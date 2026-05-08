Tablet polish pass. Strategy stays "mobile shell on tablet" — bottom nav + drilldowns — but every screen below gets denser, with caps on widths so wide iPad canvases stop looking sparse. Phone (<768px) is unchanged; only the `md:` (≥768px) range inside the mobile shell is tightened.

A new `--tablet:` helper utility (`@media (min-width:768px) and (max-width:1023px)`) is added to `src/index.css` so tablet-only tweaks don't bleed into desktop. All edits below use it.

## 1. Leads list (`/crm/leads`)
File: `src/pages/crm/CrmLeadsLayout` table + pagination footer

- Cap table content width at `max-w-[760px] mx-auto` on tablet so the list reads like a centered column instead of a stretched table.
- Shrink filter chip row gap (`gap-1.5`) and make "Add Lead" + "Manage" buttons `h-9 text-sm` on tablet (currently inherit desktop sizing).
- Pagination footer: the bug where row 11 peeks through under the sticky pager — increase scroll-container `pb-` to match pager height + safe-area.
- Hide the "Sort ↑↓" arrows in column headers (NAME, REG, PIPELINE) on tablet — they collide with column titles in the narrow grid.

## 2. Lead detail (`/crm/leads/:id`)
File: `src/components/crm/leads/detail/LeftColumn.tsx`, `CenterColumn.tsx`, `MobileHeader.tsx`

- **Header strip** (Quick Reply / Book Showing / 4/6992 pager): collapse to a single row with `text-sm`, hide "LEAD" badge, move pager arrows next to the title at tablet so they stop wrapping.
- **Action tiles** (CALL/TEXT/WHATSAPP/EMAIL): currently render as huge 2×2 grid using mobile sizing. On tablet switch to a single horizontal row of 4 chips (`h-11`, label inline next to icon). Saves ~140px vertical.
- **PIPELINE STAGE / INSIGHT** cards: drop card padding from `p-4` to `p-3`, reduce score number from `text-2xl` to `text-xl`, put SCORE / LAST ACTIVITY / IN PIPELINE on a single horizontal row instead of 3 stacked cards.
- **Contact card**: shrink avatar/title block padding on tablet (`p-3`).

## 3. Chats (`/crm/chats`)
File: `src/components/crm/chats/ChatsHeader.tsx` (or equivalent), `ChatsList.tsx`

- The two integration health cards (Email connected / SMS ready) collapse to a single 28px pill row on tablet: green/red dot + "Email · SMS connected · checked 1m ago" — tap to expand. Reclaims ~120px.
- Conversation rows: cap width at `max-w-[640px]` on tablet so avatars+names don't stretch awkwardly.

## 4. Pipeline Kanban (`/crm/pipeline`)
File: `src/components/crm/pipeline/MobileKanban.tsx` (or wherever the swipe-pager lives)

- At tablet width, show **2 columns side-by-side** instead of one full-width column with a dot pager. Each column gets `w-[48%]`. The dot pager hides at `md:`.

## 5. Calendar (`/crm/calendar`)
File: `src/pages/crm/CrmCalendar.tsx` or `MobileCalendar.tsx`

- Move "Book Showing" button into the same row as `May 2026` title on tablet (it currently consumes its own row). 
- Cap event card width (`max-w-[760px] mx-auto`) and reduce vertical gap between events from `gap-3` to `gap-2`.

## 6. Email composer / `/crm/email`
File: `src/components/crm/leads/ComposeEmailDialog.tsx` (already mobile-tuned)

- Cap dialog width at `max-w-[680px]` on tablet (currently full-screen). Centered modal feels native at iPad width.
- Cap signature preview card width to match.

## Technical notes
- `useIsMobile()` stays at `<1024` — no behavioral change to which layout renders.
- All edits gated by either Tailwind `md:` (≥768) without a `lg:` reset, or the new `tablet:` helper that scopes to 768–1023 only.
- No business logic changes; presentation only.
- Memory update: add a "Tablet Polish v1" memory listing the `tablet:` helper and the cap widths so future work doesn't reintroduce sparse layouts.

## Out of scope
- Restructuring nav (still mobile bottom-nav).
- Desktop (≥1024) untouched.
- No new components beyond cosmetic tweaks.
