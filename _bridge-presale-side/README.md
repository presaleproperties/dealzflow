# Bridge — Presale Properties side

These files belong on the **Presale Properties** project, not on the CRM.
Open Presale Properties in Lovable and ask:

> "Add these two edge functions and paste this code: `bridge-list-templates`, `bridge-send-email`, `push-lead-to-crm`, `sync-templates-with-crm`."

## Files

- `bridge-list-templates.ts` — exposes Presale's templates so CRM can read them live.
- `bridge-send-email.ts` — lets CRM send emails through Presale's Gmail SMTP.
- `push-lead-to-crm.ts` — call this from any Presale signup / behavior tracker. Sends the lead + behavior data into CRM (deduped & merged).
- `sync-templates-with-crm.ts` — two-way template sync. Run via pg_cron every few minutes or on-demand after editing.

## Required secret (already added)

`BRIDGE_SECRET` — must match the value in CRM. ✅

## Required table column on Presale templates

Add `crm_id` (text, nullable, unique) and `source` (text, default 'presale') and `sync_hash` (text) and `last_synced_at` (timestamptz) to the Presale templates table to support two-way sync.

## Behavior payload shape (what to post to push-lead-to-crm)

```json
{
  "lead": {
    "email": "buyer@example.com",
    "first_name": "Jane",
    "last_name": "Doe",
    "phone": "+16041234567",
    "source": "presale-website",
    "project": "The Pinnacle",
    "presale_user_id": "psu_123",
    "tags": ["downtown", "2br"]
  },
  "behavior": {
    "views": [{ "property_id": "p1", "property_name": "Unit 502", "action": "view" }],
    "engagement": [{ "event_type": "email_open", "campaign_name": "May newsletter" }],
    "forms": [{ "form_type": "brochure_download", "property_name": "The Pinnacle" }],
    "sessions": [{ "pages_viewed": 7, "duration_seconds": 320, "utm_source": "facebook" }]
  }
}
```
