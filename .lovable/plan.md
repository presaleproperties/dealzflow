# Zara 10x Upgrade Plan

A coordinated overhaul of Zara across chat UX, agent intelligence, cockpit, and outbound autonomy. Single rolling conversation per agent (persisted), autonomy default = level 3 (suggest + auto-send safe nudges, escalate risky moves).

## 1. Conversational UI (CUI) Rebuild

**New canonical surface:** `/crm/zara` → full-height chat room (replaces the current cockpit landing). The existing cockpit pages move under a tabbed shell: **Chat · Cockpit · Engagement · Audit · Settings**.

- Install AI Elements: `conversation`, `message`, `prompt-input`, `shimmer`, `tool`, `suggestion`, `reasoning`, `code-block`.
- Streaming responses via AI SDK `useChat` + new edge fn `zara-chat-stream` (replaces non-streaming `zara-chat`).
- Render `message.parts` (text, tool calls, reasoning, sources).
- Stop button that toggles from submit while `status === submitted | streaming` (per AI SDK abort pattern).
- Sonner toasts for 402/429 gateway errors.
- Empty state: gold/dark editorial intro with 4 suggested prompts pulled from current pipeline state ("Who needs a nudge today?", "Draft a follow-up for {hottest_lead}", "Show me presale_burst leads", "Plan tomorrow's outbound").

## 2. Slash Commands & Quick Actions

In-prompt command palette (`/`) triggered inside `PromptInputTextarea`:

| Command | Action |
|---|---|
| `/lead <name>` | Pin a lead to the conversation (fuzzy search `crm_contacts`) |
| `/send-projects` | Trigger `zara-send-project-details` for pinned lead |
| `/draft-reply` | Draft a reply to last inbound email/SMS |
| `/summarize` | Summarize pinned lead's last 30d activity |
| `/nudge` | Run planner for pinned lead only |
| `/plan` | Run autonomous planner now (dry-run preview) |
| `/audit` | Open today's outbound audit inline |
| `/mute <days>` | Mute Zara for pinned lead |
| `/voice` | Toggle voice mode |

Implemented as a `CommandPalette` popover anchored above the textarea; commands compile to a tool call sent through the chat.

## 3. Per-Lead Context Pinning

- Pinned-lead chip rendered above the conversation; persists in `crm_team_settings.zara_pin` (per agent).
- When a lead is pinned, `zara-chat-stream` auto-injects:
  - `crm_contacts` row (masked PII)
  - last 20 timeline events (`crm_lead_timeline_v2`)
  - latest `zara_lead_memory` snapshot
  - outbound audit summary (last 7d)
  - recommended projects (`recommend_projects_for_lead`)
- New "Pin from lead detail" button on `LeadDetailView` → opens Zara chat with that lead pinned.

## 4. Voice In / Out

- **Voice in**: push-to-talk button in `PromptInputFooter` using browser `MediaRecorder` → upload to new edge fn `zara-voice-transcribe` (OpenAI Whisper via Lovable AI Gateway audio compat or Gemini audio).
- **Voice out**: TTS toggle; when on, assistant responses stream to `zara-voice-tts` edge fn (Gemini TTS) and play via `<audio>` with waveform indicator.
- Mobile haptic on record start/stop. Auto-disable in quiet hours.

## 5. Smarter Agent Loop

New shared `zara-agent` module (`supabase/functions/_shared/zara-agent.ts`) used by both `zara-chat-stream` and `zara-plan-outbound`:

- AI SDK `streamText` with `stopWhen: stepCountIs(50)`.
- Tool registry (typed via Zod):
  - `lookup_lead`, `search_leads`, `lead_timeline`, `lead_memory_read/write`
  - `recommend_projects_for_lead`, `project_details`, `list_projects`
  - `draft_email`, `draft_sms`, `send_email` (needsApproval at level ≤3), `send_sms` (needsApproval)
  - `send_project_details` (auto-approved on `presale_burst` at level ≥3)
  - `schedule_nudge`, `mute_lead`, `assign_lead`, `set_lead_status`
  - `run_planner` (admin-only), `read_outbound_audit`
- Per-call autonomy check from `zara_settings.mode` + new `zara_settings.autonomy_level` (1–5).
- All tool calls log to `crm_zara_outbound_audit` with `rule_evaluation.source = 'chat' | 'planner' | 'reply'`.

**Planner improvements:**
- On `presale_burst` + `initial_outreach` triggers, auto-call `send_project_details` (3 best projects) instead of short nudge — when autonomy ≥3 and lead has no project email in last 14d.
- Reply-aware: if `zara-reply` ran in last 6h, planner defers nudges by 24h.
- A/B subject lines: planner stores `subject_variant` in audit; weekly digest surfaces winners.

## 6. Cockpit & Observability Upgrades

- **Live activity rail** (right-hand drawer on `/crm/zara`): realtime `crm_engagement_events` + `crm_zara_outbound_audit` feed, color-coded by decision.
- **Kill-switch banner**: one-click pause Zara workspace-wide (writes `zara_settings.mode='sandbox'`), with countdown to resume.
- **Per-lead drill-down**: from any audit row → opens chat with lead pinned and prefills `/summarize`.
- **Today's plan**: top card on cockpit showing next 10 scheduled outbounds with approve/skip buttons.

## 7. Database Changes

```sql
-- New columns
alter table public.zara_settings
  add column if not exists autonomy_level int not null default 3 check (autonomy_level between 1 and 5),
  add column if not exists voice_enabled boolean not null default false;

-- New table for chat history (single rolling per agent)
create table public.zara_chat_messages (
  id uuid primary key default gen_random_uuid(),
  agent_user_id uuid not null,
  role text not null check (role in ('user','assistant','system','tool')),
  parts jsonb not null,
  pinned_contact_id uuid references crm_contacts(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.zara_chat_messages enable row level security;
create policy "own chat" on public.zara_chat_messages
  for all using (auth.uid() = agent_user_id) with check (auth.uid() = agent_user_id);
create index on public.zara_chat_messages (agent_user_id, created_at desc);

-- Pinned lead per agent (singleton via settings jsonb already exists)
-- Stored in crm_team_settings.zara_pin = { contact_id, pinned_at }
```

## 8. Files to Create / Edit

**New edge functions**
- `supabase/functions/zara-chat-stream/index.ts` — streaming chat w/ tools
- `supabase/functions/zara-voice-transcribe/index.ts`
- `supabase/functions/zara-voice-tts/index.ts`
- `supabase/functions/_shared/zara-agent.ts` — shared tool registry + runner
- `supabase/functions/_shared/zara-gateway.ts` — Lovable AI Gateway provider helper

**Edge function edits**
- `zara-plan-outbound` — use shared agent, honor autonomy_level, auto project-showcase on burst
- `zara-reply` — record reply-recency for planner deferral
- `zara-send-project-details` — accept `source: 'chat'|'planner'` for audit

**New pages / components**
- `src/pages/crm/ZaraChatPage.tsx` — main chat surface
- `src/components/crm/zara/ZaraConversation.tsx`
- `src/components/crm/zara/ZaraPromptInput.tsx` — with slash palette + voice
- `src/components/crm/zara/SlashCommandPalette.tsx`
- `src/components/crm/zara/PinnedLeadChip.tsx`
- `src/components/crm/zara/LiveActivityRail.tsx`
- `src/components/crm/zara/TodaysPlanCard.tsx`
- `src/components/crm/zara/KillSwitchBanner.tsx`
- `src/components/crm/zara/VoiceRecorder.tsx`
- `src/components/crm/zara/ZaraToolCard.tsx` — per-tool renderers (lead card, projects, audit row)
- `src/hooks/useZaraChat.ts` — wraps `useChat` + persistence
- `src/hooks/useZaraPin.ts`

**Page edits**
- `src/App.tsx` — `/crm/zara` → `ZaraChatPage`, cockpit moves to `/crm/zara/cockpit`
- `src/pages/crm/ZaraCockpitPage.tsx` — re-skin under tabbed shell, add KillSwitch + TodaysPlan
- `src/pages/crm/ZaraOutboundAuditPage.tsx` — add "Open in chat" action
- `src/pages/crm/ZaraEngagementStatusPage.tsx` — add pin-to-chat button
- `src/components/crm/LeadQuickActions.tsx` — "Ask Zara about this lead" button

**Install**
- AI Elements: `bun x ai-elements@latest add conversation message prompt-input shimmer tool suggestion reasoning code-block`
- `ai`, `@ai-sdk/openai-compatible`, `@ai-sdk/react`, `zod` (likely already present)

## 9. Acceptance Checks

- New `/crm/zara` streams responses; stop button cancels mid-stream and persists partial message.
- `/lead jane` pins Jane; subsequent messages auto-include her context; tool calls render as collapsible cards with domain-specific renderers.
- Voice push-to-talk transcribes within 3s and submits as a user message; TTS plays assistant reply.
- Autonomy level 3 + `presale_burst` lead → planner auto-sends 3-project showcase, logs to audit with `decision='auto_sent_project_showcase'`.
- Kill switch toggles `zara_settings.mode='sandbox'` and the next planner run logs `decision='blocked_sandbox'` for every lead.
- Single rolling conversation persists across reloads; new "Clear conversation" button wipes `zara_chat_messages` for the agent.
- All tool calls (chat, planner, reply) appear in `/crm/zara/audit` with `source` tag.

## 10. Rollout Order (single PR sequence)

1. DB migration (autonomy_level, voice_enabled, zara_chat_messages)
2. Shared agent module + gateway helper
3. `zara-chat-stream` edge fn + AI Elements install
4. ZaraChatPage + conversation + prompt input + persistence
5. Slash palette + pin chip + tool cards
6. Voice transcribe/TTS edge fns + recorder UI
7. Planner upgrades (autonomy, project-burst auto-send, reply-defer)
8. Cockpit re-skin: tabbed shell + kill switch + today's plan + live rail
9. Lead detail "Ask Zara" entry point
10. QA pass + memory update