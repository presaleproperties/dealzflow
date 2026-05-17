
# Zara Tier 2 — Draft & Suggest

Build order, mapped to your 12 tiers. Kill switch stays ON. Engagement event log preserved. Zara is **suggestion-only** — fires nothing on her own.

## Pre-flight: secrets (build report)

You said skip, so I'll ship without these and the edge fns will fail loud at runtime until you add them. Required before any real Zara behavior works:

- `ANTHROPIC_API_KEY` — required for `zara-suggest-reply` (Claude Haiku 4.5) and `zara-refresh-memory`. Without it, `/zara-suggest-reply` returns 500 with `{error:"anthropic_key_missing"}` and no draft is inserted.
- `META_WHATSAPP_TOKEN`, `META_WHATSAPP_PHONE_NUMBER_ID` — required for `zara-execute-send` (WhatsApp channel) and `zara-notify-agent`. SMS/email paths still work.
- `META_WHATSAPP_VERIFY_TOKEN` — required for the GET handshake on `zara-whatsapp-router`. Pick any random string and paste in Meta dashboard + add as secret.
- `zara_settings.test_phone_numbers` — set in /crm/settings → Zara mode before sandbox sends work. No default.

Engagement log, InboxView, manual reply paths are unaffected if any of these are missing.

## Tier 1 — Schema (one migration)

Tables: `zara_suggested_replies`, `zara_approval_decisions`, `zara_lead_memory`, `zara_whatsapp_message_map`, `zara_settings` (singleton id=1, mode='sandbox' default).

`crm_contacts` adds `zara_enabled` (bool default false), `zara_enabled_at`, `zara_enabled_by`.

Indices exactly as specified. RLS on all: read=authenticated, update on drafts/settings=authenticated, INSERT via service_role only (no client inserts — edge fns own writes).

## Tier 2-5, 11 — Edge functions

1. `zara-suggest-reply` — gate on `zara_settings.mode`, then on `contact.zara_enabled` OR `zara_test_contact` tag. Loads `get-zara-context` + `zara_lead_memory`. Language detection by Unicode range. Calls Claude Haiku 4.5. Post-processes guardrails (regex-based). Inserts draft `status='pending'`. Logs `zara_handoff` engagement event. Invokes `zara-notify-agent` ONLY when `mode='live'`.
2. `zara-whatsapp-router` — GET verify-token handshake + POST inbound dispatcher. Agent reply → look up draft via `zara_whatsapp_message_map`, parse 👍 / ✏️ edit: / ❌, call `zara-execute-send` or update status. Lead inbound → log `whatsapp_replied` event, match/create contact, trigger `zara-suggest-reply`.
3. `zara-execute-send` — **Sandbox gate first**: real lead in sandbox → `status='sandbox_blocked'`, return `{blocked:true, would_send_to: phone}`, **no send fires**. Otherwise compute Levenshtein → status approved/edited_approved → channel switch (whatsapp/sms/email) → insert decision row + engagement event → set sent_at.
4. `zara-notify-agent` — Meta Cloud API send to agent's phone, stores wamid → `zara_whatsapp_message_map`. Live mode only.
5. `zara-refresh-memory` — nightly 03:00 Vancouver (10:00 UTC) cron via pg_cron + pg_net. Pulls last 50 events for contacts touched in 30d (cap 500). Claude summarize → upsert `zara_lead_memory`. Manual `POST ?contact_id=X` trigger.

All five fns: CORS, structured error responses, no PII leakage. Send paths fire-and-forget the engagement log insert.

## Tier 6 — Approval queue UI `/crm/zara/queue`

Three-column layout (`grid-cols-[240px_minmax(0,1fr)_320px]`, hidden on mobile → stacked):
- **Left**: filter rail (status/channel/owner/intent/guardrail toggle).
- **Center**: draft cards (header lead+stage+channel+time-ago, quoted inbound, gold-bordered draft block, footer intent+confidence chip color-coded by threshold, guardrail `<Pill>` chips, [Approve & send] gold primary / [Edit & send] inline textarea / [Reject + reason modal] / [Snooze 4h]).
- **Right**: context drawer (memory summary, last 10 events from `crm_engagement_events`, quick stats, "Open full lead" link).

Persistent mode banner at top — gray/amber/green per `zara_settings.mode`. Supabase realtime subscription to `zara_suggested_replies`. Keyboard `j/k/a/e/r`. Empty state copy as spec'd. Uses `<Pill>` primitive per memory.

## Tier 7 — Sandbox testing tools

Queue header: **Seed test contacts** button → creates 3 contacts with `zara_test_contact` tag using `zara_settings.test_phone_numbers`. Per-row **Send test inbound** → modal → invokes `zara-suggest-reply` directly.

Exclusion: `WHERE NOT 'zara_test_contact' = ANY(tags)` added to `usePaginatedCrmContacts`, segment count RPC, `/crm/reports/engagement` queries, and `crm_contact_last_touch` view (recreated with filter).

## Tier 8 — `/crm/settings` Zara mode switcher

New `<ZaraModeSection>` in SettingsLayout: 3 radio buttons (Off/Sandbox/Live). Switching → Live opens confirmation modal requiring literal `GO LIVE` text. Test phone numbers as comma-separated input.

## Tier 9 — Per-lead enablement

Lead detail right rail: new "Zara" card → memory summary + Refresh button (calls `zara-refresh-memory?contact_id=X`) + toggle "Let Zara draft replies for this lead" (helper copy) + "Ask Zara to draft a reply" manual trigger.

Leads table: new sortable/filterable "Zara" column (ti-robot/ti-robot-off via Tabler), bulk action "Enable Zara for selected" / "Disable Zara for selected", saved segment chip "Zara leads" (filter `zara_enabled=true`). Toggling logs `zara_enabled`/`zara_disabled` engagement events with `{toggled_by, prev_state}`.

## Tier 10 — `<ZaraQueueBadge />`

In top nav next to existing SMS QueueBadge. Counts pending drafts where `assigned_to=current_user OR assigned_to IS NULL`. Tone gray/amber/red. Click → `/crm/zara/queue`.

## Tier 12 — Build report

Surfaced in final response: missing secrets list + `test_phone_numbers` reminder. No placeholder defaults injected anywhere.

## Acceptance pass (23/23)

After build I'll run the bun build + edge fn deploys, then exercise:
- 3, 4, 6, 18 via `curl_edge_functions` against `zara-suggest-reply` + `zara-execute-send` with mode toggled in DB.
- 5 via GET `zara-whatsapp-router?hub.mode=subscribe&hub.verify_token=...&hub.challenge=42`.
- 8 by listing the cron job.
- 9-15, 21 via session replay / preview screenshot.
- 16, 19, 20 via DB inspection after triggering.
- 22 via `read_query` count comparison before/after seeding test contacts.

If any criterion fails, I patch and re-run. Won't mark done until 23/23 pass.

## Files to be created (rough count: ~18)

- 1 migration
- 5 edge fn dirs (`zara-suggest-reply`, `zara-whatsapp-router`, `zara-execute-send`, `zara-notify-agent`, `zara-refresh-memory`)
- 1 shared helper `supabase/functions/_shared/zara-guardrails.ts`
- 1 page `src/pages/crm/ZaraQueuePage.tsx` + route in `App.tsx`
- 3-4 queue components (`ZaraDraftCard`, `ZaraFilterRail`, `ZaraContextDrawer`, `ZaraModeBanner`)
- 1 `src/components/topnav/ZaraQueueBadge.tsx`
- 1 `src/components/settings/ZaraModeSection.tsx` (+ wire into UnifiedSettingsPage)
- 1 `src/components/crm/leads/detail/ZaraLeadCard.tsx` (right rail)
- 1 hook `src/hooks/useZaraQueue.ts` (+ realtime)
- Edits: `LeadsTable.tsx` (Zara column + bulk), `usePaginatedCrmContacts.tsx` (test-tag exclusion), `CrmEngagementReportsPage.tsx` (exclusion), `TopNav.tsx` (badge mount), `UnifiedSettingsPage.tsx` (section mount)

## Confirm before I start

Type **go** and I'll ship in this order: migration → edge fns → queue UI → settings → per-lead → badge → exclusions → acceptance pass. Or reply with changes if you want any tier reshaped.
