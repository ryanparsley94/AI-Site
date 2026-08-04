import { useState, useEffect, useCallback } from "react";
import {
  useListQuotes,
  useCreateQuote,
  useUpdateQuote,
  useDeleteQuote,
  useSearchMaterialPrices,
  useListJobs,
  useCreateInvoice,
  getListQuotesQueryKey,
  getListInvoicesQueryKey,
  PriceSearchResult,
  Quote,
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

// ── Pricing helpers ──────────────────────────────────────────────────────────

function computePricing(grandTotal: number, marginPercent: number, vatPercent: number) {
  const marginAmount = grandTotal * (marginPercent / 100);
  const subtotalAfterMargin = grandTotal + marginAmount;
  const vatAmount = subtotalAfterMargin * (vatPercent / 100);
  const totalIncVat = subtotalAfterMargin + vatAmount;
  return { marginAmount, subtotalAfterMargin, vatAmount, totalIncVat };
}

// ── PDF generation ──────────────────────────────────────────────────────────

async function downloadQuotePDF(quote: Quote, companyName?: string) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF();
  const marginX = 14;

  // Header
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text(companyName || "Your Company", marginX, 22);

  doc.setFontSize(14);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.text("Quote", marginX, 32);

  doc.setFontSize(10);
  doc.text(quote.title, marginX, 40);
  doc.text(`Date: ${format(new Date(quote.createdAt), "d MMM yyyy")}`, marginX, 47);

  doc.setTextColor(0, 0, 0);

  // Materials table
  const tableBody = (quote.materials as Array<{
    name: string; quantity: number; unit: string;
    unitPrice?: number | null; source?: string | null; total?: number | null;
  }>).map(m => [
    m.name,
    `${m.quantity} ${m.unit}`,
    formatCurrency(m.unitPrice ?? 0),
    m.source ?? "",
    formatCurrency(m.total ?? 0),
  ]);

  autoTable(doc, {
    startY: 55,
    head: [["Material", "Qty", "Unit Price", "Source", "Total"]],
    body: tableBody,
    theme: "striped",
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    styles: { fontSize: 9 },
    columnStyles: { 4: { halign: "right" } },
    margin: { left: marginX, right: marginX },
  });

  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  // Pricing breakdown
  doc.setFontSize(10);
  const rightX = 196;
  let y = finalY;

  const addRow = (label: string, value: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(label, 120, y);
    doc.text(value, rightX, y, { align: "right" });
    y += 7;
  };

  doc.setFont("helvetica", "bold");
  doc.text("Pricing Breakdown", marginX, y);
  doc.setFont("helvetica", "normal");
  y += 8;

  addRow("Materials subtotal (ex-VAT)", formatCurrency(quote.grandTotal));

  if (quote.marginPercent !== null && quote.marginPercent !== undefined) {
    addRow(`Margin (${quote.marginPercent}%)`, formatCurrency(quote.marginAmount ?? 0));
    addRow("Subtotal after margin", formatCurrency((quote.grandTotal) + (quote.marginAmount ?? 0)));
  }
  if (quote.vatPercent !== null && quote.vatPercent !== undefined) {
    addRow(`VAT (${quote.vatPercent}%)`, formatCurrency(quote.vatAmount ?? 0));
  }

  doc.line(120, y - 2, rightX, y - 2);

  if (quote.totalIncVat !== null && quote.totalIncVat !== undefined) {
    addRow("Total inc. VAT", formatCurrency(quote.totalIncVat), true);
  }

  // Footer disclaimer
  y += 10;
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  const disclaimer = "Prices are estimates based on current UK online trade prices, ex-VAT unless stated. Please confirm live pricing before purchasing. VAT at 20% applied.";
  const lines = doc.splitTextToSize(disclaimer, 180);
  doc.text(lines, marginX, y);

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
  const searchPrices = useSearchMaterialPrices();
  const createQuote = useCreateQuote();
  const updateQuote = useUpdateQuote();
  const deleteQuote = useDeleteQuote();
  const createInvoice = useCreateInvoice();

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [inputs, setInputs] = useState<{name: string, quantity: number, unit: string}[]>(initialInput);
  const [results, setResults] = useState<PriceSearchResult | null>(null);
  const [prefillBanner, setPrefillBanner] = useState<string | null>(null);

  // Pricing state
  const [marginPercent, setMarginPercent] = useState(20);
  const [vatPercent, setVatPercent] = useState(20);

  const [isSaveOpen, setIsSaveOpen] = useState(false);
  const [quoteTitle, setQuoteTitle] = useState("");
  const [jobId, setJobId] = useState<string>("");
  const [jobSearch, setJobSearch] = useState("");

  // Pre-fill from a "Create Quote from Call" action
  useEffect(() => {
    const raw = sessionStorage.getItem("buildai_prefill_quote");
    if (!raw) return;
    sessionStorage.removeItem("buildai_prefill_quote");
    try {
      const prefill = JSON.parse(raw);
      if (prefill.materials?.length) {
        setInputs(prefill.materials.map((m: { name: string; quantity: number; unit: string }) => ({
          name: m.name ?? "",
          quantity: Number(m.quantity) || 1,
          unit: m.unit ?? "each",
        })));
      }
      if (prefill.title) setQuoteTitle(prefill.title);
      if (prefill.callerName) setPrefillBanner(`Pre-filled from call with ${prefill.callerName}`);
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

  const getPricingValues = useCallback(() => {
    if (!results) return {};
    const { marginAmount, subtotalAfterMargin, vatAmount, totalIncVat } = computePricing(results.grandTotal, marginPercent, vatPercent);
    return { marginPercent, vatPercent, marginAmount, subtotalAfterMargin, vatAmount, totalIncVat };
  }, [results, marginPercent, vatPercent]);

  const handleSaveQuote = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!results) return;
    if (!quoteTitle.trim()) {
      toast({ title: "Please enter a quote title", variant: "destructive" });
      return;
    }

    const pricing = getPricingValues();

    createQuote.mutate({
      data: {
        title: quoteTitle,
        jobId: jobId ? Number(jobId) : undefined,
        grandTotal: results.grandTotal,
        materials: results.materials.map(m => ({
          name: m.name,
          quantity: m.quantity,
          unit: m.unit,
          unitPrice: m.unitPrice,
          source: m.source,
          sourceUrl: m.sourceUrl,
          total: m.total
        })),
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
    try {
      await downloadQuotePDF(quote);
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
            <h1 className="text-2xl font-bold tracking-tight text-secondary">AI Materials Quotation Tool</h1>
            <p className="text-muted-foreground text-sm">Instantly estimate costs using AI-powered price search across suppliers.</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">

          {/* Pre-fill banner from call */}
          {prefillBanner && (
            <div className="flex items-center gap-3 p-3 bg-primary/10 border border-primary/20 rounded-lg text-sm text-primary font-medium">
              <Calculator size={16} />
              {prefillBanner} — materials pre-filled below. Review and click "Get AI Prices".
              <button onClick={() => setPrefillBanner(null)} className="ml-auto text-primary/60 hover:text-primary">✕</button>
            </div>
          )}

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
                    <CardDescription>Live market estimates sourced by BuildAI.</CardDescription>
                  </div>
                  {results && (
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

              {results && (
                <>
                  <PricingPanel
                    grandTotal={results.grandTotal}
                    marginPercent={marginPercent}
                    vatPercent={vatPercent}
                    onMarginChange={setMarginPercent}
                    onVatChange={setVatPercent}
                  />
                  <div className="px-4 pb-4 shrink-0">
                    <div className="flex items-start gap-2 text-xs text-muted-foreground bg-amber-500/10 text-amber-800 dark:text-amber-400 p-3 rounded-md">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <p>{results.disclaimer}</p>
                    </div>
                  </div>
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
            {results && (
              <div className="bg-muted/50 rounded-md p-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Materials subtotal</span>
                  <span>{formatCurrency(results.grandTotal)}</span>
                </div>
                {(() => {
                  const { marginAmount, subtotalAfterMargin, vatAmount, totalIncVat } = computePricing(results.grandTotal, marginPercent, vatPercent);
                  return (
                    <>
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

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsSaveOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createQuote.isPending} className="gap-2">
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
