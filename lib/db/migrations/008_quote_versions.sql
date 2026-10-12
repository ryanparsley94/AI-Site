CREATE TABLE quote_versions (
  id serial PRIMARY KEY,
  quote_id integer NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  title text NOT NULL,
  status text NOT NULL,
  workflow jsonb NOT NULL,
  total_inc_vat numeric(12, 2),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quote_versions_quote_revision_idx UNIQUE (quote_id, revision)
);
