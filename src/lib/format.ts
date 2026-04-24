import { format, parseISO, isValid } from 'date-fns';

export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '$0.00';
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
}).format(amount);
}

export function formatCurrencyCompact(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '$0';
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 100_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return formatCurrency(amount);
}

export function formatCurrencyFull(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '$0.00';
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '—';
  try {
    const date = parseISO(dateString);
    if (!isValid(date)) return '—';
    return format(date, 'MMM d, yyyy');
  } catch {
    return '—';
  }
}

export function formatDateShort(dateString: string | null | undefined): string {
  if (!dateString) return '—';
  try {
    const date = parseISO(dateString);
    if (!isValid(date)) return '—';
    return format(date, 'MMM d');
  } catch {
    return '—';
  }
}

export function formatMonth(monthString: string): string {
  try {
    const date = parseISO(`${monthString}-01`);
    if (!isValid(date)) return monthString;
    return format(date, 'MMMM yyyy');
  } catch {
    return monthString;
  }
}

export function getCurrentMonth(): string {
  return format(new Date(), 'yyyy-MM');
}

export function getMonthRange(startOffset: number, count: number): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = startOffset; i < startOffset + count; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
    months.push(format(date, 'yyyy-MM'));
  }
  return months;
}

// Get months from a specific year start to end
export function getYearMonths(year: number): string[] {
  const months: string[] = [];
  for (let month = 0; month < 12; month++) {
    const date = new Date(year, month, 1);
    months.push(format(date, 'yyyy-MM'));
  }
  return months;
}

// Get months from Jan 2023 through end of projection period
export function getExtendedMonthRange(projectionMonths: number = 24): string[] {
  const months: string[] = [];
  const now = new Date();
  
  // Start from Jan 2023 to capture all historical transaction data
  const startDate = new Date(2023, 0, 1);
  // End at current month + projection months
  const endDate = new Date(now.getFullYear(), now.getMonth() + projectionMonths, 1);
  
  let current = startDate;
  while (current <= endDate) {
    months.push(format(current, 'yyyy-MM'));
    current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
  }
  
  return months;
}

/** Format a phone number to a friendly North-American style: (604) 555-1234 or +1 (604) 555-1234 */
export function formatPhone(phone?: string | null): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  // Fallback: return original (handles intl numbers, extensions, etc.)
  return phone.trim();
}

/** Lowercase + trim an email for consistent display */
export function formatEmail(email?: string | null): string {
  if (!email) return '';
  return email.trim().toLowerCase();
}

/** Coerce any value to a safe trimmed string (handles numbers, null, undefined, objects). */
function toSafeString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  // Avoid "[object Object]" — unknown shapes return empty
  return '';
}

/** Format a contact name, hiding empty/placeholder last names. Safe against non-string inputs. */
export function formatContactName(firstName?: unknown, lastName?: unknown): string {
  const f = toSafeString(firstName);
  const l = toSafeString(lastName);
  const isEmptyLast = !l || l === '—' || l === '-' || l.toLowerCase() === 'unknown';
  const isEmptyFirst = !f || f.toLowerCase() === 'unknown';
  if (isEmptyFirst && isEmptyLast) return 'Unnamed';
  if (isEmptyLast) return f;
  if (isEmptyFirst) return l;
  return `${f} ${l}`;
}

/** Get initials for avatar, handling empty last names. Safe against non-string inputs. */
export function getContactInitials(firstName?: unknown, lastName?: unknown): string {
  const f = toSafeString(firstName);
  const l = toSafeString(lastName);
  const isEmptyLast = !l || l === '—' || l === '-' || l.toLowerCase() === 'unknown';
  if (!f && isEmptyLast) return '?';
  if (isEmptyLast) return f.charAt(0).toUpperCase();
  return `${f.charAt(0)}${l.charAt(0)}`.toUpperCase();
}

