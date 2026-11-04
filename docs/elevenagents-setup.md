# CREWON ElevenAgents connection

Receptionist voice previews and the staged browser-session integration use ElevenLabs ElevenAgents. The ElevenLabs API key stays on the API server. The browser receives only a short-lived signed conversation URL after explicit consent. Public live calling is currently gated off.

## Replit Secrets

Add these through Replit Secrets; do not paste credentials into the app:

- `ELEVENLABS_API_KEY` — server-side ElevenLabs API key with Conversational AI and text-to-speech access.
- `ELEVENLABS_AGENT_ID` — the private Conversational AI agent ID. The agent must allow signed sessions and client overrides for system prompt, first message, and TTS voice.
- `ELEVENLABS_VOICE_MAP` — JSON object mapping each saved CREWON voice key to a voice ID you have auditioned and approved as British English. Example shape (replace every placeholder):

```json
{
  "cedar": "YOUR_VERIFIED_ELEVENLABS_VOICE_ID_1",
  "ash": "YOUR_VERIFIED_ELEVENLABS_VOICE_ID_2",
  "echo": "YOUR_VERIFIED_ELEVENLABS_VOICE_ID_3",
  "coral": "YOUR_VERIFIED_ELEVENLABS_VOICE_ID_4",
  "sage": "YOUR_VERIFIED_ELEVENLABS_VOICE_ID_5",
  "shimmer": "YOUR_VERIFIED_ELEVENLABS_VOICE_ID_6"
}
```

- `ELEVENLABS_PUBLIC_DEMO_READY` — leave unset. The public live route must stay gated until its data is fictional and cannot write to a real tenant CRM.
- `TWILIO_VERIFIED_CALLBACK_READY` — leave unset. The callback must stay gated until ownership OTP, ElevenAgents carrier handoff, and safe post-call handling are implemented and tested.

The existing onboarding picker saves one of these six persona keys; the mapped voice is previewed server-side. The browser flow passes the selected mapped voice as a per-conversation override, but starting it is gated until public-demo data and CRM writes are isolated. Do not mark a voice British based only on its name or description—listen to and approve the actual sample.

## ElevenLabs agent settings

Use a private agent and configure it for a UK electrical receptionist. Enable signed session URLs and the prompt, first-message, and voice overrides used by the web demo. Disable audio recording unless the business has separately reviewed and enabled its retention/consent policy. Do not enable public calling until its fictional demo dataset is separated from Parsley and anonymous callers cannot create real CRM records.

If OpenAI should remain the reasoning model, configure the agent's LLM through ElevenLabs' supported OpenAI connection. The Replit `OPENAI_API_KEY` is not sent to ElevenLabs by this integration. Verify provider billing, data handling, and region settings in both services before enabling a real business.

## Current boundaries

- The browser live session endpoint is intentionally disabled; its current data path is not yet isolated to a fictional company and must not be exposed as a public demo.
- Sample audio is generated, not a real customer recording, but still uses the existing Parsley demo profile rather than a fully fictional dataset.
- The callback UI and API are intentionally disabled until phone ownership verification, ElevenAgents Twilio routing, and post-call CRM webhook validation are complete.
- Existing inbound Twilio calls still use the current OpenAI Realtime path. They have not been migrated or validated against ElevenAgents.
- No recording or deployment is enabled by these changes.
