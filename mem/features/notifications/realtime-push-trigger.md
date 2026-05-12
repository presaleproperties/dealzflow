---
name: Real-time Push Trigger
description: AFTER INSERT trigger on crm_notifications fires Web Push for med/high severity via send-push-notification + bootstrap-push-trigger
type: feature
---
- `crm_internal_config` (admin-only RLS) holds `service_role_key` + `functions_base_url`.
- `dispatch_push_for_notification()` trigger fn calls `net.http_post` to `/functions/v1/send-push-notification` with the SR bearer for any new `crm_notifications` row where `severity ∈ ('med','high')`.
- `send-push-notification` accepts SR-bearer OR `x-internal-trigger: <SR>` header to bypass user-JWT path (kept user-JWT path for client-initiated calls).
- One-shot `bootstrap-push-trigger` edge fn (admin-only) writes the env service-role key into `crm_internal_config`. Must be invoked once per project (and after key rotation).
- Covers SMS-received / lead-assigned / deal-stage-change automatically because all three already route through `crm_send_notification` → `crm_notifications`.
