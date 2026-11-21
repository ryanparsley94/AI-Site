# CREWON V1 — ElevenLabs receptionist pilot

## Status
This branch adds a **signed-in browser voice pilot only**. It DOES NOT replace the OpenAI/Twilio call path, auto-enrol a business, connect the ElevenLabs agent to the existing CRM or enable public callback demos. Do not describe it as production-ready.

### Files changed
- `artifacts/api-server/src/routes/elevenlabs-pilot.ts`: authenticated signed-WebSocket-URL issuance, configuration readout, basic in-memory cost gate, no upstream body/key logging.
- `artifacts/buildai/src/pages/elevenlabs-pilot.tsx`: secure real-time speaking/listening pilot, permission handling, mute/end.
- Route, dependency and AI Assistants navigation wiring; isolated browser tests.

## Owner setup — in ElevenLabs, not in chat
1. Create an **ElevenLabs Agent** with a British-English voice. Use a *fictional electrical company* for initial pilot conversations; no real customers or private data.
2. Add a suitable greeting and system prompt: identify the company as fictional/test; ask one question at a time; gather type of job, postcode, contact preference and urgency; never promise a firm booking, quote or availability; refer electrical emergencies safely.
3. In the agent's security/authentication settings, enable authentication so CREWON can use **signed URLs**. Do not make the pilot agent public. Check any recording, transcription, retention and regional settings in ElevenLabs before using real customer information.
4. Create an ElevenLabs API key with only the necessary privileges for issuing conversation signed URLs, if your account/plan supports scopes.
5. In **Replit > Secrets**, set:
   - `ELEVENLABS_API_KEY` — the secret key, **never** post in chat or commit to GitHub.
   - `ELEVENLABS_AGENT_ID` — the ID of the **same** ElevenLabs Agent (normally begins `agent_`).
   - Keep `SESSION_SECRET` set to protect dashboard login. The pilot requires an authenticated session.
6. Preview CREWON on its **HTTPS** URL. Sign in, open AI Assistants > **ElevenLabs Pilot**, click Start Voice Test, allow microphone permission. End the call when done. The rate gate allows at most 3 new signed sessions per 10 minutes per application IP, per app process.
7. **Do not connect a live Twilio number yet**. It remains on the existing receptionist until cross-provider telephony, handoff, privacy and call-result validation are done.

## Replit handoff — GitHub-first integration
- Start from the latest `replit-agent` branch. Review and merge the *PR only*; do not overwrite concurrent dashboard, task or original voice changes.
- `pnpm install --no-frozen-lockfile` (new `@elevenlabs/react` dependency). Commit the updated `pnpm-lock.yaml` to the integration branch.
- `pnpm --filter @workspace/api-server typecheck`
- `pnpm --filter @workspace/buildai typecheck`
- `pnpm --filter @workspace/api-server build`
- `pnpm --filter @workspace/buildai build`
- Run existing voice and mobile regressions plus `artifacts/buildai/tests/elevenlabs-pilot.spec.ts`. Mocking the API in a test is not a real successful voice call.
- Verify that `GET /api/voice/elevenlabs/status` and `POST /api/voice/elevenlabs/session` return **401 without admin login**. A configured authenticated POST requires an HTTPS same-origin request.
- Check 503 when either ElevenLabs secret is missing; no signed URL is issued. Test rate limiting and vendor failure. Confirm keys and signed URLs never enter logs/analytics, and UI does not show a successful call if connection fails.
- Run an authorised live browser conversation on a test account. Measure turn latency, barge-in/interruption, silence recovery, UK pronunciation, transcript accuracy and credit usage. Compare to existing CREWON OpenAI Realtime.
- Keep old receptionist/phone path as fallback until signed off. No live publishing, public demo or payment enrolment from this PR.

## Next build stages (not included)
1. Secure per-business agent configuration, voice choices and tenant separation, with RLS/auth coverage.
2. Server-side ElevenLabs agent tools/webhooks for business FAQs, existing job/enquiry capture, available appointment slots, booking confirmation and post-call CRM records. Prevent hallucinated prices and times.
3. Twilio/ElevenLabs test number and verified call routing, callback ownership, consent and regional/privacy controls.
4. All three public demos: real sample call, safe browser demo and rate-limited explicit-consent outbound callback. Public demos need separate abuse/cost protections and must not expose a production tenant.
5. Pilot tests with Parsley Electrical before selling any subscriptions.

## Docs
- [ElevenLabs React SDK](https://elevenlabs.io/docs/eleven-agents/libraries/react)
- [ElevenLabs signed URL API](https://elevenlabs.io/docs/api-reference/conversations/get-signed-url)
- [ElevenLabs authentication](https://elevenlabs.io/docs/eleven-agents/customization/authentication)
- [ElevenLabs Twilio integration](https://elevenlabs.io/docs/eleven-agents/customization/integrations/twilio)
