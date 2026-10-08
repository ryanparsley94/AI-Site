-- Additive only. Do not rewrite legacy totals, line items or customer records.
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS contact_id integer,
  ADD COLUMN IF NOT EXISTS call_id integer,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS workflow jsonb,
  ADD COLUMN IF NOT EXISTS company_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz;
