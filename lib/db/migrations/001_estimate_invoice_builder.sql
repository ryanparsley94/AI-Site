-- Migration: Estimate & Invoice Builder
--
-- This migration is fully idempotent. It can be run safely on:
--   - A fresh database (no quotes/invoices tables yet)
--   - A legacy database (quotes exists with text job_id, no invoice table)
--   - The current dev database (already migrated by drizzle-kit push)
--
-- Run this script ONCE before deploying the updated application code
-- to any environment (production, staging, etc.).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add pricing columns to quotes (all nullable for backwards compat)
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS margin_percent  numeric(5,2);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS vat_percent     numeric(5,2);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS margin_amount   numeric(12,2);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS vat_amount      numeric(12,2);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS total_inc_vat   numeric(12,2);

-- 2. Convert quotes.job_id from TEXT to INTEGER (only when still text).
--    Step A: null-out any non-numeric text values (e.g. "JOB-1042" from the old UI)
--    Step B: alter column type with explicit USING cast
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM   information_schema.columns
    WHERE  table_name = 'quotes'
      AND  column_name = 'job_id'
      AND  data_type = 'text'
  ) THEN
    -- Null out non-numeric legacy strings before the cast
    UPDATE quotes
    SET    job_id = NULL
    WHERE  job_id IS NOT NULL
      AND  job_id !~ '^[0-9]+$';

    ALTER TABLE quotes
      ALTER COLUMN job_id TYPE integer USING job_id::integer;
  END IF;
END
$$;

-- 3. Create the invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id               serial PRIMARY KEY,
  invoice_number   text NOT NULL UNIQUE,
  quote_id         integer,
  job_id           integer,
  status           text NOT NULL DEFAULT 'draft',
  issue_date       text NOT NULL,
  due_date         text NOT NULL,
  line_items       jsonb NOT NULL DEFAULT '[]',
  subtotal         numeric(12,2) NOT NULL DEFAULT 0,
  vat_percent      numeric(5,2)  NOT NULL DEFAULT 20,
  vat_amount       numeric(12,2) NOT NULL DEFAULT 0,
  total            numeric(12,2) NOT NULL DEFAULT 0,
  notes            text,
  client_name      text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
