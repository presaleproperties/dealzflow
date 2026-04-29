---
name: Team identity & inbox onboarding
description: Owner + 3 agents are normalized to @presaleproperties.com Workspace emails; new "inbox" onboarding step one-click connects Gmail with login_hint pre-filled
type: feature
---

## Canonical team identities (crm_team.email = auth login email)

| Role  | Name           | Email                          | Notes                                    |
|-------|----------------|--------------------------------|------------------------------------------|
| owner | Uzair Muhammad | info@presaleproperties.com     | Was muzair93@hotmail.com — same user_id  |
| agent | Sarb Grewal    | sarb@presaleproperties.com     | Pre-seeded, links on first login         |
| agent | Ravish Passy   | ravish@presaleproperties.com   | Was realestatewithravish@gmail.com       |
| agent | Zara Malik     | admin@presaleproperties.com    | Already linked                           |

**Rule**: `crm_team.email` is the source of truth. The whole app reads from it. Never hard-code agent emails in `.tsx` files. When a new agent first logs in with their Workspace email, the existing `link_team_email` flow auto-binds `crm_team.user_id`.

## Owner email-change procedure (do not regress)

To change an owner/agent auth email:
1. Migration: `UPDATE auth.users SET email = '...', email_confirmed_at = COALESCE(email_confirmed_at, now()) WHERE id = '<user_id>'`
2. Mirror into `crm_team.email` for the same row
3. User must sign in with the **new** email. If they previously used Google sign-in with a different Google account, they must use Google sign-in with the Workspace account that owns the new email (Workspace Admin must have the user). Same `user_id` → all data preserved.

## "Connect inbox" onboarding step

- New step key: `'inbox'` (added to `OnboardingStepKey` in `src/hooks/useProfile.tsx`, inserted between `google` and `signature` in `CORE_STEPS`).
- Component: `src/components/onboarding/steps/StepConnectInbox.tsx`.
- Calls `gmail-auth` edge fn with `action: 'get_auth_url'` and **`loginHint: user.email`** so Google skips the account picker — agent clicks once and lands on consent screen.
- After OAuth callback (`?gmail_auth=success`), refreshes status and shows green "Inbox connected" pill with the bound mailbox.
- Skippable (deferrable to Settings → Email) but visually distinct from the optional `google` step which only handles Calendar.
