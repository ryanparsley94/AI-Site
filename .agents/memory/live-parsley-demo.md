---
name: Live Parsley demo data
description: Product boundary for the public Parsley Electrical receptionist pilot demo.
---

The Parsley Electrical public live demo is an opt-in pilot path, not a fictional sandbox: it must use the saved active phone assistant and its `assistant_training` records, augment that with the reviewed public website profile, and route any confirmed appointment through the normal availability and job-booking service. Post-call details belong in the regular CrewOn call/contact/job workflow, scoped to Parsley Electrical. Do not send owner/customer SMS or email from anonymous public demo calls unless a separate explicit delivery decision is made.

**Why:** The demo is intended to prove the same receptionist-to-office workflow as the V1 pilot, while avoiding invented availability and unsolicited external messages.

**How to apply:** Before changing the public demo, preserve explicit consent, strict Parsley tenant resolution, real scheduler validation, and the normal CRM records. For Parsley, direct booking is Monday–Friday 08:30–16:30 Europe/London; evenings and weekends are enquiry/follow-up only. Keep OpenAI Realtime as the only speech path and fail clearly when its server secret is missing.

Demo bot/voice choices are per demo session. Carry the chosen active assistant ID and supported Realtime voice through the browser session and server-generated Twilio Media Stream parameters; never update the assistant's saved default to satisfy one anonymous demo request.

**Why:** Public callers can choose a voice without changing the business's configured live-call behavior or another demo session.

**How to apply:** Validate the selected assistant against the Parsley tenant and active phone-assistant list, then confirm the server response matches the requested assistant and voice before reporting a session as started.
