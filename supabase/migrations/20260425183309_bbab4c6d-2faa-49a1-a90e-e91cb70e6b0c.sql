
DO $$
BEGIN
  PERFORM set_config('app.skip_touch','on',true);
  UPDATE public.crm_lead_segments SET name = 'Presale 🔥' WHERE name = 'Pre-Sale 🔥';
  UPDATE public.crm_lead_segments SET name = 'Resale 🔥'  WHERE name = 'Re-Sale 🔥';
END $$;
