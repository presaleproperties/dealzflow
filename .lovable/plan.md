# CRM Production-Readiness Plan

## Audit Findings (P0 = blocker, P1 = important, P2 = polish)

### Behavior tracking (P0)
- **Realtime not enabled** on `crm_lead_behavior_views/sessions/forms/engagement` — widget cannot live-update
- **Stitching gap**: 6,977 of 6,978 contacts have no `presale_user_id`. Presale sends events without email, so they stay anonymous forever
- **Zero forms/engagement events** — Presale side is not yet pushing these event types
- **PresaleActivityWidget lost its filter UI** in a recent regeneration
- **No realtime subscription** in widget — only invalidates on manual action

### Notifications (P1)
- No notify on signup completion / return visit / high-intent (3+ views in session)
- `trg_behavior_session_return_notify` exists but only for sessions; no triggers for forms/views

### Cross-lead view (P1)
- No CRM-wide behavior dashboard. Only per-lead timeline.

### Design (P2)
- Lead Detail uses some hardcoded text sizes (`text-[10px]`, `text-[11px]`) — fine for density but inconsistent
- No global behavior empty-state across pages

### Performance (P1)
- `usePresaleBehavior` fires 4 sequential-but-parallel queries per lead view; could be a single RPC
- No pagination on behavior tables for power users with thousands of events

## Phases
1. ✅ Audit (this doc)
2. Behavior realtime + stitching backfill + restore filter UI in widget + RPC for unified fetch
3. Cross-lead Behavior Dashboard page (`/crm/behavior`) — top properties, active sessions, signup funnel, return visits
4. Notification triggers on signup_completed, return visit (>30min), high-intent view burst
5. Lead Detail design polish (typography scale, card consistency, mobile)
6. Performance: indexes + RPC + pagination
7. CRM-wide design sweep
