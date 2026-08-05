import { useState } from "react";
import {
  useListInvoices,
  useCreateInvoice,
  useGetInvoice,
  useUpdateInvoice,
  useDeleteInvoice,
  getListInvoicesQueryKey,
  Invoice,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Receipt, Trash2, CheckCircle, Send, Clock,
  Printer, ChevronRight, Plus, Minus, RefreshCw, FilePlus
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";

// ── New Invoice dialog ────────────────────────────────────────────────────────

type LineItem = { description: string; quantity: number; unitPrice: number };

function NewInvoiceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createInvoice = useCreateInvoice();

  const today = format(new Date(), "yyyy-MM-dd");
  const due30 = format(new Date(Date.now() + 30 * 86400000), "yyyy-MM-dd");

  const [clientName, setClientName] = useState("");
  const [issueDate, setIssueDate] = useState(today);
  const [dueDate, setDueDate] = useState(due30);
  const [vatPercent, setVatPercent] = useState(20);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineItem[]>([
    { description: "", quantity: 1, unitPrice: 0 },
  ]);

  const updateLine = (idx: number, field: keyof LineItem, value: string | number) => {
    setLines(lines.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  };

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const vatAmt = subtotal * (vatPercent / 100);
  const total = subtotal + vatAmt;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim()) {
      toast({ title: "Client name is required", variant: "destructive" }); return;
    }
    if (subtotal === 0) {
      toast({ title: "Add at least one line item with a value", variant: "destructive" }); return;
    }
    createInvoice.mutate({
      data: {
        clientName,
        issueDate,
        dueDate,
        vatPercent,
        notes: notes || undefined,
        lineItems: lines.filter(l => l.description.trim()).map(l => ({
          name: l.description, quantity: l.quantity, unit: "each",
          unitPrice: l.unitPrice, total: l.quantity * l.unitPrice,
        })),
        subtotal,
        vatAmount: vatAmt,
        total,
      }
    }, {
      onSuccess: () => {
        toast({ title: "Invoice created" });
        queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
        onOpenChange(false);
        // reset form
        setClientName(""); setNotes(""); setVatPercent(20);
        setIssueDate(today); setDueDate(due30);
        setLines([{ description: "", quantity: 1, unitPrice: 0 }]);
      },
      onError: () => toast({ title: "Failed to create invoice", variant: "destructive" }),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FilePlus className="h-5 w-5 text-primary" /> New Invoice
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5 pt-2">
          {/* Client + dates */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-1 space-y-1">
              <Label>Client Name *</Label>
              <Input placeholder="e.g. John Smith" value={clientName} onChange={e => setClientName(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label>Issue Date</Label>
              <Input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Due Date</Label>
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
          </div>

          {/* Line items */}
          <div className="space-y-2">
            <Label>Line Items</Label>
            <div className="space-y-2">
              {lines.map((l, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    placeholder="Description"
                    value={l.description}
                    onChange={e => updateLine(idx, "description", e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    type="number" min="0.5" step="0.5"
                    value={l.quantity}
                    onChange={e => updateLine(idx, "quantity", Number(e.target.value))}
                    className="w-20"
                    placeholder="Qty"
                  />
                  <Input
                    type="number" min="0" step="0.01"
                    value={l.unitPrice}
                    onChange={e => updateLine(idx, "unitPrice", Number(e.target.value))}
                    className="w-28"
                    placeholder="£ Unit price"
                  />
                  <span className="text-sm font-medium w-20 text-right shrink-0">
                    {formatCurrency(l.quantity * l.unitPrice)}
                  </span>
                  <Button type="button" variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => setLines(lines.filter((_, i) => i !== idx))} disabled={lines.length <= 1}>
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" className="gap-2 border-dashed w-full"
              onClick={() => setLines([...lines, { description: "", quantity: 1, unitPrice: 0 }])}>
              <Plus className="h-3.5 w-3.5" /> Add Line
            </Button>
          </div>

          {/* VAT + totals */}
          <div className="flex justify-end">
            <div className="w-64 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">VAT</span>
                <div className="flex items-center gap-1">
                  <Input type="number" min="0" max="100" value={vatPercent}
                    onChange={e => setVatPercent(Number(e.target.value))}
                    className="w-16 h-7 text-sm text-right" />
                  <span className="text-muted-foreground text-xs">%</span>
                  <span className="w-20 text-right">{formatCurrency(vatAmt)}</span>
                </div>
              </div>
              <Separator />
              <div className="flex justify-between font-bold text-secondary">
                <span>Total inc. VAT</span>
                <span>{formatCurrency(total)}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <Label>Notes (optional)</Label>
            <Textarea placeholder="Payment terms, bank details, etc." value={notes}
              onChange={e => setNotes(e.target.value)} rows={2} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={createInvoice.isPending} className="gap-2">
              <FilePlus className="h-4 w-4" />
              {createInvoice.isPending ? "Creating..." : "Create Invoice"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Status badge ─────────────────────────────────────────────────────────────

const statusConfig = {
  draft: { label: "Draft", color: "bg-slate-100 text-slate-700", icon: Clock },
  sent: { label: "Sent", color: "bg-blue-100 text-blue-700", icon: Send },
  paid: { label: "Paid", color: "bg-green-100 text-green-700", icon: CheckCircle },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status as keyof typeof statusConfig] ?? statusConfig.draft;
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={`${cfg.color} border-0 gap-1`}>
      <Icon className="h-3 w-3" /> {cfg.label}
    </Badge>
  );
}

interface InvoiceExportSectionProps {
  invoiceId: number;
  externalId?: string | null;
  externalProvider?: string | null;
  onExported: () => void;
}
function InvoiceDetail({
  id,
  onClose,
}: {
  id: number;
  onClose: () => void;
}) {
  const { data: invoice, isLoading, refetch } = useGetInvoice(id);
  const updateInvoice = useUpdateInvoice();
  const deleteInvoice = useDeleteInvoice();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [editNotes, setEditNotes] = useState<string | null>(null);
  const [editLineItems, setEditLineItems] = useState<null | Array<{
    name: string; quantity: number; unit: string; unitPrice: number; total: number;
  }>>(null);

  if (isLoading || !invoice) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        Loading...
      </div>
    );
  }

  const lineItems = editLineItems ?? (invoice.lineItems as Array<{
    name: string; quantity: number; unit: string; unitPrice: number; total: number;
  }>);

  const notes = editNotes ?? (invoice.notes ?? "");
  const isDirty = editNotes !== null || editLineItems !== null;

  const recomputeTotals = (items: typeof lineItems) => {
    const subtotal = items.reduce((s, i) => s + (i.unitPrice * i.quantity), 0);
    const vatAmount = subtotal * (invoice.vatPercent / 100);
    const total = subtotal + vatAmount;
    return { subtotal, vatAmount, total };
  };

  const updateLineItem = (idx: number, field: string, value: string | number) => {
    const updated = lineItems.map((item, i) => {
      if (i !== idx) return item;
      const newItem = { ...item, [field]: value };
      if (field === "unitPrice" || field === "quantity") {
        newItem.total = Number(newItem.unitPrice) * Number(newItem.quantity);
      }
      return newItem;
    });
    setEditLineItems(updated);
  };

  const addLineItem = () => {
    setEditLineItems([...lineItems, { name: "", quantity: 1, unit: "each", unitPrice: 0, total: 0 }]);
  };

  const removeLineItem = (idx: number) => {
    setEditLineItems(lineItems.filter((_, i) => i !== idx));
  };

  const saveChanges = () => {
    const { subtotal, vatAmount, total } = recomputeTotals(lineItems);
    updateInvoice.mutate({
      id,
      data: {
        lineItems,
        notes: notes || undefined,
        subtotal,
        vatAmount,
        total,
      }
    }, {
      onSuccess: () => {
        setEditLineItems(null);
        setEditNotes(null);
        toast({ title: "Invoice updated" });
        queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
      }
    });
  };

  const updateStatus = (status: "draft" | "sent" | "paid") => {
    updateInvoice.mutate({ id, data: { status } }, {
      onSuccess: () => {
        toast({ title: `Invoice marked as ${status}` });
        queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
      }
    });
  };

  const handleDelete = () => {
    if (confirm("Delete this invoice?")) {
      deleteInvoice.mutate({ id }, {
        onSuccess: () => {
          toast({ title: "Invoice deleted" });
          queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
          onClose();
        }
      });
    }
  };

  const { subtotal: displaySubtotal, vatAmount: displayVat, total: displayTotal } = recomputeTotals(lineItems);
  const isReadOnly = invoice.status !== "draft";

  // externalId / externalProvider live in the raw invoice response but aren't
  // in the generated TypeScript type yet — cast to access them safely.
  const raw = invoice as Invoice & { externalId?: string | null; externalProvider?: string | null };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-secondary">{invoice.invoiceNumber}</h2>
          {invoice.clientName && <p className="text-muted-foreground text-sm mt-0.5">{invoice.clientName}</p>}
          <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
            <span>Issued: {invoice.issueDate}</span>
            <span>Due: {invoice.dueDate}</span>
          </div>
        </div>
        <StatusBadge status={invoice.status} />
      </div>

      {/* Status actions */}
      {!isReadOnly && (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="gap-2" onClick={() => updateStatus("sent")}>
            <Send className="h-3.5 w-3.5" /> Mark Sent
          </Button>
        </div>
      )}
      {invoice.status === "sent" && (
        <div className="flex gap-2">
          <Button size="sm" className="gap-2 bg-green-600 hover:bg-green-700" onClick={() => updateStatus("paid")}>
            <CheckCircle className="h-3.5 w-3.5" /> Mark Paid
          </Button>
          <Button size="sm" variant="outline" className="gap-2" onClick={() => updateStatus("draft")}>
            <RefreshCw className="h-3.5 w-3.5" /> Back to Draft
          </Button>
        </div>
      )}

      {/* Accounting export */}
      <InvoiceExportSection
        invoiceId={id}
        externalId={raw.externalId}
        externalProvider={raw.externalProvider}
        onExported={() => refetch()}
      />

      {/* Line items */}
      <div>
        <h3 className="font-semibold text-sm mb-2">Line Items</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Description</TableHead>
              <TableHead className="text-right w-16">Qty</TableHead>
              <TableHead className="text-right w-24">Unit Price</TableHead>
              <TableHead className="text-right w-24">Total</TableHead>
              {!isReadOnly && <TableHead className="w-8" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {lineItems.map((item, i) => (
              <TableRow key={i}>
                <TableCell>
                  {!isReadOnly ? (
                    <Input
                      value={item.name}
                      onChange={e => updateLineItem(i, "name", e.target.value)}
                      className="h-7 text-sm"
                    />
                  ) : <span className="text-sm">{item.name}</span>}
                </TableCell>
                <TableCell className="text-right">
                  {!isReadOnly ? (
                    <Input
                      type="number"
                      value={item.quantity}
                      onChange={e => updateLineItem(i, "quantity", Number(e.target.value))}
                      className="h-7 text-sm text-right w-16"
                    />
                  ) : <span className="text-sm">{item.quantity}</span>}
                </TableCell>
                <TableCell className="text-right">
                  {!isReadOnly ? (
                    <Input
                      type="number"
                      value={item.unitPrice}
                      onChange={e => updateLineItem(i, "unitPrice", Number(e.target.value))}
                      className="h-7 text-sm text-right w-24"
                    />
                  ) : <span className="text-sm">{formatCurrency(item.unitPrice)}</span>}
                </TableCell>
                <TableCell className="text-right text-sm font-medium">{formatCurrency(item.unitPrice * item.quantity)}</TableCell>
                {!isReadOnly && (
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => removeLineItem(i)}>
                      <Minus className="h-3 w-3" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!isReadOnly && (
          <Button variant="outline" size="sm" className="mt-2 gap-1 border-dashed" onClick={addLineItem}>
            <Plus className="h-3 w-3" /> Add line
          </Button>
        )}
      </div>

      {/* Totals */}
      <div className="bg-muted/50 rounded-md p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span>{formatCurrency(displaySubtotal)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">VAT ({invoice.vatPercent}%)</span>
          <span>{formatCurrency(displayVat)}</span>
        </div>
        <Separator />
        <div className="flex justify-between font-bold text-secondary">
          <span>Total</span>
          <span className="text-lg">{formatCurrency(displayTotal)}</span>
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Notes</Label>
        {!isReadOnly ? (
          <Textarea
            value={notes}
            onChange={e => setEditNotes(e.target.value)}
            placeholder="e.g. Payment by BACS. Sort code: 01-02-03, Account: 12345678"
            rows={3}
          />
        ) : (
          invoice.notes && <p className="text-sm text-muted-foreground bg-muted/30 rounded p-3">{invoice.notes}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        {isDirty && !isReadOnly && (
          <Button onClick={saveChanges} disabled={updateInvoice.isPending} className="gap-2">
            {updateInvoice.isPending ? "Saving..." : "Save Changes"}
          </Button>
        )}
        <Button variant="outline" className="gap-2" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Print / Save PDF
        </Button>
        <Button variant="destructive" size="sm" className="ml-auto gap-2" onClick={handleDelete}>
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </Button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Invoices() {
  const { data: invoices = [], isLoading } = useListInvoices();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isNewOpen, setIsNewOpen] = useState(false);

  const sorted = [...invoices].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <>
    <NewInvoiceDialog open={isNewOpen} onOpenChange={setIsNewOpen} />
    <div className="flex-1 flex h-full bg-muted/30 overflow-hidden">
      {/* List panel */}
      <div className={`flex flex-col border-r bg-background ${selectedId ? "hidden md:flex md:w-96 shrink-0" : "flex-1"}`}>
        <div className="p-6 border-b flex-shrink-0 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-secondary">Invoices</h1>
            <p className="text-muted-foreground text-sm">Track your outstanding and paid invoices.</p>
          </div>
          <Button className="shrink-0 gap-2" onClick={() => setIsNewOpen(true)}>
            <FilePlus className="h-4 w-4" /> New Invoice
          </Button>
        </div>

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Loading invoices...</div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-16 px-6">
              <Receipt className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="font-medium text-foreground/80">No invoices yet</p>
              <p className="text-sm text-muted-foreground mt-1">Create a new invoice or generate one from a saved quote.</p>
              <Button className="mt-4 gap-2" onClick={() => setIsNewOpen(true)}>
                <FilePlus className="h-4 w-4" /> New Invoice
              </Button>
            </div>
          ) : (
            <div className="divide-y">
              {sorted.map(inv => {
                const raw = inv as Invoice & { externalId?: string | null; externalProvider?: string | null };
                return (
                  <button
                    key={inv.id}
                    className={`w-full text-left px-6 py-4 hover:bg-muted/40 transition-colors flex items-center gap-4 ${selectedId === inv.id ? "bg-muted/50 border-l-2 border-primary" : ""}`}
                    onClick={() => setSelectedId(inv.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="font-semibold text-sm text-secondary">{inv.invoiceNumber}</span>
                        <StatusBadge status={inv.status} />
                        {raw.externalProvider && (
                          <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200 gap-0.5 px-1.5">
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            {raw.externalProvider === "quickbooks" ? "QB" : "Xero"}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{inv.clientName || "—"}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Issued {inv.issueDate} · Due {inv.dueDate}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-secondary">{formatCurrency(inv.total)}</p>
                      <ChevronRight className="h-4 w-4 text-muted-foreground mt-1 ml-auto" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selectedId && (
        <div className="flex-1 overflow-auto p-6 bg-background print:p-0">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-2 mb-6">
              <Button variant="ghost" size="sm" className="gap-1 md:hidden" onClick={() => setSelectedId(null)}>
                ← Back
              </Button>
            </div>
            <Card className="print:shadow-none print:border-0">
              <CardHeader className="border-b">
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="h-5 w-5 text-primary" />
                  Invoice Detail
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <InvoiceDetail id={selectedId} onClose={() => setSelectedId(null)} />
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
    </>
  );
}

function InvoiceExportSection({ invoiceId, externalId, externalProvider, onExported }: InvoiceExportSectionProps) {
  const { data: integrations } = useGetIntegrationStatus();
  const exportInvoice = useExportInvoice();
  const { toast } = useToast();
  const [exportError, setExportError] = useState<string | null>(null);

  const qbConnected = integrations?.quickbooks?.connected ?? false;
  const xeroConnected = integrations?.xero?.connected ?? false;

  // If already synced, show a badge and optional re-export
  const alreadySynced = !!externalId;
  const syncedProvider = externalProvider;

  const handleExport = (target: "quickbooks" | "xero") => {
    setExportError(null);
    exportInvoice.mutate({ id: invoiceId, target }, {
      onSuccess: (result) => {
        toast({
          title: `Synced to ${target === "quickbooks" ? "QuickBooks" : "Xero"} ✓`,
          description: target === "xero" && result.url
            ? undefined
            : undefined,
        });
        onExported();
      },
      onError: (err) => {
        setExportError(err.message || "Export failed — please try again");
      },
    });
  };

  const showQb = qbConnected || !xeroConnected;
  const showXero = xeroConnected || !qbConnected;
  const showSection = qbConnected || xeroConnected;

  if (!showSection) return null;

  return (
    <div className="border rounded-lg p-4 space-y-3 bg-muted/20">
      <p className="text-sm font-semibold text-secondary">Accounting Export</p>

      {alreadySynced && (
        <div className="flex items-center gap-2 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>
            Synced to {syncedProvider === "quickbooks" ? "QuickBooks" : "Xero"} — ID: <code className="font-mono text-xs">{externalId}</code>
          </span>
        </div>
      )}

      {exportError && (
        <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-md p-3">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{exportError}</span>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {qbConnected && (
          <Button
            size="sm"
            variant={alreadySynced && syncedProvider === "quickbooks" ? "secondary" : "outline"}
            className="gap-2"
            onClick={() => handleExport("quickbooks")}
            disabled={exportInvoice.isPending}
          >
            {exportInvoice.isPending && exportInvoice.variables?.target === "quickbooks" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <BookOpen className="h-3.5 w-3.5" />
            )}
            {alreadySynced && syncedProvider === "quickbooks" ? "Re-export to QuickBooks" : "Export to QuickBooks"}
          </Button>
        )}
        {xeroConnected && (
          <Button
            size="sm"
            variant={alreadySynced && syncedProvider === "xero" ? "secondary" : "outline"}
            className="gap-2"
            onClick={() => handleExport("xero")}
            disabled={exportInvoice.isPending}
          >
            {exportInvoice.isPending && exportInvoice.variables?.target === "xero" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <PlugZap className="h-3.5 w-3.5" />
            )}
            {alreadySynced && syncedProvider === "xero" ? "Re-export to Xero" : "Export to Xero"}
          </Button>
        )}
      </div>
    </div>
  );
}
