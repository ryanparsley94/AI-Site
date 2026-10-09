import type { Quote } from "@workspace/api-client-react";
import { ShareQuote } from "./share-quote";
import { Copy, Eye, FileText, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/utils";
import { quoteTotal, statusLabel } from "./helpers";

export function QuoteList({ quotes, loading, error, onRetry, onOpen, onDuplicate, onDelete }: {
  quotes: Quote[]; loading: boolean; error: boolean; onRetry: () => void;
  onOpen: (q: Quote) => void; onDuplicate: (q: Quote) => void; onDelete: (q: Quote) => void;
}) {
  if (loading) return <div className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="h-20 animate-pulse rounded-lg bg-card/60" />)}</div>;
  if (error) return <div className="rounded-lg border border-destructive/40 p-6 text-center"><p className="mb-3 text-sm">Could not load quotes.</p><Button onClick={onRetry} className="h-11">Retry</Button></div>;
  if (!quotes.length) return (
    <div className="rounded-lg border border-dashed border-border p-10 text-center" data-testid="empty-quotes">
      <FileText className="mx-auto mb-3 h-8 w-8 text-primary" />
      <p className="font-semibold text-secondary">No quotes yet</p>
      <p className="mt-1 text-sm text-muted-foreground">Start blank, or from a contact, job or call.</p>
    </div>
  );
  return (
    <div className="space-y-2">
      {quotes.map(q => {
        const accepted = q.status === "accepted";
        return (
          <div key={q.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card/60 p-3" data-testid={`card-quote-${q.id}`}>
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(q)}>
              <p className="truncate font-semibold text-secondary">{q.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                Q-{q.id} | {q.workflow?.customerName || "No customer"} | {formatDate(q.createdAt)}
              </p>
            </button>
            <div className="flex items-center gap-2">
              {!q.workflow && <Badge variant="outline">Legacy</Badge>}
              <Badge variant="outline" data-testid={`badge-status-${q.id}`}>{statusLabel(q.status, q.sharedAt)}</Badge>
              <span className="w-24 text-right font-semibold tabular-nums" data-testid={`text-total-${q.id}`}>{formatCurrency(quoteTotal(q))}</span>
            </div>
            {q.status === "changes_requested" && q.changeRequest && <p className="w-full rounded-md border border-amber-400/40 bg-amber-400/10 p-2 text-sm" data-testid={`text-change-request-${q.id}`}>Client asked: {q.changeRequest}</p>}
            <div className="flex">
              {q.status === "reviewed" && <ShareQuote quote={q} />}
              <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => onOpen(q)} aria-label={accepted ? "View" : "Edit"} data-testid={`button-open-${q.id}`}>{accepted ? <Eye className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}</Button>
              <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => onDuplicate(q)} aria-label="Duplicate" data-testid={`button-dup-${q.id}`}><Copy className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" className="h-11 w-11 hover:text-destructive" onClick={() => onDelete(q)} aria-label="Delete" data-testid={`button-delete-${q.id}`}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
