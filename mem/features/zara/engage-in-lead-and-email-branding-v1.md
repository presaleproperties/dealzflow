---
name: Zara Engage Panel + branded email drafts v1
description: In-lead ZaraEngagePanel (Follow up now / Schedule in 1-168h / Summarize / Book showing + free-text composer) routes through zara-engage-action edge fn. Zara email drafts now render via renderBrandedEmail (template scaffold + agent signature) inside zara-suggest-reply — draft_html + template_id_used persisted on zara_suggested_replies so zara-execute-send ships branded HTML. Engagement timeline regrouped by day with richer Zara rows. ZaraDock assistant bubble = no background (editorial), animated thinking dots.
type: feature
---
- `src/components/crm/leads/ZaraEngagePanel.tsx` mounted in RightSidebar above ZaraRemembersCard.
- Edge fn `zara-engage-action` handles 4 kinds (`follow_up_now` | `schedule_followup` | `summarize_lead` | `custom`); auth-scoped via `crm_can_see_contact_id`.
- `zara_proactive_nudges` gained `scheduled_for` + `created_by` + agent INSERT policy. Scheduled follow-ups use `kind='risk_scan'` with `payload.kind='engage_followup'` to disambiguate.
- `zara-suggest-reply` dynamically imports `_shared/zara-email-render.ts` when channel=email, persists `draft_html` + `template_id_used` + interpolated subject. `zara-execute-send` already prefers `draft_html` (pre-existing).
- `EngagementTimeline.tsx` groups by Today/Yesterday/date; Zara rows show channel/intent/confidence pills + expandable RAG sources + reasoning.
- `ZaraDock` MessageBubble: assistant has no background (per brand rule); empty state has gold-gradient avatar + pinned-lead pill; thinking uses 3-dot pulse.
