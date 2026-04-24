import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface CrmNote {
  id: string;
  contact_id: string;
  user_id: string;
  content: string;
  note_type: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  event_at?: string | null;
}

export function useLeadNotes(contactId: string | undefined) {
  return useQuery({
    queryKey: ['crm-notes', contactId],
    queryFn: async () => {
      if (!contactId) return [];
      const { data, error } = await (supabase.from('crm_notes' as any) as any)
        .select('*')
        .eq('contact_id', contactId)
        .neq('note_type', 'import_archive')
        .order('is_pinned', { ascending: false })
        .order('event_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      // Sort client-side using effective timestamp (event_at falls back to created_at)
      // so imported notes (whose created_at is the import date) appear in true chronological order.
      const list = (data ?? []) as CrmNote[];
      const ts = (n: CrmNote) => new Date(n.event_at || n.created_at).getTime();
      return [...list].sort((a, b) => {
        if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
        return ts(b) - ts(a);
      });
    },
    enabled: !!contactId,
  });
}

export function useAddNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (note: {
      contact_id: string;
      content: string;
      note_type?: string;
      is_pinned?: boolean;
    }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const { error } = await (supabase.from('crm_notes' as any) as any).insert({
        contact_id: note.contact_id,
        user_id: session.user.id,
        content: note.content,
        note_type: note.note_type || 'manual',
        is_pinned: note.is_pinned || false,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['crm-notes', vars.contact_id] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, contactId, updates }: {
      id: string;
      contactId: string;
      updates: { content?: string; is_pinned?: boolean };
    }) => {
      const { error } = await (supabase.from('crm_notes' as any) as any)
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['crm-notes', vars.contactId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, contactId }: { id: string; contactId: string }) => {
      const { error } = await (supabase.from('crm_notes' as any) as any)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['crm-notes', vars.contactId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

/** Helper to add a system note (e.g. stage change, email sent) */
export function useAddSystemNote() {
  const addNote = useAddNote();
  return {
    addSystemNote: (contactId: string, content: string) => {
      addNote.mutate({
        contact_id: contactId,
        content,
        note_type: 'system',
      });
    },
  };
}
