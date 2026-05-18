# Zara — CRM Experience & Interaction System

Goal: make Zara feel like the invisible intelligence layer of Dealz Flow — Linear/Notion AI/Superhuman vibe, never an Intercom bubble. Build on top of the layers we just cleaned (active prompt, founder principles, playbooks, lead memory, winning conversations, `zara_retrieve_context` RPC) — no new prompt bloat.

## Phase 1 — Global access (the spine)

**1. `ZaraCommandBar` (⌘K / `/`)**
- Mounted once in `App.NativeBootstrap`, available on every CRM route.
- shadcn `Command` palette, editorial styling (gold accent, Plus Jakarta).
- Context-aware: reads current route, selected lead (from a new `useZaraContext()` hook that watches `/crm/leads/:id`, `/crm/chats/:id`, `/crm/projects/:slug`, etc.).
- Actions adapt to context:
  - On a lead → Draft follow-up, Analyze lead, Summarize objections, Suggest next step, Predict readiness, Generate investor angle, Rewrite like Uzair.
  - On a chat/thread → Rewrite (softer / less salesy / more trust / investor).
  - On a project → Generate pitch (investor / family / risk / compare nearby).
  - Always: Open Zara Intelligence, Jump to draft queue, Show hot signals.

**2. Floating `ZaraDock` (corner, not a bubble)**
- Tiny status pill in the bottom-right above the floating nav pill — pulse when Zara has a proactive nudge for the current lead/page.
- Click expands to a slide-over panel (`Sheet`, not modal), not a chat balloon.
- Inside: current-context insights + inline action buttons that route through the same handlers as ⌘K.
- Mobile: replaces the per-page action with a single "Zara" item in the Quick Actions sheet (respects the bottom-nav-iOS-pill rule — no extra FAB).

**3. Keyboard**
- `⌘K` opens command bar.
- `/` from anywhere not focused in an input opens it too.
- `g z` jumps to Zara Intelligence.
- `⌘.` triggers the top inline action for the current context (e.g. Draft follow-up on a lead).

## Phase 2 — Zara Intelligence workspace (`/crm/zara`)

Replace the current scattered Zara admin pages with one calm hub. Left rail navigates between sections; main area is a single quiet column, no sidebars of widgets.

Sections (all backed by existing tables — no new schema):
- **Today** — daily standup card (`zara_daily_standup` output): hot signals, ghosted opportunities, appointment-ready leads, stalled momentum.
- **Inbox Intelligence** — unified inbound triage with Zara's suggested reply per item (`zara_suggested_replies`).
- **Draft Queue** — `crm_zara_drafts` pending list, inline Approve / Edit / Reject / Rewrite like Uzair.
- **Lead Momentum** — sorted by Zara's momentum score, tiered (rising / stalling / cooling) — never just hot/cold.
- **Hot Signals** — `crm_activity_events` burst feed (floorplan downloads, deck revisits, repeat views).
- **Escalation Queue** — drafts/leads Zara flagged for Uzair handoff (`zara_handoff_briefs`).
- **Founder Brain** — keeps the existing `/crm/zara/founder` page, slotted in as a section.
- **Winning Conversations** — library view with upload + tag.
- **Rewrite Like Uzair** — diff history (`zara_rewrite_diffs`) + style patterns.
- **Conversation Analysis** — analyze any thread → extract trust moments / reply triggers.
- **Settings** — autonomy, kill switch, quiet hours, never-quote topics (data-driven, not prompts).

Top-strip across every section: tiny mode indicator (sandbox/live), autonomy level, kill-switch state — calm, monospace small caps, no warning red unless kill-switch is on.

## Phase 3 — Inline experience on existing pages

No new pages — surfaces inside the pages users already live in.

**Lead detail (`/crm/leads/:id`)**
- New `<LeadIntelligencePanel />` slotted into the right column above existing cards.
- Pulls from `zara_retrieve_context(contact_id)` (the RPC we just built) — one fetch, no extra round trips.
- Renders, in order:
  - Emotional state + relationship stage (from `zara_lead_memory.relationship_stage` + signals).
  - Momentum chip (rising / steady / stalling / cooling) — derived, not stored.
  - Investor vs end-user, trust depth, engagement depth.
  - Recommended next step + recommended tone (from matching playbook).
  - "Pick up where you left off" — the continuity openers (already wired).
  - Escalation recommendation if Zara would flag.
- Below: inline action row — Draft follow-up · Analyze · Summarize objections · Suggest next step · Investor angle. Each posts to existing edge fns.
- No "AI" / "bot" labels anywhere. Wordmark is just "Zara" with a tiny gold dot.

**Conversation views (chat thread, email composer)**
- Above the composer: a row of quiet rewrite chips — Softer · Less salesy · More trust · Investor framing · Rewrite like Uzair. Each calls `zara-analyze-rewrite`-adjacent rewriter and drops the result into the composer with diff highlights, accept/reject.
- Mention `@zara` in the composer to pull a draft suggestion inline.

**Project view (`/crm/projects/:slug`)**
- Side card: Generate pitch (Investor / Family buyer / Risk analysis / Compare nearby). Stores output in a per-project notes scratchpad.

## Phase 4 — Proactive intelligence (no notification spam)

- `ZaraDock` pulses + shows a soft sentence only when:
  - The current lead has a momentum shift (rising/cooling) in the last 24h, OR
  - A new `crm_activity_events` burst landed, OR
  - A new `zara_proactive_nudges` row was inserted for the assigned agent.
- Examples surfaced verbatim from existing nudge generators:
  - "Lead revisited Surrey projects 4× this week."
  - "Investor intent increasing."
  - "Conversation momentum dropping — consider a value-led re-open."
- Dismiss / snooze 24h / open lead. Dismissals logged so the same nudge does not re-surface.
- All routing goes through `crm_recipients_for_contact` so we never spam owner — assigned agent only.

## Phase 5 — Visual language

- Typography: Plus Jakarta Sans; intelligence labels in 11px uppercase letter-spaced micro-caps.
- Accent: existing gold #D7A542 — used sparingly (one gold dot, one gold hairline), never as a button fill on Zara surfaces.
- Surfaces: hairline borders, no shadows, no gradients, no glow.
- Motion: 120–180ms ease-out on panel open, no entrance bounce, no shimmer except on streaming text in the command bar.
- Empty states: short sentence in muted-foreground, no illustrations.

## Phase 6 — What we are NOT building

- No floating chat bubble.
- No "Ask AI" button labels.
- No giant assistant panel that takes over the screen.
- No new tables or edge functions in Phases 1–3 — everything reuses what cleanup phase put in place.
- No reintroduction of removed integrations (WhatsApp/Meta Ads/etc.).

## Build order (suggested for first ship)

```text
1. useZaraContext() hook + ZaraCommandBar (⌘K, / shortcut, ~150 LOC)
2. ZaraDock corner pill + slide-over (~200 LOC)
3. LeadIntelligencePanel on /crm/leads/:id wired to zara_retrieve_context
4. Inline rewrite chips on ComposeEmailDialog + SMS thread
5. /crm/zara hub shell + Today / Draft Queue / Hot Signals (reuse existing data)
6. Project pitch generator side-card
7. Proactive dock pulses from zara_proactive_nudges realtime
```

Each step is independently shippable and tested against the calm-not-chatty bar before moving on.

## Technical notes

- Single retrieval contract: every Zara surface fetches via `zara_retrieve_context(contact_id, trigger, query)` — already deployed. No surface re-implements playbook/principle/memory loading.
- Active prompt stays slim — scenario nuance lives in playbooks (Layer 5) and founder principles (Layer 2) and is injected at call time, never duplicated in components.
- `useZaraContext()` returns `{ surface: 'lead' | 'chat' | 'project' | 'inbox' | 'global', leadId?, projectSlug?, threadId? }` from route params + lightweight Zustand store. Every inline action and the command bar read from this one source.
- Realtime: subscribe `ZaraDock` to `zara_proactive_nudges` filtered by `assigned_agent_id`; debounce surface updates to once per 5s.
- Accessibility: command bar is a labelled dialog; ESC closes; focus returns to trigger; all inline chips are real buttons with `aria-label`.

If you approve I'll start with Step 1 (context hook + ⌘K command bar) so Zara becomes reachable from every page first, then layer the surfaces in.