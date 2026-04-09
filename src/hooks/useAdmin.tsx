import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';

interface AdminUser {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  subscriptionTier: string;
  subscriptionStartedAt: string | null;
  subscriptionEndsAt: string | null;
  dealsCount: number;
  pendingDeals: number;
  closedDeals: number;
  yearlyGciGoal: number;
  yearlyRevshareGoal: number;
  isBanned: boolean;
  bannedAt: string | null;
  banReason: string | null;
}

interface AdminSummary {
  totalUsers: number;
  proUsers: number;
  freeUsers: number;
  totalDeals: number;
  closedDeals: number;
  recentSignups: number;
  mrr: number;
  activeSubscriptions: number;
  crmContacts: number;
  crmWithEmail: number;
  crmWithPhone: number;
  crmRecent: number;
}

interface SignupsByMonth {
  month: string;
  count: number;
}

interface AdminAnalytics {
  summary: AdminSummary;
  signupsByMonth: SignupsByMonth[];
  users: AdminUser[];
}

export function useIsAdmin() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['isAdmin', user?.id],
    queryFn: async () => {
      if (!user) return false;

      // Check user_roles table (secure, separate from profiles)
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();

      if (error) {
        console.error('Error checking admin status:', error);
        return false;
      }

      return !!data;
    },
    enabled: !!user,
  });
}

export function useAdminAnalytics() {
  const { data: isAdmin } = useIsAdmin();

  return useQuery<AdminAnalytics>({
    queryKey: ['adminAnalytics'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('admin-analytics');

      if (error) {
        throw new Error(error.message);
      }

      return data as AdminAnalytics;
    },
    enabled: isAdmin === true,
    staleTime: 60 * 1000, // 1 minute
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  });
}

export function useAdminManageUser() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (payload: {
      action: 'delete' | 'reset_password' | 'edit' | 'ban' | 'unban';
      targetUserId: string;
      name?: string;
      email?: string;
      banReason?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('admin-manage-user', { body: payload });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: (_, variables) => {
      const messages: Record<string, string> = {
        delete: 'User deleted successfully.',
        reset_password: 'Password reset email sent.',
        edit: 'User updated successfully.',
        ban: 'User has been suspended.',
        unban: 'User suspension lifted.',
      };
      toast({ title: 'Done', description: messages[variables.action] });
      queryClient.invalidateQueries({ queryKey: ['adminAnalytics'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

export function useAdminUpdateSubscription() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ targetUserId, tier }: { targetUserId: string; tier: 'free' | 'pro' }) => {
      const { data, error } = await supabase.functions.invoke('admin-update-subscription', {
        body: { targetUserId, tier },
      });

      if (error) {
        throw new Error(error.message);
      }

      return data;
    },
    onSuccess: (_, variables) => {
      toast({
        title: 'Subscription Updated',
        description: `User has been ${variables.tier === 'pro' ? 'upgraded to Pro' : 'downgraded to Free'}.`,
      });
      // Refetch admin analytics to update the UI
      queryClient.invalidateQueries({ queryKey: ['adminAnalytics'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export interface AuditLog {
  id: string;
  admin_user_id: string;
  target_user_id: string | null;
  action: string;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

export function useAdminAuditLogs() {
  const { data: isAdmin } = useIsAdmin();
  return useQuery<AuditLog[]>({
    queryKey: ['adminAuditLogs'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('admin_audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as unknown as AuditLog[];
    },
    enabled: isAdmin === true,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
}
