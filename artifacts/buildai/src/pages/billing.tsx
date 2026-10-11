import { useEffect, useState } from "react";
import { Check, CreditCard, ExternalLink, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

type BillingStatus = {
  companyId: number;
  plan: string;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canManage: boolean;
  checkoutConfigured: boolean;
  proAvailable: boolean;
};

const OFFICE_FEATURES = [
  "AI phone receptionist",
  "CRM and customer sites",
  "Enquiries and call transcripts",
  "Job scheduling",
  "Email inbox and reply drafts",
  "Simple follow-up and review chasing",
  "Tradify customer/site migration",
];

export default function Billing() {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<"checkout" | "portal" | null>(null);
  const { toast } = useToast();

  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  const loadStatus = async () => {
    setLoading(true);
    try {
      const response = await fetch(base + "/api/billing/status");
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load billing.");
      setStatus(body);
    } catch (error) {
      toast({
        title: "Could not load billing",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStatus();
  }, []);

  const openStripe = async (kind: "checkout" | "portal") => {
    setAction(kind);
    try {
      const response = await fetch(base + "/api/billing/" + kind, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not open Stripe.");
      if (typeof body.url !== "string") throw new Error("Stripe did not return a secure URL.");
      window.location.assign(body.url);
    } catch (error) {
      toast({
        title: kind === "checkout" ? "Could not start checkout" : "Could not open billing portal",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
      setAction(null);
    }
  };

  const active = Boolean(
    status && ["active", "trialing", "past_due"].includes(status.status),
  );

  return (
    <div className="flex-1 min-h-full bg-background">
      <div className="p-6 border-b">
        <h1 className="text-2xl font-bold tracking-tight text-secondary">Billing</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage the CREWON subscription for this business.
        </p>
      </div>

      <div className="p-6 max-w-5xl space-y-6">
        {loading ? (
          <div className="rounded-xl border bg-card p-8 text-sm text-muted-foreground">
            Loading billing…
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-6">
            <Card className="border-primary/30">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      CREWON Office
                      {active && <Badge>Current plan</Badge>}
                    </CardTitle>
                    <CardDescription className="mt-2">
                      The AI office for handling calls, customers and day-to-day trade admin.
                    </CardDescription>
                  </div>
                  <CreditCard className="text-primary shrink-0" size={26} />
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  {OFFICE_FEATURES.map((feature) => (
                    <div key={feature} className="flex items-center gap-2 text-sm">
                      <Check size={15} className="text-green-600 shrink-0" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>

                {status && (
                  <div className="rounded-lg bg-muted/30 border p-3 text-sm">
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">Status</span>
                      <span className="font-semibold capitalize">{status.status.replace(/_/g, " ")}</span>
                    </div>
                    {status.currentPeriodEnd && (
                      <div className="flex justify-between gap-3 mt-2">
                        <span className="text-muted-foreground">
                          {status.cancelAtPeriodEnd ? "Ends" : "Current period"}
                        </span>
                        <span className="font-medium">
                          {new Date(status.currentPeriodEnd).toLocaleDateString("en-GB")}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {status?.canManage ? (
                  <Button
                    className="w-full gap-2"
                    onClick={() => void openStripe("portal")}
                    disabled={action !== null}
                  >
                    <ExternalLink size={15} />
                    {action === "portal" ? "Opening…" : "Manage billing"}
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    onClick={() => void openStripe("checkout")}
                    disabled={action !== null || !status?.checkoutConfigured}
                  >
                    {action === "checkout"
                      ? "Opening secure checkout…"
                      : status?.checkoutConfigured
                        ? "Start CREWON Office"
                        : "Checkout not configured yet"}
                  </Button>
                )}

                <p className="text-xs text-muted-foreground text-center">
                  Pricing and payment details are shown in Stripe Checkout. CREWON does not store card details.
                </p>
              </CardContent>
            </Card>

            <Card className="border-dashed">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Sparkles size={20} className="text-muted-foreground" />
                  <CardTitle>CREWON Pro</CardTitle>
                  <Badge variant="outline">Coming soon</Badge>
                </div>
                <CardDescription>
                  Advanced estimating, take-offs, procurement, invoicing automation and deeper marketing workflows.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Pro is intentionally not chargeable until those features have passed their own release gate.
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
