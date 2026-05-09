UPDATE public.crm_contacts
SET
  source = 'PresaleProperties.com',
  tags = ARRAY['presale-website', 'deck:Fleetwood Village 2 Building 7']::text[],
  notes = COALESCE(notes, '') ||
    E'\n\n--- Presale metadata ---\n' ||
    E'Granular source: presale_properties_admin\n' ||
    E'Approved by: info@presaleproperties.com\n' ||
    E'Project: Fleetwood Village 2 Building 7\n' ||
    E'Presale lead_id: b98927d5-3ae5-42a7-a712-3d910864063f'
WHERE id = '5ed686df-7bd6-4627-acea-ef8d4f0beeb1';