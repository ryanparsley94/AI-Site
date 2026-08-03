import { useState, useEffect, useCallback } from "react";
import { useGetCompany, useUpdateCompany, useGetWidgetKey, useRegenerateWidgetKey, useUpdateWidgetSettings } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Save, Building2, Code2, RefreshCw, Copy, Check, MessageSquare, ExternalLink, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

// Absolute API base URL — must be absolute so the embed snippet works when
// pasted into any third-party website (relative URLs would resolve to that
// site's own origin, not BuildAI's).
function getApiBase(): string {
  return window.location.origin + "/api";
}

export default function Settings() {
  const { data: company, isLoading } = useGetCompany();
  const updateCompany = useUpdateCompany();
  const queryClient = useQueryClient();
  const { toast } = useToast();

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
    greeting: "Hi! How can I help you today?"
  });

  const [copied, setCopied] = useState(false);

  // Admin session state for the widget management section
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
        greeting: widgetKeyInfo.greeting || "Hi! How can I help you today?"
      });
    }
  }, [widgetKeyInfo]);

  // Check if the current browser session is already authenticated as admin
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
        // Refresh widget key after authentication
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

  // Construct the embed snippet
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
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-secondary">Settings</h1>
          <p className="text-muted-foreground text-sm">Manage your company profile and preferences.</p>
        </div>

        {/* ── Company Profile ─────────────────────────────────────────── */}
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

        {/* ── Website Widget ───────────────────────────────────────────── */}
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
            {/* Auth gate — show password form until admin session is established */}
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
                {/* API key section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Widget API Key</Label>
                    {widgetKeyInfo?.widgetKey && (
                      <Badge variant="secondary" className="text-xs font-mono">
                        Active
                      </Badge>
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

                {/* Embed code */}
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

                {/* Customisation */}
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

                {/* Live preview hint */}
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
      </div>
    </div>
  );
}
