import { useState } from "react";
import { Globe2, Search, CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

type Faq = { question: string; answer: string };
type Preview = {
  companyName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  website: string;
  services: string[];
  serviceAreas: string[];
  openingHours: string[];
  faqs: Faq[];
  receptionistGreeting: string | null;
};

type PreviewResponse = {
  source: { requestedUrl: string; finalUrl: string; title: string | null };
  preview: Preview;
  notice: string;
};

function lines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function BusinessSetup() {
  const [website, setWebsite] = useState("");
  const [source, setSource] = useState<PreviewResponse["source"] | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [services, setServices] = useState("");
  const [areas, setAreas] = useState("");
  const [hours, setHours] = useState("");
  const [scanning, setScanning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const { toast } = useToast();
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  const scan = async () => {
    if (!website.trim()) return;
    setScanning(true);
    setApplied(false);
    try {
      const response = await fetch(base + "/api/business-setup/website-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: website.trim() }),
      });
      const body = (await response.json()) as PreviewResponse & { error?: string };
      if (!response.ok) throw new Error(body.error || "The website could not be scanned.");
      setSource(body.source);
      setPreview(body.preview);
      setWebsite(body.preview.website);
      setServices(body.preview.services.join("\n"));
      setAreas(body.preview.serviceAreas.join("\n"));
      setHours(body.preview.openingHours.join("\n"));
      toast({
        title: "Business preview ready",
        description: "Review and edit the suggestions before applying them to CrewOn.",
      });
    } catch (error) {
      toast({
        title: "Website scan failed",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setScanning(false);
    }
  };

  const apply = async () => {
    if (!preview) return;
    setApplying(true);
    try {
      const reviewed: Preview = {
        ...preview,
        website: website.trim(),
        services: lines(services),
        serviceAreas: lines(areas),
        openingHours: lines(hours),
      };
      const response = await fetch(base + "/api/business-setup/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preview: reviewed }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Business setup could not be applied.");
      setApplied(true);
      toast({
        title: "Business setup applied",
        description:
          "CrewOn has updated the business profile and receptionist knowledge with the reviewed information.",
      });
    } catch (error) {
      toast({
        title: "Could not apply business setup",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setApplying(false);
    }
  };

  const updateField = (
    key: "companyName" | "phone" | "email" | "address" | "receptionistGreeting",
    value: string,
  ) => {
    setPreview((current) =>
      current ? { ...current, [key]: value.trim() ? value : null } : current,
    );
    setApplied(false);
  };

  return (
    <div className="flex-1 min-h-full bg-background">
      <div className="p-6 border-b">
        <h1 className="text-2xl font-bold tracking-tight text-secondary">
          Business Setup
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Teach CrewOn the basics from your public website, then review everything before it reaches customers.
        </p>
      </div>

      <div className="p-6 max-w-5xl space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <Globe2 size={20} />
              </div>
              <div>
                <CardTitle>Learn from your website</CardTitle>
                <CardDescription className="mt-1">
                  CrewOn reads the public page and suggests business details, services, areas and opening hours. It does not apply them automatically.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
                placeholder="https://www.yourbusiness.co.uk"
                inputMode="url"
              />
              <Button onClick={() => void scan()} disabled={scanning || !website.trim()} className="gap-2 shrink-0">
                <Search size={15} />
                {scanning ? "Scanning…" : "Scan website"}
              </Button>
            </div>
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <ShieldCheck size={14} className="mt-0.5 shrink-0" />
              <span>
                Only public web pages are read. Private/local network targets and unsafe redirects are rejected, downloads are capped, and you approve the result before it is saved.
              </span>
            </div>
          </CardContent>
        </Card>

        {preview && (
          <>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>Review business profile</CardTitle>
                    <CardDescription>
                      Correct anything the website wording did not capture properly.
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="gap-1">
                    <Sparkles size={12} /> Suggested
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                {source && (
                  <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
                    Source: <span className="font-medium text-foreground">{source.title || source.finalUrl}</span>
                    {source.finalUrl !== source.requestedUrl && (
                      <span> · Redirected to {source.finalUrl}</span>
                    )}
                  </div>
                )}

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Business name</Label>
                    <Input
                      value={preview.companyName || ""}
                      onChange={(e) => updateField("companyName", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Main phone</Label>
                    <Input
                      value={preview.phone || ""}
                      onChange={(e) => updateField("phone", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={preview.email || ""}
                      onChange={(e) => updateField("email", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Website</Label>
                    <Input value={website} onChange={(e) => setWebsite(e.target.value)} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Address</Label>
                    <Input
                      value={preview.address || ""}
                      onChange={(e) => updateField("address", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Receptionist greeting</Label>
                    <Input
                      value={preview.receptionistGreeting || ""}
                      onChange={(e) => updateField("receptionistGreeting", e.target.value)}
                      placeholder="Thank you for calling. How can I help?"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid lg:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Services</CardTitle>
                  <CardDescription>One approved service per line.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={services}
                    onChange={(e) => { setServices(e.target.value); setApplied(false); }}
                    className="min-h-52"
                    placeholder="Consumer unit upgrades\nEV charger installation"
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Service areas</CardTitle>
                  <CardDescription>One town, area or region per line.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={areas}
                    onChange={(e) => { setAreas(e.target.value); setApplied(false); }}
                    className="min-h-52"
                    placeholder="Maldon\nChelmsford\nSouthminster"
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Opening hours</CardTitle>
                  <CardDescription>Keep the website wording if it is accurate.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={hours}
                    onChange={(e) => { setHours(e.target.value); setApplied(false); }}
                    className="min-h-52"
                    placeholder="Monday–Friday 08:00–17:00"
                  />
                </CardContent>
              </Card>
            </div>

            {preview.faqs.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Website FAQs found</CardTitle>
                  <CardDescription>
                    These are added only because the website contains a clear answer.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {preview.faqs.map((faq, index) => (
                    <div key={index} className="rounded-lg border p-3">
                      <p className="text-sm font-semibold">{faq.question}</p>
                      <p className="text-sm text-muted-foreground mt-1">{faq.answer}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <div className="flex items-center justify-between gap-4 rounded-xl border bg-card p-5">
              <div>
                <p className="font-semibold">
                  {applied ? "Business setup is applied" : "Ready to apply reviewed details"}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Applying updates the company profile and the live receptionist knowledge used on future calls.
                </p>
              </div>
              <Button onClick={() => void apply()} disabled={applying || applied} className="gap-2 shrink-0">
                <CheckCircle2 size={16} />
                {applying ? "Applying…" : applied ? "Applied" : "Apply to CrewOn"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
