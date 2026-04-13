export const LOFTY_OUTBOUND_WEBHOOK_KEY = 'lofty_outbound_webhook_url';

export function getLoftyOutboundWebhookUrl(): string | null {
  if (typeof window === 'undefined') return null;

  const value = window.localStorage.getItem(LOFTY_OUTBOUND_WEBHOOK_KEY)?.trim();
  return value || null;
}

export function setLoftyOutboundWebhookUrl(url: string): string | null {
  if (typeof window === 'undefined') return null;

  const trimmed = url.trim();

  if (trimmed) {
    window.localStorage.setItem(LOFTY_OUTBOUND_WEBHOOK_KEY, trimmed);
    return trimmed;
  }

  window.localStorage.removeItem(LOFTY_OUTBOUND_WEBHOOK_KEY);
  return null;
}