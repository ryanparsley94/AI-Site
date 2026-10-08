import app from "./app";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";

// ─── Startup migration runner ─────────────────────────────────────────────────
// Idempotent migrations are run on every startup so new deployments never
// fail due to missing columns or tables. All migration SQL must use
// IF NOT EXISTS / IF EXISTS guards.
const MIGRATIONS = [
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
  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
});
