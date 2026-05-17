-- 1. Add HTML draft columns to Zara suggested replies
ALTER TABLE public.zara_suggested_replies
  ADD COLUMN IF NOT EXISTS draft_html text,
  ADD COLUMN IF NOT EXISTS template_id_used uuid REFERENCES public.crm_email_templates(id) ON DELETE SET NULL;

-- 2. Seed the Project Showcase scaffold template (idempotent on slug)
INSERT INTO public.crm_email_templates (name, slug, subject, body_html, category, source, is_active)
SELECT
  'Project Showcase — Zara Generated',
  'project-showcase-zara',
  'Curated projects for {{first_name}}',
  $html$<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f5f7;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a2e;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:0;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;margin:0 auto;">
      <!-- Header band -->
      <tr><td style="background:#1a1a2e;padding:28px 24px;text-align:center;">
        <div style="color:#ffffff;font-size:13px;letter-spacing:0.22em;font-weight:700;text-transform:uppercase;">The Presale Properties Group</div>
        <div style="color:rgba(255,255,255,0.7);font-size:13px;margin-top:6px;">Curated projects for {{first_name}}</div>
      </td></tr>
      <!-- Intro -->
      <tr><td style="padding:32px 28px 8px 28px;">
        <div style="color:#444;font-size:15px;line-height:1.6;">{{intro_html}}</div>
      </td></tr>
      <!-- Project cards -->
      <tr><td style="padding:8px 20px 16px 20px;">{{cards_html}}</td></tr>
      <!-- Closing -->
      <tr><td style="padding:0 28px 24px 28px;">
        <div style="color:#444;font-size:15px;line-height:1.6;">{{closing_html}}</div>
      </td></tr>
      <!-- Signature -->
      <tr><td style="padding:0 28px 28px 28px;border-top:1px solid #eee;">
        <div style="padding-top:20px;">{{signature_html}}</div>
      </td></tr>
      <!-- Footer band -->
      <tr><td style="background:#0f1018;padding:18px 24px;text-align:center;color:rgba(255,255,255,0.55);font-size:11px;">
        <a href="https://presaleproperties.com" style="color:rgba(255,255,255,0.7);text-decoration:none;">presaleproperties.com</a>
        &nbsp;·&nbsp;
        <a href="{{unsubscribe}}" style="color:rgba(255,255,255,0.55);text-decoration:underline;">unsubscribe</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>$html$,
  'custom',
  'zara',
  true
WHERE NOT EXISTS (SELECT 1 FROM public.crm_email_templates WHERE slug = 'project-showcase-zara');