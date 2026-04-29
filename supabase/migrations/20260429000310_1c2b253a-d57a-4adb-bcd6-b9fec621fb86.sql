UPDATE public.crm_email_templates
SET body_html = regexp_replace(body_html, '\{\{\s*lead_name\s*\}\}', '{{first_name}}', 'g'),
    subject   = regexp_replace(subject,   '\{\{\s*lead_name\s*\}\}', '{{first_name}}', 'g')
WHERE body_html ~ '\{\{\s*lead_name\s*\}\}'
   OR subject   ~ '\{\{\s*lead_name\s*\}\}';