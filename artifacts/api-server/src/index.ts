import { createServer } from "node:http";
import app from "./app";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";
import { attachRealtimePhone } from "./lib/realtime-phone";

// ─── Startup migration runner ─────────────────────────────────────────────────
// Idempotent migrations are run on every startup so new deployments never
// fail due to missing columns or tables. All migration SQL must use
// IF NOT EXISTS / IF EXISTS guards.
const MIGRATIONS = [
  `ALTER TABLE quotes
    ADD COLUMN IF NOT EXISTS acceptance_token_hash text,
    ADD COLUMN IF NOT EXISTS shared_at timestamptz,
    ADD COLUMN IF NOT EXISTS responded_at timestamptz,
    ADD COLUMN IF NOT EXISTS change_request text`,
  `CREATE UNIQUE INDEX IF NOT EXISTS quotes_acceptance_token_hash_unique ON quotes (acceptance_token_hash)`,
  // Additive quote workflow: existing prices, customer records and links are untouched.
  `ALTER TABLE quotes
    ADD COLUMN IF NOT EXISTS contact_id integer,
    ADD COLUMN IF NOT EXISTS call_id integer,
    ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft',
    ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS workflow jsonb,
    ADD COLUMN IF NOT EXISTS company_snapshot jsonb,
    ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
    ADD COLUMN IF NOT EXISTS accepted_at timestamptz`,
  // 003: Add company_id to jobs for per-company tenant scoping
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS company_id integer`,
  // Persist the crew label selected on a job without changing existing rows.
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS assigned_engineer text`,
  // 004: Create tasks table for AI-generated and manual to-do items
  `CREATE TABLE IF NOT EXISTS tasks (
    id serial PRIMARY KEY,
    title text NOT NULL,
    priority text NOT NULL DEFAULT 'medium',
    status text NOT NULL DEFAULT 'pending',
    source text NOT NULL DEFAULT 'manual',
    due_date timestamptz,
    company_id integer,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  // 005: Create marketing_drafts table for AI-generated follow-up and review-request messages
  `CREATE TABLE IF NOT EXISTS marketing_drafts (
    id serial PRIMARY KEY,
    job_id integer,
    job_title text NOT NULL,
    client_name text NOT NULL,
    client_phone text,
    company_name text NOT NULL DEFAULT '',
    type text NOT NULL DEFAULT 'review_request',
    status text NOT NULL DEFAULT 'pending',
    draft_message text,
    edited_message text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  // 006: Partial unique index on marketing_drafts (job_id, type) to prevent duplicate
  //      auto-generated drafts per job. Applies only when job_id IS NOT NULL so that
  //      manually created jobless drafts are unaffected.
  `CREATE UNIQUE INDEX IF NOT EXISTS marketing_drafts_job_type_unique
     ON marketing_drafts (job_id, type)
     WHERE job_id IS NOT NULL`,
  // 007: Durable state for Twilio's multi-step voice webhook. The unique SID
  // makes retried webhook requests safe to acknowledge without a second lead.
  `CREATE TABLE IF NOT EXISTS voice_call_sessions (
    call_sid text PRIMARY KEY,
    caller_phone text NOT NULL,
    called_phone text NOT NULL DEFAULT '',
    call_id integer,
    step integer NOT NULL DEFAULT 0,
    retries integer NOT NULL DEFAULT 0,
    answers jsonb NOT NULL DEFAULT '{}'::jsonb,
    completed boolean NOT NULL DEFAULT false,
    notification_status text NOT NULL DEFAULT 'pending',
    customer_confirmation_status text NOT NULL DEFAULT 'pending',
    opening_greeting_started boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE voice_call_sessions ADD COLUMN IF NOT EXISTS customer_confirmation_status text NOT NULL DEFAULT 'pending'`,
  `ALTER TABLE voice_call_sessions ADD COLUMN IF NOT EXISTS opening_greeting_started boolean NOT NULL DEFAULT false`,
  // 008: Multi-company phone routing and additive tenant ownership.
  // Columns stay nullable while legacy data is backfilled; strict tenant auth is
  // a separate release gate before unrelated companies can be onboarded.
  `ALTER TABLE assistants ADD COLUMN IF NOT EXISTS company_id integer`,
  `ALTER TABLE calls ADD COLUMN IF NOT EXISTS company_id integer`,
  `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS company_id integer`,
  `ALTER TABLE voice_call_sessions
     ADD COLUMN IF NOT EXISTS company_id integer,
     ADD COLUMN IF NOT EXISTS assistant_id integer,
     ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'gather'`,
  `CREATE TABLE IF NOT EXISTS phone_numbers (
     id serial PRIMARY KEY,
     company_id integer NOT NULL,
     assistant_id integer,
     provider text NOT NULL DEFAULT 'twilio',
     provider_sid text,
     phone_number text NOT NULL UNIQUE,
     label text,
     active boolean NOT NULL DEFAULT true,
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS phone_numbers_company_idx ON phone_numbers(company_id)`,
  `CREATE INDEX IF NOT EXISTS assistants_company_idx ON assistants(company_id)`,
  `CREATE INDEX IF NOT EXISTS calls_company_idx ON calls(company_id)`,
  `CREATE INDEX IF NOT EXISTS contacts_company_phone_idx ON contacts(company_id,phone)`,
  `CREATE INDEX IF NOT EXISTS voice_call_sessions_company_idx ON voice_call_sessions(company_id)`,
  `CREATE TABLE IF NOT EXISTS voice_call_diagnostics (
     id bigserial PRIMARY KEY,
     call_sid text NOT NULL,
     call_id integer,
     company_id integer,
     event_type text NOT NULL,
     summary text NOT NULL,
     details jsonb NOT NULL DEFAULT '{}'::jsonb,
     occurred_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS voice_call_diagnostics_call_time_idx
     ON voice_call_diagnostics(call_sid, occurred_at)`,
  // Preserve the current Parsley pilot rows when the new ownership columns appear.
  `UPDATE assistants SET company_id=(SELECT id FROM companies ORDER BY id LIMIT 1)
     WHERE company_id IS NULL AND EXISTS (SELECT 1 FROM companies)`,
  `UPDATE calls SET company_id=(SELECT id FROM companies ORDER BY id LIMIT 1)
     WHERE company_id IS NULL AND EXISTS (SELECT 1 FROM companies)`,
  `UPDATE contacts SET company_id=(SELECT id FROM companies ORDER BY id LIMIT 1)
     WHERE company_id IS NULL AND EXISTS (SELECT 1 FROM companies)`,

  // 009: Multiple customer job sites, including Tradify site migration.
  `CREATE TABLE IF NOT EXISTS contact_sites (
     id serial PRIMARY KEY,
     company_id integer NOT NULL,
     contact_id integer NOT NULL,
     name text NOT NULL,
     address_street text,
     city text,
     region text,
     postcode text,
     country text,
     phone text,
     notes text,
     source text NOT NULL DEFAULT 'manual',
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS contact_sites_contact_idx ON contact_sites(company_id,contact_id)`,

  // 010: CREWON Office subscription state and Stripe webhook idempotency.
  `CREATE TABLE IF NOT EXISTS billing_subscriptions (
     id serial PRIMARY KEY,
     company_id integer NOT NULL UNIQUE,
     plan text NOT NULL DEFAULT 'office',
     status text NOT NULL DEFAULT 'inactive',
     stripe_customer_id text,
     stripe_subscription_id text,
     stripe_price_id text,
     current_period_end timestamptz,
     cancel_at_period_end boolean NOT NULL DEFAULT false,
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS billing_subscriptions_stripe_subscription_unique
     ON billing_subscriptions(stripe_subscription_id)
     WHERE stripe_subscription_id IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS billing_events (
     event_id text PRIMARY KEY,
     event_type text NOT NULL,
     processed_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS public_demo_sessions (
      id text PRIMARY KEY,
      profile jsonb NOT NULL,
      receptionist_name text NOT NULL,
      voice text NOT NULL,
       company_id integer,
       assistant_id integer,
       call_sid text,
       call_id integer,
      transcript text,
      result jsonb,
      booking jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      finalized_at timestamptz
    )`,
   `ALTER TABLE public_demo_sessions
      ADD COLUMN IF NOT EXISTS company_id integer,
      ADD COLUMN IF NOT EXISTS assistant_id integer,
      ADD COLUMN IF NOT EXISTS call_sid text,
      ADD COLUMN IF NOT EXISTS call_id integer`,
  `CREATE INDEX IF NOT EXISTS public_demo_sessions_created_idx ON public_demo_sessions(created_at)`,
  `ALTER TABLE marketing_drafts
    ADD COLUMN IF NOT EXISTS client_email text,
    ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'sms',
    ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'not_sent',
    ADD COLUMN IF NOT EXISTS delivery_version integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS delivery_error text,
    ADD COLUMN IF NOT EXISTS provider_message_id text,
    ADD COLUMN IF NOT EXISTS sent_at timestamptz`,
  `UPDATE marketing_drafts d SET client_email = c.email
    FROM jobs j JOIN contacts c ON c.id = j.contact_id
    WHERE d.job_id = j.id AND d.client_email IS NULL AND c.email IS NOT NULL
      AND d.delivery_status = 'not_sent'`,
  // Normalize legacy OpenAI voice IDs to the curated receptionist persona set.
  `UPDATE assistants
      SET realtime_voice = CASE lower(realtime_voice)
        WHEN 'alloy' THEN 'cedar'
        WHEN 'marin' THEN 'cedar'
        WHEN 'ballad' THEN 'coral'
        WHEN 'verse' THEN 'echo'
        WHEN 'fable' THEN 'sage'
        WHEN 'nova' THEN 'coral'
        WHEN 'onyx' THEN 'echo'
        ELSE 'cedar'
      END
    WHERE realtime_voice NOT IN ('cedar','ash','echo','coral','sage','shimmer')`,
  `UPDATE assistants
      SET voice = CASE lower(voice)
        WHEN 'alloy' THEN 'cedar'
        WHEN 'marin' THEN 'cedar'
        WHEN 'ballad' THEN 'coral'
        WHEN 'verse' THEN 'echo'
        ELSE 'cedar'
      END
    WHERE voice NOT IN ('cedar','ash','echo','coral','sage','shimmer')`,
  `UPDATE assistants
      SET voice = realtime_voice
    WHERE type='phone'
      AND realtime_voice IN ('cedar','ash','echo','coral','sage','shimmer')
      AND voice IS DISTINCT FROM realtime_voice`,
];

async function runMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    for (const sql of MIGRATIONS) {
      await client.query(sql);
    }
    logger.info("Database migrations applied");
  } catch (err) {
    logger.error({ err }, "Migration failed — aborting startup");
    process.exit(1);
  } finally {
    client.release();
  }
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

runMigrations().then(() => {
  const server = createServer(app);
  attachRealtimePhone(server);

  server.on("error", (err) => {
    logger.error({ err }, "HTTP server error");
    process.exit(1);
  });

  server.listen(port, () => {
    logger.info({ port }, "Server listening");
  });
});
