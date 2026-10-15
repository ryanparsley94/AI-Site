---
name: Live Parsley demo data
description: Product boundary for the public Parsley Electrical receptionist pilot demo.
---

The Parsley Electrical public live demo is an opt-in pilot path, not a fictional sandbox: it must use the saved active phone assistant and its `assistant_training` records, augment that with the reviewed public website profile, and route any confirmed appointment through the normal availability and job-booking service. Post-call details belong in the regular CrewOn call/contact/job workflow, scoped to Parsley Electrical. Do not send owner/customer SMS or email from anonymous public demo calls unless a separate explicit delivery decision is made.

**Why:** The demo is intended to prove the same receptionist-to-office workflow as the V1 pilot, while avoiding invented availability and unsolicited external messages.

**How to apply:** Before changing the public demo, preserve explicit consent, strict Parsley tenant resolution, real scheduler validation, and the normal CRM records. For Parsley, direct booking is Monday–Friday 08:30–16:30 Europe/London; evenings and weekends are enquiry/follow-up only. Keep OpenAI Realtime as the only speech path and fail clearly when its server secret is missing.

Demo users may choose a receptionist name, but not override the voice. The selected phone assistant's saved curated `realtime_voice` is the source of truth for editor preview, public demo audio, browser Realtime, and inbound Twilio calls. Saving a voice change updates that assistant's persisted configuration; reject stale demo voice overrides.

**Why:** A demo voice that differs from the saved assistant misrepresents the live receptionist. Voice changes belong to the business owner and must remain consistent across preview and real calls.

**How to apply:** Validate the selected assistant against the Parsley tenant and active phone-assistant list; resolve its voice server-side for every demo and live path. Require a saved voice before previewing it, and confirm the server response voice matches the saved assistant.

For the active receptionist Edward, Cedar is the default male persona. Do not reintroduce Marin as a selectable voice, saved default, or runtime fallback; map legacy saved Marin values to Cedar.

**Why:** The owner explicitly wants Edward to sound like a calm, mature, warm, clear male British receptionist, and does not want Marin retained for him.

**How to apply:** Keep Cedar first/default in receptionist settings, use its persona direction in preview and live instructions, and preserve the one-time legacy-data conversion when evolving voice configuration.
