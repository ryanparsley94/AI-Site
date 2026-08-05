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
  XCircle, Loader2, PlugZap, Bell,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
          Connect your existing tools so BuildAI can sync jobs to your calendar and push invoices to your accounting software automatically.
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
    timezone: "America/New_York"
  });

  const [widgetSettings, setWidgetSettings] = useState({
    color: "#f97316",
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
        timezone: company.timezone || "America/New_York"
      });
    }
  }, [company]);

  useEffect(() => {
    if (widgetKeyInfo) {
      setWidgetSettings({
        color: widgetKeyInfo.color || "#f97316",
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
          <p className="text-muted-foreground text-sm">Manage your company profile, widget, and integrations.</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="profile">Company Profile</TabsTrigger>
            <TabsTrigger value="widget">Chat Widget</TabsTrigger>
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
                    <p className="text-[10px] text-muted-foreground">The number your AI will answer and transfer to.</p>
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
                                placeholder="#f97316"
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
