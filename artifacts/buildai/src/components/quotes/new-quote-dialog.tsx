import { useState } from "react";
import type { Call, Contact, Job } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { selectCls } from "./ui";

export type StartKind = "blank" | "contact" | "job" | "call";

export function NewQuoteDialog({ open, onOpenChange, contacts, jobs, calls, busy, onStart }: {
  open: boolean; onOpenChange: (o: boolean) => void; contacts: Contact[]; jobs: Job[]; calls: Call[]; busy: boolean;
  onStart: (kind: StartKind, id?: number) => void;
}) {
  const [kind, setKind] = useState<StartKind>("blank");
  const [id, setId] = useState("");
  const opts = kind === "contact" ? contacts.map(c => [c.id, `${c.name} (${c.phone})`] as const)
    : kind === "job" ? jobs.map(j => [j.id, `${j.title} - ${j.contactName}`] as const)
    : kind === "call" ? calls.map(c => [c.id, `${c.callerName || c.callerPhone} - ${new Date(c.createdAt).toLocaleDateString("en-GB")}`] as const) : [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>New quote</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          {(["blank", "contact", "job", "call"] as const).map(k => (
            <button key={k} type="button" onClick={() => { setKind(k); setId(""); }} data-testid={`button-start-${k}`}
              className={`h-12 rounded-md border text-sm font-medium ${kind === k ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>
              {k === "blank" ? "Blank quote" : `From ${k}`}
            </button>
          ))}
        </div>
        {kind !== "blank" && (
          <select className={selectCls} value={id} onChange={e => setId(e.target.value)} data-testid="select-start-source">
            <option value="">Choose a {kind}...</option>
            {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        )}
        {kind === "call" && <p className="text-xs text-muted-foreground">Quantities from the call are evidence only. Cost and selling start at zero until you price them.</p>}
        <p className="text-xs text-muted-foreground">Details are copied into the quote. Customer records are not changed.</p>
        <Button className="h-11" disabled={busy || (kind !== "blank" && !id)} onClick={() => onStart(kind, id ? Number(id) : undefined)} data-testid="button-start-quote">{busy ? "Starting..." : "Start quote"}</Button>
      </DialogContent>
    </Dialog>
  );
}
