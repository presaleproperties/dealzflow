# Engagement Event Log — Single Task Build

Append-only event log for every meaningful contact touchpoint, plus a timeline widget, a reports surface, and a Zara context endpoint. Send paths must never be blocked by a logging failure.

## Tier 1 — Database migration

Create `public.crm_engagement_events` (append-only):
- Columns per spec: `id`, `contact_id` → `crm_contacts(id) ON DELETE CASCADE`, `actor_id` → `profiles(id) ON DELETE SET NULL`, `event_type text`, `source text`, `direction text`, `campaign_id` → `crm_campaigns(id) ON DELETE SET NULL`, `thread_id text`, `metadata jsonb`, `occurred_at timestamptz`, `created_at timestamptz`.
- Indexes:
  - `(contact_id, occurred_at DESC)`
  - `(event_type, occurred_at DESC)`
  - `(campaign_id) WHERE campaign_id IS NOT NULL`
  - `(actor_id, occurred_at DESC) WHERE actor_id IS NOT NULL`
- RLS enabled:
  - SELECT: `authenticated` → `true`
  - INSERT: `actor_id IS NULL OR actor_id = auth.uid()`
  - No UPDATE / DELETE policies (append-only).

Create view `public.crm_contact_last_touch`:
- `contact_id`
- `last_outbound_at` (max where event_type ∈ email_sent, sms_sent, whatsapp_sent, call_made)
- `last_inbound_at` (max where event_type ∈ email_replied, sms_replied, whatsapp_replied, call_received, email_opened, email_clicked, whatsapp_read)
- `last_event_at` (max overall)
- `engagement_signal_count` (count where event_type ∈ email_opened, email_clicked, whatsapp_read)
- `GRANT SELECT … TO authenticated`

Pre-check: confirm `public.profiles(id)` and `public.crm_campaigns(id)` exist; if `profiles.id` keys to `user_id`, switch FK target accordingly. Allowed `event_type` values are **not** enforced via DB enum — only via the client helper union type.

## Tier 2 — Client helper `src/lib/engagementLog.ts`

- Export strongly-typed unions `EngagementEventType` and `EngagementSource`.
- Export `logEngagementEvent(params)` and `logEngagementEvents(events[])`.
- `actor_id` pulled from `supabase.auth.getUser()` (null if unauthenticated / edge).
- Fire-and-forget: full body wrapped in try/catch, never throws, errors → `console.warn('[engagementLog]', …)`.

## Tier 3 — Wire 5 call sites

1. **UnifiedComposer** (`src/components/crm/composer/UnifiedComposer.tsx`)
   - After successful email bridge response → `email_sent` with `{subject, template_id, char_count}`. Single recipient → one event; bulk → `logEngagementEvents` (one row per recipient, shared `campaign_id`).
   - After insert into `sms_outbound_queue` → `sms_sent` with `{staged:true, segment_count, char_count}`.

2. **InboxView** (`src/components/crm/email/InboxView.tsx`)
   - On first render of an unread inbound message in a thread → `email_replied` with `{from, subject, snippet}`. Debounce per session via `useRef<Set<string>>`.

3. **LeadsTable** (`src/components/crm/leads/LeadsTable.tsx`) + `EditLeadDetailsSheet.tsx` for the save path
   - Pipeline stage change (drag-drop OR edit save) → `stage_changed` `{prev_stage, new_stage}`.
   - Tag add/remove → `tag_added` / `tag_removed` `{tag}`.
   - Assignment change → `lead_assigned` (first assignment) / `lead_reassigned` `{prev_owner, new_owner}`.
   - Do **not** log on row-action icon clicks (composer covers those).

4. **Scheduler edge functions** — `supabase/functions/scheduler-send-emails` and `supabase/functions/scheduler-reminders`
   - Service-role client. After each successful send, insert one row per recipient: `actor_id` null, `source: 'scheduler'`, `event_type: 'email_sent'`, `campaign_id` when known. Try/catch swallow.

5. **Notes / Tasks / Bookings**
   - Note create → `note_added` source `'crm'` `{note_id, snippet}` in `useCrmNotes` mutation success.
   - Task create / complete → `task_added` / `task_completed` `{task_id, title}` in task mutation hooks.
   - Booking create → `booking_created` `{event_name, scheduled_at}` (manual path + Calendly/scheduler webhook insertion point).

## Tier 4 — Engagement timeline widget

- New component `src/components/crm/leads/EngagementTimeline.tsx`.
- Query: `select * from crm_engagement_events where contact_id = $id order by occurred_at desc limit 50` (react-query, key `['engagement-events', contactId]`).
- Row UI: Tabler outline icon by event type (mail / message / brand-whatsapp / phone / tag / arrow-right / calendar-event / user), sentence-case label, relative time, source pill, optional snippet line.
- Mounted in `CenterColumn` (lead detail) beside existing activity timeline. Invalidated after composer send success.

## Tier 5 — Reports surface

- Add route `/crm/reports/engagement` (sub-route or tab inside `CrmReportsPage`).
- Three cards, each clickable → leads list filtered by the matching id set:
  1. **Cold leads** — `last_inbound_at IS NULL AND last_outbound_at < now() - interval '7 days'`.
  2. **High-engagement** — `engagement_signal_count >= 3` in last 14 days (compute via direct query on events table since the view is all-time).
  3. **Reply latency (median)** — median minutes between matched `email_sent` → next `email_replied` per contact, last 30 days. Compute client-side from a single ordered fetch (≤ a few thousand rows).

## Tier 6 — Zara handoff

- `src/lib/zaraContext.ts` → `getZaraContext(contactId)` returns `{contact, lastTouch, recentEvents}` (recentEvents = last 20).
- New edge function `supabase/functions/get-zara-context/index.ts` — same payload via service-role; CORS + JWT verification per project rules; deployed automatically.

## Acceptance (12/12)

1. Migration applied — table + view exist.
2. `bun run build` succeeds.
3. Single email send → 1 `email_sent` row with correct `actor_id`.
4. 5-recipient campaign → 5 rows, same `campaign_id`.
5. Staged SMS (kill switch ON) → 1 `sms_sent` row with `metadata.staged = true`.
6. Pipeline drag-drop → 1 `stage_changed` row with prev/new.
7. Tag add → 1 `tag_added` row with `{tag}`.
8. Lead detail renders Engagement timeline section.
9. `/crm/reports/engagement` shows 3 cards with non-null counts.
10. `get-zara-context` returns JSON with contact + last touch + 20 events.
11. No send path broken by failed insert (verified by swapping in a deny-all policy locally).
12. No console errors in prod build.

## Preserved / out-of-scope

Templates, segments, pipelines, kill switch, composer UI, inbox layout, existing activity timeline are untouched. SMS still routes through `sms_outbound_queue` (staged). OpenPhone webhook for `sms_delivered` is deferred. Logging is strictly fire-and-forget.

## Execution order

1. Run migration (single SQL via `supabase--migration`).
2. Write helper + edge function in parallel with file edits.
3. Wire call sites (composer, inbox, leads table, edit sheet, notes/tasks/bookings, scheduler fns).
4. Add timeline widget + reports tab.
5. Build, then run acceptance checks.
