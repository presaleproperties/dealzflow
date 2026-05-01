import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { usePresaleAgentStore } from '@/stores/usePresaleAgent';

export type EmailTemplate = {
  id: string;
  name: string;
  subject: string | null;
  preview_text: string | null;
  html_content: string;
  category: string;
  project_tags: string[];
  area_tags: string[];
  source: string;
  thumbnail_url: string | null;
  is_active: boolean;
  is_favorite: boolean;
  times_used: number;
  last_used_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  synced_at: string;
  // New ownership fields exposed for badges in the UI
  owner_scope?: string;
  owner_agent_slug?: string | null;
  created_by_agent_slug?: string | null;
};

type CrmRow = {
  id: string;
  name: string;
  subject: string | null;
  body_html: string | null;
  preview_text: string | null;
  project: string | null;
  category: string | null;
  merge_tags: string[] | null;
  source: string | null;
  is_active: boolean;
  is_favorite: boolean;
  times_used: number | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
  last_synced_at: string | null;
  owner_scope: string;
  owner_agent_slug: string | null;
  created_by_agent_slug: string | null;
};

function rowToTemplate(r: CrmRow): EmailTemplate {
  return {
    id: r.id,
    name: r.name,
    subject: r.subject,
    preview_text: r.preview_text,
    html_content: r.body_html ?? '',
    category: r.category ?? 'general',
    project_tags: r.project ? [r.project] : [],
    area_tags: [],
    source: r.source ?? 'dealflow',
    thumbnail_url: null,
    is_active: r.is_active,
    is_favorite: r.is_favorite,
    times_used: r.times_used ?? 0,
    last_used_at: r.last_used_at,
    created_by: r.created_by_agent_slug,
    created_at: r.created_at,
    updated_at: r.updated_at,
    synced_at: r.last_synced_at ?? r.updated_at,
    owner_scope: r.owner_scope,
    owner_agent_slug: r.owner_agent_slug,
    created_by_agent_slug: r.created_by_agent_slug,
  };
}

function useMyAgentSlug(): string | null {
  const agent = usePresaleAgentStore((s) => s.agent);
  return agent?.slug ?? null;
}

export function useEmailTemplates() {
  return useQuery({
    queryKey: ['email-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_email_templates')
        .select(
          'id, name, subject, body_html, preview_text, project, category, merge_tags, source, is_active, is_favorite, times_used, last_used_at, created_at, updated_at, last_synced_at, owner_scope, owner_agent_slug, created_by_agent_slug'
        )
        .eq('is_active', true)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => rowToTemplate(r as CrmRow));
    },
    staleTime: 30_000,
  });
}

export function useEmailTemplateStats() {
  const { data: templates = [] } = useEmailTemplates();
  const total = templates.length;
  const bySource = templates.reduce((acc, t) => {
    acc[t.source] = (acc[t.source] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  return { total, bySource };
}

export function useCreateEmailTemplate() {
  const qc = useQueryClient();
  const mySlug = useMyAgentSlug();
  return useMutation({
    mutationFn: async (
      tpl: Partial<EmailTemplate> & { name: string; html_content: string; scope?: 'mine' | 'team' }
    ) => {
      const wantsTeam = tpl.scope === 'team';
      const owner_scope = wantsTeam ? 'team:presale' : mySlug ? `agent:${mySlug}` : 'team:presale';
      const owner_agent_slug = wantsTeam ? null : mySlug;

      const { data: inserted, error } = await supabase
        .from('crm_email_templates')
        .insert({
          name: tpl.name,
          subject: tpl.subject ?? '',
          body_html: tpl.html_content,
          preview_text: tpl.preview_text ?? null,
          category: tpl.category ?? 'general',
          project: tpl.project_tags?.[0] ?? null,
          merge_tags: [],
          source: tpl.source ?? 'dealflow',
          is_active: true,
          is_favorite: tpl.is_favorite ?? false,
          owner_scope,
          owner_agent_slug,
          created_by_agent_slug: mySlug,
        } as any)
        .select('id')
        .single();
      if (error) throw error;

      // Best-effort push to Presale (non-blocking)
      if (inserted?.id) {
        supabase.functions
          .invoke('push-template-to-presale', { body: { template_id: inserted.id } })
          .catch(() => {});
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-templates'] });
      qc.invalidateQueries({ queryKey: ['crm', 'email', 'templates'] });
      toast.success('Template saved');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<EmailTemplate> }) => {
      const patch: Record<string, unknown> = {};
      if (updates.name !== undefined) patch.name = updates.name;
      if (updates.subject !== undefined) patch.subject = updates.subject;
      if (updates.html_content !== undefined) patch.body_html = updates.html_content;
      if (updates.preview_text !== undefined) patch.preview_text = updates.preview_text;
      if (updates.category !== undefined) patch.category = updates.category;
      if (updates.is_favorite !== undefined) patch.is_favorite = updates.is_favorite;
      if (updates.project_tags !== undefined) patch.project = updates.project_tags?.[0] ?? null;

      const { error } = await supabase.from('crm_email_templates').update(patch).eq('id', id);
      if (error) throw error;

      supabase.functions
        .invoke('push-template-to-presale', { body: { template_id: id } })
        .catch(() => {});
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-templates'] });
      qc.invalidateQueries({ queryKey: ['crm', 'email', 'templates'] });
      toast.success('Template updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useSoftDeleteEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: tpl } = await supabase
        .from('crm_email_templates')
        .select('external_id')
        .eq('id', id)
        .maybeSingle();

      const { error } = await supabase
        .from('crm_email_templates')
        .update({ is_active: false })
        .eq('id', id);
      if (error) throw error;

      if (tpl?.external_id) {
        supabase.functions
          .invoke('push-template-to-presale', {
            body: { external_id: tpl.external_id, deleted: true },
          })
          .catch(() => {});
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-templates'] });
      qc.invalidateQueries({ queryKey: ['crm', 'email', 'templates'] });
      toast.success('Template archived');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_favorite }: { id: string; is_favorite: boolean }) => {
      const { error } = await supabase
        .from('crm_email_templates')
        .update({ is_favorite })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-templates'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

/**
 * Duplicate any template (your own, a teammate's team template, or a Presale-clone)
 * into your personal library. Always lands as `agent:<mySlug>`.
 */
export function useDuplicateTemplate() {
  const qc = useQueryClient();
  const mySlug = useMyAgentSlug();
  return useMutation({
    mutationFn: async (tpl: EmailTemplate) => {
      const owner_scope = mySlug ? `agent:${mySlug}` : 'team:presale';
      const owner_agent_slug = mySlug;
      const { error } = await supabase.from('crm_email_templates').insert({
        name: `${tpl.name} (Copy)`,
        subject: tpl.subject ?? '',
        body_html: tpl.html_content,
        preview_text: tpl.preview_text ?? null,
        category: tpl.category ?? 'general',
        project: tpl.project_tags?.[0] ?? null,
        merge_tags: [],
        source: 'dealflow',
        is_active: true,
        is_favorite: false,
        owner_scope,
        owner_agent_slug,
        created_by_agent_slug: mySlug,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-templates'] });
      toast.success('Duplicated to your library');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

/**
 * Promote a personal template up to the shared team library (or pull a team
 * template back down to personal). RLS still enforces who can perform either.
 */
export function useChangeTemplateScope() {
  const qc = useQueryClient();
  const mySlug = useMyAgentSlug();
  return useMutation({
    mutationFn: async ({ id, scope }: { id: string; scope: 'mine' | 'team' }) => {
      const owner_scope = scope === 'team' ? 'team:presale' : mySlug ? `agent:${mySlug}` : 'team:presale';
      const owner_agent_slug = scope === 'team' ? null : mySlug;
      const { error } = await supabase
        .from('crm_email_templates')
        .update({ owner_scope, owner_agent_slug })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['email-templates'] });
      toast.success(vars.scope === 'team' ? 'Shared with team' : 'Moved to your library');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
