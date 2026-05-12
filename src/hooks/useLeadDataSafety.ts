/**
 * Phase 1.5 — lead data safety & history hooks.
 *
 * Wraps the SECURITY DEFINER RPCs and edge functions for soft-delete, restore,
 * hard-delete, audit log read, per-lead CSV export, and workspace ZIP export.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

function invalidateLeads(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['crmContacts'] });
  qc.invalidateQueries({ queryKey: ['crm-leads'] });
  qc.invalidateQueries({ queryKey: ['crm-leads-list'] });
  qc.invalidateQueries({ queryKey: ['crm-trash'] });
  qc.invalidateQueries({ queryKey: ['crm-segment-counts'] });
  qc.invalidateQueries({ queryKey: ['crm-audit-log'] });
}

export function useSoftDeleteContacts() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      // Use the with_undo wrapper so the audit row carries a full row snapshot
      // (undo_payload) for admin recovery beyond the 30-day Trash window.
      const { data, error } = await (supabase as any).rpc('crm_soft_delete_contacts_with_undo', { p_ids: ids });
      if (error) throw error;
      return (data as number) ?? 0;
    },
    onSuccess: (count) => {
      toast({
        title: `Deleted ${count} contact${count === 1 ? '' : 's'}.`,
        description: 'Restore from Trash within 30 days.',
      });
      invalidateLeads(qc);
    },
    onError: (err: Error) => toast({ title: 'Could not delete', description: err.message, variant: 'destructive' }),
  });
}

export interface DeleteScope {
  contacts: number;
  notes: number;
  tasks: number;
  emails: number;
  texts: number;
  calls: number;
  showings: number;
  automations: number;
  behavior: number;
  total_related: number;
  display_name: string;
}

export function useDeleteScope(contactIds: string[] | null, enabled = true) {
  const key = contactIds ? [...contactIds].sort().join(',') : 'none';
  return useQuery<DeleteScope>({
    queryKey: ['crm-delete-scope', key],
    enabled: enabled && !!contactIds && contactIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('crm_count_delete_scope', {
        p_contact_ids: contactIds,
      });
      if (error) throw error;
      return data as DeleteScope;
    },
    staleTime: 10_000,
  });
}

export function useRestoreContacts() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { data, error } = await (supabase as any).rpc('crm_restore_contacts', { _ids: ids });
      if (error) throw error;
      return (data as number) ?? 0;
    },
    onSuccess: (count) => {
      toast({ title: 'Restored', description: `${count} lead${count === 1 ? '' : 's'} restored.` });
      invalidateLeads(qc);
    },
    onError: (err: Error) => toast({ title: 'Could not restore', description: err.message, variant: 'destructive' }),
  });
}

export function useHardDeleteContacts() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { data, error } = await (supabase as any).rpc('crm_hard_delete_contacts', { _ids: ids });
      if (error) throw error;
      return (data as number) ?? 0;
    },
    onSuccess: (count) => {
      toast({ title: 'Deleted permanently', description: `${count} lead${count === 1 ? '' : 's'} removed for good.` });
      invalidateLeads(qc);
    },
    onError: (err: Error) => toast({ title: 'Delete failed', description: err.message, variant: 'destructive' }),
  });
}

export interface TrashedLead {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  assigned_to: string | null;
  deleted_at: string;
  deleted_by: string | null;
}

export function useTrashedLeads() {
  return useQuery<TrashedLead[]>({
    queryKey: ['crm-trash'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('crm_contacts')
        .select('id, first_name, last_name, email, phone, assigned_to, deleted_at, deleted_by')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as TrashedLead[];
    },
    staleTime: 30_000,
  });
}

export interface CrmAuditRow {
  id: string;
  occurred_at: string;
  actor_id: string | null;
  actor_label: string | null;
  action: string;
  table_name: string;
  record_id: string | null;
  changed_fields: string[] | null;
  affected_count: number | null;
  bulk_job_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  filter_snapshot: Record<string, unknown> | null;
  meta: Record<string, unknown> | null;
}

export function useCrmAuditLog(opts: { recordId?: string; limit?: number } = {}) {
  const { recordId, limit = 200 } = opts;
  return useQuery<CrmAuditRow[]>({
    queryKey: ['crm-audit-log', recordId ?? 'all', limit],
    queryFn: async () => {
      let q = (supabase as any).from('crm_audit_log').select('*').order('occurred_at', { ascending: false }).limit(limit);
      if (recordId) q = q.eq('record_id', recordId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as CrmAuditRow[];
    },
    staleTime: 15_000,
  });
}

export function useExportLead() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (contactId: string) => {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const url = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/crm-export-lead`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ contact_id: contactId }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Export failed (${res.status}): ${txt}`);
      }
      const blob = await res.blob();
      const dispo = res.headers.get('Content-Disposition') ?? '';
      const m = /filename="([^"]+)"/.exec(dispo);
      const filename = m?.[1] || `lead-${contactId.slice(0, 8)}.csv`;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      return filename;
    },
    onSuccess: (filename) => toast({ title: 'Export ready', description: `Downloaded ${filename}` }),
    onError: (err: Error) => toast({ title: 'Export failed', description: err.message, variant: 'destructive' }),
  });
}

export function useExportWorkspace() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('crm-export-workspace', { body: {} });
      if (error) throw error;
      return data as { ok: boolean; url: string | null; contacts: number; size_bytes: number };
    },
    onSuccess: (res) => {
      toast({
        title: 'Workspace export ready',
        description: `${res.contacts} leads · ${(res.size_bytes / 1024 / 1024).toFixed(1)} MB. Link valid 7 days.`,
      });
    },
    onError: (err: Error) => toast({ title: 'Export failed', description: err.message, variant: 'destructive' }),
  });
}
