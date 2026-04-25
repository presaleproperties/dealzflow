import type { CrmContact } from '@/hooks/useCrmContacts';
import type { MessagingChannel, SmsLogRow } from '@/hooks/useSms';
import { format, isToday, isYesterday } from 'date-fns';

export interface Thread {
  key: string;
  phone: string;
  contact: CrmContact | undefined;
  messages: SmsLogRow[];
  lastInbound: SmsLogRow | null;
  lastMessage: SmsLogRow;
  unread: boolean;
  channel: MessagingChannel;
}

export interface QuotedRef {
  id: string;
  body: string;
  direction: 'inbound' | 'outbound';
}

export const REACTION_EMOJIS = ['❤️', '👍', '👎', '😂', '‼️', '❓'];

export const normalize = (p: string) => (p || '').replace(/\D/g, '').slice(-10);

export function initialsFor(c: CrmContact | undefined, phone: string) {
  if (c) {
    const a = (c.first_name || '').trim()[0] || '';
    const b = (c.last_name || '').trim()[0] || '';
    if (a || b) return (a + b).toUpperCase();
  }
  return phone.replace(/\D/g, '').slice(-2);
}

export function nameFor(c: CrmContact | undefined, phone: string) {
  if (c) {
    const n = `${c.first_name || ''} ${c.last_name || ''}`.trim();
    if (n) return n;
  }
  return phone;
}

export function formatThreadTime(d: Date) {
  if (isToday(d)) return format(d, 'h:mm a');
  if (isYesterday(d)) return 'Yesterday';
  const days = (Date.now() - d.getTime()) / 86400000;
  if (days < 7) return format(d, 'EEE');
  return format(d, 'M/d/yy');
}

/** Strip the leading `↪ "..."\n` quote marker we prepend on send. */
export function parseQuoted(body: string | null | undefined): { quote: string | null; text: string } {
  if (!body) return { quote: null, text: '' };
  const m = body.match(/^↪ "([^"]+)"\n([\s\S]*)$/);
  if (m) return { quote: m[1], text: m[2] };
  return { quote: null, text: body };
}
