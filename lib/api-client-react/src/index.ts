export * from "./generated/api";
export * from "./generated/api.schemas";
export { setBaseUrl, setAuthTokenGetter } from "./custom-fetch";
export type { AuthTokenGetter } from "./custom-fetch";
export * from "./integrations";
export { RECEPTIONIST_VOICE_PERSONAS, getReceptionistVoicePersona } from "@workspace/api-zod";
export type { ReceptionistVoiceId } from "@workspace/api-zod";
export { useUnreviewedWidgetCount, UNREVIEWED_WIDGET_COUNT_KEY } from "./calls-badge";
