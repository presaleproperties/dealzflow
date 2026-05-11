# Chats Experience Upgrade — 3 Builds

Three focused builds, shipped in order so each is usable on its own. All three respect existing CRM Communication Privacy, Last Activity Rule, Sender Signature Rule, and Mobile Composer Drawer rules.

---

## Build 1 — Composer Power-Ups

Make the inline composer the only place an agent needs during a conversation.

**Per-thread drafts that persist**
- New table `crm_thread_drafts` (one row per `user_id` × `contact_id` × `channel`) storing body, media URLs, quote text, updated_at.
- `useThreadDraft(contactId, channel)` hook — debounced autosave (800ms), reads on thread open, clears on send.
- "Draft" chip on the conversation row in `CrmChatsPage` when a draft exists.

**Inline channel switcher**
- Small segmented control inside the composer pill: `Text · Email`. Switching swaps the active sender (uses existing `useSendSms` / opens `ComposeEmailDialog` inline-mode).
- Default channel = last-replied channel for that contact (already in `crm_chats` row).

**AI assist (one-tap rewrite)**
- "Sparkles" button → menu: Improve, Shorten, Lengthen, Tone (friendly/professional/concise), Translate (Punjabi, Hindi, Mandarin, English).
- Calls existing `template-ai-assist` edge fn with mode + body. Shows result in a slim diff strip above the textarea with Accept / Reject (no popup).
- Preserves merge tokens.

**Schedule send + quiet-hours-aware**
- "Clock" button beside Send opens a small popover: Now / In 1h / Tonight 7pm / Tomorrow 9am / Custom.
- If quiet hours active → Send button auto-becomes "Send at 9:00 AM" (uses existing quiet-hours engine, no modal block).

**Slash commands**
- Typing `/` in textarea opens an inline command palette (no popover): `/template`, `/snippet`, `/var`, `/schedule`, `/file`. Keyboard-driven, dismissable with Esc.

---

## Build 2 — Triage Tools (Snooze + Saved Views)

Snooze, saved views, and bulk select hooks already exist server-side. Finish wiring the UI surfaces.

**Snooze**
- Add "Snooze" to the desktop hover row + mobile swipe action (right swipe).
- Popover with presets: Later today, Tonight, Tomorrow 9am, This weekend, Next week, Custom.
- `snoozedLabel` already renders on row → confirm it shows on snoozed rows in the inbox.
- Auto-resurface: scheduled job already exists in `useCrmInboxFlags` snoozePresets — verify cron triggers `snoozed_until <= now()` clears.

**Saved views**
- New left-rail section above the channel filters: "Views" with chips for built-ins (Unread, Mine, Hot, Awaiting reply >24h, Snoozed, Archived) + user-created views from `crm_inbox_views`.
- "Save current view" button captures channel + query + filters into a new row.
- Pin/unpin and reorder via drag (desktop) / long-press (mobile).
- Keyboard shortcut `g` then `1-9` to jump to view N.

**Bulk operations on desktop**
- Checkbox column appears on hover, sticky toolbar at top once any row is checked.
- Actions: Mark read/unread, Archive, Snooze, Assign to agent (if admin).
- Mobile: long-press a row enters multi-select mode with the same toolbar.

---

## Build 3 — Lead Context Side Panel

Stop the constant tab-switch to lead detail.

**Desktop (≥1024px): right rail inside `CrmChatsShell`**
- New 320px panel: contact card, pipeline pill (uses unified pipelines hook), engagement score, assigned agent, Phone/Email/Text quick actions.
- Sections (collapsible, remember state per-user): Recent presale activity (last 5), Upcoming showings (next 3), Open deals, Tags, Notes (inline add).
- Quick "Pin contact to top of inbox" action.
- Toggle to hide/show the rail (persisted in localStorage).

**Tablet (768–1023px)**
- Right rail collapses to a slide-over sheet triggered by an "info" icon in the thread header. Same content. Reuses `<ResponsiveDialog>` so it feels native.

**Mobile (<768px)**
- Replace the existing collapsible `MobileLeadContextCard` at the top of the thread with a bottom-sheet trigger in the thread header (single tap on the contact name). Sheet has the same content as desktop. Cleaner thread view, more room for messages.

**One-tap actions inside the rail**
- Call → uses `useDialer` (already wired).
- Book showing → opens existing booking dialog with contact pre-loaded.
- Send template → opens template picker that returns into the composer (Build 1).

---

## Technical Notes

**New table (Build 1)**
```sql
CREATE TABLE crm_thread_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('sms','whatsapp','email')),
  body text DEFAULT '',
  quote text,
  media jsonb DEFAULT '[]'::jsonb,
  subject text,
  scheduled_for timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, contact_id, channel)
);
-- RLS: user can CRUD only their own drafts (auth.uid() = user_id)
```

**Files to create**
- `src/hooks/useThreadDraft.ts`
- `src/hooks/useScheduledSend.ts` (wraps useSendSms with `scheduled_for`)
- `src/components/crm/chats/ComposerAIBar.tsx`
- `src/components/crm/chats/ComposerSlashMenu.tsx`
- `src/components/crm/chats/ChannelSegmented.tsx`
- `src/components/crm/chats/SnoozePopover.tsx`
- `src/components/crm/chats/SavedViewsRail.tsx`
- `src/components/crm/chats/BulkSelectToolbar.tsx`
- `src/components/crm/chats/LeadContextRail.tsx` (desktop)
- `src/components/crm/chats/LeadContextSheet.tsx` (tablet/mobile)

**Files to edit**
- `src/components/crm/chats/InlineTextComposer.tsx` — drafts, AI bar, schedule, slash, channel switch
- `src/pages/crm/CrmChatsPage.tsx` — saved-views rail, bulk toolbar, snooze action
- `src/pages/crm/CrmChatsShell.tsx` — wire desktop right rail (3-pane on ≥1024)
- `src/pages/crm/CrmChatThreadPage.tsx` — header tap → context sheet on mobile/tablet, remove inline `MobileLeadContextCard`

**Constraints respected**
- Mobile composer stays in `mobile-drawer`, not full-bleed.
- Bottom-nav clearance via `var(--bottom-nav-pad)`.
- All chips through `<Pill>` primitive.
- Sender signature always resolved per agent (no hardcoding).
- Last-touch only fires on actual manual sends.
- No tel:/mailto:/_blank — call uses dialer, email opens in `ComposeEmailDialog`.

---

## Order of work

1. **Build 1** — biggest daily-use win, needs one migration. Estimated 1 round.
2. **Build 2** — pure UI wiring on existing hooks. Estimated 1 round.
3. **Build 3** — new component, threads through 3 files. Estimated 1 round.

Approve and I'll start with Build 1 (the migration goes first so you can confirm the drafts table before I write the rest).
