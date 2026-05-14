ALTER TABLE public.crm_zara_settings
  ADD COLUMN IF NOT EXISTS autonomous_outbound boolean NOT NULL DEFAULT false;

UPDATE public.crm_zara_settings
   SET autonomous_outbound = true,
       outbound_planner_enabled = true,
       enabled = true
 WHERE id = 1;