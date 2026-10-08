/**
 * AuthGate — app-level authentication wrapper.
 *
 * On mount it checks /api/auth/check. If the server says the session is valid
 * it renders children immediately. If not, it shows a full-page login form.
 * After a successful login the gate re-renders children automatically.
 *
 * This is a thin wrapper around the same session-cookie flow used by the
 * Settings page widget section, promoted to app-level so every dashboard
 * route benefits from it.
 */
import { useState, useEffect, useCallback } from "react";
import { Loader2, Lock, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function checkAuth(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/auth/check`, { credentials: "include" });
    if (!res.ok) return false;
    const data = (await res.json()) as { authenticated: boolean };
    return data.authenticated === true;
  } catch {
    return false;
  }
}

async function login(password: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) return { ok: true };
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: data.error ?? "Incorrect password" };
  } catch {
    return { ok: false, error: "Could not reach the server" };
  }
}

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const result = await login(password);
    if (result.ok) {
      onLogin();
    } else {
      setError(result.error ?? "Login failed");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0d1117]">
      <div className="w-full max-w-sm space-y-6 p-8">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3 text-center">
          <img src="/logo-mark.png" alt="CREWON" className="w-12 h-12 object-contain" />
          <div>
            <h1 className="text-2xl font-bold text-white">
              CREW<span className="text-[#F97316]">ON</span>
            </h1>
            <p className="text-sm text-white/50 mt-1">Sign in to your dashboard</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="space-y-2">
            <Label htmlFor="password" className="text-white/80 text-sm">
              Dashboard Password
            </Label>
            <div className="relative">
              <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                className="pl-9 pr-9 bg-white/10 border-white/20 text-white placeholder:text-white/30 focus-visible:ring-[#F97316]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={loading || !password.trim()}
            className="w-full bg-[#F97316] hover:bg-[#ea6c0a] text-white border-0 font-semibold"
          >
            {loading ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
            {loading ? "Signing in…" : "Sign In"}
          </Button>
        </form>

        <p className="text-center text-xs text-white/30">
          Your password is the SESSION_SECRET set on the server.
        </p>
      </div>
    </div>
  );
}

type AuthState = "checking" | "authenticated" | "unauthenticated";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>("checking");

  const checkAndSetAuth = useCallback(async () => {
    const ok = await checkAuth();
    setAuthState(ok ? "authenticated" : "unauthenticated");
  }, []);

  useEffect(() => {
    void checkAndSetAuth();
  }, [checkAndSetAuth]);

  if (authState === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0d1117]">
        <Loader2 size={28} className="animate-spin text-[#F97316]" />
      </div>
    );
  }

  if (authState === "unauthenticated") {
    return <LoginScreen onLogin={() => setAuthState("authenticated")} />;
  }

  return <>{children}</>;
}
