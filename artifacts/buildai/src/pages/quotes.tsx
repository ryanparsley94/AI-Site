import { useState, useEffect, useCallback } from "react";
import {
  useListQuotes,
  useCreateQuote,
  useUpdateQuote,
  useDeleteQuote,
  useSearchMaterialPrices,
  useListJobs,
  useCreateInvoice,
  useGetCompany,
  getListQuotesQueryKey,
  getListInvoicesQueryKey,
  PriceSearchResult,
  Quote,
  Company,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Calculator, Plus, Trash2, Search, ExternalLink,
  Save, Calendar, AlertCircle, Download, FileText,
  ChevronDown, ChevronUp, Receipt
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";

const initialInput = [
  { name: "", quantity: 1, unit: "each" },
  { name: "", quantity: 1, unit: "each" },
  { name: "", quantity: 1, unit: "each" },
];

type LabourItem = { description: string; hours: number; rate: number };
const initialLabour: LabourItem[] = [{ description: "", hours: 1, rate: 30 }];

function labourTotal(items: LabourItem[]) {
  return items.reduce((s, i) => s + i.hours * i.rate, 0);
}

// ── Labour Section ───────────────────────────────────────────────────────────

function LabourSection({
  items,
  onChange,
}: {
  items: LabourItem[];
  onChange: (items: LabourItem[]) => void;
}) {
  const total = labourTotal(items);
  const update = (idx: number, field: keyof LabourItem, value: string | number) => {
    const next = items.map((item, i) => i === idx ? { ...item, [field]: value } : item);
    onChange(next);
  };
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Calculator className="h-4 w-4 text-primary" /> Labour Costs
        </CardTitle>
        <CardDescription>Add time and rate for each trade or role.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <Input
              placeholder="e.g. Plumber, day rate"
              value={item.description}
              onChange={e => update(idx, "description", e.target.value)}
              className="flex-1"
            />
            <Input
              type="number" min="0" step="0.5"
              value={item.hours}
              onChange={e => update(idx, "hours", Number(e.target.value))}
              className="w-20"
            />
            <span className="text-xs text-muted-foreground shrink-0">hrs @</span>
            <Input
              type="number" min="0" step="1"
              value={item.rate}
              onChange={e => update(idx, "rate", Number(e.target.value))}
              className="w-24"
            />
            <span className="text-xs text-muted-foreground shrink-0">/hr</span>
            <span className="text-sm font-semibold w-20 text-right shrink-0">{formatCurrency(item.hours * item.rate)}</span>
            <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => onChange(items.filter((_, i) => i !== idx))} disabled={items.length <= 1}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" className="w-full gap-2 border-dashed"
          onClick={() => onChange([...items, { description: "", hours: 1, rate: 30 }])}>
          <Plus className="h-3.5 w-3.5" /> Add Labour Row
        </Button>
        {total > 0 && (
          <div className="flex justify-between items-center pt-2 border-t text-sm font-semibold">
            <span className="text-muted-foreground">Labour subtotal</span>
            <span>{formatCurrency(total)}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Pricing helpers ──────────────────────────────────────────────────────────

function computePricing(grandTotal: number, marginPercent: number, vatPercent: number) {
  const marginAmount = grandTotal * (marginPercent / 100);
  const subtotalAfterMargin = grandTotal + marginAmount;
  const vatAmount = subtotalAfterMargin * (vatPercent / 100);
  const totalIncVat = subtotalAfterMargin + vatAmount;
  return { marginAmount, subtotalAfterMargin, vatAmount, totalIncVat };
}

// ── PDF generation ──────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  return [
    parseInt(clean.slice(0, 2), 16) || 249,
    parseInt(clean.slice(2, 4), 16) || 115,
    parseInt(clean.slice(4, 6), 16) || 22,
  ];
}

async function loadImageAsBase64(url: string): Promise<string | null> {
  if (!url) return null;
  // Already a data URL
  if (url.startsWith("data:")) return url;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null as unknown as string);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

type QuoteMaterial = {
  name: string; quantity: number; unit: string; type?: string;
  unitPrice?: number | null; source?: string | null; total?: number | null;
};

async function downloadQuotePDF(quote: Quote, company?: Company | null) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF();
  const W = 210; // page width mm
  const mX = 14; // margin X
  const rX = W - mX; // right edge

  const companyName = company?.name || "Your Company";
  const template = company?.quoteTemplate || "classic";
  const accentHex = company?.quoteAccentColor || "#f97316";
  const [aR, aG, aB] = hexToRgb(accentHex);
  const tagline = company?.quoteTagline || "";
  const paymentTerms = company?.paymentTerms || "";
  const footerText = company?.quoteFooterText || "";
  const dateStr = format(new Date(quote.createdAt), "d MMM yyyy");
  const disclaimer = "Prices are estimates based on current UK trade prices, ex-VAT unless stated. Confirm live pricing before purchasing.";

  // Load logo if available
  const logoBase64 = company?.logoUrl ? await loadImageAsBase64(company.logoUrl) : null;

  // Helper: add logo to doc at position
  const addLogo = (x: number, y: number, maxW: number, maxH: number) => {
    if (!logoBase64) return;
    try {
      const fmt = logoBase64.includes("png") ? "PNG" : "JPEG";
      doc.addImage(logoBase64, fmt, x, y, maxW, maxH, undefined, "FAST");
    } catch { /* skip if unsupported format */ }
  };

  // ── Materials table body (shared across templates) ──────────────────────
  const materials = quote.materials as QuoteMaterial[];
  const labourLines = materials.filter(m => m.type === "labour");
  const matLines = materials.filter(m => m.type !== "labour");

  const tableRows: string[][] = [];
  matLines.forEach(m => tableRows.push([
    m.name,
    `${m.quantity} ${m.unit}`,
    formatCurrency(m.unitPrice ?? 0),
    m.source ?? "—",
    formatCurrency(m.total ?? 0),
  ]));
  labourLines.forEach(m => tableRows.push([
    `${m.name} (labour)`,
    `${m.quantity} hrs`,
    formatCurrency(m.unitPrice ?? 0) + "/hr",
    "—",
    formatCurrency(m.total ?? 0),
  ]));

  // ── Pricing rows (shared) ───────────────────────────────────────────────
  const drawPricing = (startY: number, boldColor: [number, number, number]) => {
    let y = startY;
    const addRow = (label: string, value: string, bold = false) => {
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(60, 60, 60);
      doc.text(label, 115, y);
      doc.setTextColor(0, 0, 0);
      doc.text(value, rX, y, { align: "right" });
      y += 6.5;
    };
    addRow("Materials subtotal (ex-VAT)", formatCurrency(quote.grandTotal));
    if (quote.marginPercent != null) {
      addRow(`Contractor margin (${quote.marginPercent}%)`, formatCurrency(quote.marginAmount ?? 0));
      addRow("Subtotal after margin", formatCurrency((quote.grandTotal) + (quote.marginAmount ?? 0)));
    }
    if (quote.vatPercent != null) {
      addRow(`VAT (${quote.vatPercent}%)`, formatCurrency(quote.vatAmount ?? 0));
    }
    doc.setDrawColor(180, 180, 180);
    doc.line(115, y - 2, rX, y - 2);
    if (quote.totalIncVat != null) {
      doc.setTextColor(...boldColor);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("Total inc. VAT", 115, y + 5);
      doc.text(formatCurrency(quote.totalIncVat), rX, y + 5, { align: "right" });
      y += 12;
    }
    return y;
  };

  // ── CLASSIC TEMPLATE ────────────────────────────────────────────────────
  if (template === "classic") {
    // Header band
    doc.setFillColor(26, 35, 50);
    doc.rect(0, 0, W, 38, "F");

    // Company name
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(255, 255, 255);
    doc.text(companyName, mX, 16);

    if (tagline) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(aR, aG, aB);
      doc.text(tagline, mX, 23);
    }

    // Contact info top-right
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(200, 210, 220);
    let cInfoY = 10;
    if (company?.phone) { doc.text(company.phone, rX, cInfoY, { align: "right" }); cInfoY += 5; }
    if (company?.email) { doc.text(company.email, rX, cInfoY, { align: "right" }); cInfoY += 5; }
    if (company?.website) { doc.text(company.website, rX, cInfoY, { align: "right" }); cInfoY += 5; }

    // Logo (top-right if present)
    if (logoBase64) addLogo(rX - 30, 2, 28, 18);

    // Accent line
    doc.setFillColor(aR, aG, aB);
    doc.rect(0, 38, W, 1.5, "F");

    // Quote meta
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("QUOTE", mX, 54);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text(quote.title, mX, 62);
    doc.text(`Date: ${dateStr}`, mX, 69);
    doc.text(`Quote #${quote.id}`, rX, 62, { align: "right" });

    // Table
    autoTable(doc, {
      startY: 76,
      head: [["Description", "Qty", "Unit Price", "Source", "Total"]],
      body: tableRows,
      theme: "striped",
      headStyles: { fillColor: [26, 35, 50], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      styles: { fontSize: 9, cellPadding: 3 },
      columnStyles: { 4: { halign: "right" }, 2: { halign: "right" }, 0: { cellWidth: 65 } },
      margin: { left: mX, right: mX },
    });

    const afterTable = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
    const afterPricing = drawPricing(afterTable, [aR, aG, aB]);

    // Footer accent line
    let fy = Math.max(afterPricing + 12, 250);
    doc.setFillColor(aR, aG, aB);
    doc.rect(0, fy, W, 1.5, "F");
    fy += 7;

    if (paymentTerms) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
      doc.text("Payment Terms", mX, fy);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(60, 60, 60);
      const ptLines = doc.splitTextToSize(paymentTerms, 120);
      doc.text(ptLines, mX, fy + 6);
      fy += 6 + ptLines.length * 5;
    }

    if (footerText) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      const ftLines = doc.splitTextToSize(footerText, 180);
      doc.text(ftLines, mX, fy + 4);
      fy += 4 + ftLines.length * 5;
    }

    // Disclaimer
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(140, 140, 140);
    const dLines = doc.splitTextToSize(disclaimer, 180);
    doc.text(dLines, mX, fy + 6);

    // Company footer band
    doc.setFillColor(26, 35, 50);
    doc.rect(0, 284, W, 13, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(200, 210, 220);
    const footerParts = [companyName, company?.address, company?.phone, company?.email].filter(Boolean).join("  ·  ");
    doc.text(footerParts, W / 2, 291.5, { align: "center" });
  }

  // ── MODERN TEMPLATE ────────────────────────────────────────────────────
  else if (template === "modern") {
    // Left accent bar
    doc.setFillColor(aR, aG, aB);
    doc.rect(0, 0, 4, 297, "F");

    // Logo top-right
    if (logoBase64) addLogo(rX - 30, 8, 28, 18);

    // Company name
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(15, 23, 42);
    doc.text(companyName, 14, 22);

    if (tagline) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(tagline, 14, 29);
    }

    // Contact line
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    const contactParts = [company?.phone, company?.email, company?.website].filter(Boolean).join("   ");
    doc.text(contactParts, 14, tagline ? 35 : 30);

    // "QUOTE" badge
    doc.setFillColor(aR, aG, aB);
    doc.roundedRect(rX - 34, 6, 34, 12, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text("QUOTE", rX - 17, 14.5, { align: "center" });

    // Divider
    const divY = tagline ? 40 : 36;
    doc.setDrawColor(aR, aG, aB);
    doc.setLineWidth(0.8);
    doc.line(14, divY, W - 14, divY);
    doc.setLineWidth(0.2);

    // Quote info
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    doc.text(quote.title, 14, divY + 8);
    doc.text(`#${quote.id}  ·  ${dateStr}`, rX, divY + 8, { align: "right" });

    // Table
    autoTable(doc, {
      startY: divY + 14,
      head: [["Description", "Qty", "Unit Price", "Source", "Total"]],
      body: tableRows,
      theme: "plain",
      headStyles: { fillColor: [aR, aG, aB], textColor: 255, fontStyle: "bold" },
      styles: { fontSize: 9, cellPadding: 3 },
      columnStyles: { 4: { halign: "right" }, 2: { halign: "right" }, 0: { cellWidth: 65 } },
      bodyStyles: { lineColor: [220, 220, 220], lineWidth: 0.1 },
      margin: { left: 14, right: 14 },
    });

    const afterTable = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
    const afterPricing = drawPricing(afterTable, [aR, aG, aB]);
    let fy = afterPricing + 8;

    if (paymentTerms) {
      doc.setDrawColor(aR, aG, aB);
      doc.setLineWidth(2);
      doc.line(14, fy, 14, fy + 16);
      doc.setLineWidth(0.2);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(0, 0, 0);
      doc.text("Payment Terms", 20, fy + 5);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(80, 80, 80);
      const ptLines = doc.splitTextToSize(paymentTerms, 100);
      doc.text(ptLines, 20, fy + 11);
      fy += Math.max(20, ptLines.length * 5 + 14);
    }

    if (footerText) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      const ftLines = doc.splitTextToSize(footerText, 180);
      doc.text(ftLines, 14, fy);
      fy += ftLines.length * 5 + 4;
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(160, 160, 160);
    const dLines = doc.splitTextToSize(disclaimer, 180);
    doc.text(dLines, 14, fy + 4);

    // Footer bar
    doc.setFillColor(aR, aG, aB);
    doc.rect(0, 284, W, 13, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text([companyName, company?.address, company?.phone].filter(Boolean).join("  ·  "), W / 2, 291.5, { align: "center" });
  }

  // ── MINIMAL TEMPLATE ───────────────────────────────────────────────────
  else {
    // Company name
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text(companyName.toUpperCase(), mX, 18);

    // Logo top-right
    if (logoBase64) addLogo(rX - 26, 4, 24, 16);

    if (tagline) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(120, 120, 120);
      doc.text(tagline, mX, 24);
    }

    // "QUOTE" label
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(0, 0, 0);
    doc.text("QUOTE", rX, 18, { align: "right" });

    // Top rule
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.8);
    doc.line(mX, 28, rX, 28);
    doc.setLineWidth(0.2);

    // Quote details
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    doc.text(quote.title, mX, 37);
    doc.text(`Date: ${dateStr}  ·  Quote #${quote.id}`, rX, 37, { align: "right" });

    // Contact info
    const ctParts = [company?.phone, company?.email, company?.address].filter(Boolean).join("  |  ");
    doc.setFontSize(8);
    doc.setTextColor(130, 130, 130);
    doc.text(ctParts, mX, 43);

    // Sub-rule
    doc.setDrawColor(180, 180, 180);
    doc.line(mX, 47, rX, 47);

    // Table
    autoTable(doc, {
      startY: 52,
      head: [["Description", "Qty", "Unit Price", "Source", "Total"]],
      body: tableRows,
      theme: "grid",
      headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: "bold", lineColor: [0, 0, 0], lineWidth: 0.4 },
      styles: { fontSize: 9, cellPadding: 3, textColor: [30, 30, 30], lineColor: [200, 200, 200], lineWidth: 0.1 },
      columnStyles: { 4: { halign: "right" }, 2: { halign: "right" }, 0: { cellWidth: 65 } },
      margin: { left: mX, right: mX },
    });

    const afterTable = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
    const afterPricing = drawPricing(afterTable, [0, 0, 0]);
    let fy = afterPricing + 8;

    doc.setDrawColor(180, 180, 180);
    doc.line(mX, fy, rX, fy);
    fy += 6;

    if (paymentTerms) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(0, 0, 0);
      doc.text("Payment Terms", mX, fy);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(80, 80, 80);
      const ptLines = doc.splitTextToSize(paymentTerms, 180);
      doc.text(ptLines, mX, fy + 6);
      fy += 6 + ptLines.length * 5 + 4;
    }

    if (footerText) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      const ftLines = doc.splitTextToSize(footerText, 180);
      doc.text(ftLines, mX, fy);
      fy += ftLines.length * 5 + 4;
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(160, 160, 160);
    const dLines = doc.splitTextToSize(disclaimer, 180);
    doc.text(dLines, mX, fy + 4);

    // Bottom rule + company info
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.line(mX, 284, rX, 284);
    doc.setLineWidth(0.2);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 100, 100);
    doc.text([companyName, company?.phone, company?.email].filter(Boolean).join("  ·  "), W / 2, 290, { align: "center" });
  }

  doc.save(`quote-${quote.id}-${quote.title.replace(/\s+/g, "-").toLowerCase()}.pdf`);
}

// ── Pricing Panel ────────────────────────────────────────────────────────────

function PricingPanel({
  grandTotal,
  marginPercent,
  vatPercent,
  onMarginChange,
  onVatChange,
}: {
  grandTotal: number;
  marginPercent: number;
  vatPercent: number;
  onMarginChange: (v: number) => void;
  onVatChange: (v: number) => void;
}) {
  const [open, setOpen] = useState(true);
  const { marginAmount, subtotalAfterMargin, vatAmount, totalIncVat } = computePricing(grandTotal, marginPercent, vatPercent);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors border-t">
          <span className="font-semibold text-sm text-secondary">Pricing & Totals</span>
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-4 pb-4 space-y-3">
          {/* Materials subtotal */}
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Materials subtotal (ex-VAT)</span>
            <span className="font-medium">{formatCurrency(grandTotal)}</span>
          </div>

          {/* Margin */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground flex-1">Contractor margin</span>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0"
                max="200"
                step="0.5"
                value={marginPercent}
                onChange={(e) => onMarginChange(Number(e.target.value))}
                className="w-20 h-7 text-sm text-right"
              />
              <span className="text-sm text-muted-foreground">%</span>
              <span className="text-sm font-medium w-24 text-right">{formatCurrency(marginAmount)}</span>
            </div>
          </div>

          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Subtotal after margin</span>
            <span className="font-medium">{formatCurrency(subtotalAfterMargin)}</span>
          </div>

          <Separator />

          {/* VAT */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground flex-1">VAT</span>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={vatPercent}
                onChange={(e) => onVatChange(Number(e.target.value))}
                className="w-20 h-7 text-sm text-right"
              />
              <span className="text-sm text-muted-foreground">%</span>
              <span className="text-sm font-medium w-24 text-right">{formatCurrency(vatAmount)}</span>
            </div>
          </div>

          <Separator />

          {/* Total */}
          <div className="flex justify-between items-center">
            <span className="font-bold text-secondary">Total inc. VAT</span>
            <span className="text-xl font-bold text-secondary">{formatCurrency(totalIncVat)}</span>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function Quotes() {
  const { data: quotes = [], isLoading: isLoadingQuotes } = useListQuotes();
  const { data: jobs = [] } = useListJobs();
  const { data: company } = useGetCompany();
  const searchPrices = useSearchMaterialPrices();
  const createQuote = useCreateQuote();
  const updateQuote = useUpdateQuote();
  const deleteQuote = useDeleteQuote();
  const createInvoice = useCreateInvoice();

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [inputs, setInputs] = useState<{name: string, quantity: number, unit: string}[]>(initialInput);
  const [labourItems, setLabourItems] = useState<LabourItem[]>(initialLabour);
  const [results, setResults] = useState<PriceSearchResult | null>(null);
  const [prefillBanner, setPrefillBanner] = useState<string | null>(null);
  const [isCallDraft, setIsCallDraft] = useState(false);
  const [quoteReviewed, setQuoteReviewed] = useState(false);

  // Pricing state
  const [marginPercent, setMarginPercent] = useState(20);
  const [vatPercent, setVatPercent] = useState(20);

  const labourSubtotal = labourTotal(labourItems);

  const [isSaveOpen, setIsSaveOpen] = useState(false);
  const [quoteTitle, setQuoteTitle] = useState("");
  const [jobId, setJobId] = useState<string>("");
  const [jobSearch, setJobSearch] = useState("");

  useEffect(() => {
    setQuoteReviewed(false);
  }, [inputs, labourItems, results, marginPercent, vatPercent, quoteTitle, jobId]);

  // Pre-fill from a "Create Quote from Call" action
  useEffect(() => {
    const raw = sessionStorage.getItem("buildai_prefill_quote");
    if (!raw) return;
    sessionStorage.removeItem("buildai_prefill_quote");
    try {
      const prefill = JSON.parse(raw);
      setIsCallDraft(true);
      setQuoteReviewed(false);
      // An enquiry supplies no labour estimate; do not apply the builder's defaults.
      setLabourItems([{ description: "", hours: 0, rate: 0 }]);
      if (prefill.materials?.length) {
        setInputs(prefill.materials.map((m: { name: string; quantity: number; unit: string }) => ({
          name: m.name ?? "",
          quantity: Number(m.quantity),
          unit: m.unit ?? "each",
        })));
      } else {
        setInputs([{ name: "", quantity: 0, unit: "each" }]);
      }
      if (prefill.title) setQuoteTitle(prefill.title);
      const source = prefill.callerName ? `Call draft for ${prefill.callerName}` : "Call draft";
      setPrefillBanner(prefill.materials?.length
        ? `${source} — only explicitly stated materials and quantities were added. Review scope, labour and prices before sending.`
        : `${source} — the enquiry does not specify materials with clear quantities. Confirm the scope with the client and add the required items manually.`);
    } catch {}
  }, []);

  const updateInput = (index: number, field: keyof typeof inputs[0], value: string | number) => {
    const newInputs = [...inputs];
    newInputs[index] = { ...newInputs[index], [field]: value };
    setInputs(newInputs);
  };

  const removeRow = (index: number) => {
    if (inputs.length <= 1) return;
    setInputs(inputs.filter((_, i) => i !== index));
  };

  const addRow = () => {
    setInputs([...inputs, { name: "", quantity: 1, unit: "each" }]);
  };

  const handleSearch = () => {
    const validInputs = inputs.filter(i => i.name.trim() !== "");
    if (validInputs.length === 0) {
      toast({ title: "Please enter at least one material name", variant: "destructive" });
      return;
    }

    searchPrices.mutate({ data: { materials: validInputs } }, {
      onSuccess: (data) => {
        setResults(data);
        toast({ title: "Prices fetched successfully" });
      },
      onError: () => {
        toast({ title: "Failed to fetch prices", variant: "destructive" });
      }
    });
  };

  const combinedTotal = (results?.grandTotal ?? 0) + labourSubtotal;

  const getPricingValues = useCallback(() => {
    const total = (results?.grandTotal ?? 0) + labourSubtotal;
    if (total === 0) return {};
    const { marginAmount, subtotalAfterMargin, vatAmount, totalIncVat } = computePricing(total, marginPercent, vatPercent);
    return { marginPercent, vatPercent, marginAmount, subtotalAfterMargin, vatAmount, totalIncVat };
  }, [results, marginPercent, vatPercent, labourSubtotal]);

  const handleSaveQuote = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isCallDraft && !quoteReviewed) {
      toast({ title: "Review the scope, quantities and prices before saving this call draft.", variant: "destructive" });
      return;
    }
    if (combinedTotal === 0) {
      toast({ title: "Please add materials or labour costs first", variant: "destructive" });
      return;
    }
    if (!quoteTitle.trim()) {
      toast({ title: "Please enter a quote title", variant: "destructive" });
      return;
    }

    const pricing = getPricingValues();
    const labourLines = labourItems
      .filter(l => l.description.trim() && l.hours > 0)
      .map(l => ({ type: "labour" as const, name: l.description, quantity: l.hours, unit: "hrs", unitPrice: l.rate, source: null, sourceUrl: null, total: l.hours * l.rate }));
    const materialLines = (results?.materials ?? []).map(m => ({
      name: m.name, quantity: m.quantity, unit: m.unit,
      unitPrice: m.unitPrice, source: m.source, sourceUrl: m.sourceUrl, total: m.total,
    }));

    createQuote.mutate({
      data: {
        title: quoteTitle,
        jobId: jobId ? Number(jobId) : undefined,
        grandTotal: combinedTotal,
        materials: [...labourLines, ...materialLines],
        marginPercent: pricing.marginPercent,
        vatPercent: pricing.vatPercent,
        marginAmount: pricing.marginAmount,
        vatAmount: pricing.vatAmount,
        totalIncVat: pricing.totalIncVat,
      }
    }, {
      onSuccess: () => {
        setIsSaveOpen(false);
        setQuoteTitle("");
        setJobId("");
        toast({ title: "Quote saved successfully" });
        queryClient.invalidateQueries({ queryKey: getListQuotesQueryKey() });
      }
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("Delete this quote?")) {
      deleteQuote.mutate({ id }, {
        onSuccess: () => {
          toast({ title: "Quote deleted" });
          queryClient.invalidateQueries({ queryKey: getListQuotesQueryKey() });
        }
      });
    }
  };

  const handleDownloadPDF = async (quote: Quote) => {
    if (!confirm("Before downloading this quote to send, confirm you have reviewed its scope, materials, quantities, labour, prices and VAT. Download the reviewed quote?")) return;
    try {
      await downloadQuotePDF(quote, company);
    } catch {
      toast({ title: "Failed to generate PDF", variant: "destructive" });
    }
  };

  const handleCreateInvoice = (quote: Quote) => {
    // Build invoice line items from materials
    const lineItems: Array<{ name: string; quantity: number; unit: string; unitPrice: number; total: number }> = (
      quote.materials as Array<{
        name: string; quantity: number; unit: string;
        unitPrice?: number | null; total?: number | null;
      }>
    ).map(m => ({
      name: m.name,
      quantity: m.quantity,
      unit: m.unit,
      unitPrice: m.unitPrice ?? 0,
      total: m.total ?? 0,
    }));

    // Add margin as an explicit line item so recomputeTotals stays accurate
    if (quote.marginAmount !== null && quote.marginAmount !== undefined && quote.marginAmount > 0) {
      lineItems.push({
        name: `Contractor margin (${quote.marginPercent ?? 0}%)`,
        quantity: 1,
        unit: "allowance",
        unitPrice: quote.marginAmount,
        total: quote.marginAmount,
      });
    }

    const today = new Date();
    const dueDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Derive subtotal from line items so it's always consistent
    const subtotal = lineItems.reduce((s, i) => s + i.total, 0);
    const vatPct = quote.vatPercent ?? 20;
    const vatAmt = subtotal * (vatPct / 100);
    const total = subtotal + vatAmt;

    createInvoice.mutate({
      data: {
        quoteId: quote.id,
        jobId: quote.jobId ?? undefined,
        issueDate: format(today, "yyyy-MM-dd"),
        dueDate: format(dueDate, "yyyy-MM-dd"),
        lineItems,
        subtotal,
        vatPercent: vatPct,
        vatAmount: vatAmt,
        total,
        clientName: jobs.find(j => j.id === quote.jobId)?.contactName,
      }
    }, {
      onSuccess: (inv) => {
        toast({ title: `Invoice ${inv.invoiceNumber} created` });
        queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
        navigate("/invoices");
      },
      onError: () => {
        toast({ title: "Failed to create invoice", variant: "destructive" });
      }
    });
  };

  const getConfidenceColor = (confidence: string) => {
    if (confidence === 'high') return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    if (confidence === 'medium') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  };

  const filteredJobs = jobs.filter(j =>
    j.title.toLowerCase().includes(jobSearch.toLowerCase()) ||
    j.contactName.toLowerCase().includes(jobSearch.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-muted/30 overflow-hidden">
      <div className="p-6 border-b bg-background flex-shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-secondary">Quote Builder</h1>
            <p className="text-muted-foreground text-sm">Build full job estimates — labour, materials with AI pricing, margin &amp; VAT included.</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">

          {/* Pre-fill banner from call */}
          {prefillBanner && (
            <div className="flex items-center gap-3 p-3 bg-primary/10 border border-primary/20 rounded-lg text-sm text-primary font-medium">
              <Calculator size={16} />
              {prefillBanner}
              <button onClick={() => setPrefillBanner(null)} className="ml-auto text-primary/60 hover:text-primary">✕</button>
            </div>
          )}

          {/* Labour section - always visible */}
          <LabourSection items={labourItems} onChange={setLabourItems} />

          <div className="grid lg:grid-cols-12 gap-6">
            {/* Input Section */}
            <Card className="lg:col-span-5 flex flex-col">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2">
                  <Calculator className="h-5 w-5 text-primary" />
                  Material List
                </CardTitle>
                <CardDescription>Enter materials and quantities to estimate.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 flex-1">
                {inputs.map((input, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <div className="flex-1 space-y-2">
                      <Label className="sr-only">Material Name</Label>
                      <Input
                        placeholder="e.g. 2x4x8 Premium Stud"
                        value={input.name}
                        onChange={(e) => updateInput(index, "name", e.target.value)}
                      />
                    </div>
                    <div className="w-20 space-y-2">
                      <Label className="sr-only">Quantity</Label>
                      <Input
                        type="number"
                        min="1"
                        value={input.quantity}
                        onChange={(e) => updateInput(index, "quantity", Number(e.target.value))}
                      />
                    </div>
                    <div className="w-24 space-y-2">
                      <Label className="sr-only">Unit</Label>
                      <Input
                        placeholder="each, ft, box"
                        value={input.unit}
                        onChange={(e) => updateInput(index, "unit", e.target.value)}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive shrink-0 mt-0"
                      onClick={() => removeRow(index)}
                      disabled={inputs.length <= 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}

                <Button variant="outline" size="sm" className="w-full gap-2 border-dashed" onClick={addRow}>
                  <Plus className="h-4 w-4" /> Add Item
                </Button>
              </CardContent>
              <CardFooter className="pt-4 border-t bg-muted/20">
                <Button
                  className="w-full gap-2"
                  onClick={handleSearch}
                  disabled={searchPrices.isPending}
                >
                  {searchPrices.isPending ? (
                    <div className="h-4 w-4 border-2 border-current border-t-transparent animate-spin rounded-full" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  {searchPrices.isPending ? "Searching Prices..." : "Get AI Prices"}
                </Button>
              </CardFooter>
            </Card>

            {/* Results Section */}
            <Card className="lg:col-span-7 flex flex-col bg-secondary/5 border-secondary/10 shadow-inner">
              <CardHeader className="pb-4 border-b border-secondary/10 bg-background/50">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      Price Estimate Results
                    </CardTitle>
                    <CardDescription>Live market estimates sourced by CREWON.</CardDescription>
                  </div>
                  {combinedTotal > 0 && (
                    <Button size="sm" onClick={() => setIsSaveOpen(true)} className="gap-2">
                      <Save className="h-4 w-4" /> Save Quote
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0 flex-1 overflow-hidden">
                {!results && !searchPrices.isPending ? (
                  <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
                    <Search className="h-12 w-12 text-muted-foreground/30 mb-4" />
                    <p className="font-medium text-foreground/80">Awaiting Input</p>
                    <p className="text-sm mt-1">Enter your material list and click "Get AI Prices" to see estimates.</p>
                  </div>
                ) : searchPrices.isPending ? (
                  <div className="h-full min-h-[300px] flex flex-col items-center justify-center p-8">
                    <div className="h-8 w-8 border-4 border-primary border-t-transparent animate-spin rounded-full mb-4" />
                    <p className="font-medium text-foreground/80 animate-pulse">Scanning local suppliers...</p>
                  </div>
                ) : results ? (
                  <div className="overflow-auto max-h-[400px]">
                    <Table>
                      <TableHeader className="bg-background/80 sticky top-0">
                        <TableRow>
                          <TableHead>Material</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Unit Price</TableHead>
                          <TableHead>Source</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {results.materials.map((mat, i) => (
                          <TableRow key={i}>
                            <TableCell>
                              <div className="font-medium text-sm">{mat.name}</div>
                              <Badge variant="outline" className={`text-[10px] mt-1 uppercase tracking-wider py-0 border-0 ${getConfidenceColor(mat.confidence)}`}>
                                {mat.confidence} match
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right text-sm">
                              {mat.quantity} <span className="text-muted-foreground">{mat.unit}</span>
                            </TableCell>
                            <TableCell className="text-right text-sm">{formatCurrency(mat.unitPrice ?? 0)}</TableCell>
                            <TableCell>
                              <div className="text-sm font-medium">{mat.source}</div>
                              {mat.sourceUrl && (
                                <a href={mat.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1 mt-0.5">
                                  View <ExternalLink size={10} />
                                </a>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-semibold text-sm">{formatCurrency(mat.total ?? 0)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : null}
              </CardContent>

              {combinedTotal > 0 && (
                <>
                  {results && labourSubtotal > 0 && (
                    <div className="px-4 pt-2 text-sm space-y-1 border-t">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Materials subtotal</span><span>{formatCurrency(results.grandTotal)}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Labour subtotal</span><span>{formatCurrency(labourSubtotal)}</span>
                      </div>
                      <div className="flex justify-between font-semibold border-t pt-1">
                        <span>Combined subtotal</span><span>{formatCurrency(combinedTotal)}</span>
                      </div>
                    </div>
                  )}
                  <PricingPanel
                    grandTotal={combinedTotal}
                    marginPercent={marginPercent}
                    vatPercent={vatPercent}
                    onMarginChange={setMarginPercent}
                    onVatChange={setVatPercent}
                  />
                  {results && (
                    <div className="px-4 pb-4 shrink-0">
                      <div className="flex items-start gap-2 text-xs text-muted-foreground bg-amber-500/10 text-amber-800 dark:text-amber-400 p-3 rounded-md">
                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                        <p>{results.disclaimer}</p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </Card>
          </div>

          {/* Saved Quotes */}
          <div className="pt-8">
            <h2 className="text-lg font-bold tracking-tight text-secondary mb-4 flex items-center gap-2">
              Saved Quotes
            </h2>

            {isLoadingQuotes ? (
              <div className="text-center py-12 text-muted-foreground">Loading quotes...</div>
            ) : quotes.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed rounded-lg">
                <p className="text-muted-foreground text-sm font-medium">No saved quotes yet.</p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {quotes.map(quote => {
                  const linkedJob = jobs.find(j => j.id === quote.jobId);
                  return (
                    <Card key={quote.id} className="flex flex-col hover:border-primary/50 transition-colors">
                      <CardHeader className="pb-3 border-b">
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-xs font-bold text-secondary flex items-center gap-1">
                            <Calendar size={12} /> {format(new Date(quote.createdAt), "MMM d, yyyy")}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive -mr-2 -mt-2"
                            onClick={() => handleDelete(quote.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                        <CardTitle className="text-base leading-tight">{quote.title}</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-4 pb-4 flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-muted-foreground">Materials</span>
                          <Badge variant="secondary" className="font-mono">{quote.materials.length} items</Badge>
                        </div>
                        {linkedJob && (
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-muted-foreground">Linked Job</span>
                            <span className="text-sm font-medium truncate max-w-[120px]">{linkedJob.title}</span>
                          </div>
                        )}

                        <div className="mt-4 pt-4 border-t space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-semibold text-muted-foreground uppercase">Materials ex-VAT</span>
                            <span className="text-sm font-medium">{formatCurrency(quote.grandTotal)}</span>
                          </div>
                          {quote.totalIncVat !== null && quote.totalIncVat !== undefined ? (
                            <div className="flex justify-between items-end">
                              <span className="text-xs font-bold text-secondary uppercase">Total inc. VAT</span>
                              <span className="text-lg font-bold text-secondary">{formatCurrency(quote.totalIncVat)}</span>
                            </div>
                          ) : (
                            <div className="flex justify-between items-end">
                              <span className="text-xs font-semibold text-muted-foreground uppercase">Total</span>
                              <span className="text-lg font-bold text-secondary">{formatCurrency(quote.grandTotal)}</span>
                            </div>
                          )}
                        </div>
                      </CardContent>
                      <CardFooter className="pt-3 border-t bg-muted/20 flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 gap-1 text-xs"
                          onClick={() => handleDownloadPDF(quote)}
                        >
                          <Download className="h-3 w-3" /> PDF
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          className="flex-1 gap-1 text-xs"
                          onClick={() => handleCreateInvoice(quote)}
                          disabled={createInvoice.isPending}
                        >
                          <Receipt className="h-3 w-3" /> Invoice
                        </Button>
                      </CardFooter>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Save Quote Dialog */}
      <Dialog open={isSaveOpen} onOpenChange={setIsSaveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Save Quote</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveQuote} className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="title">Quote Title <span className="text-destructive">*</span></Label>
              <Input
                id="title"
                placeholder="e.g. Smith Residence Framing"
                value={quoteTitle}
                onChange={(e) => setQuoteTitle(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="jobSearch">Link to Job (Optional)</Label>
              <Input
                id="jobSearch"
                placeholder="Search jobs..."
                value={jobSearch}
                onChange={(e) => { setJobSearch(e.target.value); }}
              />
              {jobSearch && filteredJobs.length > 0 && (
                <div className="border rounded-md max-h-40 overflow-auto divide-y">
                  {filteredJobs.map(j => (
                    <button
                      key={j.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                      onClick={() => { setJobId(String(j.id)); setJobSearch(j.title); }}
                    >
                      <div className="font-medium">{j.title}</div>
                      <div className="text-xs text-muted-foreground">{j.contactName} · {format(new Date(j.scheduledAt), "MMM d, yyyy")}</div>
                    </button>
                  ))}
                </div>
              )}
              {jobId && (
                <div className="flex items-center gap-2 text-sm text-primary">
                  <FileText className="h-3 w-3" />
                  Job linked
                  <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => { setJobId(""); setJobSearch(""); }}>✕</button>
                </div>
              )}
            </div>

            {/* Pricing summary in save dialog */}
            {combinedTotal > 0 && (
              <div className="bg-muted/50 rounded-md p-3 space-y-1 text-sm">
                {results && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Materials subtotal</span>
                    <span>{formatCurrency(results.grandTotal)}</span>
                  </div>
                )}
                {labourSubtotal > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Labour subtotal</span>
                    <span>{formatCurrency(labourSubtotal)}</span>
                  </div>
                )}
                {(() => {
                  const { marginAmount, vatAmount, totalIncVat } = computePricing(combinedTotal, marginPercent, vatPercent);
                  return (
                    <>
                      <div className="flex justify-between border-t pt-1">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span>{formatCurrency(combinedTotal)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Margin ({marginPercent}%)</span>
                        <span>{formatCurrency(marginAmount)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">VAT ({vatPercent}%)</span>
                        <span>{formatCurrency(vatAmount)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-secondary pt-1 border-t">
                        <span>Total inc. VAT</span>
                        <span>{formatCurrency(totalIncVat)}</span>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {isCallDraft && (
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={quoteReviewed}
                  onChange={(e) => setQuoteReviewed(e.target.checked)}
                  required
                  className="mt-1 accent-orange-500"
                />
                <span>I have reviewed the scope, materials, quantities, labour, prices and VAT. This quote is ready to save for sending.</span>
              </label>
            )}
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsSaveOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createQuote.isPending || (isCallDraft && !quoteReviewed)} className="gap-2">
                <Save className="h-4 w-4" />
                {createQuote.isPending ? "Saving..." : "Save Quote"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
