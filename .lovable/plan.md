## Inbox UX polish — Email + Chats (unified)

A focused pass to make both `/crm/email` (Inbox view) and `/crm/chats` feel like one product: same density, same scanability, same triage shortcuts, and full mobile parity.

### Scope (what changes, what doesn't)

| Touched | Not touched |
|---|---|
| `InboxView.tsx` (email 3-pane + mobile) | Composer (`ComposeEmailDialog` — already canonical) |
| `CrmEmailWorkspacePage.tsx` (header tabs) | Email backend / Gmail edge fns |
| `CrmChatsPage.tsx` (list + filter rail) | SMS sending logic / Twilio |
| `CrmChatThreadPage.tsx` (thread header + composer) | Bubble component (already polished) |
| `src/index.css` — shared `inbox-*` tokens | Routing, RLS, data shape |

---

### 1. Shared design tokens (one look, both inboxes)

Add to `src/index.css`:

- `--inbox-row-py`, `--inbox-row-px`, `--inbox-rail-w` (desktop 240, mobile sheet)
- `.inbox-row` / `.inbox-row[data-unread]` — base row, bold sender + accent dot when unread
- `.inbox-meta` — 11px tabular muted timestamps
- `.inbox-snippet` — 12.5px clamp-2, color-shift on unread
- `.inbox-pane-header` — sticky 48px header with backdrop blur

Both inboxes consume the same classes → instant consistency.

### 2. Email Inbox (`InboxView.tsx`)

Desktop:
- Folder rail width 200 → **220**, add subtle dividers between sections, move "Sync" button into header (free up rail bottom)
- Message list: bump row to 64px min-height, larger sender (14px), tighter snippet line-height, **keyboard nav** (`j`/`k` move, `e` archive, `r` reply, `/` focus search, `g i` inbox)
- Reading pane: subject 20px → **22px**, sender card with avatar + tone-based color, "open lead" pill moved next to subject
- Reply box: gains **template chips** row (top 3 templates), "Suggest reply" placeholder hook (no AI call yet — just visual), Send button promoted to primary tone

Mobile:
- Top bar collapses on scroll (Apple Mail style) — title shrinks, search hides until pull-down
- Swipe gestures: left = archive (already), **right = mark unread/read**
- Floating compose FAB removed (Quick Actions is the canonical "+" per memory)
- Auto-grow reply already there — add "scroll to bottom on send" + better disabled state

### 3. Chats (`CrmChatsPage.tsx` + `CrmChatThreadPage.tsx`)

Desktop:
- Conversation list adopts the same `.inbox-row` styling so it visually matches Email
- Filter chips (`All / Email / Text`) moved into the same header pattern as Email
- Thread header: avatar + name + sub-line (channel · last seen), single overflow menu instead of scattered buttons

Mobile:
- Match Email's collapsing top bar
- Conversation row: 14px name, channel pill on right, snippet 12.5px clamp-2
- Thread page: keep bubble polish; restyle composer to match Email reply box (rounded-2xl, send button promoted)

### 4. Cross-cutting polish

- Empty states: replace centered icon stacks with **illustrated empty card** (single component `<InboxEmpty kind="email" | "chats" />`)
- Loading: replace shadcn skeleton blocks with shimmer rows that mirror real row layout (less janky)
- Unread accent: use `bg-primary` dot (3px) + bold sender, never both color shifts at once
- Timestamps: smartTime upgrade — show `h:mm a` today, `Yesterday`, weekday this week, `MMM d` else (already done in chats; harmonize email)
- Keyboard help: small `?` key opens a cheat-sheet popover

### Recommendations not implemented (call-outs only)

- Threaded chat view across channels (one contact = one thread, email + SMS interleaved) — bigger refactor, separate task
- AI "smart reply" chips — needs Lovable AI gateway wiring; flag in code as TODO
- Snooze UI is partially built (`useCrmInboxFlags`) — surface in row context menu

### Files to edit

```text
src/index.css                                  + ~60 lines (inbox-* tokens)
src/components/crm/email/InboxView.tsx         density, kbd nav, mobile collapsing header
src/pages/crm/CrmEmailWorkspacePage.tsx        minor header consistency
src/pages/crm/CrmChatsPage.tsx                 row styling + mobile parity
src/pages/crm/CrmChatThreadPage.tsx            header + composer polish
src/components/crm/inbox/InboxEmpty.tsx        NEW shared empty-state component
src/components/crm/inbox/InboxShortcutsHelp.tsx NEW kbd cheat-sheet popover
```

### Approach

Roll out in 3 sequential commits (so each is independently reviewable):
1. Tokens + shared empty + Email desktop polish
2. Email mobile collapsing header + swipe-right + kbd nav
3. Chats list + thread header alignment to new tokens
