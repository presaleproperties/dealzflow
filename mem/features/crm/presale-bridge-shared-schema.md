---
name: presale-bridge-shared-schema
description: Canonical shared lead + behavior payload between Presale Properties and CRM (bridge-ingest-lead). Lists fields, enums, dedupe, merge rules.
type: feature
---
The bridge endpoint `bridge-ingest-lead` accepts a shared schema mirroring Presale signups + behavior events. Full contract lives at `_bridge-presale-side/SHARED_SCHEMA.md`.

Lead fields on `crm_contacts` populated by Presale: presale_user_id, intent, timeframe, home_type_pref, looking_to_buy_in[], budget_min/max, bedrooms_preferred, is_pre_approved, language, city/province/postal_code, marketing_consent, signup_completed_at, presale_metadata (jsonb), campaign_source, referral_source, projects[].

Behavior tables mirror Presale events:
- crm_lead_behavior_views: + duration_seconds
- crm_lead_behavior_engagement: + template_id, template_name (for template views/clicks)
- crm_lead_behavior_forms: + funnel_step, funnel_total_steps
- crm_lead_behavior_sessions: + landing_page, exit_page

Dedupe order: presale_user_id → (email OR phone). Merge appends tags/projects/cities, fills blanks only, never overwrites manual edits.
