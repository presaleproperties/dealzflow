# Zara Cockpit + Complete — Phased Build

`ANTHROPIC_API_KEY` is now configured. Spec stays 1:1 — only delivery is phased so each piece actually works end-to-end before the next layer lands.

## Phase 1 — Foundation (this turn after approval)

**Schema (1 migration, all 8 tables):**
- `zara_conversations`, `zara_messages`, `zara_actions_log`
- `presale_projects`, `zara_training_feedback`, `zara_prompt_evolution`, `zara_system_prompt_addenda`, `zara_research_cache`
- Full RLS, indexes, the `mode='off'` enforcement helper

**Move queue:** existing `/crm/zara` → `/crm/zara/queue`. Route registered, sidebar/links updated.

**Cockpit shell at `/crm/zara`:** 3-column layout (conversations rail / chat / live activity rail). Conversations rail fully wired (create/pin/archive/rename, persisted). Live activity rail wired with realtime on `zara_actions_log`. Empty chat panel with quick-action chips + input + Cmd/Ctrl+J global shortcut.

**Acceptance hit in phase 1:** #1, #3, #17, #21.

## Phase 2 — Brain (next turn)

**Edge fns:** `zara-chat` (SSE, Claude Haiku 4.5 default, Sonnet escalation, addenda append, mode-off guard, auto-title), `zara-tool-execute` (switch over 19 tools, service-role writes, action logging).

**Tool catalog:** all 19 tools implemented. `update_lead` returns pending-confirmation; `confirm_update_lead` commits. `get_lead_context` auto-injects `relevant_projects`. `draft_*` respects `zara_enabled` gate.

**Chat UI:** SSE consumption, streaming tokens, inline tool-status pills + 1-line summaries, inline approval card for `update_lead`, horizontal project cards for `match_lead_to_projects`, 👍/👎 → `zara_training_feedback`, follow-up chips (cached secondary Haiku call), voice input (SpeechRecognition + language dropdown), conversation auto-title.

**Acceptance hit in phase 2:** #4, #5, #9, #12-#16, #18-#20, #22, #23, #26.

## Phase 3 — Knowledge + Self-awareness (final turn)

**Edge fns:** `zara-sync-projects` (presaleproperties.com scrape + CSV fallback + weekly cron), `zara-feedback-roll-up` (weekly Sonnet meta-analysis), `zara-web-research` (24h cache).

**Admin pages:**
- `/crm/zara/projects` — table, filters, sync button, CSV import, add/edit/archive, Surrey/Langley/Abbotsford/Coquitlam/Delta/Burnaby-South seed CSV
- `/crm/zara/about` — 5 sections (status hero, knowledge coverage, performance charts, prompt evolution with "Apply to system prompt", capability matrix)

**Queue training UI:** "Tell Zara why" modal on rejected/edited drafts in `/crm/zara/queue` → `zara_training_feedback`.

**Lead detail integration:** "Talk to Zara about this lead" button on `/crm/leads/:id`.

**Acceptance hit in phase 3:** #2, #6-#8, #10, #11, #24, #25.

---

## Technical Notes (you can skip these)

- **Model**: keeping Claude Haiku 4.5 / Sonnet 4.5 per spec. Anthropic SSE format is different from Lovable AI Gateway — I'll hand-roll the `EventSource` parser, not use the AI SDK.
- **Tool loop**: max 8 tool turns per user message to prevent runaway. Logged per call.
- **Voice**: feature-detected, mic hidden on Safari iOS for now (Web Speech API gap).
- **Project sync**: scraping presaleproperties.com depends on its HTML structure — if it changes, the CSV fallback keeps the admin usable.
- **Realtime addenda**: addenda fetched per `zara-chat` call (no cache) so "Apply to system prompt" takes effect on the very next message.
- **Test mode**: `zara_test_contact` tagged contacts bypass the `zara_enabled=false` guard in `draft_*` (matches existing Tier 2 behavior).

## What you're approving

Approving = green light to start Phase 1 immediately in this thread, then I continue Phase 2 and Phase 3 in the next two messages without re-asking. Reject the plan if you'd rather I attempt all 26 criteria in one shot (faster, more breakage) or compress further.
