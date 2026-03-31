
-- API Keys table for external agent authentication
CREATE TABLE public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  label text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true
);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- Only admins can view api_keys
CREATE POLICY "Admins can view api keys" ON public.api_keys
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- API Logs table for request auditing
CREATE TABLE public.api_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id uuid REFERENCES public.api_keys(id) ON DELETE SET NULL,
  endpoint text NOT NULL,
  method text NOT NULL,
  status_code integer NOT NULL DEFAULT 200,
  ip_address text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.api_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view api_logs
CREATE POLICY "Admins can view api logs" ON public.api_logs
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- Generate the initial Zara API key
INSERT INTO public.api_keys (key, label)
VALUES (
  'zara_' || encode(gen_random_bytes(32), 'hex'),
  'Zara AI Agent'
);
