import { supabase } from '@/integrations/supabase/client';
import type { CrmContact } from '@/hooks/useCrmContacts';

const STORAGE_KEY = 'crm_zapier_outbound_url';

export function getOutboundWebhookUrl(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function setOutboundWebhookUrl(url: string) {
  if (url.trim()) {
    localStorage.setItem(STORAGE_KEY, url.trim());
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export async function fireOutboundWebhook(
  event: 'lead.created' | 'lead.updated' | 'lead.status_changed',
  contact: Partial<CrmContact>
) {
  const webhookUrl = getOutboundWebhookUrl();
  if (!webhookUrl) return; // No webhook configured, skip silently

  try {
    await supabase.functions.invoke('crm-outbound-webhook', {
      body: { webhook_url: webhookUrl, event, contact },
    });
  } catch (err) {
    console.warn('Outbound webhook failed:', err);
  }
}
