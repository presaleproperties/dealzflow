UPDATE public.crm_contacts
SET
  first_name = 'Manjosh',
  last_name = 'Sandhu',
  notes = COALESCE(notes, '') ||
    E'\n\n--- Name correction ---\n' ||
    E'Original Presale admin push omitted first/last name; defaulted to "New Lead". Manually corrected to Manjosh Sandhu based on email (manjoshsandhu942@gmail.com).'
WHERE id = '5ed686df-7bd6-4627-acea-ef8d4f0beeb1';