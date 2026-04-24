-- Extend crm_contacts with Presale Properties signup fields for a shared schema
ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS presale_user_id text,
  ADD COLUMN IF NOT EXISTS intent text,                  -- 'buy' | 'invest' | 'browse' | 'sell'
  ADD COLUMN IF NOT EXISTS timeframe text,               -- '0-3m' | '3-6m' | '6-12m' | '12m+'
  ADD COLUMN IF NOT EXISTS home_type_pref text,          -- 'condo' | 'townhome' | 'detached' | 'any'
  ADD COLUMN IF NOT EXISTS looking_to_buy_in text[] DEFAULT '{}'::text[],  -- target cities/neighbourhoods
  ADD COLUMN IF NOT EXISTS marketing_consent boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS signup_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS presale_metadata jsonb DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS crm_contacts_presale_user_id_uidx
  ON public.crm_contacts(presale_user_id) WHERE presale_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS crm_contacts_email_lower_idx
  ON public.crm_contacts(lower(email));

-- Behavior tables: add useful fields to mirror Presale event schema
ALTER TABLE public.crm_lead_behavior_engagement
  ADD COLUMN IF NOT EXISTS template_id text,
  ADD COLUMN IF NOT EXISTS template_name text;

ALTER TABLE public.crm_lead_behavior_forms
  ADD COLUMN IF NOT EXISTS funnel_step integer,
  ADD COLUMN IF NOT EXISTS funnel_total_steps integer;

ALTER TABLE public.crm_lead_behavior_sessions
  ADD COLUMN IF NOT EXISTS landing_page text,
  ADD COLUMN IF NOT EXISTS exit_page text;

ALTER TABLE public.crm_lead_behavior_views
  ADD COLUMN IF NOT EXISTS duration_seconds integer DEFAULT 0;