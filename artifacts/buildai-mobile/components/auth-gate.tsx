import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import colors from "../constants/colors";

const C = colors.dark;
const API = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";

export function MobileAuthGate({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const queryClient = useQueryClient();
  useEffect(() => {
    let active = true;
    if (!API) { setError("The business API address is not configured."); setChecking(false); return; }
    fetch(`${API}/api/auth/check`, { credentials: "include" })
      .then(r => r.ok ? r.json() : Promise.reject(new Error("Cannot check sign-in")))
      .then(r => { if (active) setAuthenticated(r.authenticated === true); })
      .catch(() => { if (active) setError("Cannot check sign-in. Check your connection and retry."); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, []);
  async function login() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`${API}/api/auth/login`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Sign-in failed");
      await queryClient.invalidateQueries();
      setPassword(""); setAuthenticated(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Cannot sign in"); }
    finally { setBusy(false); }
  }
  if (authenticated) return <>{children}</>;
  if (checking) return <View style={{ flex: 1, backgroundColor: C.background, justifyContent: "center" }}><ActivityIndicator color={C.primary} /></View>;
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: C.background, justifyContent: "center", padding: 24 }}>
      <View style={{ width: "100%", maxWidth: 380, alignSelf: "center", gap: 18 }}>
        <Image source={require("../assets/images/crewon-wordmark.png")} resizeMode="contain" style={{ width: 220, height: 74, alignSelf: "center" }} accessibilityLabel="CREWON" />
        <Text style={{ color: C.primary, textAlign: "center", fontWeight: "700" }}>YOUR CREW. SWITCHED ON.</Text>
        <Text style={{ color: C.foreground, fontSize: 22, fontWeight: "700" }}>Sign in to your dashboard</Text>
        <Text style={{ color: C.mutedForeground }}>Use your existing dashboard password. Customer data stays private until you sign in.</Text>
        <TextInput accessibilityLabel="Dashboard password" placeholder="Dashboard password" placeholderTextColor={C.mutedForeground} secureTextEntry autoCapitalize="none" autoCorrect={false} value={password} onChangeText={setPassword} onSubmitEditing={() => { if (!busy && password && API) void login(); }} style={{ backgroundColor: C.card, color: C.foreground, padding: 16, borderRadius: colors.radius }} />
        {error ? <Text accessibilityRole="alert" style={{ color: C.destructive }}>{error}</Text> : null}
        <Pressable accessibilityRole="button" disabled={busy || !password || !API} onPress={() => void login()} style={{ backgroundColor: C.primary, padding: 16, borderRadius: colors.radius, opacity: busy || !password || !API ? 0.5 : 1 }}>
          <Text style={{ color: C.primaryForeground, textAlign: "center", fontWeight: "700" }}>{busy ? "Signing in…" : "Sign In"}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
