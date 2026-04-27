import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type Profile = {
  id: string;
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  title: string | null;
  created_at: string;
  updated_at: string;
};

export function useProfile() {
  return useQuery({
    queryKey: ['profile-me'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;

      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, full_name, avatar_url, phone, title, created_at, updated_at')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (error) throw error;

      // Self-heal: handle_new_user trigger should create one, but if a legacy
      // user is missing a row we materialize it on first read.
      if (!data) {
        const { data: created, error: insertErr } = await supabase
          .from('profiles')
          .insert({ user_id: session.user.id, full_name: session.user.user_metadata?.full_name ?? null })
          .select('id, user_id, full_name, avatar_url, phone, title, created_at, updated_at')
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
    mutationFn: async (updates: Partial<Pick<Profile, 'full_name' | 'avatar_url' | 'phone' | 'title'>>) => {
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
