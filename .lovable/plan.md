# Templates 2.0 — A 10× Library

A single page where any agent on the team can find, preview, edit, build, and send any email or SMS template in seconds — with shared folders, tags, favorites, real usage analytics, and an AI assistant that helps you find or write the right template.

---

## What changes for users

### One library, two channels
A single Templates page with an **Email / SMS** segmented switch at the top. Same layout, same shortcuts, same muscle memory.

### A real "find anything" experience
- **Cmd/Ctrl+K command palette** — type to instantly jump to any template by name, subject, body content, tag, or folder.
- **Smart search bar** — fuzzy match across name + subject + body + tags + project.
- **Filters that stack**: Source (Mine / Team / Presale) · Folder · Tag · Channel (Email/SMS) · Favorited · Recently used.
- **Ask AI**: "find me a follow-up after a showing for a Mandarin-speaking buyer" → AI ranks the best matches.
- **Saved views** per agent (e.g. "My hot-lead replies") stored locally.

### Organize the way real teams work
- **Folders** (e.g. "Cold outreach", "Showings", "Closing", "Nurture") — drag a template in, or create a new folder inline. Folders are team-shared.
- **Color tags** — multi-select chips on a template (e.g. `urgent`, `mandarin`, `langley`). Click a tag to filter the library.
- **Favorites** — star any template to pin it to the top of your personal view.
- **Recent** — your last 10 used templates surface in a dedicated rail at the top.

### Sharing & roles (Full library + analytics)
- **Mine** — only you can see/edit. One-click **"Share with team"** promotes it to the team library.
- **Team** — anyone on the team can use; only the author or an admin can edit.
- **Featured** — admins can mark a team template as ⭐ Featured so new agents see the gold standards first.
- **Locked** — admins can lock a Featured template to prevent edits.

### Per-template analytics
Live stats panel on every template:
- Total sends · Last sent
- Open rate · Reply rate · Click rate (email) · Reply rate (SMS)
- Sparkline of sends over the last 30 days
- Top performers section on the empty-search state ("Most-replied-to last 30 days")

### Create & edit faster
- **New template** dialog asks 3 things: channel, name, "start blank / from existing / from AI prompt".
- AI prompt path: "Write a friendly first-touch email for an investor lead in Surrey BC who downloaded a floor plan" → generated draft (subject + body) you can accept, tweak, or regenerate.
- **Inline edit** opens a side editor (no page jump): subject, body (rich text for email, plain for SMS), merge-tag picker, MMS attachments for SMS, preview against a sample lead.
- **Version history** is preserved (already exists) — accessible from a "History" button.

### Preview that mirrors the real send
- Right-side preview pane renders the template **with sample data merged** (lead name, agent signature, etc.) — what the recipient actually sees.
- "Preview as…" dropdown lets you swap the sample lead with a real one to sanity-check merge tags.
- **Send button** opens the canonical composer (`ComposeEmailDialog` / `SendTextDialog`) pre-loaded with the template — no surprises.

### Mobile-friendly
List view collapses to single column, preview pane becomes a bottom sheet, search bar pins to top, FAB-free (per pill-nav rule).

---

## Layout

```text
┌─────────────────────────────────────────────────────────────┐
│  Templates           [Email | SMS]   [+ New]  [Cmd+K]       │
│  342 templates · 28 favorites                               │
├──────────┬──────────────────────────────┬───────────────────┤
│ RAIL     │  TOOLBAR  search · sort      │  PREVIEW          │
│          ├──────────────────────────────┤                   │
│ ⭐ Favs  │  ┌──────────────────────────┐│  Subject line…    │
│ 🕐 Recent│  │ Template card            ││  ─────────────    │
│          │  │ name · subject snippet   ││  [Rendered HTML]  │
│ FOLDERS  │  │ tags · sends · last used ││                   │
│  Cold    │  └──────────────────────────┘│  ─────────────    │
│  Showing │  ┌──────────────────────────┐│  Stats            │
│  Closing │  │ Template card            ││  ▾ 248 sends      │
│  + new   │  │ ...                      ││  ▾ 42% open       │
│          │  └──────────────────────────┘│  ▾ 18% reply      │
│ TAGS     │                              │                   │
│  urgent  │                              │  [Edit] [Send]    │
│  mandarin│                              │  [History] [···]  │
│  langley │                              │                   │
└──────────┴──────────────────────────────┴───────────────────┘
```

---

## Implementation plan (technical)

### 1. Schema additions (one migration)

- `crm_template_folders` — `id, name, color, sort_order, created_by, channel ('email'|'sms'|'both')`. Team-shared, RLS: any CRM member reads, members create, only owner/admin updates/deletes.
- `crm_template_folder_items` — `template_id, template_kind ('email'|'sms'), folder_id`. Composite PK; ON DELETE CASCADE.
- `crm_template_tags` — `id, label, color`. Team-shared.
- `crm_template_tag_items` — `template_id, template_kind, tag_id`. Composite PK.
- `crm_template_favorites` — `template_id, template_kind, user_id`. Composite PK; per-agent.
- `crm_sms_templates`: add `is_favorite_legacy boolean default false` removed in favor of new table. Add `owner_scope text`, `owner_agent_slug text`, `is_featured boolean`, `is_locked boolean` to mirror email schema.
- `crm_email_templates`: add `is_featured boolean default false`, `is_locked boolean default false`.
- View: `crm_template_stats` — joins `crm_email_log` / `crm_sms_log` for sends/open/click/reply per template, last 30 days sparkline as JSON array.

### 2. Hooks (new + extended)

- `src/hooks/useUnifiedTemplates.ts` — single hook returning `{ items: UnifiedTemplate[] }` merging email + SMS + presale bridge; supports filters `{ search, channel, folderId, tagIds, favoritedOnly, source }`.
- `src/hooks/useTemplateFolders.ts` — CRUD + reorder.
- `src/hooks/useTemplateTags.ts` — CRUD + assign/unassign.
- `src/hooks/useTemplateFavorites.ts` — toggle.
- `src/hooks/useTemplateStats.ts` — pull `crm_template_stats` for one or many template ids.
- Extend `useTemplateAI.ts` with `searchByIntent(prompt)` action calling the existing `template-ai-assist` edge fn (new `mode: 'rank'`).

### 3. Components (new under `src/components/crm/templates/`)

- `TemplatesPageV2.tsx` (replaces page body of `CrmTemplatesPage.tsx`).
- `TemplateRail.tsx` — Favorites · Recent · Folders · Tags.
- `TemplateGrid.tsx` — virtualized card list (50 per page, infinite scroll).
- `TemplateCard.tsx` — name, channel pill, snippet, tag chips, sends/last-used micro-stats.
- `TemplatePreviewPane.tsx` — iframe-rendered email or SMS bubble preview, sample-lead picker, stats accordion, action bar.
- `TemplateCommandPalette.tsx` — Cmd+K dialog using `cmdk`.
- `NewTemplateDialog.tsx` — channel + start mode (blank / clone / AI).
- `TemplateEditorDrawer.tsx` — inline editor (right-side `Sheet`), reuses `VariablePicker` + `AIAssistMenu`.
- `MoveToFolderMenu.tsx`, `TagPickerPopover.tsx`, `ShareWithTeamDialog.tsx`.

### 4. Existing wiring preserved

- "Send" button still hands off to `ComposeEmailDialog` / `SendTextDialog` (per Composer Architecture v2).
- Presale bridge templates still appear via `useBridgeTemplates`, sourced as `presale` and read-only.
- Edit-in-Agent-Hub for Presale assets remains a one-click deep link.
- Per-agent ownership rules from the existing Per-agent Template Ownership memory are unchanged.

### 5. Out of scope for this pass

- Drag-and-drop to reorder folders (use sort_order for now, drag in v2).
- A/B testing variants.
- Template marketplace / external import.

---

## Rollout

1. Migration for folders/tags/favorites/featured + stats view.
2. Hooks + new components, page swapped behind a `?v=2` flag for one preview cycle, then made default.
3. Seed each of the 21 existing email templates into a default "Inbox" folder so nothing looks empty on day one.
4. Memory note added: `templates-v2` describing the new architecture so future work follows the same pattern.