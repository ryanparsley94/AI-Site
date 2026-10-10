import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  useGetCompany,
  useUpdateCompany,
  useGetWidgetKey,
  useRegenerateWidgetKey,
  useUpdateWidgetSettings,
  useGetIntegrationStatus,
  useDisconnectIntegration,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Save, Building2, Code2, RefreshCw, Copy, Check, MessageSquare,
  ExternalLink, Lock, Calendar, BookOpen, Link2, CheckCircle2,
  XCircle, Loader2, PlugZap, Bell, Palette, FileImage, FileText,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

// Absolute API base URL
function getApiBase(): string {
  return window.location.origin + "/api";
}

// ── Integrations tab ─────────────────────────────────────────────────────────

interface ProviderCardProps {
  name: string;
  icon: React.ReactNode;
  description: string;
  provider: "google" | "quickbooks" | "xero";
  status: { connected: boolean; connectedAt: string | null; lastSyncAt: string | null; configured: boolean } | undefined;
  onConnect: () => void;
  onDisconnect: () => void;
  isDisconnecting: boolean;
}

function ProviderCard({
  name, icon, description, provider, status, onConnect, onDisconnect, isDisconnecting,
}: ProviderCardProps) {
  const connected = status?.connected ?? false;
  const configured = status?.configured ?? false;

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-muted rounded-xl shrink-0 text-foreground/70">{icon}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold">{name}</span>
              {connected ? (
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1 text-xs">
                  <CheckCircle2 className="h-3 w-3" /> Connected
                </Badge>
              ) : configured ? (
                <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 text-xs">
                  Not connected
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
                  Credentials not configured
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
            {connected && status?.connectedAt && (
              <p className="text-xs text-muted-foreground mt-1.5">
                Connected {new Date(status.connectedAt).toLocaleDateString()}
                {status.lastSyncAt && ` · Last sync ${new Date(status.lastSyncAt).toLocaleString()}`}
              </p>
            )}
            {!configured && (
              <p className="text-xs text-amber-600 mt-2">
                Add <code className="font-mono bg-amber-50 px-1 rounded">{provider.toUpperCase()}_CLIENT_ID</code> and{" "}
                <code className="font-mono bg-amber-50 px-1 rounded">{provider.toUpperCase()}_CLIENT_SECRET</code> in
                Replit Secrets to enable this integration.
              </p>
            )}
          </div>
          <div className="shrink-0">
            {connected ? (
              <Button
                variant="outline"
                size="sm"
                onClick={onDisconnect}
                disabled={isDisconnecting}
                className="text-destructive border-destructive/30 hover:bg-destructive/10 gap-1.5"
              >
                {isDisconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                Disconnect
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={onConnect}
                disabled={!configured}
                className="gap-1.5"
              >
                <Link2 className="h-3.5 w-3.5" /> Connect
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function IntegrationsTab() {
  const { data: status, isLoading, refetch } = useGetIntegrationStatus();
  const disconnect = useDisconnectIntegration();
  const { toast } = useToast();
  const apiBase = getApiBase();

  const handleConnect = (provider: "google" | "quickbooks" | "xero") => {
    // Full-page redirect to start OAuth flow
    window.location.href = `${apiBase}/integrations/${provider}/auth`;
  };

  const handleDisconnect = (provider: "google" | "quickbooks" | "xero") => {
    disconnect.mutate({ provider }, {
      onSuccess: () => {
        toast({ title: `${provider} disconnected` });
        refetch();
      },
      onError: () => {
        toast({ title: "Disconnect failed", variant: "destructive" });
      },
    });
  };

  if (isLoading) {
    return <div className="py-12 text-center text-muted-foreground text-sm">Loading integration status…</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">
          Connect your existing tools so CREWON can sync jobs to your calendar and push invoices to your accounting software automatically.
        </p>
      </div>

      <ProviderCard
        name="Google Calendar"
        icon={<Calendar size={20} />}
        description="Jobs are automatically added to your Google Calendar when created or updated."
        provider="google"
        status={status?.google}
        onConnect={() => handleConnect("google")}
        onDisconnect={() => handleDisconnect("google")}
        isDisconnecting={disconnect.isPending && disconnect.variables?.provider === "google"}
      />

      <ProviderCard
        name="QuickBooks Online"
        icon={<BookOpen size={20} />}
        description="Export invoices directly to QuickBooks — line items, customer, and due date are mapped automatically."
        provider="quickbooks"
        status={status?.quickbooks}
        onConnect={() => handleConnect("quickbooks")}
        onDisconnect={() => handleDisconnect("quickbooks")}
        isDisconnecting={disconnect.isPending && disconnect.variables?.provider === "quickbooks"}
      />

      <ProviderCard
        name="Xero"
        icon={<PlugZap size={20} />}
        description="Push invoices to Xero as draft records — contacts are matched by name and VAT is mapped to OUTPUT2."
        provider="xero"
        status={status?.xero}
        onConnect={() => handleConnect("xero")}
        onDisconnect={() => handleDisconnect("xero")}
        isDisconnecting={disconnect.isPending && disconnect.variables?.provider === "xero"}
      />
    </div>
  );
}

// ── Main Settings page ────────────────────────────────────────────────────────

export default function Settings() {
  const [location] = useLocation();
  // Read ?tab= param from the URL (e.g. after OAuth callback redirect)
  const urlParams = new URLSearchParams(window.location.search);
  const initialTab = urlParams.get("tab") === "integrations" ? "integrations" : "profile";

  const [activeTab, setActiveTab] = useState(initialTab);

  const { data: company, isLoading } = useGetCompany();
  const updateCompany = useUpdateCompany();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Show toast for OAuth results
  useEffect(() => {
    const connected = urlParams.get("connected");
    const error = urlParams.get("error");
    if (connected) {
      const labels: Record<string, string> = { google: "Google Calendar", quickbooks: "QuickBooks", xero: "Xero" };
      toast({ title: `${labels[connected] ?? connected} connected successfully` });
      // Clean URL
      window.history.replaceState({}, "", window.location.pathname + "?tab=integrations");
    }
    if (error) {
      const messages: Record<string, string> = {
        google_not_configured: "Google credentials not configured in Replit Secrets.",
        google_denied: "Google authorisation was denied.",
        google_failed: "Google OAuth failed — check server logs.",
        quickbooks_not_configured: "QuickBooks credentials not configured.",
        quickbooks_denied: "QuickBooks authorisation was denied.",
        quickbooks_failed: "QuickBooks OAuth failed.",
        xero_not_configured: "Xero credentials not configured.",
        xero_denied: "Xero authorisation was denied.",
        xero_failed: "Xero OAuth failed.",
      };
      toast({ title: messages[error] ?? "Connection failed", variant: "destructive" });
      window.history.replaceState({}, "", window.location.pathname + "?tab=integrations");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Widget management requires an admin session
  const { data: widgetKeyInfo, isLoading: widgetLoading } = useGetWidgetKey();
  const regenerateKey = useRegenerateWidgetKey();
  const updateWidgetSettings = useUpdateWidgetSettings();

  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    website: "",
    timezone: "Europe/London"
  });

  const [brandingData, setBrandingData] = useState({
    logoUrl: "",
    quoteTemplate: "classic" as "classic" | "modern" | "minimal",
    quoteAccentColor: "#36C6D5",
    quoteTagline: "",
    paymentTerms: "Payment is due within 30 days of invoice date. We accept bank transfer and card payments.",
    quoteFooterText: "",
  });

  const [widgetSettings, setWidgetSettings] = useState({
    color: "#36C6D5",
    greeting: "Hi! How can I help you today?",
    widgetLeadNotify: true,
  });

  const [copied, setCopied] = useState(false);

  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean | null>(null);
  const [adminPassword, setAdminPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginPending, setLoginPending] = useState(false);

  useEffect(() => {
    if (company) {
      setFormData({
        name: company.name || "",
        phone: company.phone || "",
        email: company.email || "",
        address: company.address || "",
        website: company.website || "",
        timezone: company.timezone || "Europe/London"
      });
      setBrandingData({
        logoUrl: company.logoUrl || "",
        quoteTemplate: (company.quoteTemplate as "classic" | "modern" | "minimal") || "classic",
        quoteAccentColor: company.quoteAccentColor || "#36C6D5",
        quoteTagline: company.quoteTagline || "",
        paymentTerms: company.paymentTerms || "Payment is due within 30 days of invoice date. We accept bank transfer and card payments.",
        quoteFooterText: company.quoteFooterText || "",
      });
    }
  }, [company]);

  useEffect(() => {
    if (widgetKeyInfo) {
      setWidgetSettings({
        color: widgetKeyInfo.color || "#36C6D5",
        greeting: widgetKeyInfo.greeting || "Hi! How can I help you today?",
        widgetLeadNotify: widgetKeyInfo.widgetLeadNotify ?? true,
      });
    }
  }, [widgetKeyInfo]);

  const checkAdminAuth = useCallback(async () => {
    try {
      const res = await fetch(getApiBase() + "/auth/check", { credentials: "include" });
      const data = await res.json() as { authenticated: boolean };
      setIsAdminAuthenticated(data.authenticated);
    } catch {
      setIsAdminAuthenticated(false);
    }
  }, []);

  useEffect(() => {
    checkAdminAuth();
  }, [checkAdminAuth]);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginPending(true);
    try {
      const res = await fetch(getApiBase() + "/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password: adminPassword }),
      });
      if (res.ok) {
        setIsAdminAuthenticated(true);
        setAdminPassword("");
        queryClient.invalidateQueries({ queryKey: ["/api/company/widget-key"] });
      } else {
        const data = await res.json() as { error?: string };
        setLoginError(data.error ?? "Incorrect password");
      }
    } catch {
      setLoginError("Could not reach the server. Please try again.");
    } finally {
      setLoginPending(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSave = () => {
    updateCompany.mutate({ data: formData }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['/api/company'] });
        toast({ title: "Company profile updated" });
      }
    });
  };

  const handleSaveBranding = () => {
    updateCompany.mutate({
      data: {
        logoUrl: brandingData.logoUrl || undefined,
        quoteTemplate: brandingData.quoteTemplate,
        quoteAccentColor: brandingData.quoteAccentColor,
        quoteTagline: brandingData.quoteTagline || undefined,
        paymentTerms: brandingData.paymentTerms || undefined,
        quoteFooterText: brandingData.quoteFooterText || undefined,
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['/api/company'] });
        toast({ title: "Quote branding saved" });
      }
    });
  };

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setBrandingData(prev => ({ ...prev, logoUrl: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const handleRegenerateKey = () => {
    regenerateKey.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['/api/company/widget-key'] });
        toast({ title: "Widget key regenerated", description: "Update the script tag on your website with the new key." });
      }
    });
  };

  const handleSaveWidgetSettings = () => {
    updateWidgetSettings.mutate({ data: widgetSettings }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['/api/company/widget-key'] });
        toast({ title: "Widget settings saved" });
      }
    });
  };

  const apiOrigin = getApiBase();
  const embedCode = widgetKeyInfo?.widgetKey
    ? `<script src="${apiOrigin}/widget.js?key=${widgetKeyInfo.widgetKey}" data-buildai-key="${widgetKeyInfo.widgetKey}" async></script>`
    : null;

  const handleCopy = () => {
    if (!embedCode) return;
    navigator.clipboard.writeText(embedCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">Loading settings...</div>;
  }

  return (
    <div className="flex-1 overflow-auto p-6 bg-muted/30">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-secondary">Settings</h1>
          <p className="text-muted-foreground text-sm">Manage your business profile, customer channels and integrations.</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="profile">Company Profile</TabsTrigger>
            <TabsTrigger value="widget">Chat Widget</TabsTrigger>
            <TabsTrigger value="branding">Quote Branding</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
          </TabsList>

          {/* ── Company Profile ────────────────────────────────────────── */}
          <TabsContent value="profile">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 text-primary rounded-lg">
                    <Building2 size={24} />
                  </div>
                  <div>
                    <CardTitle>Company Profile</CardTitle>
                    <CardDescription>This information is used by your AI assistants when talking to customers.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6 pt-4">
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="name">Company Name</Label>
                    <Input id="name" name="name" value={formData.name} onChange={handleChange} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Main Phone Number</Label>
                    <Input id="phone" name="phone" value={formData.phone} onChange={handleChange} />
                    <p className="text-[10px] text-muted-foreground">Your main business number. The AI receptionist never transfers live calls in V1.</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Public Email</Label>
                    <Input id="email" name="email" type="email" value={formData.email} onChange={handleChange} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="website">Website</Label>
                    <Input id="website" name="website" value={formData.website} onChange={handleChange} />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="address">Headquarters Address</Label>
                    <Input id="address" name="address" value={formData.address} onChange={handleChange} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="timezone">Timezone</Label>
                    <Select value={formData.timezone} onValueChange={(v) => setFormData(prev => ({...prev, timezone: v}))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="America/New_York">Eastern Time (ET)</SelectItem>
                        <SelectItem value="America/Chicago">Central Time (CT)</SelectItem>
                        <SelectItem value="America/Denver">Mountain Time (MT)</SelectItem>
                        <SelectItem value="America/Los_Angeles">Pacific Time (PT)</SelectItem>
                        <SelectItem value="Europe/London">London (GMT/BST)</SelectItem>
                        <SelectItem value="Europe/Dublin">Dublin (GMT/IST)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">Used for scheduling jobs and after-hours routing.</p>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="border-t bg-muted/20 pt-4 flex justify-end">
                <Button onClick={handleSave} disabled={updateCompany.isPending} className="gap-2 font-bold px-6">
                  <Save size={16} /> {updateCompany.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>

          {/* ── Website Widget ──────────────────────────────────────────── */}
          <TabsContent value="widget">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 text-primary rounded-lg">
                    <MessageSquare size={24} />
                  </div>
                  <div>
                    <CardTitle>Website Chat Widget</CardTitle>
                    <CardDescription>
                      Embed a live AI chat button on your website to capture leads 24/7. Paste one script tag — no other setup needed.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-6 pt-4">
                {isAdminAuthenticated === null && (
                  <div className="text-sm text-muted-foreground">Checking authentication…</div>
                )}

                {isAdminAuthenticated === false && (
                  <div className="rounded-lg border p-6 space-y-4 bg-muted/30">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Lock size={15} className="text-muted-foreground" />
                      Admin authentication required
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Widget settings are protected. Enter your admin password (the <code className="font-mono bg-muted px-1 rounded">SESSION_SECRET</code> value set in your Replit environment) to continue.
                    </p>
                    <form onSubmit={handleAdminLogin} className="flex flex-col gap-3 max-w-sm">
                      <Input
                        type="password"
                        placeholder="Admin password"
                        value={adminPassword}
                        onChange={e => setAdminPassword(e.target.value)}
                        autoComplete="current-password"
                      />
                      {loginError && (
                        <p className="text-xs text-destructive">{loginError}</p>
                      )}
                      <Button type="submit" disabled={loginPending || !adminPassword} className="w-fit gap-2">
                        <Lock size={14} />
                        {loginPending ? "Verifying…" : "Unlock Widget Settings"}
                      </Button>
                    </form>
                  </div>
                )}

                {isAdminAuthenticated === true && (
                  <>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label>Widget API Key</Label>
                        {widgetKeyInfo?.widgetKey && (
                          <Badge variant="secondary" className="text-xs font-mono">Active</Badge>
                        )}
                      </div>

                      {widgetKeyInfo?.widgetKey ? (
                        <div className="flex items-center gap-2">
                          <code className="flex-1 px-3 py-2 bg-muted rounded-lg text-xs font-mono truncate border select-all">
                            {widgetKeyInfo.widgetKey}
                          </code>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleRegenerateKey}
                            disabled={regenerateKey.isPending}
                            className="gap-1.5 shrink-0"
                          >
                            <RefreshCw size={13} className={regenerateKey.isPending ? "animate-spin" : ""} />
                            Regenerate
                          </Button>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-3">
                          <p className="text-sm text-muted-foreground">
                            Generate an API key to activate the chat widget on your website.
                          </p>
                          <Button
                            onClick={handleRegenerateKey}
                            disabled={widgetLoading || regenerateKey.isPending}
                            className="gap-2 w-fit"
                          >
                            <Code2 size={16} />
                            {regenerateKey.isPending ? "Generating..." : "Generate Widget Key"}
                          </Button>
                        </div>
                      )}
                    </div>

                    {embedCode && (
                      <div className="space-y-2">
                        <Label>Embed Code</Label>
                        <p className="text-xs text-muted-foreground">
                          Paste this script tag just before the <code className="font-mono bg-muted px-1 rounded">&lt;/body&gt;</code> tag on every page of your website.
                        </p>
                        <div className="relative">
                          <pre className="px-4 py-3 bg-muted rounded-lg text-xs font-mono overflow-x-auto border whitespace-pre-wrap break-all pr-12">
                            {embedCode}
                          </pre>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute top-2 right-2 h-7 w-7"
                            onClick={handleCopy}
                          >
                            {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
                          </Button>
                        </div>
                      </div>
                    )}

                    {widgetKeyInfo?.widgetKey && (
                      <div className="space-y-4 pt-2 border-t">
                        <p className="text-sm font-medium">Customise Appearance</p>
                        <div className="grid md:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <Label htmlFor="widgetColor">Brand Colour</Label>
                            <div className="flex items-center gap-3">
                              <input
                                type="color"
                                id="widgetColor"
                                value={widgetSettings.color}
                                onChange={e => setWidgetSettings(prev => ({ ...prev, color: e.target.value }))}
                                className="h-10 w-16 rounded-lg border cursor-pointer bg-transparent"
                              />
                              <Input
                                value={widgetSettings.color}
                                onChange={e => setWidgetSettings(prev => ({ ...prev, color: e.target.value }))}
                                className="font-mono text-sm"
                                placeholder="#36C6D5"
                              />
                            </div>
                            <p className="text-[10px] text-muted-foreground">Used for the chat button and header.</p>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="widgetGreeting">Opening Greeting</Label>
                            <Input
                              id="widgetGreeting"
                              value={widgetSettings.greeting}
                              onChange={e => setWidgetSettings(prev => ({ ...prev, greeting: e.target.value }))}
                              placeholder="Hi! How can I help you today?"
                            />
                            <p className="text-[10px] text-muted-foreground">First message shown when the chat opens.</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {widgetKeyInfo?.widgetKey && (
                      <div className="space-y-3 pt-2 border-t">
                        <p className="text-sm font-medium">Notifications</p>
                        <div className="flex items-center justify-between rounded-lg border p-4">
                          <div className="flex items-start gap-3">
                            <Bell size={16} className="text-muted-foreground mt-0.5 shrink-0" />
                            <div>
                              <p className="text-sm font-medium leading-none">Widget lead email alerts</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                Send an email to your company address the moment a visitor submits their name and phone via the chat widget.
                                {!company?.email && (
                                  <span className="block text-amber-600 mt-1">
                                    No company email set — add one in the Company Profile tab to receive alerts.
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                          <Switch
                            checked={widgetSettings.widgetLeadNotify}
                            onCheckedChange={checked => setWidgetSettings(prev => ({ ...prev, widgetLeadNotify: checked }))}
                          />
                        </div>
                      </div>
                    )}

                    {widgetKeyInfo?.widgetKey && (
                      <div className="rounded-lg border border-dashed p-4 bg-muted/30 flex items-start gap-3">
                        <ExternalLink size={16} className="text-muted-foreground mt-0.5 shrink-0" />
                        <div className="text-xs text-muted-foreground">
                          <p className="font-medium text-foreground mb-1">Live preview</p>
                          <p>
                            Open{" "}
                            <a
                              href={`${apiOrigin}/widget.js?key=${widgetKeyInfo.widgetKey}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline font-mono"
                            >
                              widget.js
                            </a>{" "}
                            to inspect the script, or paste the embed code into any HTML page to see the chat button appear in the bottom-right corner.
                          </p>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>

              {isAdminAuthenticated === true && widgetKeyInfo?.widgetKey && (
                <CardFooter className="border-t bg-muted/20 pt-4 flex justify-end">
                  <Button
                    onClick={handleSaveWidgetSettings}
                    disabled={updateWidgetSettings.isPending}
                    className="gap-2 font-bold px-6"
                  >
                    <Save size={16} /> {updateWidgetSettings.isPending ? "Saving..." : "Save Widget Settings"}
                  </Button>
                </CardFooter>
              )}
            </Card>
          </TabsContent>

          {/* ── Quote Branding ──────────────────────────────────────────── */}
          <TabsContent value="branding">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 text-primary rounded-lg">
                    <Palette size={24} />
                  </div>
                  <div>
                    <CardTitle>Quote Branding</CardTitle>
                    <CardDescription>
                      Set your logo, template, and footer details — applied to every PDF quote you download.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-8 pt-2">

                {/* ── Template picker ── */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold">Quote Template</Label>
                  <p className="text-xs text-muted-foreground">Choose the visual style for your PDF quotes.</p>
                  <div className="grid grid-cols-3 gap-4">
                    {(
                      [
                        {
                          id: "classic" as const,
                          label: "Classic",
                          desc: "Dark header, accent stripe, professional table",
                          preview: (
                            <div className="w-full h-20 rounded overflow-hidden border">
                              <div className="h-7 bg-[#1a2332] flex items-center px-2 gap-1.5">
                                <div className="w-8 h-1.5 rounded-sm bg-white/80" />
                                <div className="ml-auto w-3 h-3 rounded-sm" style={{ backgroundColor: brandingData.quoteAccentColor }} />
                              </div>
                              <div className="h-1" style={{ backgroundColor: brandingData.quoteAccentColor }} />
                              <div className="px-2 pt-1.5 space-y-1">
                                <div className="flex gap-1">
                                  <div className="w-16 h-1.5 rounded-sm bg-slate-300" />
                                  <div className="ml-auto w-8 h-1.5 rounded-sm bg-slate-200" />
                                </div>
                                <div className="h-3 rounded-sm bg-slate-100 w-full" />
                                <div className="h-2 w-full bg-slate-50 rounded-sm" />
                              </div>
                            </div>
                          ),
                        },
                        {
                          id: "modern" as const,
                          label: "Modern",
                          desc: "Accent bar, clean white layout, bold badge",
                          preview: (
                            <div className="w-full h-20 rounded overflow-hidden border flex">
                              <div className="w-2 h-full shrink-0" style={{ backgroundColor: brandingData.quoteAccentColor }} />
                              <div className="flex-1 p-2 space-y-1.5">
                                <div className="flex items-start justify-between">
                                  <div className="w-14 h-2 rounded-sm bg-slate-700" />
                                  <div className="px-1.5 py-0.5 rounded text-white text-[6px] font-bold" style={{ backgroundColor: brandingData.quoteAccentColor }}>QUOTE</div>
                                </div>
                                <div className="h-px w-full" style={{ backgroundColor: brandingData.quoteAccentColor }} />
                                <div className="h-3 rounded-sm w-full bg-slate-100" />
                                <div className="h-2 w-full bg-slate-50 rounded-sm" />
                              </div>
                            </div>
                          ),
                        },
                        {
                          id: "minimal" as const,
                          label: "Minimal",
                          desc: "Clean lines, no colours, pure black & white",
                          preview: (
                            <div className="w-full h-20 rounded overflow-hidden border bg-white p-2 space-y-1.5">
                              <div className="flex items-center justify-between">
                                <div className="w-14 h-2 rounded-sm bg-slate-800" />
                                <div className="w-10 h-2 rounded-sm bg-slate-800" />
                              </div>
                              <div className="h-px w-full bg-black" />
                              <div className="h-2 w-24 rounded-sm bg-slate-300" />
                              <div className="h-px w-full bg-slate-300" />
                              <div className="space-y-0.5">
                                <div className="h-2 w-full border border-slate-200 rounded-sm" />
                                <div className="h-2 w-full border border-slate-200 rounded-sm" />
                              </div>
                            </div>
                          ),
                        },
                      ] as const
                    ).map(({ id, label, desc, preview }) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setBrandingData(prev => ({ ...prev, quoteTemplate: id }))}
                        className={cn(
                          "text-left rounded-xl border-2 p-3 transition-all space-y-2",
                          brandingData.quoteTemplate === id
                            ? "border-primary bg-primary/5 shadow-sm"
                            : "border-border hover:border-muted-foreground/40"
                        )}
                      >
                        {preview}
                        <div>
                          <p className="font-semibold text-sm">{label}</p>
                          <p className="text-[11px] text-muted-foreground leading-snug">{desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── Accent colour ── */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Accent Colour</Label>
                  <p className="text-xs text-muted-foreground">Used for header bars, table headers, and total highlights in the PDF.</p>
                  <div className="flex items-center gap-3 flex-wrap">
                    <input
                      type="color"
                      value={brandingData.quoteAccentColor}
                      onChange={e => setBrandingData(prev => ({ ...prev, quoteAccentColor: e.target.value }))}
                      className="h-10 w-16 rounded-lg border cursor-pointer bg-transparent"
                    />
                    <Input
                      value={brandingData.quoteAccentColor}
                      onChange={e => setBrandingData(prev => ({ ...prev, quoteAccentColor: e.target.value }))}
                      className="font-mono text-sm w-36"
                      placeholder="#36C6D5"
                    />
                    <div className="flex gap-2">
                      {["#36C6D5", "#2563eb", "#16a34a", "#7c3aed", "#dc2626", "#0891b2"].map(c => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setBrandingData(prev => ({ ...prev, quoteAccentColor: c }))}
                          className={cn(
                            "w-7 h-7 rounded-full border-2 transition-all",
                            brandingData.quoteAccentColor === c ? "border-slate-500 scale-110" : "border-transparent"
                          )}
                          style={{ backgroundColor: c }}
                          title={c}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* ── Logo ── */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Company Logo</Label>
                  <p className="text-xs text-muted-foreground">
                    Appears in the top-right corner of your PDF quotes. PNG or JPEG recommended, under 200 KB.
                  </p>
                  <div className="flex items-start gap-4">
                    {brandingData.logoUrl && (
                      <div className="w-24 h-16 rounded-lg border bg-muted flex items-center justify-center overflow-hidden shrink-0">
                        <img src={brandingData.logoUrl} alt="Company logo" className="max-w-full max-h-full object-contain" />
                      </div>
                    )}
                    <div className="flex-1 space-y-2">
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <div className="flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed bg-muted/50 hover:bg-muted transition-colors text-sm text-muted-foreground">
                          <FileImage size={15} />
                          Upload image file
                        </div>
                        <input type="file" accept="image/*" className="sr-only" onChange={handleLogoFileChange} />
                      </label>
                      <p className="text-xs text-muted-foreground">Or paste a public image URL:</p>
                      <Input
                        placeholder="https://yourcompany.com/logo.png"
                        value={brandingData.logoUrl.startsWith("data:") ? "(uploaded file)" : brandingData.logoUrl}
                        onChange={e => setBrandingData(prev => ({ ...prev, logoUrl: e.target.value }))}
                        className="text-sm"
                        readOnly={brandingData.logoUrl.startsWith("data:")}
                      />
                      {brandingData.logoUrl && (
                        <button
                          type="button"
                          onClick={() => setBrandingData(prev => ({ ...prev, logoUrl: "" }))}
                          className="text-xs text-destructive hover:underline"
                        >
                          Remove logo
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── Tagline ── */}
                <div className="space-y-2">
                  <Label htmlFor="quoteTagline" className="text-sm font-semibold">
                    Tagline <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <p className="text-xs text-muted-foreground">A short phrase printed below your company name on the quote.</p>
                  <Input
                    id="quoteTagline"
                    value={brandingData.quoteTagline}
                    onChange={e => setBrandingData(prev => ({ ...prev, quoteTagline: e.target.value }))}
                    placeholder="e.g. Trusted by Manchester's finest trades"
                    maxLength={80}
                  />
                </div>

                {/* ── Payment Terms ── */}
                <div className="space-y-2">
                  <Label htmlFor="paymentTerms" className="text-sm font-semibold">Payment Terms</Label>
                  <p className="text-xs text-muted-foreground">Printed in the footer section of every quote PDF.</p>
                  <Textarea
                    id="paymentTerms"
                    value={brandingData.paymentTerms}
                    onChange={e => setBrandingData(prev => ({ ...prev, paymentTerms: e.target.value }))}
                    placeholder="e.g. Payment due within 30 days of invoice. Bank transfer preferred — sort code and account number provided on invoice."
                    className="resize-none"
                    rows={3}
                  />
                </div>

                {/* ── Footer Note ── */}
                <div className="space-y-2">
                  <Label htmlFor="quoteFooterText" className="text-sm font-semibold">
                    Footer Note <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Extra text at the bottom — e.g. warranty info, T&amp;Cs reference, or a thank-you message.
                  </p>
                  <Textarea
                    id="quoteFooterText"
                    value={brandingData.quoteFooterText}
                    onChange={e => setBrandingData(prev => ({ ...prev, quoteFooterText: e.target.value }))}
                    placeholder="e.g. All work is covered by a 12-month workmanship guarantee. Full T&Cs available on request."
                    className="resize-none"
                    rows={3}
                  />
                </div>

                {/* ── Hint ── */}
                <div className="rounded-lg border border-dashed p-4 bg-muted/30 flex items-start gap-3">
                  <FileText size={16} className="text-muted-foreground mt-0.5 shrink-0" />
                  <div className="text-xs text-muted-foreground">
                    <p className="font-medium text-foreground mb-1">Preview your quote</p>
                    <p>Save your branding, then open any saved quote and click <strong>Download PDF</strong> to see your template and branding applied.</p>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="border-t bg-muted/20 pt-4 flex justify-end">
                <Button
                  onClick={handleSaveBranding}
                  disabled={updateCompany.isPending}
                  className="gap-2 font-bold px-6"
                >
                  <Save size={16} /> {updateCompany.isPending ? "Saving..." : "Save Branding"}
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>

          {/* ── Integrations ────────────────────────────────────────────── */}
          <TabsContent value="integrations">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 text-primary rounded-lg">
                    <PlugZap size={24} />
                  </div>
                  <div>
                    <CardTitle>Integrations</CardTitle>
                    <CardDescription>
                      Connect Google Calendar, QuickBooks, and Xero to sync jobs and export invoices automatically.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-2">
                <IntegrationsTab />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
