-- ── 1. Pin search_path on the 3 flagged helpers ───────────────────────
ALTER FUNCTION public.crm_cta_label(button_key text, url text)   SET search_path = public;
ALTER FUNCTION public.crm_normalize_email(_v text)               SET search_path = public;
ALTER FUNCTION public.crm_normalize_phone(_v text)               SET search_path = public;

-- ── 2. Lock down SECURITY DEFINER trigger functions ──────────────────
-- Triggers don't need anon/authenticated EXECUTE — Postgres invokes them.
REVOKE EXECUTE ON FUNCTION public.backfill_behavior_notes_for_contact(uuid)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.crm_promote_campaign_on_reply()            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_task_claimed_webhook()             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_crm_contacts_auto_new_lead()            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_crm_contacts_auto_status_change()       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_crm_contacts_auto_tag_added()           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_recalc_lead_score_activity()           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_recalc_lead_score_behavior()           FROM PUBLIC, anon, authenticated;

-- ── 3. Revoke anon EXECUTE on user-callable RPCs ─────────────────────
-- Keep authenticated EXECUTE so signed-in users can still invoke them.
REVOKE EXECUTE ON FUNCTION public.crm_claim_task(uuid, text)                              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.crm_delete_contact(uuid)                                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.crm_lead_timeline_v2(uuid, text[], text, timestamptz, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.crm_match_contact_by_phone(text)                        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.crm_merge_contacts(uuid, uuid, jsonb)                   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.enroll_in_automation(uuid, uuid, jsonb)                 FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_crm_agent_or_above(uuid)                             FROM PUBLIC, anon;