// Templates 2.0 organization hooks: folders, tags, favorites, stats.
// Folders + tags are team-shared; favorites are per-agent.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export type TemplateKind = 'email' | 'sms';

export interface TemplateFolder {
  id: string;
  name: string;
  color: string | null;
  channel: 'email' | 'sms' | 'both';
  sort_order: number;
  created_by: string | null;
  created_at: string;
}

export interface TemplateTag {
  id: string;
  label: string;
  color: string | null;
  created_by: string | null;
}

export interface TemplateFolderItem {
  folder_id: string;
  template_id: string;
  template_kind: TemplateKind;
}

export interface TemplateTagItem {
  tag_id: string;
  template_id: string;
  template_kind: TemplateKind;
}

export interface TemplateFavoriteRow {
  template_id: string;
  template_kind: TemplateKind;
}

export interface TemplateStatsRow {
  template_kind: TemplateKind;
  template_id: string;
  total_sends: number;
  last_sent_at: string | null;
  total_opens: number;
  total_clicks: number;
  total_replies: number;
  sparkline_30d: Array<[string, number]>;
}

// ---------------------------------------------------------------- Folders
export function useTemplateFolders() {
  return useQuery({
    queryKey: ['crm', 'template-folders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_template_folders')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as TemplateFolder[];
    },
    staleTime: 60_000,
  });
}

export function useTemplateFolderItems() {
  return useQuery({
    queryKey: ['crm', 'template-folder-items'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_template_folder_items')
        .select('folder_id, template_id, template_kind');
      if (error) throw error;
      return (data ?? []) as TemplateFolderItem[];
    },
    staleTime: 30_000,
  });
}

export function useCreateFolder() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { name: string; color?: string | null; channel?: 'email' | 'sms' | 'both' }) => {
      const { data, error } = await supabase
        .from('crm_template_folders')
        .insert({
          name: input.name.trim(),
          color: input.color ?? null,
          channel: input.channel ?? 'both',
          created_by: user?.id ?? null,
        })
        .select('*')
        .single();
      if (error) throw error;
      return data as TemplateFolder;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'template-folders'] });
      toast.success('Folder created');
    },
    onError: (e: any) => toast.error(e?.message || 'Could not create folder'),
  });
}

export function useDeleteFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('crm_template_folders').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'template-folders'] });
      qc.invalidateQueries({ queryKey: ['crm', 'template-folder-items'] });
      toast.success('Folder removed');
    },
    onError: (e: any) => toast.error(e?.message || 'Could not delete folder'),
  });
}

export function useRenameFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from('crm_template_folders').update({ name }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm', 'template-folders'] }),
    onError: (e: any) => toast.error(e?.message || 'Could not rename folder'),
  });
}

export function useAddTemplateToFolder() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { folderId: string; templateId: string; kind: TemplateKind }) => {
      const { error } = await supabase.from('crm_template_folder_items').insert({
        folder_id: input.folderId,
        template_id: input.templateId,
        template_kind: input.kind,
        added_by: user?.id ?? null,
      });
      if (error && error.code !== '23505') throw error; // ignore duplicate
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm', 'template-folder-items'] }),
    onError: (e: any) => toast.error(e?.message || 'Could not add to folder'),
  });
}

export function useRemoveTemplateFromFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { folderId: string; templateId: string; kind: TemplateKind }) => {
      const { error } = await supabase
        .from('crm_template_folder_items')
        .delete()
        .eq('folder_id', input.folderId)
        .eq('template_id', input.templateId)
        .eq('template_kind', input.kind);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm', 'template-folder-items'] }),
  });
}

// ---------------------------------------------------------------- Tags
export function useTemplateTags() {
  return useQuery({
    queryKey: ['crm', 'template-tags'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_template_tags')
        .select('*')
        .order('label', { ascending: true });
      if (error) throw error;
      return (data ?? []) as TemplateTag[];
    },
    staleTime: 60_000,
  });
}

export function useTemplateTagItems() {
  return useQuery({
    queryKey: ['crm', 'template-tag-items'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_template_tag_items')
        .select('tag_id, template_id, template_kind');
      if (error) throw error;
      return (data ?? []) as TemplateTagItem[];
    },
    staleTime: 30_000,
  });
}

export function useCreateTag() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { label: string; color?: string | null }) => {
      const { data, error } = await supabase
        .from('crm_template_tags')
        .insert({
          label: input.label.trim(),
          color: input.color ?? null,
          created_by: user?.id ?? null,
        })
        .select('*')
        .single();
      if (error) throw error;
      return data as TemplateTag;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'template-tags'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Could not create tag'),
  });
}

export function useToggleTagOnTemplate() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { tagId: string; templateId: string; kind: TemplateKind; on: boolean }) => {
      if (input.on) {
        const { error } = await supabase.from('crm_template_tag_items').insert({
          tag_id: input.tagId,
          template_id: input.templateId,
          template_kind: input.kind,
          added_by: user?.id ?? null,
        });
        if (error && error.code !== '23505') throw error;
      } else {
        const { error } = await supabase
          .from('crm_template_tag_items')
          .delete()
          .eq('tag_id', input.tagId)
          .eq('template_id', input.templateId)
          .eq('template_kind', input.kind);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm', 'template-tag-items'] }),
  });
}

// ---------------------------------------------------------------- Favorites
export function useTemplateFavorites() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['crm', 'template-favorites', user?.id ?? 'anon'],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_template_favorites')
        .select('template_id, template_kind')
        .eq('user_id', user!.id);
      if (error) throw error;
      return (data ?? []) as TemplateFavoriteRow[];
    },
    staleTime: 30_000,
  });
}

export function useToggleFavoriteV2() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { templateId: string; kind: TemplateKind; on: boolean }) => {
      if (!user?.id) throw new Error('Not signed in');
      if (input.on) {
        const { error } = await supabase.from('crm_template_favorites').insert({
          user_id: user.id,
          template_id: input.templateId,
          template_kind: input.kind,
        });
        if (error && error.code !== '23505') throw error;
      } else {
        const { error } = await supabase
          .from('crm_template_favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('template_id', input.templateId)
          .eq('template_kind', input.kind);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm', 'template-favorites'] }),
    onError: (e: any) => toast.error(e?.message || 'Could not update favorite'),
  });
}

// ---------------------------------------------------------------- Stats
export function useTemplateStats() {
  return useQuery({
    queryKey: ['crm', 'template-stats'],
    queryFn: async () => {
      const { data, error } = await supabase.from('crm_template_stats').select('*');
      if (error) throw error;
      return (data ?? []) as TemplateStatsRow[];
    },
    staleTime: 60_000,
  });
}

export function useTemplateStatsMap() {
  const { data: rows = [], isLoading } = useTemplateStats();
  const map = useMemo(() => {
    const m = new Map<string, TemplateStatsRow>();
    for (const r of rows) m.set(`${r.template_kind}:${r.template_id}`, r);
    return m;
  }, [rows]);
  return { map, isLoading };
}

// ---------------------------------------------------------------- Recents (local)
const RECENT_KEY = 'crm:templates-v2:recent';
const RECENT_MAX = 10;

export function readRecentTemplates(): Array<{ id: string; kind: TemplateKind }> {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((x: any) => x?.id && (x.kind === 'email' || x.kind === 'sms')).slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

export function pushRecentTemplate(entry: { id: string; kind: TemplateKind }) {
  try {
    const cur = readRecentTemplates().filter((x) => !(x.id === entry.id && x.kind === entry.kind));
    const next = [entry, ...cur].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('crm:templates-v2:recents-changed'));
  } catch {}
}

export function useRecentTemplates() {
  // Read on mount and whenever a custom event fires.
  const { data } = useQuery({
    queryKey: ['crm', 'template-recents'],
    queryFn: async () => readRecentTemplates(),
    staleTime: 0,
  });
  return data ?? [];
}
