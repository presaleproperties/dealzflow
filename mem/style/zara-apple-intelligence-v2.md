---
name: Zara Apple Intelligence v2
description: Quieter editorial pass over Zara surfaces (in-lead whisper + admin shell/Overview) — new utility classes and number-first tiles.
type: design
---
Build on Apple Intelligence v1 with text-forward, hairline-only chrome.

New CSS utilities in `src/index.css`:
- `.zara-rule` — hairline divider (gradient, replaces border lines)
- `.zara-meta` — 10.5px tabular muted text for timestamps/counts
- `.zara-link` — underline-on-hover gold link (no chrome)
- `.zara-dot-row` — middot separators between inline actions
- `.zara-tile` / `.zara-tile__label` / `.zara-tile__num` / `.zara-tile__num--sm` / `.zara-tile__sub` — editorial KPI tiles (replaces shadcn Card grids on Zara surfaces)
- `.zara-rail` / `.zara-rail__item` — glass sidebar rail with gold left-bar on `[data-active="true"]`
- `.zara-section-head` — 10px tracked uppercase label
- `.zara-input` — borderless soft input, gold focus halo
- `.zara-chip` — borderless filter/segment chip via `[data-active="true"]`
- `.zara-shimmer` — animated gradient text for streaming/loading

Rules:
- In-lead Zara (`ZaraSection.tsx`) primary lane is text-only links with middot separators — no icon buttons.
- Admin Zara pages (via `ZaraShell.tsx`) MUST use the glass rail and the title block (eyebrow → 30px headline → muted subtitle → `.zara-rule`).
- KPI strips inside `/admin/zara/*` MUST use `.zara-tile`, not `<Card>`.
- Use `.zara-rule` between rows instead of `border-b`/`border-t`.
