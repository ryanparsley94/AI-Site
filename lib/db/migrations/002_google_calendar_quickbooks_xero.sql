-- Migration: Google Calendar, QuickBooks & Xero integrations
--
-- Idempotent — safe to run on fresh or already-migrated databases.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. OAuth tokens table (one row per provider per company installation)
CREATE TABLE IF NOT EXISTS integrations (
  id              serial PRIMARY KEY,
  provider        text NOT NULL UNIQUE,  -- 'google' | 'quickbooks' | 'xero'
  access_token    text,
  refresh_token   text,
  expires_at      timestamptz,
  metadata        jsonb,
  connected_at    timestamptz NOT NULL DEFAULT now(),
  last_sync_at    timestamptz
);

-- 2. Link jobs to Google Calendar events
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS google_event_id text;

-- 3. Link invoices to external accounting records
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS external_id       text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS external_provider text;
