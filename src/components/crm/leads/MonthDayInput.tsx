import * as React from 'react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** Days per month using a non-leap year baseline (Feb=29 to be permissive). */
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Parse any of: "MM-DD", "--MM-DD" (ISO partial), "YYYY-MM-DD", or empty/null.
 * Returns { month, day } as 1-indexed numbers, or nulls.
 */
export function parseMonthDay(value: string | null | undefined): { month: number | null; day: number | null } {
  if (!value) return { month: null, day: null };
  const s = value.trim();
  // ISO date YYYY-MM-DD
  let m = s.match(/^\d{4}-(\d{2})-(\d{2})$/);
  if (m) return { month: +m[1], day: +m[2] };
  // ISO partial --MM-DD
  m = s.match(/^--(\d{2})-(\d{2})$/);
  if (m) return { month: +m[1], day: +m[2] };
  // MM-DD or M-D
  m = s.match(/^(\d{1,2})-(\d{1,2})$/);
  if (m) return { month: +m[1], day: +m[2] };
  // MM/DD
  m = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m) return { month: +m[1], day: +m[2] };
  return { month: null, day: null };
}

/** Format MM-DD storage value as e.g. "Aug 15" for display. Returns '' if unparseable. */
export function formatMonthDay(value: string | null | undefined): string {
  const { month, day } = parseMonthDay(value);
  if (!month || !day) return '';
  return `${SHORT_MONTHS[month - 1]} ${day}`;
}

/** Build the canonical storage value: zero-padded "MM-DD". */
function toStorage(month: number | null, day: number | null): string {
  if (!month || !day) return '';
  return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

interface Props {
  value: string | null | undefined;
  onChange: (value: string) => void;
  className?: string;
}

/**
 * Apple-style Month + Day picker (no year). Two segmented dropdowns.
 * Outputs MM-DD (e.g. "08-15"). Reads MM-DD, --MM-DD, or YYYY-MM-DD.
 */
export function MonthDayInput({ value, onChange, className }: Props) {
  const { month, day } = parseMonthDay(value);
  const maxDay = month ? DAYS_IN_MONTH[month - 1] : 31;

  const setMonth = (mStr: string) => {
    const m = +mStr;
    // Clamp day if it overflows the new month.
    const newMax = DAYS_IN_MONTH[m - 1];
    const clampedDay = day && day > newMax ? newMax : day;
    onChange(toStorage(m, clampedDay));
  };

  const setDay = (dStr: string) => {
    const d = +dStr;
    onChange(toStorage(month, d));
  };

  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      <Select value={month ? String(month) : ''} onValueChange={setMonth}>
        <SelectTrigger className="h-12 flex-1 bg-muted/40 border-border/40 text-[16px]">
          <SelectValue placeholder="Month" />
        </SelectTrigger>
        <SelectContent className="max-h-[320px]">
          {MONTHS.map((name, i) => (
            <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={day ? String(day) : ''} onValueChange={setDay} disabled={!month}>
        <SelectTrigger className="h-12 w-[110px] bg-muted/40 border-border/40 text-[16px]">
          <SelectValue placeholder="Day" />
        </SelectTrigger>
        <SelectContent className="max-h-[320px]">
          {Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => (
            <SelectItem key={d} value={String(d)}>{d}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
