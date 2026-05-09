/* Shared types & helpers for the Lead Detail screen. */
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import type { CrmNote } from '@/hooks/useCrmNotes';

export interface CrmTask {
  id: string;
  contact_id: string;
  title: string;
  status: string;
  priority?: string | null;
  due_date?: string | null;
  completed_at?: string | null;
  assigned_to?: string | null;
  presale_task_id?: string | null;
  claimed_at?: string | null;
  claimed_by?: string | null;
}

export interface CrmShowing {
  id: string;
  project?: string | null;
  unit?: string | null;
  showing_date: string;
  showing_time?: string | null;
  status?: string | null;
  notes?: string | null;
}

export interface CrmMessageRow {
  id: string;
  direction: 'inbound' | 'outbound' | string;
  content?: string | null;
  channel?: string | null;
  created_at: string;
}

export interface LeadScore {
  score: number;
  color: string;
  label: string;
}

/** Bucket a date into Today / Yesterday / formatted date label. */
export function getDateGroup(dateStr: string): string {
  const d = parseISO(dateStr);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'MMMM d, yyyy');
}

/** Effective timestamp for a note: prefer event_at (real activity time)
 *  and fall back to created_at (import time). */
export function noteTime(n: CrmNote): string {
  return n.event_at || n.created_at;
}

/* ─── Type styles (text-only, editorial) ─── */
export const TYPE_LABELS: Record<string, string> = {
  lead: 'LEAD',
  realtor: 'REALTOR',
  past_client: 'CLIENT',
};
