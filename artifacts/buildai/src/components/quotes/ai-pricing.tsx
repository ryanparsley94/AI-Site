import { useState } from "react";
import { useSearchMaterialPrices, type PricedMaterial } from "@workspace/api-client-react";
import type { QuoteItem, QuoteWorkflow } from "@workspace/api-zod";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { NumInput, Panel } from "./ui";

type Hit = { itemId: string; snap: string; m: PricedMaterial; cost: number; sell: number; open: boolean };
const snapOf = (i: QuoteItem) => JSON.stringify([i.description, i.quantity, i.unit, i.costPrice, i.sellPrice]);

export function AiPricing({ w, onChange }: { w: QuoteWorkflow; onChange: (w: QuoteWorkflow) => void }) {
  const search = useSearchMaterialPrices();
  const { toast } = useToast();
  const [hits, setHits] = useState<Hit[]>([]);
  const [note, setNote] = useState("");
  const all = w.sections.flatMap(s => s.items);
  const targets = all.filter(i => i.type === "materials" && i.description.trim() && i.quantity > 0);

  const run = () => {
    const sent = targets.map(i => ({ id: i.id, snap: snapOf(i), name: i.description, quantity: i.quantity, unit: i.unit }));
    search.mutate({ data: { materials: sent.map(s => ({ name: s.name, quantity: s.quantity, unit: s.unit })) } }, {
      onSuccess: r => {
        setNote(r.disclaimer);
        setHits(r.materials.map((m, idx) => {
          const cur = all.find(i => i.id === sent[idx]?.id);
          return { itemId: sent[idx]?.id ?? "", snap: sent[idx]?.snap ?? "", m, cost: m.unitPrice, sell: cur && cur.sellPrice > 0 ? cur.sellPrice : m.unitPrice, open: false };
        }).filter(h => h.itemId));
      },
      onError: () => toast({ title: "AI pricing is unavailable. You can keep entering prices manually.", variant: "destructive" }),
    });
  };
  const patch = (id: string, p: Partial<Hit>) => setHits(hs => hs.map(h => (h.itemId === id ? { ...h, ...p } : h)));
  const apply = (h: Hit) => {
    const cur = all.find(i => i.id === h.itemId);
    if (!cur || snapOf(cur) !== h.snap) {
      toast({ title: "That line changed since the search. Run the search again.", variant: "destructive" });
      setHits(hs => hs.filter(x => x.itemId !== h.itemId));
      return;
    }
    onChange({ ...w, sections: w.sections.map(s => ({ ...s, items: s.items.map(i => i.id === h.itemId
      ? { ...i, costPrice: h.cost, sellPrice: h.sell, source: `${h.m.source} (${h.m.confidence} confidence)`, sourceUrl: h.m.sourceUrl || undefined, pricedAt: new Date().toISOString(), priceVerified: false } : i) })) });
    setHits(hs => hs.filter(x => x.itemId !== h.itemId));
    toast({ title: "Estimate applied. Check it before sending." });
  };

  return (
    <Panel title="AI price estimates (optional)" hint="Estimates only, not verified. Entering prices by hand always works.">
      <Button type="button" variant="outline" className="h-11" disabled={!targets.length || search.isPending} onClick={run} data-testid="button-ai-price">
        <Sparkles className="mr-2 h-4 w-4" />{search.isPending ? "Searching..." : `Estimate ${targets.length} material line${targets.length === 1 ? "" : "s"}`}
      </Button>
      {note && <p className="mt-2 text-xs text-muted-foreground">{note}</p>}
      <div className="mt-3 space-y-2">
        {hits.map(h => {
          const cur = all.find(i => i.id === h.itemId);
          return (
            <div key={h.itemId} className="rounded-md border border-border p-3 text-sm" data-testid={`ai-hit-${h.itemId}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><p className="font-medium">{cur?.description}</p>
                  <p className="text-xs text-muted-foreground">Unverified estimate {formatCurrency(h.m.unitPrice)} per {h.m.unit} from {h.m.source}</p></div>
                <Button type="button" size="sm" className="h-10" onClick={() => patch(h.itemId, { open: !h.open })}>Review</Button>
              </div>
              {h.open && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <label className="space-y-1 text-xs">Cost each<NumInput value={h.cost} onChange={n => patch(h.itemId, { cost: n })} /></label>
                  <label className="space-y-1 text-xs">Selling each<NumInput value={h.sell} onChange={n => patch(h.itemId, { sell: n })} /></label>
                  <p className="col-span-2 text-xs text-amber-300/90">Applying replaces this line's cost and selling price with these figures. They stay marked unverified.</p>
                  <Button type="button" className="col-span-2 h-11" onClick={() => apply(h)} data-testid={`button-apply-ai-${h.itemId}`}>Confirm and apply</Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
