import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type WorkspaceStatus = 'pending' | 'approved' | 'suspended';

export type Profile = {
  id: string;
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  avatar_position: string;
  phone: string | null;
  title: string | null;
  workspace_status: WorkspaceStatus;
  approved_at: string | null;
  denial_reason: string | null;
  requested_at: string | null;
  created_at: string;
  updated_at: string;
};

const PROFILE_COLUMNS = 'id, user_id, full_name, avatar_url, avatar_position, phone, title, workspace_status, approved_at, denial_reason, requested_at, created_at, updated_at';

export function useProfile() {
  return useQuery({
    queryKey: ['profile-me'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;

      const { data, error } = await supabase
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (error) throw error;

      if (!data) {
        const { data: created, error: insertErr } = await supabase
          .from('profiles')
          .insert({ user_id: session.user.id, full_name: session.user.user_metadata?.full_name ?? null })
          .select(PROFILE_COLUMNS)
          .single();
        if (insertErr) throw insertErr;
        return created as Profile;
      }
      return data as Profile;
    },
    staleTime: 60_000,
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (updates: Partial<Pick<Profile, 'full_name' | 'avatar_url' | 'avatar_position' | 'phone' | 'title'>>) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not signed in');
      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('user_id', session.user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile-me'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
