import type { CrmContact } from '@/hooks/useCrmContacts';

const REQUIRED_FIELDS = ['first_name', 'last_name', 'email', 'phone', 'birthday'] as const;

export function getMissingFields(contact: CrmContact): string[] {
  const missing: string[] = [];
  if (!contact.first_name?.trim()) missing.push('first_name');
  if (!contact.last_name?.trim() || contact.last_name === '—') missing.push('last_name');
  if (!contact.email?.trim()) missing.push('email');
  if (!contact.phone?.trim()) missing.push('phone');
  if (!contact.birthday?.trim()) missing.push('birthday');
  return missing;
}

export function isProfileComplete(contact: CrmContact): boolean {
  return getMissingFields(contact).length === 0;
}

export function formatFieldName(field: string): string {
  return field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function getDataHealthStats(contacts: CrmContact[]) {
  const pastClients = contacts.filter(c => c.contact_type === 'past_client');
  const complete = pastClients.filter(isProfileComplete);
  return {
    total: pastClients.length,
    complete: complete.length,
    incomplete: pastClients.length - complete.length,
    percentage: pastClients.length > 0 ? Math.round((complete.length / pastClients.length) * 100) : 100,
  };
}
