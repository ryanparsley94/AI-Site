# CREWON V1 — Phase 1 Build Blueprint

## Product goal

CREWON V1 is an AI office for UK trades. It must remove admin work rather than add another dashboard the contractor has to feed manually.

The Parsley Electrical pilot is the first live tenant, but the architecture must be safe to extend to many independent trade businesses. Every business must have its own customers, calls, jobs, diary, assistant configuration, communications and subscription state.

## V1 promise

A customer can contact the trade business by phone, website or email. CREWON captures the enquiry, creates or matches the customer record, stores the conversation, identifies urgency, proposes or books the next action, and puts the result in one dashboard with minimal manual entry.

## V1 navigation

1. Dashboard
2. Enquiries / Calls
3. Schedule / Jobs
4. Customers
5. Email Inbox
6. AI Receptionist
7. Tasks
8. Business Setup
9. Billing

Quotes and invoices already exist in the repo. They can remain available during the Parsley pilot, but they are not the commercial promise of the initial Office plan unless explicitly enabled.

## Core V1 capabilities

### 1. Business onboarding
- Business name, phone, email, website, address and time zone.
- Trade type and services.
- Service areas / postcodes.
- Opening hours.
- Emergency wording and safety rules.
- Preferred appointment windows.
- Website knowledge import may assist onboarding but must never be an unrestricted server-side scraper.

### 2. CRM
Customer record:
- Full name
- Primary phone
- Email
- Billing address
- One or more site addresses
- Notes
- Source
- Created / updated times
- Communication and job history

Rules:
- Match callers primarily by verified inbound number.
- Avoid duplicate customers.
- Calls, emails, jobs and enquiries must link back to the customer where possible.
- Tradify CSV migration is part of V1 onboarding.

### 3. AI phone receptionist
This is a headline V1 feature.

The live path must be:
Twilio inbound call -> bidirectional Media Stream -> OpenAI Realtime -> audio straight back to Twilio.

Do NOT put speech-to-text -> chat completion -> text-to-speech in the live response path.

Requirements:
- Natural conversational UK receptionist style.
- Low dead-air latency.
- Caller can interrupt / barge in.
- Voice is selected inside CREWON.
- Current Realtime-compatible voices: alloy, ash, ballad, coral, echo, sage, shimmer, verse, marin, cedar.
- Default recommendation: marin or cedar.
- Voice is saved per business / receptionist.
- Greeting, name, tone and instructions are configurable.
- No live call transfer in V1.
- The assistant must never invent prices, appointments or availability.
- The assistant should collect: caller name, callback number, work required, site address/postcode, urgency/safety, preferred availability.
- For safety-critical electrical symptoms, prioritise immediate safety guidance and human follow-up.
- The AI must not claim to be a human. If asked, it can say it is the business's AI receptionist.
- Full transcript is stored; dashboard shows a concise summary first.
- Post-call extraction and CRM writes must happen outside the critical audio path.
- Existing Gather/Polly interview remains as a feature-flag fallback until Realtime passes the pilot release gate.

### 4. Voice quality acceptance gate
Do not call Realtime production-ready merely because the transcript is correct.

A pilot call passes only when:
- First useful response feels prompt over a real mobile call.
- Normal turn gaps are conversational, not multi-second pauses.
- Barge-in clears already buffered Twilio audio.
- Caller does not repeatedly hear the assistant talk over them.
- Audio is intelligible on an ordinary mobile network.
- Transcript and summary survive a completed call.
- Partial enquiry survives an interrupted call.
- Provider failure falls back safely or leaves a visible missed/partial enquiry.

### 5. Scheduling
- CREWON diary plus optional Google Calendar integration.
- Jobs include customer, site, service, date/time, duration, notes and status.
- The receptionist may offer/book a slot only from confirmed availability.
- No fabricated availability.
- Reschedule/cancel actions remain auditable.

### 6. Email inbox
- Inbound email becomes a thread in CREWON.
- Link to matching customer where possible.
- AI may draft replies.
- Sending must remain explicit unless the business has deliberately enabled a safe auto-send policy.
- Thread history stays on the customer record.

### 7. Customer follow-up
Included in Office V1:
- Job follow-up
- Review request draft
- Simple reactivation / check-in
- Customer confirmation after a phone enquiry

Full marketing campaigns, ad management and broad social scheduling belong to Pro / later phases.

### 8. Tasks
CREWON can create a task from:
- urgent call
- unanswered enquiry
- quote follow-up
- unpaid invoice
- customer request
- manual entry

### 9. Billing
- Stripe subscription for CREWON itself.
- Office plan first.
- Pro can be displayed as coming soon / waitlist until those features are genuinely live.
- Never charge for unreleased functionality.

## Multi-tenant architecture

The current repository started as a single-contractor dashboard. Phase 1 must move toward explicit tenant ownership.

Every tenant-owned table must have company_id (or an equivalent workspace key), including at minimum:
- assistants
- assistant training
- contacts
- calls
- jobs
- quotes
- invoices
- email threads
- integrations
- tasks
- marketing drafts
- phone number routing
- contact sites
- billing subscriptions

No authenticated tenant route may query a tenant-owned table globally.

The Parsley pilot can be migrated into the first company row, but do not rely on "ORDER BY id LIMIT 1" as the final SaaS boundary.

## Realtime infrastructure

Required Replit secrets / environment values:
- OPENAI_API_KEY
- TWILIO_ACCOUNT_SID
- TWILIO_AUTH_TOKEN
- VOICE_PUBLIC_BASE_URL
- VOICE_REALTIME_ENABLED=true for pilot testing
- OPENAI_REALTIME_MODEL=gpt-realtime-2.1 (optional override)
- RESEND_API_KEY and RESEND_FROM_EMAIL if email alerts are enabled
- STRIPE_SECRET_KEY
- STRIPE_WEBHOOK_SECRET
- STRIPE_OFFICE_PRICE_ID
- APP_PUBLIC_BASE_URL

Realtime model target:
- gpt-realtime-2.1 unless the current OpenAI docs require a newer compatible default.

Audio:
- Twilio Media Streams provides 8 kHz mu-law.
- Configure OpenAI Realtime input and output as audio/pcmu so audio can be forwarded without unnecessary transcoding.

Turn detection:
- Server VAD for the first phone pilot.
- create_response=true
- interrupt_response=true
- tune silence_duration_ms during real call testing.

## Data handling / privacy
- Do not log raw phone audio.
- Avoid logging full transcripts in infrastructure logs.
- Store the minimum transcript/customer data needed for the service.
- If call recordings are later enabled, add an explicit recording policy/notice and retention control before enabling them.
- Secrets must stay server-side.
- Realtime API keys must never be sent to the browser.

## Phase 1 release gates

### Gate A — Build integrity
- Typecheck passes.
- Database migrations are additive/idempotent.
- No secrets in source.
- Existing core pages still load.

### Gate B — Parsley Electrical alpha
- Import a sample of Tradify customers.
- Real Twilio number reaches CREWON.
- Realtime receptionist answers with selected voice.
- Call creates visible enquiry.
- Transcript and summary are attached.
- Urgent call is visibly flagged.
- Owner notification is delivered.
- Customer confirmation is delivered when enabled.
- Appointment can be created from confirmed availability.

### Gate C — SaaS isolation
Before unrelated paying companies are onboarded:
- tenant login/workspace is in place,
- all tenant-owned queries are scoped,
- integrations are tenant-scoped,
- billing is tenant-scoped,
- automated tests prove one tenant cannot read or mutate another tenant's records.

## Replit handoff rule

Replit should build and run the code supplied on the CREWON V1 branch. It should not redesign product behaviour or replace the Realtime architecture with Gather + Polly unless explicitly asked. Its role is to install dependencies, apply migrations, run typecheck/tests, surface compile/runtime failures, and deploy the working branch.

## Commercial V1 positioning

CREWON Office:
- AI receptionist
- CRM
- enquiries
- customer database
- scheduling
- email inbox and reply drafts
- simple follow-up/review chasing
- dashboard
- integrations required for the pilot

CREWON Pro — later:
- deeper estimating
- drawings/take-offs
- advanced quote automation
- invoicing/payment automation
- procurement
- broad marketing campaigns
- advanced workflow automation
