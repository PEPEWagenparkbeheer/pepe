-- Twinfield OAuth token store (singleton per Vercel-deployment, geen vaste schijf)
CREATE TABLE IF NOT EXISTS twinfield_auth (
  id                    TEXT PRIMARY KEY DEFAULT 'singleton',
  refresh_token         TEXT,
  access_token          TEXT,
  access_token_expires  TIMESTAMPTZ,
  cluster_url           TEXT,
  company_code          TEXT,
  connected_by          TEXT,
  connected_at          TIMESTAMPTZ,
  CONSTRAINT twinfield_auth_singleton CHECK (id = 'singleton')
);

ALTER TABLE twinfield_auth ENABLE ROW LEVEL SECURITY;
-- Geen policies = alleen service-role (supabaseAdmin) mag erbij; browser-clients geblokkeerd.
