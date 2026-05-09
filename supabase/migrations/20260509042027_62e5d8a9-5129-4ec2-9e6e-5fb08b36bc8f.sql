UPDATE public.crm_contacts
SET
  lead_tier = 'hot',
  tags = ARRAY(SELECT DISTINCT unnest(COALESCE(tags, ARRAY[]::text[]) || ARRAY['hot']::text[])),
  notes = COALESCE(notes, '') ||
    E'\n\n--- Activity timeline (auto-summary from Presale) ---\n' ||
    E'• 03:58:55 — Lead approved by info@presaleproperties.com (admin push)\n' ||
    E'• 03:58:57 — Auto-response email sent (Fleetwood Village 2 Building 7)\n' ||
    E'• 03:59:01 — Project details email sent: "Fleetwood Village 2 Building 7 — Your Requested Floor Plans & Details" (template: auto_project_details_docs)\n' ||
    E'• 04:00:30 — Email opened (1st open)\n' ||
    E'• 04:00:30 — Email opened (2nd open) → triggers HOT (≥2 opens)\n' ||
    E'\n--- Engagement counters ---\n' ||
    E'Emails sent: 2 · Opens: 2 · Clicks: 0 · Deck visits: 0 · Forms: 0'
WHERE id = '5ed686df-7bd6-4627-acea-ef8d4f0beeb1';