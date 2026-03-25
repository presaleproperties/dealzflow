import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { Settings } from '@/lib/types';
import { toast } from 'sonner';

const DEFAULT_SETTINGS: Partial<Settings> = {
  currency: 'CAD',
  tax_set_aside_percent: 0,
  brokerage_split_percent: 0,
  apply_tax_to_forecasts: false,
};

export function useSettings() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['settings', user?.id],
    queryFn: async () => {
      if (!user) return DEFAULT_SETTINGS as Settings;
      
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (error) throw error;
      
      if (!data) {
        return DEFAULT_SETTINGS as Settings;
      }
      
      return data as Settings;
    },
    enabled: !!user,
  });
}

export function useUpdateSettings(options?: { silent?: boolean }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (data: Partial<Settings>) => {
      if (!user) throw new Error('Not authenticated');
      
      // First try to update existing settings
      const { data: existing } = await supabase
        .from('settings')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (existing) {
        // Update existing record
        const { data: settings, error } = await supabase
          .from('settings')
          .update(data)
          .eq('user_id', user.id)
          .select()
          .single();
        
        if (error) throw error;
        return settings as Settings;
      } else {
        // Create new settings record
        const { data: settings, error } = await supabase
          .from('settings')
          .insert({ ...data, user_id: user.id })
          .select()
          .single();
        
        if (error) throw error;
        return settings as Settings;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      if (!options?.silent) toast.success('Settings saved');
    },
    onError: (error) => {
      if (!options?.silent) toast.error(`Failed to save settings: ${error.message}`);
    },
  });
}
