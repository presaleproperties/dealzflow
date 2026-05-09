# Manual Lead Quality Sprint

Three tightly-scoped improvements to fix the biggest daily pain points around manual lead entry.

## 1. AddLeadDialog: required fields

Make these fields required (currently optional or defaulted silently):

- **Lead source** — dropdown sourced from `crm_lead_sources` (canonical list); no free-text. Default unset so the agent must choose. Includes "Manual entry", "Referral", "Walk-in", "Phone-in", "Inbound email", "Inbound SMS", "Other" alongside Presale/Lofty/etc.
- **Assigned agent** — dropdown from `crm_team`; defaults to current user. Owner/admin can pick anyone.
- **Pipeline stage** — dropdown from `useUnifiedPipelines`; defaults to "New / Needs Triage".
- **Contact type** — Buyer / Seller / Investor / Renter / Other (already optional; promote to required).

Validation in zod; submit disabled until valid; inline error messages.

## 2. Duplicate **merge** dialog

Today `crm_find_my_duplicates` warns but the agent has no way to merge — they copy fields by hand and delete. Build:

- **`MergeContactsDialog`** opened from the duplicate-warning step in AddLead and from a "Merge…" action on the lead detail header.
- Side-by-side: winner (kept) vs loser (deleted). Per-field radio: take winner, take loser, or "combine" for multi-value fields (tags, notes, alt emails).
- Server: `crm_merge_contacts(p_winner uuid, p_loser uuid, p_field_choices jsonb)` SECURITY DEFINER RPC that:
  - Reassigns FK rows: `crm_notes`, `crm_email_log`, `crm_sms_log`, `crm_activity_events`, `crm_lead_behavior_*`, `crm_showings`, `crm_tasks`, `crm_email_threads`, `crm_deals`, etc.
  - Unions tags arrays.
  - Writes a "Merged from <name>" note on the winner.
  - Soft-deletes the loser (`deleted_at`) — don't hard-delete in case of mistake.
  - Logs to `crm_source_events` audit table.
- Permission: only agent assigned to either contact, or admin/owner.

## 3. Normalization triggers

Database-level so every entry path benefits (manual, Presale, Lofty, CSV import, edits).

- **Email lowercase trigger** on `crm_contacts.email`, `alt_email`, `spouse_email` — before insert/update.
- **E.164 phone trigger** on `crm_contacts.phone`, `alt_phone`, `spouse_phone` using a small `normalize_phone(text, default_country text default 'CA')` SQL function:
  - Strip non-digits.
  - If 10 digits → prefix `+1`.
  - If 11 digits starting `1` → prefix `+`.
  - If already starts with `+` → keep digits only after `+`.
  - Otherwise leave as-is + log warning (don't block insert).
- One-time backfill migration: lowercase all existing emails, normalize all existing phones, with a guard on duplicates (skip+log if normalization would create a key collision rather than fail the migration).
- Apply same triggers to `crm_sms_log.to_number` / `from_number` so historic SMS stays matchable.

## Technical layout

**Migrations**
1. `normalize_phone(text)` + `lowercase_email_trigger` + `normalize_phone_trigger` on `crm_contacts` and `crm_sms_log`.
2. Backfill existing rows.
3. `crm_merge_contacts(uuid, uuid, jsonb)` RPC + add `deleted_at` column to `crm_contacts` + RLS update to hide soft-deleted.

**Frontend**
- `src/components/crm/leads/AddLeadDialog.tsx` — add required fields, zod schema update, dup-step gets "Merge instead" button.
- `src/components/crm/leads/MergeContactsDialog.tsx` (new) — merge UI.
- `src/hooks/useMergeContacts.ts` (new) — calls RPC, invalidates contact + timeline queries.
- Lead detail header (`src/components/crm/leads/detail/...`) — "Merge…" menu item that opens the dialog with the current contact preselected as winner.

**Out of scope (next sprint)**
- Inbound DLQ, round-robin assignment, log-a-call button, SLA timer, source ROI report.

## Verification

- Manual lead with missing source → submit blocked, inline error shown.
- Add lead with phone `(604) 555-1234` → DB stores `+16045551234`.
- Add lead with email `Foo@Bar.com` → DB stores `foo@bar.com`; second entry of `FOO@bar.com` triggers dup detection.
- Merge two contacts: timeline, emails, SMS, deals all reattach to winner; loser disappears from lists; audit row in `crm_source_events`.
- Backfill migration runs cleanly; row count unchanged; no constraint violations.
