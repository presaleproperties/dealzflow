---
name: Tablet as Scaled Mobile v1
description: Tablets (768–1023) render the mobile UI scaled up via device-tier tokens; useIsCompact now flips at <1024 (matches useIsMobile). Centered .m-page max-width 720px on tablet.
type: design
---

## Foundational shift

Tablets no longer render the squeezed desktop CRM. They render the
**mobile UI** (MobileLeadDetail, MobilePipelineView, mobile Leads list,
mobile Chats, etc.) scaled up via the existing device-tier token system.

## What changed

- `src/hooks/use-mobile.tsx`
  - `COMPACT_BREAKPOINT` flipped from 768 → **1024**, so `useIsCompact`
    is now semantically equivalent to `useIsMobile` (both true <1024).
  - New `useIsTablet()` helper returns true for 768–1023 only — use it
    for tablet-specific affordances (centered max-width, side-sheets,
    list-rail splits) when needed.

- `src/index.css` device-tier tokens
  - Pro Max breakpoint shrunk to `414–767` (phones only).
  - **New tablet tier** `768–1023`:
    `--device-scale: 1.14`, `--device-pad-x: 28px`,
    `--device-pad-y: 22px`, `--device-gap: 26px`,
    `--m-content-max: 720px`.
  - Desktop block (≥1024) unchanged.

- `.m-page` now reads `max-width: var(--m-content-max, none)` and
  centers itself with `margin-inline: auto` — the cap only applies
  on tablet (the var is undefined on phone & desktop).
- Components that don't use `.m-page` can opt in by adding
  `data-mobile-shell="true"` to their root wrapper.

## Why

- Eliminates the "iPad squeeze" where 3-col Lead Detail, Kanban, and
  two-pane Chats all crammed into ~768px.
- One UI tree to maintain instead of three. Mobile polish work
  (`crm-mobile-*`, `m-list`/`m-row`, `Pill`, bottom pill nav) compounds
  to tablet for free.
- Reading line-length stays comfortable (720px) instead of 1024px.

## Future tablet-only polish (not yet done)

- Landscape list-rail splits for Lead Detail and Chats (260–300px rail
  + mobile detail view), keyboard shortcuts (`j/k/c//`), side-sheets
  for filters/compose at 480px wide.
- Settings, Admin, Reports/Analytics still gated to desktop layout
  at ≥1024 — they're dashboard-shaped and benefit from full width.

## Tradeoffs / gotchas

- `useIsMobile` and `useIsCompact` are now functionally identical.
  Do not drop one — many files import `useIsCompact as useIsMobile`
  for "phone-only" semantics that we deliberately broadened to "phone
  or tablet". Renames will create churn for no gain.
- The older "CRM Tablet Polish v1" `@media (768–1023)` block in
  `src/index.css` (data-* opt-in caps at 760px) still exists and is
  complementary — it only fires on screens that still render the
  desktop CRM (e.g. a few admin/settings surfaces).
