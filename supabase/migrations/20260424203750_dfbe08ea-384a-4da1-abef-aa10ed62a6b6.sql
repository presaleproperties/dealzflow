CREATE TABLE IF NOT EXISTS public.crm_timeline_link_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid,
  note_id uuid,
  url text NOT NULL,
  host text,
  path text,
  source text,
  clicked_by uuid,
  clicked_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_link_clicks_contact ON public.crm_timeline_link_clicks(contact_id, clicked_at DESC);
CREATE INDEX IF NOT EXISTS idx_link_clicks_host ON public.crm_timeline_link_clicks(host);
CREATE INDEX IF NOT EXISTS idx_link_clicks_url ON public.crm_timeline_link_clicks(url);

ALTER TABLE public.crm_timeline_link_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CRM members view link clicks"
  ON public.crm_timeline_link_clicks FOR SELECT
  TO authenticated USING (public.is_crm_member(auth.uid()));

CREATE POLICY "CRM agents+ insert link clicks"
  ON public.crm_timeline_link_clicks FOR INSERT
  TO authenticated WITH CHECK (public.is_crm_agent_or_above(auth.uid()));

CREATE OR REPLACE FUNCTION public.log_timeline_link_click(
  _url text,
  _contact_id uuid DEFAULT NULL,
  _note_id uuid DEFAULT NULL,
  _source text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_id uuid;
  v_host text;
  v_path text;
BEGIN
  IF _url IS NULL OR length(btrim(_url)) = 0 THEN RETURN NULL; END IF;
  IF NOT public.is_crm_agent_or_above(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to log link clicks';
  END IF;

  BEGIN
    v_host := lower(split_part(regexp_replace(_url, '^https?://', ''), '/', 1));
    v_path := '/' || split_part(regexp_replace(_url, '^https?://[^/]+/?', ''), '?', 1);
  EXCEPTION WHEN OTHERS THEN
    v_host := NULL; v_path := NULL;
  END;

  INSERT INTO public.crm_timeline_link_clicks
    (url, contact_id, note_id, source, host, path, clicked_by)
  VALUES (_url, _contact_id, _note_id, _source, v_host, v_path, auth.uid())
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_timeline_link_click(text, uuid, uuid, text) TO authenticated;