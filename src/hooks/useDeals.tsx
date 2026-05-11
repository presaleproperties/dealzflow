import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { Deal, DealFormData } from '@/lib/types';
import { toast } from 'sonner';

export function useDeals() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['deals', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('deals')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Deal[];
    },
    enabled: !!user,
  });
}

export function useDeal(id: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['deal', id],
    queryFn: async () => {
      if (!user || !id) return null;
      const { data, error } = await supabase
        .from('deals')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      
      if (error) throw error;
      return data as Deal | null;
    },
    enabled: !!user && !!id,
  });
}

export function useCreateDeal() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (data: DealFormData) => {
      if (!user) throw new Error('Not authenticated');
      
      const { data: deal, error } = await supabase
        .from('deals')
        .insert({
          ...data,
          user_id: user.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return deal as Deal;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      toast.success('Deal created successfully');
    },
    onError: (error) => {
      toast.error(`Failed to create deal: ${error.message}`);
    },
  });
}

export function useUpdateDeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<DealFormData> }) => {
      // Clean empty strings → null for optional/date fields
      const cleanedData = Object.entries(data).reduce((acc, [key, value]) => {
        acc[key] = value === '' || value === undefined ? null : value;
        return acc;
      }, {} as Record<string, any>);

      // Fetch current deal so we can compute auto-sync payouts using the
      // POST-update values (the RPC will apply cleanedData atomically).
      const { data: current, error: curErr } = await supabase
        .from('deals')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (curErr) throw curErr;
      if (!current) throw new Error('Deal not found');

      const merged = { ...current, ...cleanedData } as any;
      const teamMemberPortion = Number(merged.team_member_portion ?? 0);
      const userPortion = teamMemberPortion > 0 ? (100 - teamMemberPortion) / 100 : 1;

      // Build payout updates the RPC will apply (skipping any payout where
      // manual_override = true so user-edited rows aren't clobbered).
      const { data: existingPayouts } = await supabase
        .from('payouts')
        .select('id, payout_type, manual_override')
        .eq('deal_id', id);

      const payoutUpdates: Array<{ id: string; amount?: number; due_date?: string | null }> = [];
      const findPayout = (kind: string) => existingPayouts?.find((p) => p.payout_type === kind);

      if (merged.property_type === 'RESALE') {
        const completion = findPayout('Completion');
        if (completion) {
          const upd: any = { id: completion.id };
          if ('close_date_est' in cleanedData) upd.due_date = cleanedData.close_date_est;
          if ('gross_commission_est' in cleanedData || 'team_member_portion' in cleanedData) {
            const grossAmount = Number(merged.gross_commission_est || 0);
            upd.amount = Math.round(grossAmount * userPortion * 100) / 100;
          }
          if (Object.keys(upd).length > 1) payoutUpdates.push(upd);
        }
      }

      if (merged.property_type === 'PRESALE') {
        const advance = findPayout('Advance');
        if (advance) {
          const upd: any = { id: advance.id };
          if ('advance_date' in cleanedData) upd.due_date = cleanedData.advance_date;
          if ('advance_commission' in cleanedData || 'team_member_portion' in cleanedData) {
            const advAmount = Number(merged.advance_commission || 0);
            upd.amount = Math.round(advAmount * userPortion * 100) / 100;
          }
          if (Object.keys(upd).length > 1) payoutUpdates.push(upd);
        }
        const completion = findPayout('Completion');
        if (completion) {
          const upd: any = { id: completion.id };
          if ('completion_date' in cleanedData) upd.due_date = cleanedData.completion_date;
          if ('completion_commission' in cleanedData || 'team_member_portion' in cleanedData) {
            const compAmount = Number(merged.completion_commission || 0);
            upd.amount = Math.round(compAmount * userPortion * 100) / 100;
          }
          if (Object.keys(upd).length > 1) payoutUpdates.push(upd);
        }
      }

      // Single transactional RPC — deal + payouts succeed or fail together.
      const { data: deal, error } = await supabase.rpc('update_deal_with_payouts', {
        p_deal_id: id,
        p_deal_data: cleanedData,
        p_payouts: payoutUpdates,
      });
      if (error) throw error;

      return deal as Deal;
    },
    onSuccess: (deal) => {
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.invalidateQueries({ queryKey: ['deal', deal.id] });
      queryClient.invalidateQueries({ queryKey: ['payouts'] });
      queryClient.invalidateQueries({ queryKey: ['payouts', 'deal', deal.id] });
      toast.success('Deal updated successfully');
    },
    onError: (error) => {
      toast.error(`Failed to update deal: ${error.message}`);
    },
  });
}

export function useDeleteDeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('deals')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      toast.success('Deal deleted successfully');
    },
    onError: (error) => {
      toast.error(`Failed to delete deal: ${error.message}`);
    },
  });
}
