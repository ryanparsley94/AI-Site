import { useEffect, useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const parse = (s: string) => (s === "" || s === "." ? 0 : Number(s));

export function NumInput({ value, onChange, className, testid, placeholder }: {
  value: number; onChange: (n: number) => void; className?: string; testid?: string; placeholder?: string;
}) {
  const [s, setS] = useState(String(value));
  useEffect(() => {
    setS(prev => (parse(prev) === value ? prev : String(value)));
  }, [value]);
  return (
    <Input
      inputMode="decimal"
      value={s}
      placeholder={placeholder}
      data-testid={testid}
      className={cn("h-11 tabular-nums", className)}
      onFocus={e => e.target.select()}
      onChange={e => {
        const t = e.target.value;
        if (!/^\d*\.?\d*$/.test(t)) return;
        setS(t);
        onChange(parse(t));
      }}
    />
  );
}

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export const selectCls =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60";

export function Panel({ title, hint, children, right }: { title: string; hint?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card/60">
      <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-secondary">{title}</h3>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
        {right}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}
