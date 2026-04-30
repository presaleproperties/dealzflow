---
name: Per-agent + team template ownership
description: crm_email_templates scoped via owner_scope ('team:presale' | 'agent:<slug>') + owner_agent_slug; RLS gates visibility to team OR caller's own slug; sync edge fns forward agent_slug and accept owner_scope from Presale
type: feature
---

# Per-agent + Team Template Ownership

## Schema (`crm_email_templates`)
- `owner_scope` text NOT NULL DEFAULT `'team:presale'` — format `team:<x>` or `agent:<slug>`
- `owner_agent_slug` text — null for team scope, required for agent scope (CHECK enforces)
- `created_by_agent_slug` text — audit only

## Visibility & edit rules (RLS)
- SELECT: team templates OR `owner_agent_slug = crm_my_presale_slug()` OR admin
- UPDATE/DELETE: own agent templates OR (team + admin)
- INSERT: agents create only `agent:<self>`; team templates require admin
- Helper: `crm_my_presale_slug()` reads caller's `crm_team.slug`

## Sync flow
- `sync-bridge-templates` (pull) → forwards `{ agent_slug, include_team: true }` to Presale's `bridge-list-templates`; respects `owner_scope`/`owner_agent_slug` returned; defense-in-depth skip if Presale leaks another agent
- `bridge-templates-sync` (push webhook) → accepts `owner_scope`, `owner_agent_slug`, `created_by_agent_slug`, plus `deleted: true` for soft-delete
- GET on push fn now exposes scope fields back to Presale

## Client (`useCrmEmail.tsx`)
- `useCreateTemplate` accepts `scope: 'mine' | 'team'` (default `mine`)
- `useMyAgentSlug()` exposes the caller's slug from `usePresaleAgentStore`
- `useCrmEmailTemplates` returns rows naturally filtered by RLS; no client filter needed

## Affected surfaces
- All template pickers (`TemplatePicker`, `TemplatesRail`, `ComposeEmailDialog`, `SendProjectDialog`, `NewCampaignDialog`, `AutomationBuilder`) automatically respect scoping via the hook
- `CrmTemplatesPage.EmailTemplatesPanel` uses a separate `email_templates` table (legacy) — scoping does NOT apply there
