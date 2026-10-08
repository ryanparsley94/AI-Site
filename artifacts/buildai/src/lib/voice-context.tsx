import { createContext, useContext, useState, type ReactNode } from "react";
import type { VoiceCommandResultQuoteDraftItem } from "@workspace/api-client-react";

export type VoiceMaterial = VoiceCommandResultQuoteDraftItem;
type VoiceContextValue = {
  quoteDraft: VoiceMaterial[] | null;
  setQuoteDraft: (draft: VoiceMaterial[] | null) => void;
};
const VoiceContext = createContext<VoiceContextValue | null>(null);

export function VoiceProvider({ children }: { children: ReactNode }) {
  const [quoteDraft, setQuoteDraft] = useState<VoiceMaterial[] | null>(null);
  return <VoiceContext.Provider value={{ quoteDraft, setQuoteDraft }}>{children}</VoiceContext.Provider>;
}

export function useVoice() {
  const value = useContext(VoiceContext);
  if (!value) throw new Error("VoiceProvider is required");
  return value;
}
