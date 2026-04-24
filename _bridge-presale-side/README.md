# Presale Properties — Bridge Edge Functions (DEPLOY TO OTHER PROJECT)

These two files must be added to your **Presale Properties** project so the Dealzflow CRM can read templates and send emails through Presale's existing Gmail SMTP pipeline.

## How to deploy

1. Open the **Presale Properties** project in Lovable.
2. Ask Lovable: *"Add these two edge functions to my project"* and paste the contents of:
   - `bridge-list-templates.ts` → create `supabase/functions/bridge-list-templates/index.ts`
   - `bridge-send-email.ts` → create `supabase/functions/bridge-send-email/index.ts`
3. The `BRIDGE_SECRET` is already added to the Presale project (you confirmed this).
4. Lovable will deploy them automatically — no extra config needed.

That's it. The CRM's `bridge-templates` and `bridge-send-email` functions on this side will start working as soon as those two are live on Presale.

## What they do

- `bridge-list-templates` — returns all rows from `campaign_templates` so the CRM can show them in its template picker (gated by `x-bridge-secret` header).
- `bridge-send-email` — accepts `{ to, cc, bcc, subject, html, template_id?, source }`, sends via the existing `gmail-smtp.ts` shared module from `info@presaleproperties.com`, logs to `email_logs` with `template_type='crm_bridge'` for unified analytics.
