import { useMemo, useState } from "react";
import { Link } from "wouter";
import { isBefore, parseISO, startOfDay, format } from "date-fns";
import { useListContacts, useListInvoices, useListQuotes } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { ArrowUpRight, FileText, Phone, ReceiptText, Users } from "lucide-react";

type SalesTab = "enquiries" | "quotes" | "acceptance" | "invoices";
const tabStyles: Record<SalesTab, string> = {
  enquiries: "border-l-cyan-400 bg-cyan-400/10 text-cyan-100",
  quotes: "border-l-sky-400 bg-sky-400/10 text-sky-100",
  acceptance: "border-l-amber-400 bg-amber-400/10 text-amber-100",
  invoices: "border-l-emerald-400 bg-emerald-400/10 text-emerald-100",
};

export default function Sales() {
  const [tab, setTab] = useState<SalesTab>("enquiries");
  const [invoiceView, setInvoiceView] = useState<"all" | "unpaid" | "overdue">("all");
  const contactsQ = useListContacts();
  const quotesQ = useListQuotes();
  const invoicesQ = useListInvoices();
  const contacts = contactsQ.data ?? [], quotes = quotesQ.data ?? [], invoices = invoicesQ.data ?? [];
  const today = startOfDay(new Date());
  const unpaidInvoices = invoices.filter((invoice) => invoice.status === "sent");
  const overdueInvoices = unpaidInvoices.filter((invoice) => isBefore(parseISO(invoice.dueDate), today));
  const overdue = (invoice: (typeof invoices)[number]) => invoice.status === "sent" && isBefore(parseISO(invoice.dueDate), today);
  const filteredInvoices = useMemo(() => invoiceView === "all" ? invoices : invoiceView === "unpaid" ? unpaidInvoices : overdueInvoices, [invoices, invoiceView]);
  const leads = contacts.filter((contact) => contact.type === "lead");
  const loading = contactsQ.isLoading || quotesQ.isLoading || invoicesQ.isLoading;
  const error = contactsQ.isError || quotesQ.isError || invoicesQ.isError;
  const awaiting = quotes.filter((quote) => quote.status === "reviewed" && Boolean(quote.sharedAt));
  const tabs: { id: SalesTab; label: string; count: number; icon: typeof Users; href: string }[] = [
    { id: "enquiries", label: "Enquiries", count: leads.length, icon: Phone, href: "/contacts" },
    { id: "quotes", label: "Quotes", count: quotes.length, icon: FileText, href: "/quotes" },
    { id: "acceptance", label: "Awaiting Acceptance", count: awaiting.length, icon: Users, href: "/quotes" },
    { id: "invoices", label: "Invoices", count: invoices.length, icon: ReceiptText, href: "/invoices" },
  ];
  const setSalesTab = (value: SalesTab) => { setTab(value); if (value !== "invoices") setInvoiceView("all"); };
  const invoiceFilters = [
    { id: "all" as const, label: "All", count: invoices.length },
    { id: "unpaid" as const, label: "Unpaid", count: unpaidInvoices.length },
    { id: "overdue" as const, label: "Overdue", count: overdueInvoices.length },
  ];

  return <main className="min-h-full bg-background px-4 pb-28 pt-5 sm:px-6 sm:py-6 lg:px-8" data-testid="page-sales">
    <div className="mx-auto max-w-6xl">
      <div className="border-b border-border pb-4 sm:pb-5">
        <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-primary">Customer pipeline</p>
        <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Sales</h1>
        <p className="mt-1 text-sm text-muted-foreground">Enquiries, quotes and invoices.</p>
      </div>

      <nav className="mt-4 grid grid-cols-2 gap-3 md:hidden" aria-label="Sales sections">
        {tabs.map(({ id, label, count, icon: Icon }) => <button key={id} type="button"
          onClick={() => setSalesTab(id)} aria-pressed={tab === id} data-testid={`sales-tile-${id}`}
          className={`flex min-h-[92px] items-center justify-between gap-3 rounded-lg border border-l-4 px-4 py-3 text-left shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${tab === id ? tabStyles[id] : "border-border bg-card text-foreground hover:bg-muted/50"}`}>
          <span className="min-w-0"><span className="flex items-center gap-2 text-sm font-semibold leading-tight"><Icon size={18} aria-hidden="true" />{label}</span>
            <span className="mt-2 block text-xs text-muted-foreground">{id === "acceptance" ? "Sent, awaiting reply" : id === "invoices" ? "Billing records" : id === "quotes" ? "Prepare and review" : "New customer work"}</span></span>
          <span className="shrink-0 text-2xl font-bold tabular-nums">{loading ? "—" : count}</span>
        </button>)}
      </nav>

      <div className="mt-5 hidden border-b border-border md:flex" role="tablist" aria-label="Sales sections">
        {tabs.map(({ id, label, count, icon: Icon }) => <button key={id} role="tab" aria-selected={tab === id}
          onClick={() => setSalesTab(id)} className={`inline-flex min-h-12 items-center gap-2 border-b-2 px-4 text-sm transition-colors ${tab === id ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          data-testid={`sales-tab-${id}`}><Icon size={16} />{label}<span className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs">{loading ? "—" : count}</span></button>)}
      </div>

      {tab === "invoices" && <div className="grid grid-cols-3 gap-2 py-4" role="group" aria-label="Filter invoices">
        {invoiceFilters.map(({ id, label, count }) => <button key={id} type="button" aria-pressed={invoiceView === id}
          onClick={() => setInvoiceView(id)} data-testid={`invoice-filter-${id}`}
          className={`min-h-12 rounded-lg border px-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:px-4 ${invoiceView === id ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}>
          {label}<span className="ml-1.5 font-mono tabular-nums">{loading ? "—" : count}</span>
        </button>)}
      </div>}

      {error && <p className="my-4 border-l-2 border-amber-400 bg-card p-3 text-sm text-muted-foreground">Some sales data failed to load. Counts and records below use only successful requests.</p>}
      <section className="mt-4 overflow-hidden rounded-lg border border-border bg-card" aria-label={`${tabs.find((item) => item.id === tab)?.label} records`}>
        {loading ? <p className="p-6 text-sm text-muted-foreground">Loading sales records…</p> :
          tab === "enquiries" ? <div className="divide-y divide-border">
            {leads.map((contact) => <Link key={`contact-${contact.id}`} href="/contacts" className="grid min-h-[88px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-4 transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary">
              <span className="min-w-0 break-words"><span className="block text-base font-semibold">{contact.name}</span><span className="mt-1 block break-words text-sm text-muted-foreground">{contact.phone || "No phone"}{contact.address ? ` · ${contact.address}` : ""}</span></span>
              <span className="inline-flex items-center gap-1 rounded-full bg-cyan-400/10 px-3 py-1.5 text-xs font-semibold text-cyan-200">Lead <ArrowUpRight size={13} /></span>
            </Link>)}
            {leads.length === 0 && <p className="p-7 text-center text-sm text-muted-foreground">No lead records yet. New enquiries will appear here when a customer record is created or matched.</p>}
          </div> : tab === "quotes" || tab === "acceptance" ? <div className="divide-y divide-border">
            {quotes.filter((quote) => tab === "quotes" || (quote.status === "reviewed" && Boolean(quote.sharedAt))).map((quote) => <Link key={quote.id} href="/quotes" className="grid min-h-[88px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-4 transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary">
              <span className="min-w-0 break-words"><span className="block break-words text-base font-semibold">{quote.title}</span><span className="mt-1 block text-sm capitalize text-muted-foreground">{quote.status}{quote.sharedAt ? ` · sent ${format(new Date(quote.sharedAt), "d MMM")}` : ""}</span></span>
              <span className="text-right"><span className="block whitespace-nowrap font-mono text-base font-semibold tabular-nums">{formatCurrency(Number(quote.totalIncVat ?? quote.grandTotal ?? 0))}</span><span className="text-xs text-muted-foreground">Quote total</span></span>
            </Link>)}
            {quotes.filter((quote) => tab === "quotes" || (quote.status === "reviewed" && Boolean(quote.sharedAt))).length === 0 && <p className="p-7 text-center text-sm text-muted-foreground">No quotes in this view. Create a draft in Quote Builder.</p>}
          </div> : <div className="divide-y divide-border">
            {filteredInvoices.map((invoice) => <Link key={invoice.id} href="/invoices" className="grid min-h-[88px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-4 transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary">
              <span className="min-w-0 break-words"><span className="block break-words text-base font-semibold">{invoice.invoiceNumber} · {invoice.clientName || "Customer"}</span><span className={`mt-1 block text-sm ${overdue(invoice) ? "font-semibold text-destructive" : "text-muted-foreground"}`}>{overdue(invoice) ? "Overdue" : invoice.status} · due {format(parseISO(invoice.dueDate), "d MMM yyyy")}</span></span>
              <span className="text-right"><span className="block whitespace-nowrap font-mono text-base font-semibold tabular-nums">{formatCurrency(invoice.total)}</span><span className="text-xs text-muted-foreground">Invoice total</span></span>
            </Link>)}
            {filteredInvoices.length === 0 && <p className="p-7 text-center text-sm text-muted-foreground">No invoices match this view.</p>}
          </div>}
      </section>
    </div>
  </main>;
}
