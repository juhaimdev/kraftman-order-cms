import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

export interface ShippingLabelData {
  awb: string;
  orderNumber: string;
  customerName: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  paymentMethod: "COD" | "Prepaid";
  totalAmount: number;
  itemDescription?: string | null;
  sku?: string | null;
  createdAt?: string | null;
  shippingMode?: "Surface" | "Express";
  routingCode?: string | null;
  sellerName?: string;
  sellerAddress?: string;
  returnAddress?: string;
}

const DEFAULT_SELLER_NAME = "Kraftman";
const DEFAULT_SELLER_ADDRESS =
  "valiyapramba po nellikkaparamba mukkom , Thazhecode, Kerala, India, 673602";

/**
 * Full Code-128 pattern table (indices 0..106) for standard Start Code B barcodes.
 * Each pattern encodes alternating [bar, space, bar, space, bar, space] module widths.
 */
const CODE128_PATTERNS: readonly string[] = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312",
  "132212", "221213", "221312", "231212", "112232", "122132", "122231", "113222",
  "123122", "123221", "223211", "221132", "221231", "213212", "223112", "312131",
  "311222", "321122", "321221", "312212", "322112", "322211", "212123", "212321",
  "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121",
  "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321",
  "331121", "312113", "312311", "332111", "314111", "221411", "431111", "111224",
  "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114",
  "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112",
  "421211", "212141", "214121", "412121", "111143", "111341", "131141", "114113",
  "114311", "411113", "411311", "113141", "114131", "311141", "411131", "211412",
  "211214", "211232", "2331112",
];

function sanitizeWinAnsi(text: string): string {
  return text
    .replace(/\u20B9/g, "INR ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function encodeCode128B(rawValue: string): string {
  const clean = sanitizeWinAnsi(rawValue) || "000000";
  const codes: number[] = [104]; // Start Code B
  let checksum = 104;

  for (let i = 0; i < clean.length; i++) {
    const code = Math.max(0, Math.min(94, clean.charCodeAt(i) - 32));
    codes.push(code);
    checksum += code * (i + 1);
  }

  codes.push(checksum % 103);
  codes.push(106); // Stop pattern

  return codes.map((c) => CODE128_PATTERNS[c] ?? "").join("");
}

function formatLabelDate(isoOrDate?: string | null): string {
  const ts = isoOrDate ? Date.parse(isoOrDate) : Date.now();
  const date = Number.isNaN(ts) ? new Date() : new Date(ts);
  const formatted = new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(date);
  return sanitizeWinAnsi(formatted.replace(",", " |"));
}

function wrapText(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
  maxLines = 4
): string[] {
  const clean = sanitizeWinAnsi(text);
  if (!clean) return [];

  const words = clean.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      if (lines.length >= maxLines) break;
      current = word;
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  }
  return lines;
}

/**
 * Generates an official-style 4x6 (288x432pt) Delhivery x Kraftman PDF shipping label
 * matching the Delhivery One thermal layout with real Code-128B vector barcodes.
 */
export async function generateDelhiveryLabelPdf(
  items: ShippingLabelData[]
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const black = rgb(0.06, 0.08, 0.12);
  const muted = rgb(0.32, 0.36, 0.42);
  const border = rgb(0.75, 0.78, 0.82);
  const delhiveryRed = rgb(0.85, 0.14, 0.16);

  const pageW = 288; // 4 in
  const pageH = 432; // 6 in
  const margin = 12;
  const boxW = pageW - margin * 2; // 264
  const boxRight = margin + boxW; // 276

  const totalPages = Math.max(1, items.length);

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const page = doc.addPage([pageW, pageH]);

    const boxTop = pageH - margin; // 420
    const boxBottom = margin; // 12
    const boxH = boxTop - boxBottom; // 408

    // Outer white frame & crisp border matching Delhivery 4R slip
    page.drawRectangle({
      x: margin,
      y: boxBottom,
      width: boxW,
      height: boxH,
      borderColor: border,
      borderWidth: 0.9,
      color: rgb(1, 1, 1),
    });

    const drawHLine = (y: number, thickness = 0.7) => {
      page.drawLine({
        start: { x: margin, y },
        end: { x: boxRight, y },
        thickness,
        color: border,
      });
    };

    const drawVLine = (x: number, y1: number, y2: number, thickness = 0.7) => {
      page.drawLine({
        start: { x, y: y1 },
        end: { x, y: y2 },
        thickness,
        color: border,
      });
    };

    const drawBarcode = (
      value: string,
      xCenter: number,
      yBottom: number,
      maxWidth: number,
      barHeight: number
    ) => {
      const pattern = encodeCode128B(value);
      let totalModules = 0;
      for (const ch of pattern) totalModules += Number(ch) || 0;
      if (totalModules <= 0) return;

      const unitWidth = Math.min(1.5, maxWidth / totalModules);
      const totalWidth = totalModules * unitWidth;
      let cursorX = xCenter - totalWidth / 2;

      for (let i = 0; i < pattern.length; i++) {
        const w = (Number(pattern[i]) || 1) * unitWidth;
        if (i % 2 === 0) {
          page.drawRectangle({
            x: cursorX,
            y: yBottom,
            width: w,
            height: barHeight,
            color: rgb(0, 0, 0),
          });
        }
        cursorX += w;
      }
    };

    /* ---------------------- 1. Header: Kraftman | DELHIVERY ---------------------- */
    const yHeaderBottom = 386;
    const sellerLabel = sanitizeWinAnsi(item.sellerName || DEFAULT_SELLER_NAME);
    page.drawText(sellerLabel, {
      x: margin + 7,
      y: 398,
      size: 10.5,
      font: fontRegular,
      color: black,
    });

    const wordmark = "DELHIVERY";
    const wmSize = 15.5;
    const wmWidth = fontBold.widthOfTextAtSize(wordmark, wmSize);
    const wmX = boxRight - 7 - wmWidth;
    page.drawText(wordmark, {
      x: wmX,
      y: 397,
      size: wmSize,
      font: fontBold,
      color: black,
    });
    // Crimson Delhivery roof/ribbon accent over top-right of logo
    page.drawRectangle({
      x: wmX + wmWidth - 11,
      y: 410.5,
      width: 11,
      height: 2.3,
      color: delhiveryRed,
    });
    drawHLine(yHeaderBottom);

    /* ---------------------- 2. AWB & Primary Code-128 Barcode ---------------------- */
    const yBarcodeBottom = 302;
    const awbClean = sanitizeWinAnsi(item.awb);
    page.drawText(`AWB# ${awbClean}`, {
      x: margin + 7,
      y: 373,
      size: 7.5,
      font: fontRegular,
      color: black,
    });

    drawBarcode(awbClean, margin + boxW / 2, 324, boxW - 38, 43);

    const destPin = sanitizeWinAnsi(item.pincode || "000000");
    page.drawText(destPin, {
      x: margin + 7,
      y: 309,
      size: 7,
      font: fontRegular,
      color: black,
    });

    const awbCenterLabel = `AWB# ${awbClean}`;
    const awbCenterW = fontBold.widthOfTextAtSize(awbCenterLabel, 7.2);
    page.drawText(awbCenterLabel, {
      x: margin + boxW / 2 - awbCenterW / 2,
      y: 309,
      size: 7.2,
      font: fontBold,
      color: black,
    });

    const cityCode = sanitizeWinAnsi(item.city || "IND")
      .replace(/[^A-Za-z]/g, "")
      .slice(0, 3)
      .toUpperCase() || "IND";
    const routeText = sanitizeWinAnsi(
      item.routingCode ||
        `${cityCode}/${item.paymentMethod === "COD" ? "COD" : "PDD"}`
    );
    const routeW = fontRegular.widthOfTextAtSize(routeText, 7);
    page.drawText(routeText, {
      x: boxRight - 7 - routeW,
      y: 309,
      size: 7,
      font: fontRegular,
      color: black,
    });

    drawHLine(yBarcodeBottom);

    /* ---------------------- 3. Ship To & Payment / Date Split ---------------------- */
    const ySplitBottom = 204;
    const xSplit = margin + 158; // 170
    drawVLine(xSplit, ySplitBottom, yBarcodeBottom);

    // Left column: Customer name + address + City (State) + PIN
    let shipY = 289;
    const shipTitleLines = wrapText(
      `Ship to - ${item.customerName}`,
      fontBold,
      8.5,
      xSplit - margin - 14,
      2
    );
    for (const line of shipTitleLines) {
      page.drawText(line, {
        x: margin + 7,
        y: shipY,
        size: 8.5,
        font: fontBold,
        color: black,
      });
      shipY -= 10.5;
    }

    const addrLines = wrapText(
      item.address,
      fontRegular,
      6.8,
      xSplit - margin - 14,
      4
    );
    for (const line of addrLines) {
      page.drawText(line, {
        x: margin + 7,
        y: shipY,
        size: 6.8,
        font: fontRegular,
        color: black,
      });
      shipY -= 8.8;
    }

    const cityStateLine = sanitizeWinAnsi(
      `${item.city}${item.state ? ` (${item.state})` : ""}`
    );
    const cityStateWrapped = wrapText(
      cityStateLine,
      fontBold,
      7.8,
      xSplit - margin - 14,
      2
    );
    for (const line of cityStateWrapped) {
      page.drawText(line, {
        x: margin + 7,
        y: Math.max(ySplitBottom + 18, shipY - 2),
        size: 7.8,
        font: fontBold,
        color: black,
      });
      shipY -= 10;
    }

    page.drawText(`PIN - ${destPin}`, {
      x: margin + 7,
      y: Math.max(ySplitBottom + 7, shipY - 2),
      size: 7.8,
      font: fontBold,
      color: black,
    });

    // Right column: Pre-paid/COD + Mode + INR Amount + Date
    const payLabel = `${item.paymentMethod === "COD" ? "COD" : "Pre-paid"} - ${item.shippingMode || "Surface"}`;
    page.drawText(payLabel, {
      x: xSplit + 7,
      y: 287,
      size: 7.6,
      font: fontBold,
      color: black,
    });

    page.drawText(`INR ${Math.round(item.totalAmount || 0)}`, {
      x: xSplit + 7,
      y: 274,
      size: 8.5,
      font: fontBold,
      color: black,
    });

    page.drawText("Date", {
      x: xSplit + 7,
      y: 256,
      size: 6.5,
      font: fontRegular,
      color: muted,
    });

    page.drawText(formatLabelDate(item.createdAt), {
      x: xSplit + 7,
      y: 247,
      size: 6.4,
      font: fontRegular,
      color: black,
    });

    drawHLine(ySplitBottom);

    /* ---------------------- 4. Seller & Order ID Barcode Row ---------------------- */
    const ySellerBottom = 136;
    const xSellerSplit = margin + 136; // 148
    drawVLine(xSellerSplit, ySellerBottom, ySplitBottom);

    page.drawText(`Seller:${sellerLabel}`, {
      x: margin + 7,
      y: 192,
      size: 7.5,
      font: fontBold,
      color: black,
    });

    const sellerAddrText = sanitizeWinAnsi(
      item.sellerAddress || DEFAULT_SELLER_ADDRESS
    );
    const sellerLines = wrapText(
      sellerAddrText,
      fontRegular,
      6.4,
      xSellerSplit - margin - 12,
      4
    );
    let sY = 181;
    for (const line of sellerLines) {
      page.drawText(line, {
        x: margin + 7,
        y: sY,
        size: 6.4,
        font: fontRegular,
        color: black,
      });
      sY -= 8.5;
    }

    const orderRefClean = sanitizeWinAnsi(item.orderNumber || awbClean);
    page.drawText(orderRefClean, {
      x: xSellerSplit + 7,
      y: 192,
      size: 7.8,
      font: fontBold,
      color: black,
    });

    drawBarcode(
      orderRefClean,
      xSellerSplit + (boxRight - xSellerSplit) / 2,
      150,
      boxRight - xSellerSplit - 14,
      32
    );

    drawHLine(ySellerBottom);

    /* ---------------------- 5. Product Name & SKU Table ---------------------- */
    const yFooterTop = 40;
    page.drawText("Product Name & SKU", {
      x: margin + 7,
      y: 124,
      size: 6.5,
      font: fontBold,
      color: black,
    });
    page.drawText("Qty", {
      x: margin + 178,
      y: 124,
      size: 6.5,
      font: fontBold,
      color: black,
    });
    page.drawText("Price", {
      x: margin + 205,
      y: 124,
      size: 6.5,
      font: fontBold,
      color: black,
    });
    page.drawText("Total", {
      x: margin + 238,
      y: 124,
      size: 6.5,
      font: fontBold,
      color: black,
    });

    drawHLine(118, 0.5);

    const itemTitle = sanitizeWinAnsi(
      item.itemDescription || `Order ${orderRefClean}`
    );
    const productLines = wrapText(itemTitle, fontRegular, 6.8, 160, 2);
    let pY = 107;
    for (const line of productLines) {
      page.drawText(line, {
        x: margin + 7,
        y: pY,
        size: 6.8,
        font: fontRegular,
        color: black,
      });
      pY -= 9;
    }
    page.drawText(`SKU: ${sanitizeWinAnsi(item.sku || "info")}`, {
      x: margin + 7,
      y: Math.max(yFooterTop + 6, pY),
      size: 6.3,
      font: fontRegular,
      color: muted,
    });

    const priceStr = (item.totalAmount || 0).toFixed(2);
    page.drawText("1", {
      x: margin + 183,
      y: 107,
      size: 6.8,
      font: fontRegular,
      color: black,
    });
    page.drawText(priceStr, {
      x: boxRight - 36 - fontRegular.widthOfTextAtSize(priceStr, 6.8),
      y: 107,
      size: 6.8,
      font: fontRegular,
      color: black,
    });
    page.drawText(priceStr, {
      x: boxRight - 7 - fontRegular.widthOfTextAtSize(priceStr, 6.8),
      y: 107,
      size: 6.8,
      font: fontRegular,
      color: black,
    });

    /* ---------------------- 6. Footer Return Address & Pagination ---------------------- */
    drawHLine(yFooterTop, 0.5);
    const returnText = sanitizeWinAnsi(
      `Return Address: ${item.returnAddress || sellerAddrText}`
    );
    const returnLines = wrapText(returnText, fontRegular, 5.7, 200, 2);
    let rY = 29;
    for (const line of returnLines) {
      page.drawText(line, {
        x: margin + 7,
        y: rY,
        size: 5.7,
        font: fontRegular,
        color: black,
      });
      rY -= 7.5;
    }

    const pageStr = `Page ${idx + 1} of ${totalPages}`;
    const pageStrW = fontRegular.widthOfTextAtSize(pageStr, 6.3);
    page.drawText(pageStr, {
      x: boxRight - 7 - pageStrW,
      y: 19,
      size: 6.3,
      font: fontRegular,
      color: black,
    });
  }

  return doc.save();
}

