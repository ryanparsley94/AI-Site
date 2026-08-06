-- Migration: Add company_id to jobs for per-company tenant scoping
--
-- Idempotent — safe to run on fresh or already-migrated databases.
-- Existing rows get NULL (unclaimed), which is treated as "all companies" for
-- legacy data and is backward-compatible with existing job API queries.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS company_id integer;
