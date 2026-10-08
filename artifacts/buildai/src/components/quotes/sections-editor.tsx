import { useState } from "react";
import { sellingFromCost, type QuoteItem, type QuoteSection, type QuoteWorkflow } from "@workspace/api-zod";
import { ArrowDown, ArrowUp, ExternalLink, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { ITEM_TYPES, UNITS, newItem, uid, type Calc } from "./helpers";
import { NumInput, Panel, selectCls } from "./ui";

type Method = "markup" | "margin";
const swap = <T,>(a: T[], i: number, j: number) => {
  if (j < 0 || j >= a.length) return a;
  const n = [...a];
  [n[i], n[j]] = [n[j], n[i]];
  return n;
};

function MarkupControl({ pct, method, onPct, onMethod, onApply, label, testid }: {
  pct: number; method: Method; onPct: (n: number) => void; onMethod: (m: Method) => void; onApply: () => void; label: string; testid: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-20"><NumInput value={pct} onChange={onPct} testid={`input-${testid}-percent`} /></div>
      <span className="text-sm text-muted-foreground">%</span>
      <select className={selectCls + " !w-28"} value={method} onChange={e => onMethod(e.target.value as Method)} data-testid={`select-${testid}-method`}>
        <option value="markup">Markup</option>
        <option value="margin">Margin</option>
      </select>
      <Button type="button" variant="outline" className="h-11" onClick={onApply} data-testid={`button-${testid}-apply`}>{label}</Button>
    </div>
  );
}

function ItemRow({ item, index, count, lineTotal, onChange, onMove, onRemove }: {
  item: QuoteItem; index: number; count: number; lineTotal?: { total: number; costTotal: number };
  onChange: (p: Partial<QuoteItem>) => void; onMove: (d: number) => void; onRemove: () => void;
}) {
  const { toast } = useToast();
  const [pct, setPct] = useState(0);
  const [method, setMethod] = useState<Method>("markup");
  const apply = () => {
    try { onChange({ sellPrice: sellingFromCost(item.costPrice, pct, method), priceVerified: item.priceVerified }); }
    catch (e) { toast({ title: e instanceof Error ? e.message : "Invalid values", variant: "destructive" }); }
  };
  const loss = !!lineTotal && lineTotal.costTotal > 0 && lineTotal.total < lineTotal.costTotal;
  return (
    <div className={`rounded-md border p-3 ${loss ? "border-destructive/60" : "border-border"} bg-background/40`} data-testid={`row-item-${item.id}`}>
      <div className="flex gap-2">
        <Input className="h-11 flex-1" placeholder="Description" value={item.description} onChange={e => onChange({ description: e.target.value })} data-testid={`input-desc-${item.id}`} />
        <div className="flex shrink-0">
          <Button type="button" variant="ghost" size="icon" className="h-11 w-9" disabled={index === 0} onClick={() => onMove(-1)} aria-label="Move up"><ArrowUp className="h-4 w-4" /></Button>
          <Button type="button" variant="ghost" size="icon" className="h-11 w-9" disabled={index === count - 1} onClick={() => onMove(1)} aria-label="Move down"><ArrowDown className="h-4 w-4" /></Button>
          <Button type="button" variant="ghost" size="icon" className="h-11 w-9 text-muted-foreground hover:text-destructive" onClick={onRemove} aria-label="Remove line" data-testid={`button-remove-item-${item.id}`}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <label className="space-y-1"><span className="text-[10px] uppercase tracking-wider text-muted-foreground">Type</span>
          <select className={selectCls} value={item.type} onChange={e => onChange({ type: e.target.value as QuoteItem["type"] })}>
            {ITEM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select></label>
        <label className="space-y-1"><span className="text-[10px] uppercase tracking-wider text-muted-foreground">Qty</span>
          <NumInput value={item.quantity} onChange={n => onChange({ quantity: n })} testid={`input-qty-${item.id}`} /></label>
        <label className="space-y-1"><span className="text-[10px] uppercase tracking-wider text-muted-foreground">Unit</span>
          <Input className="h-11" list="quote-units" value={item.unit} onChange={e => onChange({ unit: e.target.value })} data-testid={`input-unit-${item.id}`} /></label>
        <label className="space-y-1"><span className="text-[10px] uppercase tracking-wider text-muted-foreground">Cost each</span>
          <NumInput value={item.costPrice} onChange={n => onChange({ costPrice: n })} testid={`input-cost-${item.id}`} /></label>
        <label className="space-y-1"><span className="text-[10px] uppercase tracking-wider text-muted-foreground">Selling each</span>
          <NumInput value={item.sellPrice} onChange={n => onChange({ sellPrice: n })} testid={`input-sell-${item.id}`} /></label>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <MarkupControl pct={pct} method={method} onPct={setPct} onMethod={setMethod} onApply={apply} label="Set selling" testid={`row-${item.id}`} />
        <div className="text-right text-sm tabular-nums">
          <span className="font-semibold text-secondary" data-testid={`text-line-total-${item.id}`}>{lineTotal ? formatCurrency(lineTotal.total) : "-"}</span>
          {lineTotal && <span className={`ml-2 text-xs ${loss ? "text-destructive" : "text-primary"}`}>{loss ? "Loss " : "Profit "}{formatCurrency(lineTotal.total - lineTotal.costTotal)}</span>}
        </div>
      </div>
      {item.source && (
        <p className="mt-2 text-xs text-amber-300/90">
          AI estimate, unverified{item.pricedAt ? ` (${new Date(item.pricedAt).toLocaleDateString("en-GB")})` : ""}: {item.source}
          {item.sourceUrl && <a className="ml-1 inline-flex items-center gap-0.5 underline" href={item.sourceUrl} target="_blank" rel="noreferrer">link<ExternalLink className="h-3 w-3" /></a>}
        </p>
      )}
    </div>
  );
}

export function SectionsEditor({ w, onChange, calc }: { w: QuoteWorkflow; onChange: (w: QuoteWorkflow) => void; calc: Calc | null }) {
  const { toast } = useToast();
  const [pct, setPct] = useState(0);
  const [method, setMethod] = useState<Method>("markup");
  const lines = new Map((calc?.lines ?? []).map(l => [l.id, l]));
  const setSections = (sections: QuoteSection[]) => onChange({ ...w, sections });
  const patchSection = (si: number, p: Partial<QuoteSection>) => setSections(w.sections.map((s, i) => (i === si ? { ...s, ...p } : s)));

  const bulk = () => {
    if (!window.confirm("Replace the selling price on every line that has a cost?")) return;
    try {
      setSections(w.sections.map(s => ({ ...s, items: s.items.map(i => (i.costPrice > 0 ? { ...i, sellPrice: sellingFromCost(i.costPrice, pct, method) } : i)) })));
    } catch (e) { toast({ title: e instanceof Error ? e.message : "Invalid values", variant: "destructive" }); }
  };

  return (
    <Panel title="Work and pricing" hint="Cost is private. Selling price is what the customer sees."
      right={<Button type="button" size="sm" variant="outline" className="h-9" onClick={() => setSections([...w.sections, { id: uid(), title: "New section", items: [] }])} data-testid="button-add-section"><Plus className="mr-1 h-4 w-4" />Section</Button>}>
      <datalist id="quote-units">{UNITS.map(u => <option key={u} value={u} />)}</datalist>
      <div className="mb-4 rounded-md border border-dashed border-border p-3">
        <p className="mb-2 text-xs text-muted-foreground">Bulk: set selling price on all costed lines</p>
        <MarkupControl pct={pct} method={method} onPct={setPct} onMethod={setMethod} onApply={bulk} label="Apply to all" testid="bulk" />
      </div>
      <div className="space-y-5">
        {w.sections.map((s, si) => (
          <div key={s.id} className="space-y-2" data-testid={`section-${s.id}`}>
            <div className="flex gap-2">
              <Input className="h-11 flex-1 font-semibold" value={s.title} onChange={e => patchSection(si, { title: e.target.value })} data-testid={`input-section-title-${s.id}`} />
              <Button type="button" variant="ghost" size="icon" className="h-11" disabled={si === 0} onClick={() => setSections(swap(w.sections, si, si - 1))} aria-label="Move section up"><ArrowUp className="h-4 w-4" /></Button>
              <Button type="button" variant="ghost" size="icon" className="h-11" disabled={si === w.sections.length - 1} onClick={() => setSections(swap(w.sections, si, si + 1))} aria-label="Move section down"><ArrowDown className="h-4 w-4" /></Button>
              <Button type="button" variant="ghost" size="icon" className="h-11 hover:text-destructive" disabled={w.sections.length <= 1}
                onClick={() => { if (!s.items.length || window.confirm("Remove this section and its lines?")) setSections(w.sections.filter((_, i) => i !== si)); }} aria-label="Remove section" data-testid={`button-remove-section-${s.id}`}><Trash2 className="h-4 w-4" /></Button>
            </div>
            {s.items.length === 0 && <p className="rounded-md border border-border/60 p-3 text-sm text-muted-foreground">No lines yet. Nothing is charged until you add one.</p>}
            {s.items.map((it, ii) => (
              <ItemRow key={it.id} item={it} index={ii} count={s.items.length} lineTotal={lines.get(it.id)}
                onChange={p => patchSection(si, { items: s.items.map(x => (x.id === it.id ? { ...x, ...p } : x)) })}
                onMove={d => patchSection(si, { items: swap(s.items, ii, ii + d) })}
                onRemove={() => patchSection(si, { items: s.items.filter(x => x.id !== it.id) })} />
            ))}
            <div className="flex flex-wrap gap-2">
              {(["materials", "labour", "other"] as const).map(t => (
                <Button key={t} type="button" variant="outline" size="sm" className="h-10 border-dashed" onClick={() => patchSection(si, { items: [...s.items, newItem(t)] })} data-testid={`button-add-${t}-${s.id}`}>
                  <Plus className="mr-1 h-3.5 w-3.5" />{ITEM_TYPES.find(x => x.value === t)?.label}
                </Button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
