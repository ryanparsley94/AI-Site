import { useState } from "react";
import {
  useListInvoices,
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
  Printer, ChevronRight, Plus, Minus, RefreshCw
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
import { formatCurrency } from "@/lib/utils";

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

// ── Invoice detail panel ─────────────────────────────────────────────────────

function InvoiceDetail({
  id,
  onClose,
}: {
  id: number;
  onClose: () => void;
}) {
  const { data: invoice, isLoading } = useGetInvoice(id);
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

  const sorted = [...invoices].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div className="flex-1 flex h-full bg-muted/30 overflow-hidden">
      {/* List panel */}
      <div className={`flex flex-col border-r bg-background ${selectedId ? "hidden md:flex md:w-96 shrink-0" : "flex-1"}`}>
        <div className="p-6 border-b flex-shrink-0">
          <h1 className="text-2xl font-bold tracking-tight text-secondary">Invoices</h1>
          <p className="text-muted-foreground text-sm">Track your outstanding and paid invoices.</p>
        </div>

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Loading invoices...</div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-16 px-6">
              <Receipt className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="font-medium text-foreground/80">No invoices yet</p>
              <p className="text-sm text-muted-foreground mt-1">Create an invoice from a saved quote on the Quotes page.</p>
            </div>
          ) : (
            <div className="divide-y">
              {sorted.map(inv => (
                <button
                  key={inv.id}
                  className={`w-full text-left px-6 py-4 hover:bg-muted/40 transition-colors flex items-center gap-4 ${selectedId === inv.id ? "bg-muted/50 border-l-2 border-primary" : ""}`}
                  onClick={() => setSelectedId(inv.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-semibold text-sm text-secondary">{inv.invoiceNumber}</span>
                      <StatusBadge status={inv.status} />
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
              ))}
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
  );
}
