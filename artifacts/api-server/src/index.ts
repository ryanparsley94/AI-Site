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
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE voice_call_sessions ADD COLUMN IF NOT EXISTS customer_confirmation_status text NOT NULL DEFAULT 'pending'`,
  // 008: Multi-company routing required by the realtime receptionist.
  `ALTER TABLE assistants ADD COLUMN IF NOT EXISTS company_id integer`,
  `ALTER TABLE calls ADD COLUMN IF NOT EXISTS company_id integer`,
  `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS company_id integer`,
  `ALTER TABLE voice_call_sessions
     ADD COLUMN IF NOT EXISTS company_id integer,
     ADD COLUMN IF NOT EXISTS assistant_id integer`,
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
  `CREATE INDEX IF NOT EXISTS contacts_company_idx ON contacts(company_id)`,
  // Preserve the pilot data by attaching pre-existing rows to the first company.
  `UPDATE assistants SET company_id=(SELECT id FROM companies ORDER BY id LIMIT 1)
     WHERE company_id IS NULL AND EXISTS (SELECT 1 FROM companies)`,
  `UPDATE calls SET company_id=(SELECT id FROM companies ORDER BY id LIMIT 1)
     WHERE company_id IS NULL AND EXISTS (SELECT 1 FROM companies)`,
  `UPDATE contacts SET company_id=(SELECT id FROM companies ORDER BY id LIMIT 1)
     WHERE company_id IS NULL AND EXISTS (SELECT 1 FROM companies)`,
  // 008: Additive tenant ownership for the phone/CRM pilot. Columns remain nullable
  // while legacy records are backfilled; tenant route enforcement is a separate release gate.
  `ALTER TABLE assistants ADD COLUMN IF NOT EXISTS company_id integer`,
  `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS company_id integer`,
  `ALTER TABLE calls ADD COLUMN IF NOT EXISTS company_id integer`,
  `ALTER TABLE voice_call_sessions
     ADD COLUMN IF NOT EXISTS company_id integer,
     ADD COLUMN IF NOT EXISTS assistant_id integer,
     ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'gather'`,
  `CREATE INDEX IF NOT EXISTS assistants_company_id_idx ON assistants(company_id)`,
  `CREATE INDEX IF NOT EXISTS contacts_company_phone_idx ON contacts(company_id, phone)`,
  `CREATE INDEX IF NOT EXISTS calls_company_id_idx ON calls(company_id)`,
  `CREATE INDEX IF NOT EXISTS voice_call_sessions_company_id_idx ON voice_call_sessions(company_id)`,

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
