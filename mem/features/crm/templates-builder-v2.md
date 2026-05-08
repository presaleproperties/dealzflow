---
name: Templates → Agent Hub Handoff
description: CRM /crm/templates is read-only mirror of local + Presale templates; editing/creating delegated to Presale Agent Hub via deep links.
type: feature
---
# Templates Page = Read-only Mirror

The CRM does NOT build templates. Editing happens in **Presale Agent Hub**.

- `/crm/templates` lists local (`crm_email_templates`) + live Presale (`bridge-list-templates`) assets in a unified view.
- All "New template", "Edit", "Draft with AI" buttons → `window.open(AgentHubLinks.*)` in a new tab.
- "Open Agent Hub" button is in the page header next to the Email/SMS tabs.
- Agent slug is auto-appended via `usePresaleAgentStore` so the agent lands in their own AgentHub workspace.
- Local template "Duplicate", "Share with team", "Move to my library", "Favorite", "Archive" still work in CRM.
- Presale assets: "Send" + "Open preview" still work in CRM (uses bridge-render-email + Resend).

## Files
- `src/lib/agentHub.ts` — `AgentHubLinks.{home,templates,newTemplate,editTemplate,campaigns}`. Base overridable via `localStorage['presale.agenthub_url']`. Default: `https://app.presaleproperties.com/agent`.
- `src/pages/crm/CrmTemplatesPage.tsx` — `OpenAgentHubButton` + `openHub()` helper.

## Deleted (do NOT re-add)
- `src/components/crm/templates/TemplateEditor.tsx` (3-pane builder)
- `src/components/crm/templates/TemplateEditorDialog.tsx`
- `SendTestDialog.tsx`, `SenderIdentityField.tsx`, `SyncHistoryList.tsx`
- `src/hooks/useTemplateAutosave.ts`, `src/hooks/useTemplateSyncLog.ts`
- `supabase/functions/template-send-test`

**Rule:** Never reintroduce an in-CRM email builder. Presale AgentHub is the single source of truth for marketing creative.
