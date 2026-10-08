import { useGetPilotReadiness, getGetPilotReadinessQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { ShieldCheck, AlertCircle, ArrowUpRight, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function PilotReleaseGate() {
  const { data, isLoading, error } = useGetPilotReadiness({
    query: { queryKey: getGetPilotReadinessQueryKey(), refetchOnMount: true, refetchInterval: 30000 },
  });
  if (isLoading) return <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">Checking pilot readiness…</div>;
  if (error || !data) return <div className="rounded-xl border border-destructive/40 bg-card p-5 text-sm">Pilot readiness could not be checked. Do not assume the receptionist is live.</div>;
  return (
    <section className="rounded-xl border border-primary/25 bg-card p-5 sm:p-6" aria-labelledby="pilot-release-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
            <ShieldCheck size={16} /> V1 release gate · {data.timezone}
          </div>
          <h2 id="pilot-release-title" className="text-xl font-bold">{data.pilotName} receptionist pilot</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Calls and email come first. Quoting and other Pro modules do not gate this pilot.
            Demo activity is never counted as a real call or delivered message.
          </p>
        </div>
        <Badge variant="outline" className={data.live ? "border-primary text-primary" : "border-amber-500/40 text-amber-400"}>
          {data.live ? "Live pilot verified" : "Not live · setup & verification required"}
        </Badge>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.checks.map(check => (
          <Link key={check.id} href={check.path} className="rounded-lg border bg-background/60 p-4 transition-colors hover:border-primary/50">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-semibold">{check.title}</h3>
              {check.status === "verified" ? <CheckCircle2 size={16} className="shrink-0 text-primary" /> :
                <AlertCircle size={16} className={`shrink-0 ${check.status === "failed" ? "text-destructive" : "text-amber-400"}`} />}
            </div>
            <span className="mt-2 inline-block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {check.status.replace("_", " ")}
            </span>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{check.detail}</p>
            <span className="mt-3 flex items-center gap-1 text-xs text-primary">Open related workspace <ArrowUpRight size={13} /></span>
          </Link>
        ))}
      </div>
      <details className="mt-5 border-t pt-4 text-sm">
        <summary className="cursor-pointer font-semibold">What remains before a real Parsley test</summary>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-muted-foreground">
          {data.missingSetup.map(item => <li key={item}>{item}</li>)}
        </ul>
      </details>
    </section>
  );
}
