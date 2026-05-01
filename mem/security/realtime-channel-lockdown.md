---
name: Realtime Channel Lockdown
description: realtime.messages has RLS — only CRM members get CRM broadcasts; everyone gets their own user:<uid>:* topics
type: feature
---
RLS is enabled on `realtime.messages` with two policies:

- **crm_realtime_subscribe_gate (SELECT)** — auth users may subscribe if topic starts with `user:<their uid>:` / `presence:<their uid>:` OR they are `is_crm_member(auth.uid())`.
- **crm_realtime_publish_gate (INSERT)** — same gate for broadcast/presence sends.

Service role bypasses RLS, so all edge functions are unaffected. Without this, any signed-in user could subscribe to any topic and receive row-change broadcasts for the 13 published CRM tables.

When adding a new realtime channel, name it either `user:<uid>:...` (personal) or anything else (CRM-gated). Do NOT add new policies for individual channel names — the two gates above cover everything.
