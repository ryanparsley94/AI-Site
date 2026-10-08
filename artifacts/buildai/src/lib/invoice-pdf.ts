import type { Company, Invoice } from "@workspace/api-client-react";
import { formatCurrency } from "./utils";
import { loadPdfLogo, pdfBranding, PDF_INK } from "./pdf-branding";

export async function downloadInvoicePDF(invoice: Invoice, company: Company) {
  const [{ default: jsPDF }, { default: autoTable }, logo] = await Promise.all([
    import("jspdf"), import("jspdf-autotable"), loadPdfLogo(company.logoUrl),
  ]);
  const doc = new jsPDF();
  const margin = 14, right = 196, bottom = 276;
  const { template, accent, theme, headStyles } = pdfBranding(company);
  const dark = template === "classic";
  const name = company.name || "Your company";
  const contact = [company.address, company.phone, company.email].filter(Boolean).join("  |  ");
  const headerX = margin + (template === "modern" ? 2 : 0);
  const headerWidth = logo ? 138 : 182;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(template === "minimal" ? 13 : 18);
  const nameLines = doc.splitTextToSize(template === "minimal" ? name.toUpperCase() : name, headerWidth) as string[];
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const contactLines = contact ? doc.splitTextToSize(contact, headerWidth) as string[] : [];
  const taglineLines = company.quoteTagline ? doc.splitTextToSize(company.quoteTagline, headerWidth) as string[] : [];
  const contactY = 16 + nameLines.length * 7;
  const taglineY = contactY + contactLines.length * 4 + (contactLines.length ? 4 : 0);
  const headerBottom = Math.max(36, taglineY + taglineLines.length * 4 + 5);

  if (dark) {
    doc.setFillColor(...PDF_INK); doc.rect(0, 0, 210, headerBottom, "F");
    doc.setFillColor(...accent); doc.rect(0, headerBottom, 210, 1.5, "F");
  }
  if (template === "modern") {
    doc.setFillColor(...accent); doc.rect(0, 0, 4, doc.internal.pageSize.getHeight(), "F");
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(template === "minimal" ? 13 : 18);
  const nameColor: [number, number, number] = dark ? [255, 255, 255] : PDF_INK;
  doc.setTextColor(...nameColor);
  doc.text(nameLines, headerX, 16);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8);
  const contactColor: [number, number, number] = dark ? [200, 210, 220] : [100, 116, 139];
  doc.setTextColor(...contactColor);
  if (contactLines.length) doc.text(contactLines, headerX, contactY);
  if (taglineLines.length) doc.text(taglineLines, headerX, taglineY);
  if (logo) {
    const scale = Math.min(36 / logo.width, 20 / logo.height);
    const width = logo.width * scale, height = logo.height * scale;
    doc.addImage(logo.data, "PNG", right - width, 6, width, height);
  }
  if (!dark) {
    doc.setDrawColor(...(template === "modern" ? accent : PDF_INK));
    doc.setLineWidth(template === "modern" ? 0.8 : 0.6);
    doc.line(margin, headerBottom + 2, right, headerBottom + 2);
  }

  let y = headerBottom + 12;
  const ensure = (height: number) => {
    if (y + height > bottom) { doc.addPage(); y = 20; }
  };
  doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.setTextColor(...PDF_INK);
  doc.text("TAX INVOICE", margin, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(70, 70, 70);
  const referenceLines = doc.splitTextToSize(invoice.invoiceNumber, 70) as string[];
  doc.text(referenceLines, right, y - 6, { align: "right" });
  const datesY = y - 6 + referenceLines.length * 5;
  doc.text(`Issued: ${invoice.issueDate}`, right, datesY, { align: "right" });
  doc.text(`Due: ${invoice.dueDate}`, right, datesY + 6, { align: "right" });
  y = datesY + 18;

  const paragraph = (heading: string, text?: string | null) => {
    if (!text?.trim()) return;
    ensure(14);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    doc.setTextColor(accent[0] * 0.6, accent[1] * 0.6, accent[2] * 0.6);
    doc.text(heading.toUpperCase(), margin, y); y += 5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(40, 40, 40);
    for (const line of doc.splitTextToSize(text, 182) as string[]) {
      ensure(5); doc.text(line, margin, y); y += 4.8;
    }
    y += 4;
  };
  paragraph("Bill to", invoice.clientName || "—");
  ensure(24);
  const items = invoice.lineItems as Array<{ name: string; quantity: number; unitPrice: number; total: number }>;
  autoTable(doc, {
    startY: y, head: [["Description", "Qty", "Unit Price", "Amount"]],
    body: items.map(item => [item.name, `${item.quantity}`, formatCurrency(item.unitPrice), formatCurrency(item.total)]),
    theme, headStyles: { ...headStyles, fontSize: 9 },
    styles: { fontSize: 9, cellPadding: 2.8 },
    columnStyles: {
      0: { cellWidth: "auto" }, 1: { halign: "right", cellWidth: 20 },
      2: { halign: "right", cellWidth: 30 }, 3: { halign: "right", cellWidth: 30 },
    },
    margin: { left: margin, right: margin, top: 20, bottom: 21 },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  ensure(30);
  const row = (label: string, value: number, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(bold ? 11 : 9.5);
    doc.setTextColor(40, 40, 40);
    doc.text(label, 120, y); doc.text(formatCurrency(value), right, y, { align: "right" });
    y += bold ? 8 : 6;
  };
  // Stored amounts preserve penny rounding and accepted-quote commercial snapshots.
  row("Subtotal (ex-VAT)", invoice.subtotal);
  row(`VAT (${invoice.vatPercent}%)`, invoice.vatAmount);
  doc.setDrawColor(...accent); doc.setLineWidth(0.5); doc.line(120, y - 3, right, y - 3);
  y += 2;
  row("Total inc. VAT", invoice.total, true);
  y += 4;
  paragraph("Notes / Payment Instructions", invoice.notes);
  paragraph("Payment terms", company.paymentTerms);
  paragraph("Notes", company.quoteFooterText);

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    if (template === "modern" && page > 1) {
      doc.setFillColor(...accent); doc.rect(0, 0, 4, doc.internal.pageSize.getHeight(), "F");
    }
    doc.setDrawColor(...accent); doc.setLineWidth(0.3); doc.line(margin, 282, right, 282);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(130, 130, 130);
    doc.text(doc.splitTextToSize(`${name}  |  ${invoice.invoiceNumber}`, 145), margin, 288);
    doc.text(`Page ${page} of ${pages}`, right, 290, { align: "right" });
  }
  doc.save(`invoice-${invoice.invoiceNumber.replace(/\s+/g, "-").toLowerCase()}.pdf`);
}
