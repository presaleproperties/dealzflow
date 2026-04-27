import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { WorkspaceStatus } from '@/hooks/useProfile';

export type AccessRequest = {
  user_id: string;
  full_name: string | null;
  workspace_status: WorkspaceStatus;
  requested_at: string | null;
  approved_at: string | null;
  denial_reason: string | null;
  email?: string | null;
};

export function useAccessRequests(status?: WorkspaceStatus) {
  return useQuery({
    queryKey: ['access-requests', status ?? 'all'],
    queryFn: async () => {
      let q = supabase
        .from('profiles')
        .select('user_id, full_name, workspace_status, requested_at, approved_at, denial_reason')
        .order('requested_at', { ascending: false });
      if (status) q = q.eq('workspace_status', status);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as AccessRequest[];
    },
    staleTime: 30_000,
  });
}

export function useSetWorkspaceStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { userId: string; status: WorkspaceStatus; reason?: string }) => {
      const { error } = await supabase.rpc('admin_set_workspace_status', {
        _target_user_id: params.userId,
        _status: params.status,
        _reason: params.reason ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['access-requests'] });
      qc.invalidateQueries({ queryKey: ['profile-me'] });
      toast.success(
        vars.status === 'approved'
          ? 'User approved'
          : vars.status === 'suspended'
          ? 'User suspended'
          : 'User set to pending',
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
