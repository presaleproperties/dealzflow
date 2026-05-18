# Zara 10x — Full Rollout Plan

Six themed phases, shipped in order. Each phase is independently useful — you'll feel value after every one. I'll build phase 1 immediately after you approve, then check in before each subsequent phase.

---

## Phase 1 — Inline Reply Loop (biggest daily ROI)

Make Zara draft a reply the moment a lead writes back, right inside the existing inbox thread.

- New edge fn `zara-draft-reply` — takes `contact_id` + last inbound message, returns `{ subject, html, confidence, reasoning, sources[] }`.
- Trigger on inbound: `gmail-pull` and `crm-twilio-inbound` enqueue a draft job into new `zara_pending_drafts` table.
- UI: `<ZaraReplyChip />` mounted at the top of every email thread + SMS thread when a draft exists. Tap to expand → editable composer prefilled, "Send / Edit / Dismiss / Why this?" actions.
- "Why this?" reveals sources (lead memory facts, project KB rows, prior messages quoted).
- Auto-send rule: confidence ≥ 0.9 AND topic ∈ {price-list, sqft, completion-date, deposit-structure, brochure-request, generic-thanks} AND autonomy ≥ 4 → auto-send + 60s undo toast.
- All auto-sends logged to `crm_zara_outbound_audit` with `source='reply'` and `confidence`.

**Tables**: `zara_pending_drafts (id, contact_id, channel, inbound_ref, draft jsonb, confidence, status, created_at, expires_at)`.

---

## Phase 2 — Lead Memory & "Zara Remembers" Card

Give Zara real long-term memory per lead so every action gets smarter.

- Promote/extend `zara_lead_memory` with typed facts: `budget`, `areas[]`, `bedrooms`, `timeline`, `family`, `objections[]`, `motivation`, `decision_makers`, `competing_projects[]`, `last_confirmed_at` per fact.
- New edge fn `zara-extract-facts` — runs after every inbound email/SMS/call-note; uses structured `Output.object` schema; merges into memory with provenance + confidence.
- "Stale fact" decay: facts >60d old flagged `needs_reconfirm`; planner asks naturally before asserting.
- UI: `<ZaraRemembersCard />` in lead detail (desktop right column + mobile sheet) — bullet list grouped by category, each fact with source link + edit/dismiss.
- Cross-channel summary: 4-sentence rolling brief regenerated nightly per active lead, stored in `zara_lead_memory.rolling_summary`.

---

## Phase 3 — Voice (mobile unlock)

PWA-native push-to-talk for briefings + after-showing notes.

- Edge fns: `zara-voice-transcribe` (ElevenLabs Scribe v2 batch), `zara-voice-tts` (Lovable AI Gemini TTS).
- `<VoiceFAB />` in mobile bottom-nav `+` sheet → "Ask Zara" (transcribe → chat) and "Note a showing" (transcribe → `zara-extract-facts` → memory update + timeline event).
- `useScribe` realtime hook for live caption while recording.
- TTS-back for briefing replies, opt-in per agent, suppressed during quiet hours.
- Mobile haptic on record start/stop (already wired via `triggerHaptic`).

---

## Phase 4 — Proactive Coaching

Zara stops waiting to be asked.

- New edge fn `zara-daily-standup` (cron 7am Pacific per agent timezone) — pushes "Today's plan" web-push notification: 3 most urgent leads + 1 deal-at-risk + 1 opportunity.
- New `<TodaysPlanCard />` on `/crm/zara` cockpit + lock-screen-friendly push payload.
- Deal-at-risk detector edge fn `zara-risk-scan` (hourly): scores leads on no-reply-after-hot-signal, last-touch decay, opened-but-didn't-reply patterns. Writes to `zara_risk_alerts` table.
- Weekly self-review email Sunday 6pm: win rate, A/B subject winners, where humans overrode Zara, suggested setting tweaks with one-click apply.

---

## Phase 5 — Trust & Safety Guardrails

Real-money safety net so autonomous sends never embarrass an agent.

- `zara_never_quote` config (admin UI): regex/topic list — anything matching → defer to human draft, never auto-send (default: price, commission, legal terms unless sourced from `crm_projects` with timestamp ≤ 30d).
- Tone-mirror: extract per-lead style features (avg length, formality, emoji use, punctuation density) → injected into draft system prompt.
- Universal 60-sec undo on every auto-send (toast + push action) — actually retracts via Gmail draft delete / Twilio message redaction where possible, else "follow-up correction" auto-send.
- Auto-mute keywords: "stop", "unsubscribe", "remove me", "not interested", "wrong number" → sets `do_not_contact=true` + tags + notifies assigned agent.
- New `<KillSwitchBanner />` (workspace-wide pause from any page).

---

## Phase 6 — Workflow Integration

Zara respects the rest of the agent's world.

- Calendar-aware planner: query `crm_showings` + Google Calendar before scheduling nudges. Suppress 2h before showing, prompt 24h after no-show.
- Deal-stage switch: when `crm_deals` row created for a lead, planner switches mode to `transaction_support` — different prompts, different cadence (deposit reminders, doc chase, completion countdown).
- Handoff brief: when `crm_contacts.assigned_to` changes, `zara-handoff-brief` edge fn writes a 3-line summary to a timeline note and pushes to new assignee.
- "Ask Zara about this lead" button on `LeadQuickActions` → opens `/crm/zara` with that lead pinned (uses existing `useZaraPin`).

---

## Technical foundations (built alongside phase 1)

- **Shared agent runner**: `supabase/functions/_shared/zara-agent.ts` — single AI SDK `streamText` + tool registry used by reply/planner/extract/chat. Honors `zara_settings.autonomy_level` per call.
- **Lovable AI Gateway helper**: `supabase/functions/_shared/zara-gateway.ts` (if not already present).
- **Audit schema additions**: `crm_zara_outbound_audit` gains `source`, `confidence`, `undo_token`, `undone_at`.
- **English-only constraint** preserved everywhere (per `mem://constraints/zara-english-only`).
- **Notification routing rule** respected — drafts/alerts only to assigned agent via `crm_recipients_for_contact` RPC.
- **No new top-level nav** — everything lives inside existing CRM inbox, lead detail, and `/crm/zara` cockpit.

---

## Rollout sequencing

```text
Phase 1  ─ Inline reply loop          [SHIP FIRST — felt within a day]
Phase 2  ─ Lead memory + Remembers     [foundation for phases 3-6]
Phase 3  ─ Voice (PWA push-to-talk)
Phase 4  ─ Proactive coaching          [standup + risk scan + weekly review]
Phase 5  ─ Guardrails (undo, never-quote, auto-mute, kill switch)
Phase 6  ─ Workflow (calendar, deal-stage, handoffs, "Ask Zara")
```

Approve and I'll start building Phase 1 immediately, then check in before each next phase.
