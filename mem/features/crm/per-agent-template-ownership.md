---
name: Per-agent + team template ownership
description: Two-way sync of crm_email_templates with Presale; owner_scope ('team:presale' | 'agent:<slug>') + RLS via crm_my_presale_slug(); any agent can contribute to team, only authors+admins edit/remove; CRM edits push back via push-template-to-presale → bridge-receive-template
type: feature
---

# Per-agent + Team Template Ownership (v1, two-way)

## Schema (`crm_email_templates`)
- `owner_scope` text NOT NULL DEFAULT `'team:presale'` — `team:<x>` or `agent:<slug>`
- `owner_agent_slug` text — null for team scope, required for agent scope (CHECK)
- `created_by_agent_slug` text — required for team scope (RLS), audit elsewhere

## RLS (using `crm_my_presale_slug()` helper)
- **SELECT**: team OR `owner_agent_slug = my slug` OR admin
- **INSERT**: own personal; team (must stamp `created_by_agent_slug = me`); admin override
- **UPDATE/DELETE**: own personal; own team contribution (`crm_template_is_my_team_contribution`); admin override

## Sync (three edge fns)
- `sync-bridge-templates` (pull, manual + daily cron) → POST `bridge-list-templates` with `{ agent_slug, include_team: true }`. Skips templates Presale leaks for other agents.
- `bridge-templates-sync` (Presale push webhook) → upserts with scope; supports `{ deleted: true }`.
- `push-template-to-presale` (CRM → Presale on save/delete) → POST `bridge-receive-template`; hash-gated to prevent loops; non-fatal on failure.

## Client (`useCrmEmail.tsx`)
- `useMyAgentSlug()` from `usePresaleAgentStore`
- `useCreateTemplate({ scope: 'mine' | 'team' })` — any agent can pick `team`
- `useUpdateTemplate` / `useDeleteTemplate` auto-fire push to Presale (best-effort)

## Spec doc
`docs/PRESALE_TEMPLATE_SYNC_SPEC.md` — single source of truth for cross-team coordination.

## Affected surfaces
All template pickers (`TemplatePicker`, `TemplatesRail`, `ComposeEmailDialog`, `SendProjectDialog`, `NewCampaignDialog`, `AutomationBuilder`) inherit RLS scoping automatically.
`CrmTemplatesPage.EmailTemplatesPanel` uses the legacy `email_templates` table — scoping does NOT apply there.
