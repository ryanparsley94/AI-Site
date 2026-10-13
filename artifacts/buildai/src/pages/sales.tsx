import { useMemo, useState } from "react";
import { Link } from "wouter";
import { isBefore, parseISO, startOfDay, format } from "date-fns";
import { useListContacts, useListCalls, useListInvoices, useListQuotes } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { FileText, Phone, ReceiptText, Users } from "lucide-react";

type SalesTab = "enquiries" | "quotes" | "acceptance" | "invoices";
export default function Sales() {
  const [tab, setTab] = useState<SalesTab>("enquiries");
  const [invoiceView, setInvoiceView] = useState<"all" | "unpaid" | "overdue">("all");
  const contactsQ = useListContacts();
  const callsQ = useListCalls({ limit: 100 });
  const quotesQ = useListQuotes();
  const invoicesQ = useListInvoices();
  const contacts = contactsQ.data ?? [], calls = callsQ.data ?? [], quotes = quotesQ.data ?? [], invoices = invoicesQ.data ?? [];
  const today = startOfDay(new Date());
  const overdue = (invoice: (typeof invoices)[number]) => invoice.status !== "paid" && isBefore(parseISO(invoice.dueDate), today);
  const filteredInvoices = useMemo(() => invoices.filter((invoice) => invoiceView === "all" || (invoiceView === "unpaid" ? invoice.status !== "paid" : overdue(invoice))), [invoices, invoiceView]);
  const loading = contactsQ.isLoading || callsQ.isLoading || quotesQ.isLoading || invoicesQ.isLoading;
  const error = contactsQ.isError || callsQ.isError || quotesQ.isError || invoicesQ.isError;
  const tabs: { id: SalesTab; label: string; count: number; icon: typeof Users }[] = [
    { id: "enquiries", label: "Enquiries", count: contacts.filter((contact) => contact.type === "lead").length + calls.filter((call) => call.status === "unresolved" || call.status === "missed").length, icon: Phone },
    { id: "quotes", label: "Quotes", count: quotes.length, icon: FileText },
    { id: "acceptance", label: "Awaiting acceptance", count: quotes.filter((quote) => quote.status === "reviewed" && Boolean(quote.sharedAt)).length, icon: Users },
    { id: "invoices", label: "Invoices", count: invoices.length, icon: ReceiptText },
  ];
  return <main className="min-h-full bg-background px-4 py-6 sm:px-6 lg:px-8" data-testid="page-sales"><div className="mx-auto max-w-6xl">
    <div className="border-b border-border pb-5"><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-primary">Customer pipeline</p><h1 className="mt-1 text-2xl font-semibold">Sales</h1><p className="mt-1 text-sm text-muted-foreground">Enquiries, quotes and invoices linked to the existing records.</p></div>
    <div className="mt-5 flex flex-wrap gap-1 border-b border-border" role="tablist">{tabs.map(({ id, label, count, icon: Icon }) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`inline-flex items-center gap-2 border-b-2 px-3 py-3 text-sm ${tab === id ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground"}`} data-testid={`sales-tab-${id}`}><Icon size={14} />{label}<span className="font-mono text-xs">{loading ? "—" : count}</span></button>)}</div>
    {tab === "invoices" && <div className="flex gap-2 py-3">{(["all", "unpaid", "overdue"] as const).map((view) => <button key={view} onClick={() => setInvoiceView(view)} className={`rounded-sm border px-3 py-1.5 text-xs capitalize ${invoiceView === view ? "border-primary text-primary" : "border-border text-muted-foreground"}`} data-testid={`invoice-filter-${view}`}>{view}</button>)}</div>}
    {error && <p className="my-4 border-l-2 border-amber-400 bg-card p-3 text-xs text-muted-foreground">Some sales data failed to load. The counts and records shown are only from successful requests.</p>}
    <section className="mt-4 border border-border bg-card">
      {loading ? <p className="p-6 text-sm text-muted-foreground">Loading sales records…</p> :
        tab === "enquiries" ? <div className="divide-y divide-border">
          {calls.filter((call) => call.status === "unresolved" || call.status === "missed").map((call) => <Link key={`call-${call.id}`} href={`/calls/${call.id}`} className="block px-4 py-4 hover:bg-muted/30"><p className="text-sm font-medium">{call.callerName || call.callerPhone || "Caller"} · {call.status === "missed" ? "Missed call" : "Needs follow-up"}</p><p className="mt-1 text-xs text-muted-foreground">{call.outcome || call.notes || "Call enquiry"} · {format(new Date(call.createdAt), "d MMM, HH:mm")}</p></Link>)}
          {contacts.filter((contact) => contact.type === "lead").map((contact) => <Link key={`contact-${contact.id}`} href="/contacts" className="block px-4 py-4 hover:bg-muted/30"><p className="text-sm font-medium">{contact.name} · New lead</p><p className="mt-1 text-xs text-muted-foreground">{contact.phone}{contact.address ? ` · ${contact.address}` : ""}</p></Link>)}
          {contacts.filter((contact) => contact.type === "lead").length + calls.filter((call) => call.status === "unresolved" || call.status === "missed").length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">No open enquiries. New leads and calls needing review appear here.</p>}
        </div> : tab === "quotes" || tab === "acceptance" ? <div className="divide-y divide-border">
          {quotes.filter((quote) => tab === "quotes" || (quote.status === "reviewed" && Boolean(quote.sharedAt))).map((quote) => <Link key={quote.id} href="/quotes" className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 hover:bg-muted/30"><span><span className="block text-sm font-medium">{quote.title}</span><span className="mt-1 block text-xs capitalize text-muted-foreground">{quote.status}{quote.sharedAt ? ` · sent ${format(new Date(quote.sharedAt), "d MMM")}` : ""}</span></span><span className="font-mono text-sm">{formatCurrency(Number(quote.totalIncVat ?? quote.grandTotal ?? 0))}</span></Link>)}
          {quotes.filter((quote) => tab === "quotes" || (quote.status === "reviewed" && Boolean(quote.sharedAt))).length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">No quotes in this view. Create a draft in Quote Builder.</p>}
        </div> : <div className="divide-y divide-border">
          {filteredInvoices.map((invoice) => <Link key={invoice.id} href="/invoices" className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 hover:bg-muted/30"><span><span className="block text-sm font-medium">{invoice.invoiceNumber} · {invoice.clientName || "Customer"}</span><span className={`mt-1 block text-xs capitalize ${overdue(invoice) ? "text-destructive" : "text-muted-foreground"}`}>{overdue(invoice) ? "overdue" : invoice.status} · due {format(parseISO(invoice.dueDate), "d MMM yyyy")}</span></span><span className="font-mono text-sm">{formatCurrency(invoice.total)}</span></Link>)}
          {filteredInvoices.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">No invoices match this view.</p>}
        </div>}
    </section>
  </div></main>;
}
