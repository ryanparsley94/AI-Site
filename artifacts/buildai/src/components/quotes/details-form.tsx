import type { QuoteWorkflow } from "@workspace/api-zod";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, Panel } from "./ui";

export function DetailsForm({ w, onChange, title, onTitle }: {
  w: QuoteWorkflow; onChange: (w: QuoteWorkflow) => void; title: string; onTitle: (t: string) => void;
}) {
  const set = <K extends keyof QuoteWorkflow>(k: K, v: QuoteWorkflow[K]) => onChange({ ...w, [k]: v });
  return (
    <div className="space-y-4">
      <Panel title="Customer and site" hint="Copied into this quote only. Customer records are never changed.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Quote title" className="sm:col-span-2">
            <Input className="h-11" value={title} onChange={e => onTitle(e.target.value)} data-testid="input-quote-title" placeholder="e.g. Kitchen rewire, 14 Mill Lane" />
          </Field>
          <Field label="Customer name"><Input className="h-11" value={w.customerName} onChange={e => set("customerName", e.target.value)} data-testid="input-customer-name" /></Field>
          <Field label="Phone"><Input className="h-11" inputMode="tel" value={w.customerPhone} onChange={e => set("customerPhone", e.target.value)} data-testid="input-customer-phone" /></Field>
          <Field label="Email"><Input className="h-11" inputMode="email" value={w.customerEmail} onChange={e => set("customerEmail", e.target.value)} data-testid="input-customer-email" /></Field>
          <Field label="Quote valid until"><Input className="h-11" type="date" value={w.validUntil} onChange={e => set("validUntil", e.target.value)} data-testid="input-valid-until" /></Field>
          <Field label="Billing address"><Textarea rows={2} value={w.billingAddress} onChange={e => set("billingAddress", e.target.value)} data-testid="input-billing-address" /></Field>
          <Field label="Site address"><Textarea rows={2} value={w.siteAddress} onChange={e => set("siteAddress", e.target.value)} data-testid="input-site-address" /></Field>
        </div>
      </Panel>
      <Panel title="Scope and terms">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Scope of work" className="md:col-span-2"><Textarea rows={4} value={w.scope} onChange={e => set("scope", e.target.value)} data-testid="input-scope" /></Field>
          <Field label="Assumptions"><Textarea rows={3} value={w.assumptions} onChange={e => set("assumptions", e.target.value)} data-testid="input-assumptions" /></Field>
          <Field label="Exclusions"><Textarea rows={3} value={w.exclusions} onChange={e => set("exclusions", e.target.value)} data-testid="input-exclusions" /></Field>
          <Field label="Payment terms" className="md:col-span-2"><Textarea rows={3} value={w.paymentTerms} onChange={e => set("paymentTerms", e.target.value)} data-testid="input-payment-terms" /></Field>
        </div>
      </Panel>
    </div>
  );
}
