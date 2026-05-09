## Unified Lead Timeline v2

### Goal
Make the lead detail page feel like HubSpot's contact timeline: one chronological feed of **every touchpoint ever**, fast, filterable, searchable, paginated, and inclusive of sources the current `LeadActivityTimeline` misses.

### Why v2
The current `LeadActivityTimeline.tsx` (539 lines) merges 7 sources client-side via 8 separate hooks. It works but:
- Misses **calls**, **calendar bookings**, **deal events**, **project interest views**, **task completions**, **assignment changes**, **pipeline moves**, **notes by other agents**.
- No pagination — loads everything for every lead.
- No server-side search across all sources.
- No "pin to top" / "important moments" view.
- No ability to share a permalink to a specific event.
- Each hook hits a different table → 8 round trips per lead open.

### What v2 delivers

**1. Server-side unified feed (`crm_lead_timeline_v2` SQL function)**
A single Postgres function that returns a paginated, sorted, typed event stream per `contact_id`. It UNIONs across:
- `crm_messages` (notes)
- `crm_email_log` + `crm_email_events` (sent / opened / clicked)
- `crm_sms` (in/out, status, MMS)
- `crm_calls` (Twilio call log — if present, else stub)
- `crm_activity_events` (Presale behavior: views, deck opens, floorplan downloads)
- `crm_contact_views` + `crm_contact_sessions` (web visits)
- `crm_contact_forms` (form submissions)
- `crm_showings`
- `crm_tasks` (created + completed)
- `crm_calendar_events` (Google Calendar matched to lead via attendee email)
- `crm_deals` events (created, stage change, won/lost)
- `crm_audit_log` filtered to contact (assignment changes, pipeline moves, status flips)

Each row returns `{ id, kind, sub_kind, direction, occurred_at, actor, title, subtitle, body_excerpt, metadata jsonb, importance int }`.

**2. New React component `<LeadTimelineV2 />`**
Replaces `LeadActivityTimeline` on lead detail (desktop + mobile drawer). Features:
- **Virtualized list** (react-virtuoso or windowing) — handles 10k+ events.
- **Filter chips**: All · Communications · Behavior · Tasks · Deals · System.
- **Search bar** — full-text across title + body_excerpt (server-side via `to_tsvector`).
- **Date jumper** — sticky month headers, click to jump.
- **Pin / star** — `crm_timeline_pins` table for "important moments" surfaced at top.
- **Permalink** — `/crm/leads/:id?event=<eventId>` deep-links + scroll-into-view.
- **Inline expand** — emails open thread dialog, SMS opens chat, calls show recording, deals open deal sheet.
- **Realtime tail** — subscribe to `crm_activity_events` insert for this contact only; new event animates in at top.

**3. Importance scoring (lays groundwork for engagement engine)**
The SQL function assigns `importance` (0–10) per event:
- Form submit: 8, deck reopen: 9, floorplan download: 10
- Email open: 2, click: 4, reply: 7
- SMS reply: 6, missed call: 7
- Pipeline move: 5, deal won: 10
Used to sort the "Important Moments" pinned strip and feed into the future engagement score.

**4. Empty / loading / error states**
Skeleton shimmer (existing `crm-mobile-*` utility), empty illustration, retry on 5xx.

### Out of scope (saved for later sprints)
- Workflow automation engine (P1).
- Project-scoped opportunities (P2).
- Source attribution analytics (P3).
- Outbound bridge push of CRM → Presale events.

### Technical details

**Migration**
```sql
-- Function with stable security definer, scoped via crm_can_see_contact_id
create or replace function public.crm_lead_timeline_v2(
  p_contact_id uuid,
  p_kinds text[] default null,
  p_search text default null,
  p_before timestamptz default null,
  p_limit int default 50
) returns table (...) language sql stable security definer ...

-- Pin table
create table public.crm_timeline_pins (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null,
  event_kind text not null,
  event_id text not null,
  pinned_by uuid not null,
  pinned_at timestamptz default now(),
  unique (contact_id, event_kind, event_id)
);
alter table public.crm_timeline_pins enable row level security;
create policy "team can manage pins" on public.crm_timeline_pins
  for all using (public.crm_can_see_contact_id(contact_id));
```

**Files**
- `supabase/migrations/<ts>_lead_timeline_v2.sql` — function + pin table + GIN index on activity events for search.
- `src/hooks/useLeadTimelineV2.ts` — infinite query with `useInfiniteQuery`, realtime subscription.
- `src/components/crm/leads/timeline/LeadTimelineV2.tsx` — main component.
- `src/components/crm/leads/timeline/TimelineRow.tsx` — single event row (kind-aware rendering).
- `src/components/crm/leads/timeline/TimelineFilters.tsx` — chip row + search input.
- `src/components/crm/leads/timeline/PinnedMoments.tsx` — sticky strip.
- Wire into `LeadDetailView` (desktop) and mobile drawer; **keep `LeadActivityTimeline` for one release behind a feature flag** so we can A/B and roll back fast.

**Performance budget**
- First page (50 events) under 200ms server-side.
- GIN index on `crm_activity_events.payload` for search.
- React-virtuoso so DOM stays under 60 nodes regardless of feed size.

### Plan structure (build order)
```text
1. Migration: crm_lead_timeline_v2 fn + crm_timeline_pins table  (first, needs approval)
2. Hook: useLeadTimelineV2 with infinite query + realtime
3. Component: TimelineRow (kind-aware rendering, reuse existing icon/tone palette)
4. Component: TimelineFilters + PinnedMoments
5. Component: LeadTimelineV2 (virtualized container)
6. Wire into LeadDetailView (feature flag)
7. Memory entry + acceptance check
```

### Acceptance
- Open any lead → see merged feed of every source above, sorted desc.
- Type in search → server filters by `to_tsvector` match.
- Click filter chip → server re-queries with `p_kinds`.
- Star an event → it appears in the pinned strip; reload preserves it.
- New Presale activity arrives → animates in at top within 2s.
- Mobile drawer renders identically.
- Desktop loads 50 events under 300ms wall clock.
