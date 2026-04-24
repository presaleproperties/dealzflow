-- Reorder pipeline segments: lead-type-specific buckets (Pre-Sale, Re-Sale, Commercial)
-- come BEFORE the generic status-based "New Leads" bucket so a presale lead with
-- status="New Lead" lands in Pre-Sale 🔥 first.
UPDATE public.crm_lead_segments SET sort_order = 0  WHERE name = 'All Leads';
UPDATE public.crm_lead_segments SET sort_order = 10 WHERE name = 'Pre-Sale 🔥';
UPDATE public.crm_lead_segments SET sort_order = 20 WHERE name = 'Re-Sale 🔥';
UPDATE public.crm_lead_segments SET sort_order = 30 WHERE name = 'Commercial';
UPDATE public.crm_lead_segments SET sort_order = 40 WHERE name = 'New Leads';
UPDATE public.crm_lead_segments SET sort_order = 50 WHERE name = 'Showing Booked';
UPDATE public.crm_lead_segments SET sort_order = 60 WHERE name = 'Offer Made';
UPDATE public.crm_lead_segments SET sort_order = 70 WHERE name = 'Nurturing';
UPDATE public.crm_lead_segments SET sort_order = 80 WHERE name = 'Closed';
UPDATE public.crm_lead_segments SET sort_order = 90 WHERE name = 'Lost / Cold';