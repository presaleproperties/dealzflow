/**
 * Per-thread composer drafts.
 *
 * One draft per (user_id, contact_id, channel). Reads on mount, autosaves
 * with 800ms debounce, clears on send. RLS scopes everything to auth.uid()
 * so an agent never sees another agent's drafts.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type DraftChannel = 'sms' | 'whatsapp' | 'email';

export interface ThreadDraft {
  body: string;
  quote: string | null;
  media: { url: string; name: string }[];
  subject: string | null;
  scheduled_for: string | null;
  updated_at: string;
}

const EMPTY: ThreadDraft = {
  body: '', quote: null, media: [], subject: null, scheduled_for: null, updated_at: '',
};

const KEY = (uid: string | undefined, contactId: string | undefined, channel: DraftChannel) =>
  ['crm-thread-draft', uid ?? 'anon', contactId ?? 'none', channel];

export function useThreadDraft(contactId: string | undefined, channel: DraftChannel) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const queryKey = KEY(user?.id, contactId, channel);

  const query = useQuery({
    queryKey,
    enabled: !!user?.id && !!contactId,
    staleTime: 30_000,
    queryFn: async (): Promise<ThreadDraft | null> => {
      if (!user?.id || !contactId) return null;
      const { data, error } = await supabase
        .from('crm_thread_drafts')
        .select('body, quote, media, subject, scheduled_for, updated_at')
        .eq('user_id', user.id)
        .eq('contact_id', contactId)
        .eq('channel', channel)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        body: data.body ?? '',
        quote: data.quote ?? null,
        media: Array.isArray(data.media) ? (data.media as any) : [],
        subject: data.subject ?? null,
        scheduled_for: data.scheduled_for ?? null,
        updated_at: data.updated_at,
      };
    },
  });

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSnapshot = useRef<string>('');

  const save = useCallback(async (patch: Partial<ThreadDraft>) => {
    if (!user?.id || !contactId) return;
    const merged = { ...(query.data ?? EMPTY), ...patch };
    const isEmpty = !merged.body.trim() && (!merged.media || merged.media.length === 0);
    if (isEmpty) {
      await supabase
        .from('crm_thread_drafts')
        .delete()
        .eq('user_id', user.id)
        .eq('contact_id', contactId)
        .eq('channel', channel);
      qc.setQueryData(queryKey, null);
      return;
    }
    const { data, error } = await supabase
      .from('crm_thread_drafts')
      .upsert(
        {
          user_id: user.id,
          contact_id: contactId,
          channel,
          body: merged.body,
          quote: merged.quote,
          media: merged.media as any,
          subject: merged.subject,
          scheduled_for: merged.scheduled_for,
        },
        { onConflict: 'user_id,contact_id,channel' },
      )
      .select('body, quote, media, subject, scheduled_for, updated_at')
      .single();
    if (error) return;
    qc.setQueryData(queryKey, {
      body: data.body ?? '',
      quote: data.quote ?? null,
      media: Array.isArray(data.media) ? (data.media as any) : [],
      subject: data.subject ?? null,
      scheduled_for: data.scheduled_for ?? null,
      updated_at: data.updated_at,
    });
  }, [channel, contactId, qc, query.data, queryKey, user?.id]);

  /** Schedule a debounced save (800ms). */
  const queueSave = useCallback((patch: Partial<ThreadDraft>) => {
    const snap = JSON.stringify(patch);
    if (snap === lastSnapshot.current) return;
    lastSnapshot.current = snap;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void save(patch); }, 800);
  }, [save]);

  /** Wipe the draft (call after a successful send). */
  const clear = useCallback(async () => {
    if (!user?.id || !contactId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    lastSnapshot.current = '';
    await supabase
      .from('crm_thread_drafts')
      .delete()
      .eq('user_id', user.id)
      .eq('contact_id', contactId)
      .eq('channel', channel);
    qc.setQueryData(queryKey, null);
  }, [channel, contactId, qc, queryKey, user?.id]);

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  return useMemo(() => ({
    draft: query.data ?? null,
    isLoading: query.isLoading,
    queueSave,
    save,
    clear,
  }), [query.data, query.isLoading, queueSave, save, clear]);
}

/** Lightweight hook for the inbox row — returns whether a draft exists for any channel. */
export function useHasDraftForContact(contactId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['crm-thread-draft-exists', user?.id ?? 'anon', contactId ?? 'none'],
    enabled: !!user?.id && !!contactId,
    staleTime: 60_000,
    queryFn: async (): Promise<boolean> => {
      if (!user?.id || !contactId) return false;
      const { data, error } = await supabase
        .from('crm_thread_drafts')
        .select('id')
        .eq('user_id', user.id)
        .eq('contact_id', contactId)
        .limit(1);
      if (error) return false;
      return (data?.length ?? 0) > 0;
    },
  });
}

/** Quick-access list of all my drafts (for a future drafts view). */
export function useMyDrafts() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['crm-thread-drafts-mine', user?.id ?? 'anon'],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('crm_thread_drafts')
        .select('contact_id, channel, body, updated_at')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

const _unused = useState; // keep useState in scope for tree-shake friendliness
