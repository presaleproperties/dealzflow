-- ============================================================
-- Migration A — Realtime Channel Lockdown (P0)
-- ============================================================
-- Problem: realtime.messages has NO RLS policies. With 13 sensitive tables
-- (crm_messages, crm_sms_log, crm_lead_behavior_*, crm_activity_events, etc.)
-- published to supabase_realtime, any authenticated user could subscribe to
-- any channel topic and receive all row-change broadcasts, bypassing the
-- table-level SELECT policies.
--
-- Fix: Enable RLS on realtime.messages and add a SELECT policy that:
--   - Allows CRM members to subscribe to crm-* / lead-* topics
--   - Allows all users to subscribe to their own personal topics
--     (e.g. "user:<uid>:*" used by presence)
--   - Service role bypasses RLS automatically (edge fns unaffected)
--
-- Note: realtime.messages is the ephemeral broadcast log. Enabling RLS on it
-- is the supported Supabase pattern (https://supabase.com/docs/guides/realtime/authorization).
-- ============================================================

-- 1. Enable RLS (idempotent)
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

-- 2. Drop any prior version of our policy so this migration is re-runnable
DROP POLICY IF EXISTS "crm_realtime_subscribe_gate" ON realtime.messages;

-- 3. Create the subscription gate.
--    realtime.topic() returns the channel topic string the client subscribed to.
CREATE POLICY "crm_realtime_subscribe_gate"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  -- Allow personal channels: "user:<uid>:..." or "presence:<uid>:..."
  (
    realtime.topic() LIKE ('user:' || auth.uid()::text || '%')
    OR realtime.topic() LIKE ('presence:' || auth.uid()::text || '%')
  )
  -- OR the caller is a CRM member (covers all crm-* / postgres_changes channels
  -- that broadcast row changes for the 13 published CRM tables)
  OR public.is_crm_member(auth.uid())
);

-- 4. Allow CRM members to publish to channels (broadcast/presence sends).
--    Without this, broadcast() calls from the client would fail.
DROP POLICY IF EXISTS "crm_realtime_publish_gate" ON realtime.messages;
CREATE POLICY "crm_realtime_publish_gate"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  (
    realtime.topic() LIKE ('user:' || auth.uid()::text || '%')
    OR realtime.topic() LIKE ('presence:' || auth.uid()::text || '%')
  )
  OR public.is_crm_member(auth.uid())
);
