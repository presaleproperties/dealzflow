---
name: Per-agent Template Ownership
description: Single unified `crm_email_templates` table with owner_scope (`team:presale` | `agent:<slug>`); RLS via `crm_my_presale_slug()`. Outbound Presale sync (push-template-to-presale + sync-bridge-templates) gated by `PRESALE_TEMPLATE_SYNC_ENABLED` secret — OFF until Presale ships `bridge-receive-template` + scoped `bridge-list-templates`. While OFF, local saves succeed silently and the Sync button shows a friendly "not live yet" toast.
type: feature
---

## Single source of truth
- Table: `crm_email_templates` (legacy `email_templates` dropped)
- Hooks: both `useCrmEmail.useTemplates` and the legacy-named `useEmailTemplates` read/write the same table
- Columns: `owner_scope`, `owner_agent_slug`, `created_by_agent_slug`, `external_id`, `sync_hash`, `is_favorite`, `preview_text`

## Ownership scope
- `team:presale` — visible to all; any agent can add; only original author OR admin (owner/admin role) can edit/delete
- `agent:<slug>` — visible/editable only to that agent (admins can moderate via RLS)
- RLS helper: `crm_my_presale_slug()` resolves caller → their `crm_team.slug`

## Sync edge functions (3-way clean)
- `push-template-to-presale` — CRM → Presale on every create/update/soft-delete; forwards `actor_agent_slug` + `actor_is_admin`; sync_hash loop guard
- `sync-bridge-templates` — CRM-initiated PULL from Presale (`bridge-list-templates`); filters by caller slug; defense-in-depth scope check
- `bridge-templates-sync` — Presale-initiated PUSH webhook into CRM; rejects ownership-conflict re-assignments unless `actor_is_admin`

## Canonical agent slugs (must match Presale exactly)
- `uzair-muhammad` (owner)
- `sarb-grewal`
- `ravish-passy`
- `zara-malik`

## UI
- `CrmTemplatesPage` shows "Mine" / "Team" badge per template, plus "Sync now" button that invokes `sync-bridge-templates`
- `useCreateTemplate({scope:'mine'|'team'})` controls scope on creation

## Removed / deprecated
- `email_templates` table → DROPPED
- `bridge-templates` edge function → DELETED (was a duplicate of `bridge-templates-sync`)
- `bridge-templates-sync` is the spec'd ingest endpoint; `bridge-list-templates` lives on the Presale side
