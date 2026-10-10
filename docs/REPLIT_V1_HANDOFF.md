# CREWON V1 — Replit Build & Pilot Handoff

Source branch: `crewon-v1-phase1`

This file is operational. The product scope and design rationale live in
`docs/CREWON_V1_BUILD_BLUEPRINT.md`.

## Replit's role

Use the GitHub branch as the source of truth.

Replit should:
1. Sync the latest `crewon-v1-phase1` branch.
2. Install workspace dependencies and update the pnpm lockfile when required.
3. Apply the existing additive/idempotent startup migrations.
4. Run the full workspace typecheck and build.
5. Run the existing voice, Twilio/TwiML, quote-acceptance and dashboard voice tests.
6. Fix concrete compile, type, dependency, migration or runtime defects.
7. Surface missing secrets clearly.
8. Keep the app unpublished until the Parsley alpha release gate is explicitly passed.

Replit should NOT:
- replace Twilio bidirectional Media Streams + OpenAI Realtime with Gather/Polly;
- remove the Gather fallback;
- move post-call CRM work into the live audio path;
- redesign the navigation or commercial V1 scope;
- hard-code provider credentials;
- mark the pilot live merely because credentials exist;
- charge for CREWON Pro while Pro is still marked Coming Soon.

## Current Phase 1 implementation

### AI Receptionist
- Twilio signed inbound webhook.
- Number -> company -> receptionist routing.
- Bidirectional Twilio Media Stream.
- OpenAI Realtime speech-to-speech using PCMU in/out.
- Natural interruption/barge-in with Twilio clear + Realtime truncation.
- Current selectable Realtime voices with Marin/Cedar surfaced as recommended.
- Business-specific greeting, personality, instructions and training knowledge.
- No live human call transfer.
- Legacy Gather interview remains as the safe fallback.

### Live scheduling
- Realtime tool can request the next real CREWON appointment slots.
- The AI may offer only slots returned by CREWON.
- Booking requires the caller to choose an exact returned slot plus name, job address and work required.
- Booking is revalidated transactionally with an advisory lock before the job is inserted.
- Calendar sync occurs after the CREWON booking transaction so an external calendar outage cannot lose the reserved slot.

### Post-call CRM
After the audio call finishes:
- preserve the real transcript;
- extract a concise structured enquiry;
- match/create the customer within the company;
- link the call to the customer;
- flag urgent/safety enquiries;
- create an urgent task when appropriate;
- update receptionist metrics;
- notify the owner by email when configured;
- send caller confirmation SMS when configured.

### Business Setup
- Public website preview with local/private-network rejection and capped page reads.
- Website text is treated as untrusted source material, not instructions.
- OpenAI extracts a factual proposed profile only.
- Owner can edit the proposed business details, services, service areas, opening hours and greeting.
- Nothing updates the live receptionist until the owner explicitly applies the reviewed preview.
- Applying updates the business profile and approved receptionist knowledge.

### CRM and migration
- Company-owned contacts.
- Multiple customer job sites.
- Tradify Customer CSV preview + import.
- Tradify Customer Site CSV preview + import.
- Dedup/update behaviour instead of blind duplicate creation.
- Customer Sites are visible/editable in the CREWON customer dialog.

### Office billing
- CREWON Office billing page.
- Stripe Checkout session creation.
- Stripe Billing Portal session creation.
- Stripe webhook signature verification.
- Idempotent subscription-event processing.
- CREWON stores subscription/customer IDs and state, never payment-card details.
- CREWON Pro remains Coming Soon and non-chargeable.

### Existing office capabilities retained
- Dashboard
- Enquiries/calls
- Schedule/jobs
- Email inbox
- Tasks
- Customer CRM
- Google Calendar / accounting integrations already present in the project
- Existing quote/invoice/certificate tools remain available without being required for the Office launch promise.

## Required live voice configuration

Required for the Realtime phone pilot:
- `OPENAI_API_KEY`
- `VOICE_REALTIME_ENABLED=true`
- `VOICE_PUBLIC_BASE_URL`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_ACCOUNT_SID` recommended/required for provider identity checks and SMS
- a Twilio UK inbound number pointed at `/api/voice/incoming`
- a `phone_numbers` row mapping that number to Parsley Electrical and its phone receptionist

Optional model overrides:
- `OPENAI_REALTIME_MODEL` (default in code: `gpt-realtime-2.1`)
- `OPENAI_TRANSCRIBE_MODEL`
- `OPENAI_POSTCALL_MODEL`

Owner email notifications:
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

Customer SMS confirmation:
- `TWILIO_SMS_FROM`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`

## Required Office billing configuration

- `STRIPE_SECRET_KEY`
- `STRIPE_OFFICE_PRICE_ID`
- `STRIPE_WEBHOOK_SECRET`
- `APP_PUBLIC_BASE_URL`

Stripe webhook endpoint:
- `/api/billing/webhook`

## Parsley Electrical alpha release gate

Do not call the phone receptionist ready based only on a good transcript.

Run a genuine mobile-to-Twilio call and verify:
1. Greeting begins promptly.
2. Typical turn gaps feel conversational rather than multi-second.
3. Caller can interrupt the receptionist naturally.
4. Cleared audio does not continue talking over the caller.
5. Caller details and job description appear in the real transcript.
6. The post-call summary matches what was actually said.
7. The customer record is matched/created correctly.
8. Urgent electrical symptoms create an obvious urgent state/task.
9. A returned appointment can be offered and booked without double-booking.
10. Owner/customer notifications either deliver or show an explicit unconfigured/failed state.
11. A hang-up midway through still preserves the useful partial transcript.
12. If Realtime is disabled/unavailable, the Gather fallback still captures an enquiry rather than dropping the call.

## Commercial SaaS gate

The Parsley alpha may use the current first-company admin context.

Do NOT onboard unrelated paying businesses until a proper authenticated workspace/company context replaces that pilot shortcut across every tenant-owned route, including:
- customers/sites;
- calls/enquiries;
- jobs;
- assistants/training;
- email;
- tasks/marketing;
- integrations;
- billing;
- quotes/invoices where offered.

Before commercial multi-company launch, automated isolation tests must prove that one workspace cannot read or mutate another workspace's records.

## Build acceptance

A Replit build handoff is acceptable only when:
- full workspace typecheck passes;
- full workspace build passes;
- voice tests pass;
- Twilio webhook/TwiML tests pass;
- quote acceptance tests pass;
- dashboard voice tests pass;
- API starts and migrations apply;
- `/api/healthz` returns HTTP 200;
- no provider secret appears in browser code or repository source.

After those checks, the next action is configuration + the real Parsley Electrical phone test — not publication to paying customers.
