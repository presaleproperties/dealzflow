-- Auto-generated app-level secrets table (singleton rows by key)
CREATE TABLE IF NOT EXISTS public.app_secrets (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;

-- No policies: only service-role (bypasses RLS) may read. Anon/authenticated cannot.

-- Seed OAuth state HMAC secret (256 bits, base64) once
INSERT INTO public.app_secrets (key, value)
VALUES ('oauth_state_secret', encode(gen_random_bytes(32), 'base64'))
ON CONFLICT (key) DO NOTHING;