## Reconciliations vs your spec

Three real conflicts with what already exists. I'll resolve them as follows unless you say otherwise:

1. **Templates table is `crm_email_templates`** (not `email_templates`). Will use this everywhere.
2. **Signatures already live in `crm_email_signatures` + `crm_email_settings.signature_html`** (per-user, edited via Signatures Manager in /crm/settings). I will NOT add `profiles.signature_html` — that would create a second source of truth and break every existing composer. Zara will read the sender's signature from the same source every composer uses, which is the [Sender Signature Rule](mem://features/email/sender-signature-rule) we already follow.
3. **`match_lead_to_projects` RPC does not exist.** I'll add a server-side selector inside the new edge fn that queries `crm_projects` by lead budget/city/persona and orders by best fit — same logic the existing `SendProjectDialog` uses.

Also: a `SendProjectDialog` already exists as a manual multi-step compose flow. The new path here is the **one-click Zara-drafted** version that lands in the queue — different surface, no conflict.

## What I'll ship (14 acceptance criteria)

### Tier 1 — Schema
- `zara_suggested_replies` → add `draft_html text`, `template_id_used uuid REFERENCES crm_email_templates(id) ON DELETE SET NULL`.
- New row in `crm_email_templates`: `Project Showcase — Zara Generated` (category=`custom`, source=`zara`, body_html = the navy/gold scaffold below).
- New CRM settings keys (existing key-value `crm_settings` store): `zara.email.use_template_scaffold` (default true), `zara.email.append_signature` (default true), `zara.email.fallback_template_id`.

### Tier 2 — `draft_email` refactor (zara-tool-execute)
Replace the plain-text path with:
1. Match template by intent → category map (greeting/follow_up/reactivation/neighborhood/newsletter/project_match).
2. Ask the model for JSON `{subject, intro, body_paragraphs[], ps?, cta_text?, cta_url?}` — never raw HTML.
3. Server-render: inject parts into the chosen template's `body_html` + token interpolation (`{{first_name}}`, `{{project_name}}`, etc).
4. Append signature: `crm_email_signatures` default row for the actor (fallback `crm_email_settings.signature_html`).
5. Persist `draft_html`, `template_id_used`, and a plain-text fallback in `draft_text`.

If no template matches → use the inline navy/gold scaffold (header band, 600px white card, `#3b82f6` CTA, signature, dark footer).

### Tier 3 — One-click "Send projects"
- New edge fn **`zara-send-project-details`**: takes `{contact_id, count=3}`, picks top-N matching projects, calls the new `draft_email` path with intent `project_match` + the Project Showcase scaffold, queues into `zara_suggested_replies`.
- Leads row: add a `Sparkles` lucide icon button (project uses lucide, not Tabler — `ti-sparkles` doesn't exist here) in the actions column with tooltip "Send project details".
- Lead detail right rail (Zara section): gold "Send Project Details" button.
- Bulk: when 2+ leads selected, show "Send projects to N leads" in the bulk action bar; fans out the edge fn in parallel (cap 25).

### Tier 4 — Project Showcase scaffold
Stored in `crm_email_templates.body_html` exactly as specified — navy `#1a1a2e` header, 600px white card, 3 stacked project cards (hero/name/city·developer/price/why-it-fits/blue CTA "View Floor Plans"), signature, dark footer with unsubscribe.

### Tier 5 — Queue HTML preview
For email drafts in `/crm/zara/queue`: sandboxed `<iframe srcDoc>` rendering of `draft_html`, toggle Preview / Plain-text fallback / View source, "Edit before send" opens `ComposeEmailDialog` pre-filled with the HTML. Approve & send fires the rendered HTML via `bridge-send-email` (unchanged).

### Tier 6 — Settings
- "Zara email behavior" section in /crm/settings with the three toggles/dropdown above.
- I will **not** add a separate "Email signature" section because [the existing Signatures Manager already does this](mem://features/email/sender-signature-rule). If you want a new card pointing users there, I'll add a one-liner link.

## Files (high level)

- DB migration: 2 columns + 1 template seed
- `supabase/functions/zara-tool-execute/index.ts` — `draft_email` rewrite
- `supabase/functions/zara-send-project-details/index.ts` — new
- `src/pages/crm/ZaraQueuePage.tsx` — iframe preview + toggles + edit
- `src/components/crm/leads/LeadsTable*` — Sparkles action button
- `src/components/crm/leads/LeadsBulkActions*` — bulk button
- `src/components/crm/leads/detail/RightSidebar.tsx` (or ZaraLeadCard) — "Send Project Details" gold button
- `src/components/crm/settings/ZaraEmailBehaviorSection.tsx` — new

## One question before I start

**Should the actor's signature come from `crm_email_signatures` (the per-user table all other composers use) — yes/no?** If yes, I proceed exactly as planned. If you specifically want a new `profiles.signature_html` column AND want every existing composer kept in sync, that's a much larger change and I'll quote separately.

(SMS/WhatsApp drafts stay plain-text as you specified. Kill switch, queue, mode, engagement log, 7 indexed playbooks all preserved.)