import type { QuoteWorkflow } from "@workspace/api-zod";
import { AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import type { Calc } from "./helpers";
import { Field, NumInput, Panel, selectCls } from "./ui";

const Row = ({ k, v, strong, tone }: { k: string; v: string; strong?: boolean; tone?: string }) => (
  <div className={`flex items-baseline justify-between gap-3 py-1 ${strong ? "text-base font-semibold text-secondary" : "text-sm"}`}>
    <span className="text-muted-foreground">{k}</span>
    <span className={`tabular-nums ${tone ?? ""}`}>{v}</span>
  </div>
);

export function TotalsPanel({ w, onChange, calc, error }: {
  w: QuoteWorkflow; onChange: (w: QuoteWorkflow) => void; calc: Calc | null; error: string | null;
}) {
  const loss = calc ? calc.profit < 0 : false;
  const mode = w.deposit.mode;
  return (
    <Panel title="Totals" hint="Internal view. Cost and profit never appear on the customer document.">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="VAT">
          <label className="flex h-11 items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5 accent-[#36C6D5]" checked={w.vatRegistered} onChange={e => onChange({ ...w, vatRegistered: e.target.checked })} data-testid="check-vat-registered" />
            VAT registered
          </label>
        </Field>
        {w.vatRegistered && (
          <>
            <Field label="VAT rate %"><NumInput value={w.vatPercent} onChange={n => onChange({ ...w, vatPercent: n })} testid="input-vat-percent" /></Field>
            <Field label="VAT number" className="sm:col-span-2"><Input className="h-11" value={w.vatNumber} onChange={e => onChange({ ...w, vatNumber: e.target.value })} data-testid="input-vat-number" /></Field>
          </>
        )}
        <Field label="Deposit">
          <select className={selectCls} value={mode} data-testid="select-deposit-mode"
            onChange={e => {
              const m = e.target.value as QuoteWorkflow["deposit"]["mode"];
              onChange({ ...w, deposit: { mode: m, value: m === "materials" ? 100 : m === "none" ? 0 : w.deposit.value } });
            }}>
            <option value="none">No deposit</option>
            <option value="materials">% of materials (inc. VAT)</option>
            <option value="fixed">Fixed amount (GBP)</option>
            <option value="percentage">% of total</option>
          </select>
        </Field>
        {mode !== "none" && (
          <Field label={mode === "fixed" ? "Deposit GBP" : "Deposit %"}>
            <NumInput value={w.deposit.value} onChange={n => onChange({ ...w, deposit: { ...w.deposit, value: n } })} testid="input-deposit-value" />
          </Field>
        )}
      </div>
      <div className="mt-4 border-t border-border pt-3">
        {error && (
          <p className="mb-2 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive-foreground" data-testid="text-calc-error">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
          </p>
        )}
        {calc && (
          <>
            <Row k="Subtotal (selling)" v={formatCurrency(calc.subtotal)} />
            <Row k={w.vatRegistered ? `VAT ${calc.vatPercent}%` : "VAT (not registered)"} v={formatCurrency(calc.vatAmount)} />
            <Row k="Total" v={formatCurrency(calc.total)} strong />
            {mode !== "none" && <Row k="Deposit due" v={formatCurrency(calc.depositAmount)} />}
            {mode !== "none" && <Row k="Balance" v={formatCurrency(calc.balance)} />}
            <div className="mt-3 rounded-md bg-background/60 p-3">
              <p className="mb-1 text-[11px] uppercase tracking-wider text-primary">Private</p>
              <Row k="Your cost" v={formatCurrency(calc.costTotal)} />
              <Row k="Profit (ex VAT)" v={`${formatCurrency(calc.profit)} (${calc.profitPercent.toFixed(1)}%)`} tone={loss ? "font-semibold text-destructive" : "text-primary"} />
              {loss && <p className="mt-1 text-xs text-destructive" data-testid="text-loss-warning">Selling is below cost. This quote loses money.</p>}
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}
