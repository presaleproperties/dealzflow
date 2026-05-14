# Zara Operations Center v2

This is a large build. Before I start, here's the plan so you can confirm scope and call out any cuts. **Estimated work: 1 migration, 1 data-seed, ~10 new files, edits to 4 edge functions, 1 new edge function, 1 new cron.** I'll deliver in one pass.

---

## 1. Database (single migration)

New tables (all RLS-enabled, admin SELECT + service_role ALL):
- `crm_zara_insights` — daily AI-generated behavior insights
- `crm_zara_knowledge_gaps` — auto-captured `{LOOKUP:...}` / FAQ misses
- `crm_zara_model_calls` — per-call AI usage + cost ledger (indexed `created_at desc`)
- `zara_system_prompts` — versioned system prompt with `is_active`
- `crm_zara_playbooks` — trigger_conditions + behavior_sequence

Schema changes:
- `crm_zara_drafts.is_training_example bool default false`
- `zara_org_context.custom_instructions text` (add if column missing)
- `crm_zara_settings`: `daily_cost_cap_usd numeric default 20`, `auto_pause_on_cost bool default true`

Seeds:
- 5 playbooks (Default New Lead, Hot Lead Fast-Track, VIP Approval, Investor Long-Game, Dormant Re-Engage)
- 1 active row in `zara_system_prompts` (v1, copied from current planner SYSTEM_PROMPT)

## 2. Edge functions

New: `zara-insight-generator` — daily 7am UTC cron, summarizes 7d audit log via Sonnet 4.6, writes 1–3 rows to `crm_zara_insights`, logs cost.

Edits (add `crm_zara_model_calls` insert + gap detection):
- `zara-reply` — log every Anthropic call; insert gap row when FAQ lookup returns null
- `zara-plan-outbound` — log every AI call; **playbook resolver**: for `zara_state='new'`, pick first matching playbook by priority asc, store `active_playbook_id` + `step_index` in `crm_contacts.metadata`, drive sequence on subsequent ticks; insert gap row on `{LOOKUP:...}` placeholders or null project lookup; inject top-5 most recent `is_training_example=true` drafts as few-shot; append `zara_org_context.custom_instructions` and active `zara_system_prompts.prompt_text`
- `zara-draft-action` — log model calls if any

New cron: `zara-insight-generator` daily `0 7 * * *` (via `supabase--insert` since URL+anon key are user-specific).

## 3. Frontend — Sidebar shell + 7 pages

New shell: `src/pages/admin/ZaraLayout.tsx` with left sidebar (Overview, Drafts, Jobs, Behavior, Gaps, Models & Cost, Training, Lead Assignment Designer, Settings). Mounts at `/admin/zara/*`. Mobile: collapses to icon rail.

Routes (existing routes for `/admin/zara`, `/admin/zara/drafts`, `/admin/zara/settings` rewired through the layout, content untouched):

- **Overview** `/admin/zara` (replaces current landing)
  - Stat cards: Edge Functions deployed (hardcoded list count), Tables (count of `crm_zara_*`), Last Cron Tick, 7-day uptime %, Kill Switch toggle, Behavior Score (computed client-side from RPC)
  - `zara_state` distribution donut (recharts)
  - "What I built recently" feed from `crm_audit_log`
  - "Run planner now" button (top right)
  - "Quick Test Lead" modal button (creates lead with tag `zara:test`, immediately triggers planner)
- **Jobs** `/admin/zara/jobs` — 6 job cards (Inbound Classifier, FAQ Instant Reply, Outbound Planner, Cold Drafter, Hot Drafter, Escalator) with counts 1d/7d/30d, last-5 examples table, Run-now button
- **Behavior** `/admin/zara/behavior` — 4 recharts (state donut, decision-to-send funnel, approval breakdown bars, response latency lines) + insights list from `crm_zara_insights`
- **Gaps** `/admin/zara/gaps` — Biggest Gap card (auto-detect), Knowledge Gaps table + Behavior Gaps table (categorized approval rates)
- **Models & Cost** `/admin/zara/cost` — 4 stat cards, stacked bar (Sonnet/Haiku/Voyage/other), per-function table (calls, total, avg, p95), budget alarm input + auto-pause toggle bound to `crm_zara_settings`
- **Training** `/admin/zara/training` — 4 sections: System Prompt Editor (markdown + version save/activate + line diff), Training Examples table, Custom Instructions textarea, Prompt Version History table
- **Lead Assignment Designer** `/admin/zara/playbooks` — list view with priority/active/triggered/edit/dupe/delete, click → two-pane editor (Trigger Conditions form + sortable Behavior Sequence with edit-step modal)

All pages use existing Card / Table / Badge primitives + Plus Jakarta Sans.

## 4. Wiring confirmations (will verify before completion)

- `crm_zara_model_calls` written by zara-reply, zara-plan-outbound, zara-draft-action, zara-insight-generator
- Knowledge gaps inserted on `{LOOKUP:...}` placeholders + null FAQ/project lookups
- 5 default playbooks seeded
- Playbook resolver active in `zara-plan-outbound`
- `zara-insight-generator` cron registered

## 5. Scope notes / likely deviations

- **Edge Functions count** will be a hardcoded list (no Supabase mgmt API in edge runtime); easy to extend.
- **Cost numbers** are computed from logged token counts × hardcoded model rate cards (Sonnet 4.6, Haiku 4.5, Voyage). Rate-card constants live in one file.
- **Behavior Score** computed in a Postgres function `crm_zara_behavior_score()` returning a single int — Overview just reads it.
- **Diff view** in Training is line-based (not token-level); good enough for prompt review.
- **Sample screenshots** at the end will be Lovable preview links rather than uploaded PNGs (faster, you can click through).
- **`zara-bridge-healthcheck`** — you mentioned "if not already there"; I'll skip creating it unless you confirm you want it (the uptime % already comes from cron-tick audit rows). If you want it, say so and I'll add it as a 5-minute cron that pings the bridge and writes a `zara.tick.healthcheck` audit row.
- I will **not** touch the existing kill switch, 24h stats, activity feed, escalation rail, training stats panel, assigned-leads queue, drafts inbox, or settings page — they get re-mounted inside the new sidebar shell unchanged.

Reply **go** to ship, or call out cuts/changes.
