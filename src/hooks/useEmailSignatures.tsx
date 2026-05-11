import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type EmailSignatureKind = 'full' | 'reply';

export type EmailSignature = {
  id: string;
  user_id: string;
  name: string;
  html: string;
  is_default: boolean;
  sort_order: number;
  kind: EmailSignatureKind;
  created_at: string;
  updated_at: string;
};

export function useEmailSignatures() {
  return useQuery({
    queryKey: ['crm-email-signatures'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return [] as EmailSignature[];
      const { data, error } = await (supabase.from('crm_email_signatures' as any) as any)
        .select('*')
        .eq('user_id', session.user.id)
        .order('is_default', { ascending: false })
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as EmailSignature[];
    },
    staleTime: 60_000,
  });
}

type UpsertPayload = {
  id?: string;
  name: string;
  html: string;
  is_default?: boolean;
  sort_order?: number;
  kind?: EmailSignatureKind;
};

export function useUpsertEmailSignature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: UpsertPayload) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const row = {
        ...payload,
        user_id: session.user.id,
      };
      const { error } = await (supabase.from('crm_email_signatures' as any) as any).upsert(row);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-email-signatures'] });
      toast.success('Signature saved');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteEmailSignature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from('crm_email_signatures' as any) as any)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-email-signatures'] });
      toast.success('Signature deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useSetDefaultSignature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      // Look up the row's kind so we only clear other defaults of the same
      // kind. Full vs reply defaults are independent.
      const { data: row, error: fetchErr } = await (supabase.from('crm_email_signatures' as any) as any)
        .select('kind')
        .eq('id', id)
        .maybeSingle();
      if (fetchErr) throw fetchErr;
      const kind = (row?.kind as EmailSignatureKind | undefined) ?? 'full';
      const { error: clearErr } = await (supabase.from('crm_email_signatures' as any) as any)
        .update({ is_default: false })
        .eq('user_id', session.user.id)
        .eq('kind', kind)
        .eq('is_default', true);
      if (clearErr) throw clearErr;
      const { error } = await (supabase.from('crm_email_signatures' as any) as any)
        .update({ is_default: true })
        .eq('id', id)
        .eq('user_id', session.user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-email-signatures'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

/**
 * Resolve the signature HTML to use for a given send context.
 * `kind: 'reply'` returns the agent's reply-only signature (or falls back to
 * the full default if they haven't set one yet — never returns the empty
 * string when a full one exists).
 */
export function pickSignatureForKind(
  signatures: EmailSignature[],
  kind: EmailSignatureKind,
): EmailSignature | null {
  const ofKind = signatures.filter((s) => (s.kind ?? 'full') === kind);
  const def = ofKind.find((s) => s.is_default) ?? ofKind[0];
  if (def) return def;
  if (kind === 'reply') {
    // Fallback: full default. Better than no signature at all.
    const full = signatures.filter((s) => (s.kind ?? 'full') === 'full');
    return full.find((s) => s.is_default) ?? full[0] ?? null;
  }
  return null;
}
