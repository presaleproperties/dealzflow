# Send Project — 3-Phase Overhaul

This is a large build (~15-20 files, 2 edge functions, 1 migration, 1 new public route). I'll ship it in phases so you can review/test each before moving on.

---

## Phase 1 — Composer & Recipient UX (ships first)

**File: `src/components/crm/leads/SendProjectDialog.tsx`** (rewrite the form panel)

Add to the dialog:
- **Recipient banner** at top: name · email · "last emailed Xd ago · opened N of M" (one query against `crm_email_log`).
- **Editable subject line** field bound to the preview (passes `subject_override` to `render-and-send`).
- **Personal note** textarea — injected above the project card via a new `personal_note` param, rendered in a styled blockquote.
- **Smart defaults**:
  - Project: prefer the lead's most-recent `crm_activity_events.project_slug`, fallback to `contact.projects[0]`, then alphabetical.
  - Template: remember per-agent last choice in `localStorage` (`sendproject:lastTemplate:<agent>`).
  - Attachments: same per-agent memory.
- **Remove dead SMS tab** (currently disabled with "Prompt 3" tooltip — hide entirely).
- **Gmail disconnect banner**: if `gmailConnected === false`, show inline reconnect CTA (`/crm/settings#gmail`) instead of just disabling Send.
- **Composer autosave**: persist `{projectSlug, templateSlug, subject, personalNote, attachments}` to `localStorage` keyed by `contact.id`, restore on open.

**File: `supabase/functions/render-and-send/index.ts`**
- Accept `subject_override` and `personal_note` body params.
- Inject `personal_note` (sanitized — strip tags, allow line breaks) into the rendered HTML above the project card.
- Generate **plain-text fallback** from final HTML (strip tags, decode entities, preserve links as `text (url)`); attach as `text/plain` alternative.
- Set `Reply-To: <agent.email>` explicitly (currently inherits Gmail default which may be the connected Gmail account — confirm and override).

---

## Phase 2 — Shareable Project Pages

**Migration: `crm_project_shares`**

```text
crm_project_shares
  id                uuid pk
  token             text unique  (24-char nanoid, used in URL)
  project_slug      text references crm_projects(slug)
  contact_id        uuid references crm_contacts(id)  -- nullable (anonymous shares)
  created_by        uuid (agent)
  created_at        timestamptz
  expires_at        timestamptz  (default now()+60d)
  revoked_at        timestamptz  (nullable, manual kill switch)
  view_count        int default 0
  last_viewed_at    timestamptz
```

RLS: agents can SELECT their own shares; INSERT scoped to `auth.uid() = created_by`; public read via edge function (service role) — never directly exposed.

**Edge function: `project-share-view`** (public, `verify_jwt = false`)
- `GET /project-share-view?token=xxx`
- Returns: `{ project, agent, assets, expired, revoked }` — uses service role to fetch `crm_projects` + `crm_team` (for agent identity) + signed URLs for assets.
- Increments `view_count`, sets `last_viewed_at`, inserts `crm_activity_events` row (`event_type: 'project_share_viewed'`, `contact_id`, `project_slug`).
- Sub-events: `?event=floor_plans_viewed`, `?event=pricing_downloaded`, `?event=brochure_downloaded`, `?event=cta_clicked` — each writes one `crm_activity_events` row.

**Public route: `/p/:token`** → new file `src/pages/public/ProjectSharePage.tsx`
- Agent-branded hero (headshot, name, brokerage, phone, Calendly button).
- Project: gallery (max 6 images, lightbox), key stats grid (price-from, beds, completion, deposit), description, location map embed.
- Asset cards: Brochure / Floor Plans / Pricing — each click fires the tracking event before download.
- Single primary CTA: **"Book a viewing"** → opens `/book/:agent-slug?project=:slug&contact=:token` (existing public booking page, just pre-fill).
- Soft-off footer link: "Not interested in this project — show me others" (writes `not_interested` event, doesn't unsubscribe globally).
- Expired/revoked → friendly fallback page with "Contact agent" button.

**Wire into Send Project**
- After `render-and-send` queues the message, also call new RPC `crm_create_project_share(contact_id, project_slug)` → returns `{token}`.
- Email template includes `{{share_url}}` merge var = `https://dealzflow.ca/p/<token>`.
- Primary email CTA becomes "See full project details" → share URL.

---

## Phase 3 — Behavior-aware followups + scheduled & multi-project

**A. Behavior-aware sequence (replaces the single "Cold Lead Followup" toggle)**

New seed automation: `project-share-nurture` with branches based on `crm_activity_events`:
- Day 0: send (handled by Send Project itself)
- Day 1 if no `email_opened` AND no `project_share_viewed` → "Did this land in spam?" nudge from agent
- Day 2 if `project_share_viewed` AND no reply → warm followup w/ booking CTA
- Day 4 if `floor_plans_viewed` OR `pricing_downloaded` → notify agent (push) + send "ready to chat?" email
- Day 7 if no engagement → final soft-touch + mark lead `cold`

Implementation: extend `process-scheduled-emails` to evaluate branch conditions against `crm_activity_events` before sending each step. Add `crm_automation_steps.condition_jsonb` column.

**B. Multi-project send**
- Composer: project picker becomes multi-select (max 3).
- `render-and-send` accepts `project_slugs: string[]`; renders 1-3 stacked project cards in the email.
- One share token created per project, all linked under one `share_group_id` for grouped tracking.

**C. Scheduled send**
- "Send" button becomes split: **Send now** | **Schedule…** (popover with quick options: Tomorrow 9am / Mon 9am / Custom).
- Stored in existing `crm_scheduled_emails` table (already used by `process-scheduled-emails`).
- Visible/cancelable from the lead's timeline as "Scheduled to send Tue 9:00am — Cancel".

---

## Technical summary

**New files**
- `src/pages/public/ProjectSharePage.tsx`
- `src/components/public/AgentBrandedHeader.tsx` (reusable)
- `src/lib/sendProjectMemory.ts` (per-agent localStorage helpers)
- `supabase/functions/project-share-view/index.ts`
- 1 migration: `crm_project_shares` + `crm_create_project_share` RPC + `crm_automation_steps.condition_jsonb`

**Edited files (major)**
- `src/components/crm/leads/SendProjectDialog.tsx` (composer rewrite)
- `supabase/functions/render-and-send/index.ts` (subject/note/text-fallback/share-url/multi-project)
- `supabase/functions/process-scheduled-emails/index.ts` (branch conditions)
- `src/App.tsx` (add `/p/:token` public route)

**Edited files (minor)**
- `src/components/crm/leads/detail/RightSidebar.tsx` (timeline shows scheduled sends)
- 1-2 template HTML updates to include `{{share_url}}` CTA

**Phase order**: 1 → 2 → 3, deploying after each phase so you can test before the next builds on it.

---

## Out of scope (call out if you want them)

- WhatsApp share of the project URL (memory says WhatsApp is removed; SMS share is fine).
- Lead-facing account / saved-projects portal (would need lead auth — big lift).
- A/B testing subject lines.

Confirm and I'll start Phase 1.
