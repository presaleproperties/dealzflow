
## Mobile composer + toast overhaul

The screenshots show three real issues. Fixing them well needs changes in a few coordinated spots — but only frontend/presentation. No business logic, no edge-fn changes.

### Issues we're fixing

1. **Status-bar collision** — "SEND TEXT" and "Cancel / New Message" headers paint behind the iOS status bar (`11:28`, signal/wifi/battery), so titles get visually shredded.
2. **Toast collision** — Sonner is pinned `top-right` with a 16px offset; on iOS the toast lands on top of the time/notch (the "Text Sent" / "Loaded – Save $100,000…" overlap).
3. **Composer doesn't feel native** — Today the Send Text and Compose Email dialogs render as full-bleed sheets with hard edges and an arbitrary keyboard accessory bar. The user wants a true bottom-up drawer with rounded top, drag handle, sticky action bar that never tucks under the bottom nav, and proper safe-area padding top + bottom.

### Scope (frontend only)

- **`src/components/ui/sonner.tsx`** — make toaster mobile-aware: on `<sm` switch to `top-center` and offset by `calc(env(safe-area-inset-top, 0px) + 12px)`, narrower max width, slightly smaller radius. Desktop stays exactly as today.
- **`src/components/ui/responsive-dialog.tsx`** — upgrade the mobile sheet branch:
  - Add a new variant `mobile-drawer` (used by composers) — rounded-t-3xl, max-h `92dvh`, backdrop dim, drag handle, content area scrolls, header pinned, footer pinned with `padding-bottom: calc(env(safe-area-inset-bottom) + var(--bottom-nav-pad, 0px))` so Send/Cancel never tucks under the floating pill nav.
  - Retire the `mobile-fullbleed` 100dvh path for these two composers (it's the root cause of the status-bar overlap).
  - Add `--composer-safe-top` token = `env(safe-area-inset-top)` so headers can pad above the notch.
- **`src/components/crm/leads/SendTextDialog.tsx`** — switch from `mobile-fullbleed` to `mobile-drawer`. New header layout: drag handle row → "SEND TEXT" title row with channel toggle + close. Recipient row, message field and helper count compress on mobile (no horizontal cut-off). Sticky bottom action bar with single primary "Send" button (icon + label) that respects bottom-nav clearance. Remove the floating up/down/✓ accessory bar on mobile (it duplicates iOS's own keyboard accessory and looks foreign).
- **`src/components/crm/leads/ComposeEmailDialog.tsx`** — same drawer treatment for mobile only:
  - Header: drag handle + "New Message" centered, Cancel left, Send right (matches Apple Mail).
  - Subject row sits flush under header, body editor fills, formatting toolbar collapses behind a single `Aa` button on mobile so the row doesn't horizontally clip.
  - Sticky footer with signature picker chip + Send. Bottom padding includes safe-area + bottom-nav clearance.
  - Kill the orange full-width separator line that's currently pushing into the keyboard area.
  - Remove the duplicated up/down/✓ accessory bar on mobile.
- **Send Project preview screen** (Image 58) — same drawer wrapper, no full-bleed; the toast at the top will stop overlapping once Sonner is fixed.

### Visual polish (mobile only, desktop untouched)

- 16px outer side padding on every composer field row (today some are 12 / some 20).
- Drag handle: 36px wide, 4px tall, `bg-muted-foreground/30`, 8px top + 6px bottom.
- Header title: `text-[15px] font-semibold tracking-tight`, no uppercase letter-spacing chaos.
- Footer divider is hairline (`border-border/60`), not gold.
- Sticky footer uses `backdrop-blur-md bg-background/92` so it reads as a bar, not a panel.

### Out of scope (will not touch)

- Send pipeline, templates, signatures, AI assist, attachment uploader behaviour.
- Desktop layout for either composer.
- Lead detail screens, chat thread bubbles (that was the SMS bubble redesign).

### Verification

- Open `/crm/leads/<id>` on iPhone-sized viewport, tap **Text** → confirm drawer rises from bottom, drag handle visible, "SEND TEXT" sits below the status bar, Send button sits above the bottom-nav pill.
- Tap **Email** → same drawer behaviour, Cancel/Send respect safe areas.
- Trigger any toast → appears centered below the notch, not overlapping `11:28`.
- Desktop (≥sm): both dialogs render exactly as today (centered modal, no drawer treatment).

### Memory follow-up

After ship, add a memory `mem://style/mobile-composer-drawer-v1` capturing the drawer pattern, safe-area tokens, and the rule "no `mobile-fullbleed` for composers" so future composers stay consistent.
