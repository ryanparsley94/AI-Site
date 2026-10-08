ALTER TABLE quotes ADD COLUMN IF NOT EXISTS acceptance_token_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS quotes_acceptance_token_hash_unique ON quotes (acceptance_token_hash);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS shared_at timestamptz;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS responded_at timestamptz;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS change_request text;
