import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { Payout, PayoutFormData, PayoutType } from '@/lib/types';
import { toast } from 'sonner';

export function usePayouts() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['payouts', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('payouts')
        .select(`
          *,
          deal:deals(*)
        `)
        .order('due_date', { ascending: true });
      
      if (error) throw error;
      return data as Payout[];
    },
    enabled: !!user,
  });
}

export function useDealPayouts(dealId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['payouts', 'deal', dealId],
    queryFn: async () => {
      if (!user || !dealId) return [];
      const { data, error } = await supabase
        .from('payouts')
        .select('*')
        .eq('deal_id', dealId)
        .order('due_date', { ascending: true });
      
      if (error) throw error;
      return data as Payout[];
    },
    enabled: !!user && !!dealId,
  });
}

export function useCreatePayout() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (data: PayoutFormData) => {
      if (!user) throw new Error('Not authenticated');
      
      const { data: payout, error } = await supabase
        .from('payouts')
        .insert({
          ...data,
          user_id: user.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return payout as Payout;
    },
    onSuccess: (payout) => {
      queryClient.invalidateQueries({ queryKey: ['payouts'] });
      queryClient.invalidateQueries({ queryKey: ['payouts', 'deal', payout.deal_id] });
      toast.success('Payout added successfully');
    },
    onError: (error) => {
      toast.error(`Failed to add payout: ${error.message}`);
    },
  });
}


export function useUpdatePayout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<PayoutFormData> }) => {
      // Clean up empty strings to null for date fields
      const cleanedData = Object.entries(data).reduce((acc, [key, value]) => {
        if (value === '' || value === undefined) {
          acc[key] = null;
        } else {
          acc[key] = value;
        }
        return acc;
      }, {} as Record<string, any>);

      // S8: Any manual edit to `amount` flags this payout as user-overridden,
      // so future deal-level recalculations leave it alone. Callers that want
      // to recalc a payout (and clear the lock) must pass manual_override:false
      // explicitly.
      if (Object.prototype.hasOwnProperty.call(cleanedData, 'amount')
          && !Object.prototype.hasOwnProperty.call(cleanedData, 'manual_override')) {
        cleanedData.manual_override = true;
      }

      const { data: payout, error } = await supabase
        .from('payouts')
        .update(cleanedData)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;

      // Reverse sync: Update deal dates when payout due_date changes
      if (cleanedData.due_date !== undefined) {
        // Get the deal to check property type
        const { data: deal } = await supabase
          .from('deals')
          .select('property_type')
          .eq('id', payout.deal_id)
          .single();

        if (deal?.property_type === 'PRESALE') {
          // Sync payout due_date back to deal's advance_date or completion_date
          if (payout.payout_type === 'Advance') {
            await supabase
              .from('deals')
              .update({ advance_date: cleanedData.due_date })
              .eq('id', payout.deal_id);
          } else if (payout.payout_type === 'Completion') {
            await supabase
              .from('deals')
              .update({ completion_date: cleanedData.due_date })
              .eq('id', payout.deal_id);
          }
        } else if (deal?.property_type === 'RESALE') {
          // For resale, Completion payout syncs to close_date_est
          if (payout.payout_type === 'Completion') {
            await supabase
              .from('deals')
              .update({ close_date_est: cleanedData.due_date })
              .eq('id', payout.deal_id);
          }
        }
      }

      return payout as Payout;
    },
    onSuccess: (payout) => {
      queryClient.invalidateQueries({ queryKey: ['payouts'] });
      queryClient.invalidateQueries({ queryKey: ['payouts', 'deal', payout.deal_id] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.invalidateQueries({ queryKey: ['deal', payout.deal_id] });
      toast.success('Payout updated');
    },
    onError: (error) => {
      toast.error(`Failed to update payout: ${error.message}`);
    },
  });
}

export function useMarkPayoutPaid() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const today = new Date().toISOString().split('T')[0];
      const { data: payout, error } = await supabase
        .from('payouts')
        .update({ status: 'PAID', paid_date: today })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return payout as Payout;
    },
    onSuccess: (payout) => {
      queryClient.invalidateQueries({ queryKey: ['payouts'] });
      queryClient.invalidateQueries({ queryKey: ['payouts', 'deal', payout.deal_id] });
      toast.success('Marked as paid');
    },
    onError: (error) => {
      toast.error(`Failed to mark as paid: ${error.message}`);
    },
  });
}

export function useAutoMarkPayoutsPaid() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return [];
      
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('payouts')
        .update({ status: 'PAID', paid_date: today })
        .in('id', ids)
        .select();
      
      if (error) throw error;
      return data as Payout[];
    },
    onSuccess: (payouts) => {
      if (payouts.length > 0) {
        queryClient.invalidateQueries({ queryKey: ['payouts'] });
        toast.success(`${payouts.length} payout(s) auto-marked as paid`);
      }
    },
    onError: (error) => {
      toast.error(`Failed to auto-mark payouts: ${error.message}`);
    },
  });
}

export function useDeletePayout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, dealId }: { id: string; dealId: string }) => {
      const { error } = await supabase
        .from('payouts')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      return dealId;
    },
    onSuccess: (dealId) => {
      queryClient.invalidateQueries({ queryKey: ['payouts'] });
      queryClient.invalidateQueries({ queryKey: ['payouts', 'deal', dealId] });
      toast.success('Payout deleted');
    },
    onError: (error) => {
      toast.error(`Failed to delete payout: ${error.message}`);
    },
  });
}

interface RecalculatePayoutsData {
  dealId: string;
  advanceCommission?: number;
  completionCommission?: number;
  grossCommission?: number;
  teamMemberPortion?: number;
  propertyType: 'PRESALE' | 'RESALE' | null;
}

export function useRecalculatePayouts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      dealId,
      advanceCommission = 0,
      completionCommission = 0,
      grossCommission = 0,
      teamMemberPortion = 0,
      propertyType,
    }: RecalculatePayoutsData) => {
      // Calculate user's portion (user gets 100% - teamMemberPortion)
      const userPortion = teamMemberPortion > 0 ? (100 - teamMemberPortion) / 100 : 1;

      // Fetch existing payouts for this deal
      const { data: existingPayouts, error: fetchError } = await supabase
        .from('payouts')
        .select('*')
        .eq('deal_id', dealId);

      if (fetchError) throw fetchError;

      // Update each payout with the recalculated amount
      const updates = existingPayouts?.map((payout) => {
        let newAmount = 0;

        if (payout.payout_type === 'Advance') {
          newAmount = advanceCommission * userPortion;
        } else if (payout.payout_type === 'Completion') {
          // For resale with single payout, use gross; for presale, use completion commission
          if (propertyType === 'RESALE' || !completionCommission) {
            newAmount = grossCommission * userPortion;
          } else {
            newAmount = completionCommission * userPortion;
          }
        } else {
          // Other payout types - apply user portion to existing amount
          // (only if it was a team deal and amounts weren't recalculated)
          newAmount = payout.amount;
        }

        return {
          id: payout.id,
          amount: Math.round(newAmount * 100) / 100,
        };
      }) || [];

      // Batch update all payouts
      for (const update of updates) {
        const { error } = await supabase
          .from('payouts')
          .update({ amount: update.amount })
          .eq('id', update.id);
        
        if (error) throw error;
      }

      return dealId;
    },
    onSuccess: (dealId) => {
      queryClient.invalidateQueries({ queryKey: ['payouts'] });
      queryClient.invalidateQueries({ queryKey: ['payouts', 'deal', dealId] });
      toast.success('Payouts recalculated with team split');
    },
    onError: (error) => {
      toast.error(`Failed to recalculate payouts: ${error.message}`);
    },
  });
}
