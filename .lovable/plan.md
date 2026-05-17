# Zara Experience — One-shot ship plan

Eight tiers, layered on Tier 2 + Cockpit + Brain. Kill switch + engagement log preserved. No new secrets.

## Step 1 — DB migration (one call)

```sql
ALTER TABLE zara_messages ADD COLUMN IF NOT EXISTS page_context jsonb;
ALTER TABLE zara_conversations
  ADD COLUMN IF NOT EXISTS last_message_snippet text,
  ADD COLUMN IF NOT EXISTS title_regenerated_at_turn int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_zara_conv_recent ON zara_conversations(last_message_at DESC);
```

(`zara_conversations` likely already has owner-scoped RLS — we don't touch policies.)

## Step 2 — Edge fn `zara-chat`

- Accept `page_context` in request body.
- Store on the user-message insert (`zara_messages.page_context`).
- Inject `<current_view>` block into system prompt (surface, url, optional lead+project lookup via service client).
- Append the pronoun-resolution paragraph after the existing rules.
- Update `last_message_snippet` (strip markdown, 100 chars) when persisting assistant text.
- Regenerate title at turn 2 (existing), 6, 12 via Haiku (max 6 words). Track via `title_regenerated_at_turn`.
- Populate `metadata.referenced_contact_ids` / `referenced_project_ids` from tool results that surface those IDs (best-effort scan of `get_lead_context` / `recommend_projects_for_lead` outputs).

## Step 3 — Frontend hooks + state (`src/hooks/`)

- `useZaraPageContext.ts` — derives `{surface, contact_id?, project_id?, campaign_id?, url, label}` from `useLocation` + params. Surface inferred by route prefix.
- `useZaraDock.ts` (Zustand) — `{open, conversationId, setOpen, setConversationId, toggle}`. Persist to `localStorage` (`zara_dock_open`, `zara_dock_conversation_id`).
- `useZaraKeyboard.ts` — Cmd/Ctrl+J toggle, Cmd/Ctrl+K new conv, Cmd/Ctrl+/ focus input, Esc close, `/` focus search. Extend (replace usage of) `useZaraShortcut`.
- `useZaraConversations.ts` — list/CRUD (pin, rename, archive, delete) via supabase. Realtime subscription on `zara_messages` for active conv.

## Step 4 — Components (`src/components/zara/`)

- `ZaraDock.tsx` — root mount: launcher (closed) + slide-in panel (open). 400px desktop, full-screen mobile. Hidden on `/crm/zara`, `/crm/zara/about`, `/crm/zara/train`, `/crm/zara/projects/:id`.
- `ZaraDockHeader.tsx` — avatar + name + mode pill + maximize/history/help/close buttons.
- `ZaraChatStream.tsx` — shared message renderer (markdown, code-blocks with copy, lead/project link rewriting, sources pill expand, per-bubble copy, time tooltip with tokens). Used by dock AND cockpit.
- `ZaraComposer.tsx` — auto-resize textarea + mic + language + send + Cmd/Ctrl+Enter. Below: `ZaraQuickActionChips`.
- `ZaraQuickActionChips.tsx` — surface→chips map; clicking sends prefilled message with implicit `contact_id` injected via dock store.
- `ZaraConversationListOverlay.tsx` — search, filter tabs, sort, grouped sticky headers (Pinned/Today/Yesterday/Week/Earlier), row actions menu (pin/rename/archive/export/delete), keyboard nav. Used in dock history button and cockpit left rail.
- `useZaraExportMarkdown.ts` — client-side export to `.md`.

## Step 5 — Mount

Add `<ZaraDock />` + `useZaraKeyboard()` inside `CrmLayout.tsx` (outside `PageTransition`, sibling to `BottomNav`). Replace old `useZaraShortcut` global usage in `App.tsx` to forward to dock toggle when on `/crm/*`.

## Step 6 — Refactor cockpit

Swap `ZaraCockpitPage` message rendering + composer + chips to use the shared `ZaraChatStream` + `ZaraComposer` + `ZaraQuickActionChips` + `ZaraConversationListOverlay` so behaviour matches dock 1:1. Keep cockpit's max-width layout and project/queue panels.

## Step 7 — Deploy + verify

- Deploy `zara-chat`.
- Run `bun run build`.
- Smoke-test: open dock from `/crm/leads`, navigate, confirm persistence; send from `/crm/leads/:id` and check `page_context` saved + chips render; test pin/rename/archive/export/delete; Cmd/Ctrl+J/K/Esc.

## Technical details

- Surface inference: `/crm/leads/:id` → `lead_detail` + `contact_id`; `/crm/leads` → `leads_list`; `/crm/pipeline` → `pipeline`; `/crm/chats*` → `chats`; `/crm/email*` → `email`; `/crm/scheduler` → `calendar`; `/crm/templates` → `templates`; `/crm/zara/queue` → `queue`; `/crm/zara/projects` → `projects_list`; `/crm/reports*|/crm/email/analytics` → `reports`; `/crm/behavior*|/dashboard` → `dashboard`; else `other`.
- Hidden routes computed once via regex array.
- Realtime: single channel per `conversation_id`; subscribe both dock+cockpit, de-dupe by message id.
- Title regen: scheduled inline at end of stream (non-blocking `await`), gated by `title_regenerated_at_turn`.
- Markdown link rewriting: post-render walk on text nodes with built-from-metadata Map. Avoid wrapping inside code blocks.
- Touch targets: `min-h-11 min-w-11` on mobile controls.
- Theme: gold launcher uses `bg-primary text-primary-foreground`; surface uses `bg-background border-border`. No raw hex.
