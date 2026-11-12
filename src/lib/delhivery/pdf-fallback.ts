/**
 * Lightweight zero-dependency 4x6 inch (288 x 432 pt) thermal PDF generator.
 * Used as a fallback when Delhivery `/api/p/packing_slip` returns JSON metadata
 * instead of direct PDF bytes.
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

/** Generate simple deterministic bar pattern for visual AWB scanning fallback */
function drawVisualBarcode(awb: string, x: number, y: number, width: number, height: number): string {
  const ops: string[] = [];
  const chars = awb.split("");
  const totalUnits = chars.length * 6 + 4;
  const unitW = width / totalUnits;
  let cursor = x;

  // Start guard bars
  ops.push(`${cursor.toFixed(2)} ${y} ${(unitW * 1.5).toFixed(2)} ${height} re f`);
  cursor += unitW * 2.5;

  for (let i = 0; i < chars.length; i++) {
    const code = chars[i].charCodeAt(0);
    for (let b = 0; b < 3; b++) {
      const bit = (code >> b) & 1;
      const barW = bit ? unitW * 1.4 : unitW * 0.7;
      ops.push(`${cursor.toFixed(2)} ${y} ${barW.toFixed(2)} ${height} re f`);
      cursor += unitW * 2;
    }
  }

  // Stop guard bar
  ops.push(`${cursor.toFixed(2)} ${y} ${(unitW * 1.5).toFixed(2)} ${height} re f`);
  return ops.join("\n");
}

function buildPageStream(label: ThermalLabelData): string {
  const lines: string[] = [];
  // 4x6 inch page: 288 x 432 points
  // Outer border
  lines.push("1 w 0 0 0 RG 10 10 268 412 re S");
  // Header divider
  lines.push("10 374 m 278 374 l S");
  // Barcode divider
  lines.push("10 278 m 278 278 l S");
  // Payment divider
  lines.push("10 218 m 278 218 l S");
  // Footer divider
  lines.push("10 64 m 278 64 l S");

  // Header text
  lines.push("BT /F2 14 Tf 20 395 Td (DELHIVERY EXPRESS) Tj ET");
  if (label.sortCode) {
    lines.push(`BT /F2 12 Tf 200 395 Td (${escapePdfText(label.sortCode)}) Tj ET`);
  }
  lines.push(`BT /F1 9 Tf 20 381 Td (4x6 Thermal Packing Slip) Tj ET`);

  // Barcode block
  lines.push("0 0 0 rg");
  lines.push(drawVisualBarcode(label.awb, 24, 312, 240, 48));
  lines.push(`BT /F2 12 Tf 72 292 Td (AWB: ${escapePdfText(label.awb)}) Tj ET`);

  // Payment & Weight block
  const payBadge = label.paymentMode.toUpperCase() === "COD"
    ? `COD - COLLECT Rs. ${label.codAmount}`
    : "PREPAID - DO NOT COLLECT CASH";
  lines.push(`BT /F2 11 Tf 20 256 Td (${escapePdfText(payBadge)}) Tj ET`);
  lines.push(`BT /F1 10 Tf 20 236 Td (Order: ${escapePdfText(label.orderNumber)}   Weight: ${escapePdfText(label.weightGrams)}g) Tj ET`);

  // Deliver To block
  lines.push("BT /F2 10 Tf 20 198 Td (DELIVER TO:) Tj ET");
  lines.push(`BT /F2 11 Tf 20 182 Td (${escapePdfText(label.customerName)}) Tj ET`);
  lines.push(`BT /F1 10 Tf 20 166 Td (Phone: ${escapePdfText(label.phone)}) Tj ET`);

  const addressLines = wrapText(label.address, 42).slice(0, 3);
  let y = 148;
  for (const addrLine of addressLines) {
    lines.push(`BT /F1 9.5 Tf 20 ${y} Td (${escapePdfText(addrLine)}) Tj ET`);
    y -= 13;
  }
  const cityState = `${label.city}, ${label.state} - ${label.pincode}`.trim();
  lines.push(`BT /F2 11 Tf 20 ${Math.min(y - 2, 102)} Td (${escapePdfText(cityState)}) Tj ET`);

  // Footer
  lines.push("BT /F1 8 Tf 20 44 Td (Powered by Delhivery One Shipping Dashboard) Tj ET");
  lines.push(`BT /F1 8 Tf 20 30 Td (Track: delhivery.com/track/package/${escapePdfText(label.awb)}) Tj ET`);

  return lines.join("\n");
}

export function buildThermalLabelsPdf(labels: ThermalLabelData[]): Uint8Array {
  const safeLabels = labels.length > 0 ? labels : [{
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
  }];

  const objects: string[] = [];
  // 1: Catalog, 2: Pages, 3: Font F1 (Helvetica), 4: Font F2 (Helvetica-Bold)
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

