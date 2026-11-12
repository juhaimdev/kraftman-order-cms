/**
 * Zero-dependency 4x6 inch (288 x 432 pt) thermal PDF generator styled after
 * the default Delhivery Express 4x6 shipping label theme.
 */

export interface ThermalLabelData {
  awb: string;
  orderNumber: string;
  customerName: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  paymentMode: string;
  codAmount: string;
  weightGrams: string;
  dimensions?: string;
  itemDescription?: string;
  pickupWarehouse?: string;
  sortCode?: string;
}

function escapePdfText(input: string): string {
  return input
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= maxChars) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Generate clean deterministic barcode stripes for 4x6 label scanning */
function drawVisualBarcode(
  awb: string,
  x: number,
  y: number,
  width: number,
  height: number
): string {
  const ops: string[] = [];
  const chars = awb.split("");
  const totalUnits = chars.length * 6 + 4;
  const unitW = width / totalUnits;
  let cursor = x;

  ops.push(`${cursor.toFixed(2)} ${y} ${(unitW * 1.5).toFixed(2)} ${height} re f`);
  cursor += unitW * 2.5;

  for (let i = 0; i < chars.length; i++) {
    const code = chars[i].charCodeAt(0);
    for (let b = 0; b < 3; b++) {
      const bit = (code >> b) & 1;
      const barW = bit ? unitW * 1.45 : unitW * 0.72;
      ops.push(`${cursor.toFixed(2)} ${y} ${barW.toFixed(2)} ${height} re f`);
      cursor += unitW * 2;
    }
  }

  ops.push(`${cursor.toFixed(2)} ${y} ${(unitW * 1.5).toFixed(2)} ${height} re f`);
  return ops.join("\n");
}

function buildPageStream(label: ThermalLabelData): string {
  const lines: string[] = [];
  const isCod = label.paymentMode.toUpperCase() === "COD";
  const routingCode =
    label.sortCode ||
    (label.pincode && label.pincode !== "000000"
      ? `IN-${label.pincode.slice(0, 3)}`
      : "DEL-STD");

  // Outer card border (288 x 432 pt)
  lines.push("1.1 w 0.08 0.09 0.12 RG 10 10 268 412 re S");

  // Default Delhivery Theme Header: Deep Charcoal Bar + Delhivery Crimson Accent Strip
  lines.push("0.07 0.09 0.13 rg 10 382 268 40 re f");
  lines.push("0.85 0.13 0.17 rg 10 377 268 5 re f");

  // DELHIVERY Wordmark & Routing Pill
  lines.push("1 1 1 rg");
  lines.push("BT /F2 15 Tf 18 400 Td (DELHIVERY) Tj ET");
  lines.push("0.85 0.13 0.17 rg 104 401 38 12 re f");
  lines.push("1 1 1 rg");
  lines.push("BT /F2 7 Tf 109 404.5 Td (ONE) Tj ET");
  lines.push("0.82 0.85 0.90 rg");
  lines.push("BT /F1 7.5 Tf 18 388 Td (EXPRESS PARCEL · DEFAULT 4x6 LABEL) Tj ET");

  // Routing / Sort Code Badge (top right)
  lines.push("1 1 1 rg 206 388 64 26 re f");
  lines.push("0.07 0.09 0.13 rg");
  lines.push(`BT /F2 10.5 Tf 214 398 Td (${escapePdfText(routingCode)}) Tj ET`);

  // Horizontal section dividers
  lines.push("0.75 0.78 0.82 RG 0.7 w");
  lines.push("10 282 m 278 282 l S");
  lines.push("10 230 m 278 230 l S");
  lines.push("10 92 m 278 92 l S");
  lines.push("10 54 m 278 54 l S");

  // AWB Barcode Block
  lines.push("0 0 0 rg");
  lines.push(drawVisualBarcode(label.awb, 26, 314, 236, 48));
  lines.push(`BT /F2 11.5 Tf 66 297 Td (AWB# ${escapePdfText(label.awb)}) Tj ET`);
  lines.push(`BT /F1 8 Tf 18 287 Td (Order: ${escapePdfText(label.orderNumber)}) Tj ET`);

  // Payment Banner (Delhivery Crimson for COD, Slate for Prepaid)
  if (isCod) {
    lines.push("0.85 0.13 0.17 rg 16 254 256 22 re f");
    lines.push("1 1 1 rg");
    lines.push(
      `BT /F2 10.5 Tf 24 261 Td (${escapePdfText(`COD · COLLECT Rs. ${label.codAmount}`)}) Tj ET`
    );
  } else {
    lines.push("0.12 0.16 0.23 rg 16 254 256 22 re f");
    lines.push("1 1 1 rg");
    lines.push("BT /F2 10 Tf 24 261 Td (PREPAID · DO NOT COLLECT CASH) Tj ET");
  }

  // Weight, Dimensions & Item Info Row
  lines.push("0.15 0.18 0.24 rg");
  const specLine = [
    `Wt: ${label.weightGrams}g`,
    label.dimensions ? `Dim: ${label.dimensions} cm` : null,
  ]
    .filter(Boolean)
    .join("   |   ");
  lines.push(`BT /F2 8.5 Tf 18 239 Td (${escapePdfText(specLine)}) Tj ET`);

  // DELIVER TO (Consignee Box)
  lines.push("0.85 0.13 0.17 rg");
  lines.push("BT /F2 8.5 Tf 18 216 Td (DELIVER TO:) Tj ET");
  lines.push("0.07 0.09 0.13 rg");
  lines.push(`BT /F2 11 Tf 18 201 Td (${escapePdfText(label.customerName)}) Tj ET`);
  lines.push(`BT /F1 9 Tf 18 187 Td (Mob: ${escapePdfText(label.phone || "N/A")}) Tj ET`);

  const addressLines = wrapText(label.address || "Address on file", 42).slice(0, 3);
  let y = 171;
  for (const addrLine of addressLines) {
    lines.push(`BT /F1 9 Tf 18 ${y} Td (${escapePdfText(addrLine)}) Tj ET`);
    y -= 12.5;
  }

  const cityState = [label.city, label.state].filter(Boolean).join(", ");
  const pinStr = label.pincode ? `PIN: ${label.pincode}` : "";
  lines.push(
    `BT /F2 10.5 Tf 18 ${Math.min(y - 4, 118)} Td (${escapePdfText(`${cityState}${cityState ? " - " : ""}${pinStr}`)}) Tj ET`
  );

  if (label.itemDescription) {
    lines.push("0.35 0.39 0.46 rg");
    lines.push(
      `BT /F1 8 Tf 18 100 Td (Item: ${escapePdfText(label.itemDescription.slice(0, 44))}) Tj ET`
    );
  }

  // Pickup / Return Warehouse Block
  lines.push("0.15 0.18 0.24 rg");
  const warehouse = label.pickupWarehouse || "Kraftman Seller Warehouse";
  lines.push(
    `BT /F2 8 Tf 18 77 Td (RETURN / PICKUP FROM: KRAFTMAN) Tj ET`
  );
  lines.push(
    `BT /F1 8.5 Tf 18 65 Td (${escapePdfText(warehouse)}) Tj ET`
  );

  // Official Delhivery Footer
  lines.push("0.96 0.97 0.98 rg 11 11 266 42 re f");
  lines.push("0.28 0.33 0.40 rg");
  lines.push(
    `BT /F1 7.5 Tf 18 39 Td (Track: delhivery.com/track-v2/package/${escapePdfText(label.awb)}) Tj ET`
  );
  lines.push(
    "BT /F1 7 Tf 18 26 Td (Kraftman x Delhivery Express Packing Slip · Handle With Care) Tj ET"
  );

  return lines.join("\n");
}

export function buildThermalLabelsPdf(labels: ThermalLabelData[]): Uint8Array {
  const safeLabels: ThermalLabelData[] =
    labels.length > 0
      ? labels
      : [
          {
            awb: "000000000000",
            orderNumber: "N/A",
            customerName: "Unknown",
            phone: "",
            address: "",
            city: "",
            state: "",
            pincode: "",
            paymentMode: "Prepaid",
            codAmount: "0",
            weightGrams: "500",
          },
        ];

  const objects: string[] = [];
  const pageObjIds: number[] = [];
  let nextId = 5;

  const pageBodies: string[] = [];
  for (const label of safeLabels) {
    const pageId = nextId++;
    const contentId = nextId++;
    pageObjIds.push(pageId);
    const stream = buildPageStream(label);
    pageBodies.push(
      `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 288 432] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`,
      `${contentId} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`
    );
  }

  objects.push(
    `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`,
    `2 0 obj\n<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjIds.length} >>\nendobj\n`,
    `3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`,
    `4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n`,
    ...pageBodies
  );

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return new TextEncoder().encode(pdf);
}
