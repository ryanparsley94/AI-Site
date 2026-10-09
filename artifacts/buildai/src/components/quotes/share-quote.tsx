import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateQuoteAcceptanceLink, getListQuotesQueryKey, type Quote } from "@workspace/api-client-react";
import { Check, Copy, Mail, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiBase } from "./helpers";

export function ShareQuote({ quote }: { quote: Quote }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [confirm, setConfirm] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const link = useCreateQuoteAcceptanceLink();
  const email = quote.workflow?.customerEmail?.trim();

  const generate = () => {
    setErr(null);
    link.mutate({ id: quote.id }, {
      onSuccess: r => {
        setConfirm(false);
        setUrl(window.location.origin + apiBase() + r.path);
        setCopied(false);
        qc.invalidateQueries({ queryKey: getListQuotesQueryKey() });
      },
      onError: () => setErr("Could not create the link. Check the quote is still reviewed and try again."),
    });
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(url!); setCopied(true); toast({ title: "Link copied" }); }
    catch { input.current?.select(); toast({ title: "Copy blocked. The link is selected, press Ctrl+C.", variant: "destructive" }); }
  };
  const mailto = url && email
    ? `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(`Quote: ${quote.title}`)}&body=${encodeURIComponent(`Hello,\n\nYou can review and respond to your quote here:\n${url}\n`)}`
    : null;

  return (
    <>
      <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Share quote" onClick={() => { setErr(null); setConfirm(true); }} data-testid={`button-share-${quote.id}`}><Share2 className="h-4 w-4" /></Button>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader><DialogTitle>Share quote online</DialogTitle>
            <DialogDescription>{quote.sharedAt ? "Creating a new link revokes the earlier link. The old link will stop working." : "Creates a private link your customer can use to accept or request changes."}</DialogDescription></DialogHeader>
          {err && <p className="text-sm text-destructive" data-testid="text-share-error">{err}</p>}
          <DialogFooter><Button className="h-11" onClick={generate} disabled={link.isPending} data-testid="button-create-link">{link.isPending ? "Creating..." : err ? "Retry" : "Create link"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!url} onOpenChange={o => { if (!o) setUrl(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Customer link ready</DialogTitle>
            <DialogDescription>Send this to your customer. Creating another link later revokes this one.</DialogDescription></DialogHeader>
          <div className="flex gap-2">
            <Input ref={input} readOnly value={url ?? ""} className="h-11" onFocus={e => e.currentTarget.select()} data-testid="input-share-url" />
            <Button className="h-11" onClick={copy} data-testid="button-copy-link">{copied ? <Check className="mr-1 h-4 w-4" /> : <Copy className="mr-1 h-4 w-4" />}{copied ? "Copied" : "Copy"}</Button>
          </div>
          {mailto ? <Button variant="outline" className="h-11" asChild><a href={mailto} data-testid="link-email-customer"><Mail className="mr-1.5 h-4 w-4" />Open in your email app</a></Button>
            : <p className="text-xs text-muted-foreground">Add a customer email on the quote to prefill an email draft.</p>}
          <p className="text-xs text-muted-foreground">Nothing is sent automatically. Your email app opens a draft for you to send.</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
