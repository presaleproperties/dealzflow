
DELETE FROM public.crm_lead_behavior_sessions WHERE event_id IN ('TEST_RETURN_PRIOR','TEST_RETURN_NOW');
DELETE FROM public.crm_notifications WHERE type='lead_return_visit' AND link_to='/crm/leads/5d687661-28c4-40e8-85f8-dbb8ab20c9c8' AND created_at > now() - interval '10 minutes';
DELETE FROM public.crm_notes WHERE contact_id='5d687661-28c4-40e8-85f8-dbb8ab20c9c8' AND created_at > now() - interval '10 minutes' AND note_type LIKE '%behavior%';
