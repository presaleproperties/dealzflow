-- Add kind to email signatures so each agent can have BOTH a full branded
-- signature (new emails) and a minimalist reply signature (replies/forwards).
ALTER TABLE public.crm_email_signatures
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'full'
    CHECK (kind IN ('full','reply'));

CREATE INDEX IF NOT EXISTS idx_crm_email_signatures_user_kind
  ON public.crm_email_signatures (user_id, kind);

-- Replace the enforce-single-default trigger so the uniqueness is scoped per
-- (user_id, kind). Without this, marking a reply signature as default would
-- clear the user's full default and vice-versa.
CREATE OR REPLACE FUNCTION public.enforce_single_default_signature()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_default THEN
    UPDATE public.crm_email_signatures
       SET is_default = false
     WHERE user_id = NEW.user_id
       AND kind = COALESCE(NEW.kind, 'full')
       AND id <> NEW.id
       AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$;