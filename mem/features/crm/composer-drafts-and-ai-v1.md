---
name: Composer Drafts & AI Assist v1
description: Per-thread persisted drafts + inline AI rewrite/translate in the chat composer
type: feature
---
**Drafts**: `crm_thread_drafts` (user_id × contact_id × channel, RLS auth.uid()=user_id). `useThreadDraft(contactId, channel)` hydrates on mount, autosaves on body/quote/media change (800ms debounce), `clear()` runs on send. Hydration guard resets when contact/channel changes.

**AI assist**: Sparkles button in `InlineTextComposer` opens menu (Improve / Shorten / Lengthen / Tone / Translate pa·hi·zh·en). `useComposerAI` calls `template-ai-assist` edge fn with `format:'plain'` + `channel`. Edge fn now has `SYSTEM_RULES_PLAIN` and returns `{text, body}` for plain mode. Suggestion shown in inline diff strip with Use/Dismiss — no popup. Merge tokens preserved by system prompt.

**Files**: `src/hooks/useThreadDraft.ts`, `src/hooks/useComposerAI.ts`, edits to `src/components/crm/chats/InlineTextComposer.tsx`, `supabase/functions/template-ai-assist/index.ts`.

**Build 2 & 3 still queued** (snooze quick action, saved-views rail, bulk toolbar, desktop right rail / mobile context sheet).
