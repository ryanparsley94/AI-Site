import type { Company } from "@workspace/api-client-react";
import type { QuoteWorkflow } from "@workspace/api-zod";
import { formatCurrency } from "@/lib/utils";
import type { Calc } from "./helpers";

const rgb = (hex: string): [number, number, number] => {
  const c = (hex || "").replace("#", "");
  const n = [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16));
  return n.some(Number.isNaN) ? [54, 198, 213] : [n[0], n[1], n[2]];
};

async function loadLogo(url?: string | null): Promise<{ data: string; w: number; h: number; fmt: string } | null> {
  if (!url) return null;
  try {
    let data = url;
    if (!url.startsWith("data:")) {
      const r = await fetch(url);
      if (!r.ok) return null;
      const b = await r.blob();
      data = await new Promise<string>((res, rej) => { const f = new FileReader(); f.onloadend = () => res(String(f.result)); f.onerror = rej; f.readAsDataURL(b); });
    }
    const dim = await new Promise<{ w: number; h: number }>((res, rej) => { const im = new Image(); im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = rej; im.src = data; });
    return { data, ...dim, fmt: data.includes("image/png") ? "PNG" : "JPEG" };
  } catch { return null; }
}

export async function downloadQuotePdf(o: {
  id?: number; title: string; createdAt?: string; workflow: QuoteWorkflow; calc: Calc; company?: Company | null; draft: boolean;
}) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const { workflow: w, calc, company } = o;
  const doc = new jsPDF();
  const W = 210, mX = 14, rX = W - mX, bottom = 276;
  const tpl = company?.quoteTemplate || "classic";
  const [aR, aG, aB] = rgb(company?.quoteAccentColor || "#36C6D5");
  const name = company?.name || "Your company";
  const ref = o.id ? `Q-${o.id}` : "Unsaved";
  const date = new Date(o.createdAt ?? Date.now()).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const logo = await loadLogo(company?.logoUrl);
  const dark = tpl === "classic";
  const bandH = tpl === "minimal" ? 0 : 36;

  if (tpl === "classic") { doc.setFillColor(13, 23, 28); doc.rect(0, 0, W, bandH, "F"); doc.setFillColor(aR, aG, aB); doc.rect(0, bandH, W, 1.5, "F"); }
  if (tpl === "modern") { doc.setFillColor(aR, aG, aB); doc.rect(0, 0, 4, 297, "F"); }
  doc.setFont("helvetica", "bold"); doc.setFontSize(tpl === "minimal" ? 13 : 18);
  doc.setTextColor(...(dark ? ([255, 255, 255] as [number, number, number]) : ([13, 23, 28] as [number, number, number])));
  doc.text(tpl === "minimal" ? name.toUpperCase() : name, mX + (tpl === "modern" ? 2 : 0), 16);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8);
  doc.setTextColor(...(dark ? ([200, 210, 220] as [number, number, number]) : ([100, 116, 139] as [number, number, number])));
  const contact = [company?.address, company?.phone, company?.email].filter(Boolean) as string[];
  doc.text(doc.splitTextToSize(contact.join("  |  "), logo ? 120 : 150), mX + (tpl === "modern" ? 2 : 0), 23);
  if (company?.quoteTagline) doc.text(company.quoteTagline, mX + (tpl === "modern" ? 2 : 0), 31);
  if (logo) { const h = Math.min(20, 36 * logo.h / logo.w * 0.5); const wd = Math.min(36, h * logo.w / logo.h); try { doc.addImage(logo.data, logo.fmt, rX - wd, 6, wd, h); } catch { /* unsupported */ } }
  if (tpl === "minimal") { doc.setDrawColor(13, 23, 28); doc.setLineWidth(0.6); doc.line(mX, 34, rX, 34); doc.setLineWidth(0.2); }
  if (tpl === "modern") { doc.setDrawColor(aR, aG, aB); doc.setLineWidth(0.8); doc.line(mX, 38, rX, 38); doc.setLineWidth(0.2); }

  let y = 48;
  const ensure = (h: number) => { if (y + h > bottom) { doc.addPage(); y = 20; } };
  doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.setTextColor(13, 23, 28);
  doc.text("QUOTE", mX, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(70, 70, 70);
  doc.text(`Ref ${ref}`, rX, y - 6, { align: "right" });
  doc.text(`Date ${date}`, rX, y, { align: "right" });
  if (w.validUntil) doc.text(`Valid until ${new Date(w.validUntil).toLocaleDateString("en-GB")}`, rX, y + 6, { align: "right" });
  y += 7; doc.text(doc.splitTextToSize(o.title, 110), mX, y); y += 10;

  const para = (head: string, text: string, x = mX, width = 182) => {
    if (!text.trim()) return;
    ensure(14);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(aR * 0.6, aG * 0.6, aB * 0.6); doc.text(head.toUpperCase(), x, y); y += 5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(40, 40, 40);
    for (const line of doc.splitTextToSize(text, width) as string[]) { ensure(5); doc.text(line, x, y); y += 4.8; }
    y += 4;
  };
  const cust = [w.customerName, w.customerEmail, w.customerPhone, w.billingAddress].filter(s => s.trim()).join("\n");
  const top = y;
  para("Prepared for", cust, mX, 85);
  const afterLeft = y; y = top;
  para("Site address", w.siteAddress, 110, 86);
  y = Math.max(y, afterLeft);
  para("Scope of work", w.scope);

  const byId = new Map(calc.lines.map(l => [l.id, l]));
  for (const s of w.sections) {
    if (!s.items.length) continue;
    ensure(24);
    autoTable(doc, {
      startY: y, margin: { left: mX, right: mX, top: 20, bottom: 20 },
      head: [[s.title || "Items", "Qty", "Unit price", "Total"]],
      body: s.items.map(i => [i.description, `${i.quantity} ${i.unit}`, formatCurrency(i.sellPrice), formatCurrency(byId.get(i.id)?.total ?? 0)]),
      theme: tpl === "minimal" ? "grid" : "striped",
      headStyles: tpl === "minimal" ? { fillColor: [255, 255, 255], textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.3 } : { fillColor: tpl === "modern" ? [aR, aG, aB] : [13, 23, 28], textColor: 255 },
      styles: { fontSize: 9, cellPadding: 2.8 },
      columnStyles: { 0: { cellWidth: 92 }, 2: { halign: "right" }, 3: { halign: "right" } },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  ensure(46);
  const row = (k: string, v: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(bold ? 11 : 9.5); doc.setTextColor(40, 40, 40);
    doc.text(k, 120, y); doc.text(v, rX, y, { align: "right" }); y += bold ? 7 : 6;
  };
  row("Subtotal", formatCurrency(calc.subtotal));
  row(w.vatRegistered ? `VAT (${calc.vatPercent}%)` : "VAT not charged", formatCurrency(calc.vatAmount));
  doc.setDrawColor(aR, aG, aB); doc.line(120, y - 3, rX, y - 3); y += 2;
  row("Total", formatCurrency(calc.total), true);
  if (w.deposit.mode !== "none") { row("Deposit due", formatCurrency(calc.depositAmount)); row("Balance", formatCurrency(calc.balance), true); }
  if (w.vatRegistered && w.vatNumber) { doc.setFontSize(8); doc.setTextColor(110, 110, 110); doc.text(`VAT number ${w.vatNumber}`, rX, y, { align: "right" }); y += 6; }
  y += 4;
  para("Assumptions", w.assumptions);
  para("Exclusions", w.exclusions);
  para("Payment terms", w.paymentTerms);
  if (company?.quoteFooterText) para("Notes", company.quoteFooterText);

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    if (o.draft) {
      try { doc.setGState(new (doc as unknown as { GState: new (a: object) => object }).GState({ opacity: 0.12 })); } catch { /* ignore */ }
      doc.setFont("helvetica", "bold"); doc.setFontSize(100); doc.setTextColor(13, 23, 28);
      doc.text("DRAFT", 105, 170, { align: "center", angle: 35 });
      try { doc.setGState(new (doc as unknown as { GState: new (a: object) => object }).GState({ opacity: 1 })); } catch { /* ignore */ }
    }
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(130, 130, 130);
    doc.text([name, ...contact].join("  |  "), mX, 290);
    doc.text(`Page ${p} of ${pages}`, rX, 290, { align: "right" });
  }
  doc.save(`quote-${ref}${o.draft ? "-DRAFT" : ""}.pdf`);
}
