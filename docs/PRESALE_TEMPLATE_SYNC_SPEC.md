# Presale Properties ↔ Dealzflow CRM — Template Sync Spec (v1.0)

**Status:** CRM side is shipped and waiting on Presale to implement these endpoints.
**Feature flag:** All outbound calls to Presale are gated by the `PRESALE_TEMPLATE_SYNC_ENABLED` secret on the CRM side. It is currently **OFF** — local saves work normally and the "Sync now" button shows a friendly "not live yet" message instead of erroring. Flip the secret to `"true"` the day Presale deploys `bridge-receive-template` + scoped `bridge-list-templates`.
**Owners:** Uzair (CRM) ↔ Presale Properties dev
**Last test target:** Zara on her Presale agent portal

---

## 1. Single ownership model (the contract)

Every template, on either side, has exactly one owner scope:

| Scope            | Visible to                  | Add  | Edit / Remove                                   |
|------------------|-----------------------------|------|--------------------------------------------------|
| `agent:<slug>`   | That one agent only         | That agent | That agent only                            |
| `team:presale`   | All team members            | Any agent  | Original author OR an admin (Uzair, etc.)  |

Slug = the agent's Presale slug (e.g. `uzair-mohammed`, `zara-...`). It must match what Presale already exposes via `bridge-list-agents` / `bridge-get-agent` and what the CRM gets back from `presale-agent-me`. Email-matched.

Cloning a team template = creates a brand-new `agent:<self>` row. No links back; edits to the clone never touch the team original.

---

## 2. What Presale Properties needs to build

### 2.1 Agent portal routes
```
/agent/templates                 → My Templates + Team Templates tabs
/agent/templates/new             → defaults to scope = agent:<me>; toggle to team
/agent/templates/:id/edit        → 403 if not owner and not admin
/agent/templates/:id/clone       → always becomes agent:<me>
/agent/templates/:id/delete      → soft-delete (is_active=false) + push delete signal
```

### 2.2 Database fields per template (Presale side)
```
id                       uuid
slug                     text    (stable, used for cross-system matching)
external_id              text    (typically same as slug)
name                     text
subject                  text
body_html                text
preview_text             text?
category                 text    (general | listing | project_launch | follow_up | …)
project_slug             text?   (optional Presale project link)
merge_tags               text[]
owner_scope              text    'agent:<slug>' | 'team:presale'
owner_agent_slug         text?   null for team
created_by_agent_slug    text    NEVER null (audit trail)
is_active                boolean
sync_hash                text    sha256(subject + '|' + body_html)
updated_at               timestamptz
```

### 2.3 Endpoints Presale must expose

All endpoints require headers:
- `x-bridge-secret: <PRESALE_BRIDGE_SECRET>`
- `Authorization: Bearer <PRESALE_ANON_KEY>`
- `apikey: <PRESALE_ANON_KEY>`

#### A. `POST /bridge-list-templates` — pull
The CRM already calls this. Add **server-side filtering**:
```jsonc
// Request
{ "agent_slug": "uzair-mohammed", "include_team": true }

// Response
{
  "templates": [
    {
      "slug": "...", "external_id": "...", "name": "...", "subject": "...", "body_html": "...",
      "owner_scope": "agent:uzair-mohammed" | "team:presale",
      "owner_agent_slug": "uzair-mohammed" | null,
      "created_by_agent_slug": "uzair-mohammed",
      "category": "...", "project": "...", "merge_tags": [...],
      "sync_hash": "...", "updated_at": "..."
    }
  ]
}
```
**Filter rule (server-side, mandatory):** return rows where
`owner_scope = 'team:presale' OR owner_agent_slug = agent_slug`.
Never leak another agent's templates, even if our client asks. Defense in depth.

#### B. `POST /bridge-templates-pull` (optional) — push to CRM
Already wired on our side as `bridge-templates-sync`. Presale should fire this **on every save/delete** in the agent portal:
```
POST https://svbilqvudkkdhslxebce.supabase.co/functions/v1/bridge-templates-sync
```
Headers: `x-bridge-secret: <BRIDGE_SECRET>` and `Content-Type: application/json`.

Body for create/update:
```jsonc
{
  "templates": [{
    "external_id": "uzair-fall-launch",
    "name": "Fall Launch Invite",
    "subject": "You're invited…",
    "body_html": "<p>…</p>",
    "category": "project_launch",
    "project": "northshore",
    "merge_tags": ["first_name","project_name"],
    "owner_scope": "agent:uzair-mohammed",
    "owner_agent_slug": "uzair-mohammed",
    "created_by_agent_slug": "uzair-mohammed",
    "sync_hash": "<sha256 of subject|body_html>"
  }]
}
```

Body for soft-delete:
```jsonc
{ "templates": [{ "external_id": "uzair-fall-launch", "deleted": true }] }
```

#### C. `POST /bridge-receive-template` — accept inbound from CRM (NEW)
The CRM calls this when an agent edits or deletes a template **in the CRM** (two-way sync). Presale must:

1. Match by `external_id`.
2. Compare `sync_hash`. If equal → return `{ "action": "unchanged" }` (loop prevention).
3. Verify ownership: if `owner_scope = 'agent:<X>'` then `actor_agent_slug` must equal `<X>` **OR** `actor_is_admin === true`. Reject 403 otherwise.
4. Apply create/update/soft-delete and respond `{ "action": "created"|"updated"|"soft_deleted" }`.

Inbound payload shape (from us):
```jsonc
{
  "external_id": "uzair-fall-launch",
  "slug": "uzair-fall-launch",
  "name": "...", "subject": "...", "body_html": "...",
  "category": "...", "project": "...", "merge_tags": [...],
  "owner_scope": "agent:uzair-muhammad",
  "owner_agent_slug": "uzair-muhammad",
  "created_by_agent_slug": "uzair-muhammad",
  "sync_hash": "...",
  "actor_agent_slug": "uzair-muhammad",   // who pressed save in the CRM
  "actor_is_admin": true                    // forwarded so admins can moderate team templates
}
```
Soft-delete shape:
```jsonc
{ "external_id": "uzair-fall-launch", "deleted": true, "actor_agent_slug": "uzair-muhammad", "actor_is_admin": false }
```

> **Slug source of truth**: the canonical agent slugs are `uzair-muhammad`, `sarb-grewal`, `ravish-passy`, `zara-malik`. The CRM now stamps these on every push. Presale must match against these strings.

---

## 3. What's already live on the CRM side

- **DB scoping**: `crm_email_templates` has `owner_scope` + `owner_agent_slug` + `created_by_agent_slug` with strict RLS:
  - SELECT: team OR `owner_agent_slug = caller's slug` OR admin
  - INSERT: agent creates own; agent creates team (must stamp `created_by_agent_slug = self`); admins anything
  - UPDATE/DELETE: own personal; own team contribution; admin override
- **Pull**: `sync-bridge-templates` (manual button + daily cron) calls `POST /bridge-list-templates` with `{ agent_slug, include_team }`.
- **Push (inbound webhook from Presale)**: `bridge-templates-sync` (`POST`/`GET`) handles upserts + soft-deletes scoped by `owner_scope`.
- **Push (outbound on CRM edits)**: `push-template-to-presale` is invoked from `useCreateTemplate` + `useUpdateTemplate` + `useDeleteTemplate`. It calls `POST /bridge-receive-template` on Presale with hash dedup.

---

## 4. Acceptance test (Zara)

| # | Action | Expected |
|---|--------|----------|
| 1 | Zara creates template "Z-Test-1" in Presale agent portal (scope: mine) | Appears in **Zara's** CRM under My Templates within ~5s; **invisible** to Uzair |
| 2 | Uzair creates "Team-Welcome" in Presale (scope: team) | Appears in Team Templates for **both** Zara and Uzair |
| 3 | Zara clicks Clone on "Team-Welcome" | A new `Z's copy of Team-Welcome` shows under Zara's My Templates only; editing it does NOT touch the team original |
| 4 | Zara deletes "Z-Test-1" in Presale | Disappears from Zara's CRM within ~5s |
| 5 | Zara edits one of her own templates **in the CRM** | Edit lands in Presale agent portal (two-way) |
| 6 | Zara tries to edit Uzair's personal template (via API hack) | Rejected by RLS (403). She literally cannot read it; no row visible |

---

## 5. Open items / coordination checklist for Presale

- [ ] Confirm slug scheme matches what `bridge-get-agent` returns (e.g. `uzair-mohammed`, lowercase, hyphenated)
- [ ] Backfill existing templates: agent-authored → `agent:<slug>`, library → `team:presale`
- [ ] Implement `bridge-receive-template` (section 2.3.C)
- [ ] Update `bridge-list-templates` to accept `{ agent_slug, include_team }` and filter
- [ ] Update push payloads to `bridge-templates-sync` to include `owner_scope` + `owner_agent_slug` + `created_by_agent_slug` + `sync_hash`
- [ ] Fire push on create / update / soft-delete from the agent portal
- [ ] Confirm `BRIDGE_SECRET` shared secret is the same on both sides

Once items 3–7 are green, Zara test runs end-to-end.
