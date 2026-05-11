import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { TemplateKind } from '@/hooks/useTemplateOrg';

export interface TemplateVersion {
  id: string;
  template_id: string;
  kind: TemplateKind;
  version: number;
  name: string | null;
  subject: string | null;
  body: string | null;
  category: string | null;
  preview_text: string | null;
  changed_by: string | null;
  changed_by_email: string | null;
  created_at: string;
}

export function useTemplateVersions(templateId: string | null, kind: TemplateKind | null) {
  return useQuery({
    queryKey: ['crm', 'template-versions', kind, templateId],
    queryFn: async (): Promise<TemplateVersion[]> => {
      if (!templateId || !kind) return [];
      const { data, error } = await supabase
        .from('crm_template_versions' as any)
        .select('*')
        .eq('template_id', templateId)
        .eq('kind', kind)
        .order('version', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as TemplateVersion[];
    },
    enabled: !!templateId && !!kind,
  });
}

export function useRevertTemplateVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      templateId,
      kind,
      version,
    }: {
      templateId: string;
      kind: TemplateKind;
      version: number;
    }) => {
      const { error } = await supabase.rpc('crm_revert_template_version' as any, {
        _template_id: templateId,
        _kind: kind,
        _version: version,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['crm', 'template-versions', vars.kind, vars.templateId] });
      qc.invalidateQueries({ queryKey: ['email-templates'] });
      qc.invalidateQueries({ queryKey: ['crm', 'email', 'templates'] });
      qc.invalidateQueries({ queryKey: ['crm', 'sms-templates'] });
      toast.success(`Reverted to version ${vars.version}`);
    },
    onError: (err: Error) => toast.error(err.message || 'Revert failed'),
  });
}
