# CREWON ElevenAgents connection

The browser receptionist demo and receptionist voice previews use ElevenLabs ElevenAgents. The ElevenLabs API key stays on the API server. The browser receives only a short-lived signed conversation URL after explicit consent.

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

The existing onboarding picker saves one of these six persona keys; the mapped voice is previewed server-side and passed as a per-conversation override in the browser demo. Do not mark a voice British based only on its name or description—listen to and approve the actual sample.

## ElevenLabs agent settings

Use a private agent and configure it for a UK electrical receptionist. Enable signed session URLs and the prompt, first-message, and voice overrides used by the web demo. Disable audio recording unless the business has separately reviewed and enabled its retention/consent policy. The app saves transcript text to the Parsley CREWON enquiry only after the demo consent checkbox is accepted and the user ends the call.

If OpenAI should remain the reasoning model, configure the agent's LLM through ElevenLabs' supported OpenAI connection. The Replit `OPENAI_API_KEY` is not sent to ElevenLabs by this integration. Verify provider billing, data handling, and region settings in both services before enabling a real business.

## Current boundaries

- The live browser demo is limited to the reviewed Parsley Electrical profile and is disabled when any required ElevenLabs setting is missing.
- Sample audio remains a generated dramatization, not a recording of a real customer.
- The existing Twilio inbound and callback paths have not yet been migrated to ElevenAgents. The callback still needs phone-number verification, ElevenLabs Twilio handoff, and post-call CRM webhook validation before it should be presented as the new live agent.
- The live demo does not book appointments or send messages. It captures an enquiry for team follow-up; the team must confirm availability.
- No recording or deployment is enabled by these changes.
