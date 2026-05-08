## Audit findings (what's broken today)

The current automations system looks polished but is largely **non-functional**:

1. **No enrollment engine.** Triggers `new_lead`, `status_change`, `tag_added`, `no_response` exist in the UI, but **nothing in the database or any edge function actually enrolls a lead** when those events happen. `process-automations` only ticks already-enrolled rows — but no row ever gets enrolled. So most automations never run.
2. **Action-type mismatch.** UI saves: `send_email`, `send_whatsapp`, `wait`, `assign_agent`, `update_status`, `add_tag`, `create_task`, `send_notification`. Runner only handles: `send_email`, `send_sms`, `set_tag`, `set_status`. Anything saved from the UI is silently dropped as `unsupported_action`. WhatsApp is also forbidden by project memory.
3. **`delay_hours` and `exit_condition` are in the schema but hidden** from the builder, so users can't actually build multi-step delayed sequences.
4. **`crm_automation_logs` doubles as the enrollments table** (it has `status`, `current_step_order`, `next_step_due_at`, `exit_reason`). That's confusing and there's no proper "log" of each step's send result.
5. **No manual enrollment UI**, no "Enroll lead in automation" action, no test-run, no way to see who is currently in flight.
6. **Page UX**: list-only, no preview pane. Builder takes over the whole screen and there's no way to glance at multiple automations side by side.

## Goal

A **split-pane Automations workspace** that looks and behaves like a high-end agentic workflow tool (Customer.io / Make / n8n vibe), backed by an engine that actually fires.

## Plan

### Phase 1 — Engine (make it actually work)

- **One migration**:
  - Rename the in-flight rows out of `crm_automation_logs`: create `crm_automation_enrollments` (id, automation_id, contact_id, status, current_step_order, next_step_due_at, enrolled_at, exited_at, exit_reason, project_slug). Migrate existing in-flight rows.
  - Add `crm_automation_run_log` (id, enrollment_id, step_order, action_type, action_result, error_message, payload, created_at) for true per-step history.
  - Add a SECURITY DEFINER function `enroll_in_automation(p_automation_id, p_contact_id, p_trigger_data)` with idempotency (no double-enroll if active).
  - Add Postgres triggers on `crm_contacts`:
    - INSERT → match `new_lead` automations (honoring `trigger_config.source` filter).
    - UPDATE of `status` → match `status_change` automations.
    - UPDATE of `tags` → match `tag_added` automations (new tag in array).
  - Add nightly `pg_cron` (`scan-stale-leads`) calling a new edge fn that enrolls leads with no `last_touch_at` activity for `trigger_config.days` into `no_response` automations.
- **Rewrite `process-automations`** to read from `crm_automation_enrollments`, write per-step rows to `crm_automation_run_log`, and support the full action set: `send_email`, `send_sms`, `wait`, `assign_agent`, `update_status` (renamed from set_status), `add_tag` (renamed from set_tag), `create_task`, `send_notification`. Map old names for back-compat. Drop `send_whatsapp` from UI (memory).
- Add `enroll-in-automation` and `unenroll-from-automation` edge fns for client + manual UI use.

### Phase 2 — Split-pane workspace UI

Replace `CrmAutomationsPage` with a 3-zone editorial layout:

```text
┌──────────────────────────────────────────────────────────────────┐
│  Header: Automations · stats · search · New                      │
├──────────────┬───────────────────────────────────────────────────┤
│ List rail    │  Preview / Builder pane                           │
│ (380px)      │                                                   │
│              │   ┌─ Header: name · status pill · run/pause ─┐   │
│  ┌────────┐  │   │                                            │   │
│  │ Auto 1 │  │   │  Flow canvas (centered nodes)              │   │
│  │ active │  │   │     [Trigger]                              │   │
│  │ 24 in  │  │   │        ↓                                   │   │
│  │ flight │  │   │     [Wait 1 day]                           │   │
│  └────────┘  │   │        ↓                                   │   │
│  ┌────────┐  │   │     [Send email · "Welcome v2"]            │   │
│  │ Auto 2 │  │   │        ↓                                   │   │
│  └────────┘  │   │     [+ add step]                           │   │
│              │   └────────────────────────────────────────────┘   │
│  + New       │   Tabs: Flow · Enrolled · Runs · Settings         │
└──────────────┴───────────────────────────────────────────────────┘
```

- **List rail**: each row shows name, trigger pill, active/draft, # in-flight, last-run, click → preview/edit on the right. Search + filter at top of rail.
- **Preview pane**: same `AutomationBuilder` flow canvas, but tabbed:
  - **Flow** — visual canvas + side config (today's builder, expanded with `delay_hours` and `exit_condition` per step).
  - **Enrolled** — table of currently-active enrollments with "unenroll" + "advance now" + jump-to-lead.
  - **Runs** — chronological per-step run log with success/error badges and the rendered email/sms snippet.
  - **Settings** — name, description, active toggle, slug, danger-zone delete.
- **Empty preview state**: gallery of starter templates + "Build from scratch".
- Mobile: rail collapses to a top dropdown, preview takes full width.

### Phase 3 — Agentic capabilities

- **New action types** the builder exposes:
  - `wait` (amount + unit, mapped into `delay_hours`).
  - `branch_if` — basic condition node: lead source / status / tag / has-email / engagement-score threshold. Builder shows a Y/N split (saved as two ordered branches via `step_order` semantics; runner picks branch by evaluating `action_config.condition`).
  - `ai_draft_email` — calls Lovable AI gateway (`google/gemini-2.5-flash`) with the lead context + a prompt to draft a personalized email; result is saved as a draft on the lead and the assigned agent gets notified.
  - `ai_classify_lead` — runs the lead through a prompt to score intent / suggest next-best-action; writes to `lead_engagement_score` + a note.
  - `webhook` — POST lead JSON to a user-supplied URL (for Zapier/Make/n8n bridges).
- **Per-step exit conditions** (already in schema): "stop if lead replied", "stop if status = X", "stop if tag added".
- **Manual enrollment everywhere**: `EnrollInAutomationDialog` that's launched from `LeadQuickActions` ("Enroll in automation"), bulk action on the leads table ("Enroll selected"), and a button on the automation preview ("Enroll leads…" with picker).
- **Test run**: "Test on me" button that enrolls the current logged-in agent's own contact (or a chosen lead) and immediately processes the first step, surfacing the result inline.
- **Tokens**: standardize on `{{first_name}}`, `{{last_name}}`, `{{agent_name}}`, `{{project}}`, `{{source}}`, `{{status}}`, `{{unsubscribe}}` everywhere — same renderer the email composer already uses.

## Out of scope

- Visual drag-to-reorder of step nodes (use up/down buttons for now).
- Multi-branch trees deeper than one Y/N (keep the canvas linear with at most one branch split per automation).
- Migrating WhatsApp / ManyChat (forbidden by memory).
- Replacing the email/sms send pipelines — we reuse `render-and-send` and `send-sms`.

## Files

- **New**: `crm_automation_enrollments` + `crm_automation_run_log` migration; `enroll-in-automation` + `unenroll-from-automation` + `scan-stale-leads` edge fns; `EnrollInAutomationDialog`, `AutomationListRail`, `AutomationPreviewPane`, `AutomationEnrolledTab`, `AutomationRunsTab`, `AutomationSettingsTab` components; `useAutomationEnrollments` hook.
- **Edited**: `process-automations/index.ts` (full rewrite of action set + new tables), `useCrmAutomations.tsx` (action type list, new hooks), `AutomationBuilder.tsx` (delay/exit fields, branch + AI nodes, drop whatsapp), `CrmAutomationsPage.tsx` (split-pane shell), `LeadQuickActions.tsx` ("Enroll in automation"), leads bulk ops ("Enroll selected").

## Estimated scope

≈ 1 migration · 3 new edge fns + 1 rewrite · 6 new components · ~5 edits. Larger than typical — splitting Phase 1 (engine) and Phase 2 (UI) is safe; Phase 3 (agentic) is additive.