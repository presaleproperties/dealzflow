import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface PlatformConnection {
  id: string;
  user_id: string;
  platform: string;
  api_key: string | null;
  api_secret: string | null;
  base_url: string | null;
  is_active: boolean;
  last_synced_at: string | null;
  sync_status: string;
  sync_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface SyncedTransaction {
  id: string;
  user_id: string;
  platform: string;
  external_id: string | null;
  transaction_type: string | null;
  client_name: string | null;
  property_address: string | null;
  city: string | null;
  sale_price: number | null;
  commission_amount: number | null;
  close_date: string | null;
  listing_date: string | null;
  firm_date: string | null;
  status: string | null;
  agent_name: string | null;
  lifecycle_state: string | null;
  compliance_status: string | null;
  is_listing: boolean | null;
  journey_id: string | null;
  mls_number: string | null;
  my_net_payout: number | null;
  my_split_percent: number | null;
  lead_source: string | null;
  buyer_type: string | null;
  transaction_code: string | null;
  currency: string | null;
  raw_data: any;
  synced_at: string;
  created_at: string;
  updated_at: string;
}

export interface RevenueShare {
  id: string;
  user_id: string;
  platform: string;
  agent_name: string;
  tier: number;
  amount: number;
  period: string;
  cap_contribution: number | null;
  status: string | null;
  notes: string | null;
  created_at: string;
}

export interface SyncLog {
  id: string;
  user_id: string;
  platform: string;
  sync_type: string;
  status: string;
  records_synced: number | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

const PLATFORMS = [
  { id: 'lofty', name: 'Lofty (Chime)', description: 'CRM - transactions, listings', hasApi: true },
  { id: 'real_broker', name: 'Real Broker (ReZen)', description: 'Transactions, revenue share, cap tracking', hasApi: true },
  { id: 'follow_up_boss', name: 'Follow Up Boss', description: 'CRM - contacts, deals', hasApi: true },
  { id: 'skyslope', name: 'SkySlope', description: 'Transaction management', hasApi: true },
];

export { PLATFORMS };

export function usePlatformConnections() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['platform_connections', user?.id],
    queryFn: async () => {
      if (!user) return [];
      // Route through edge function — api_key/api_secret are never exposed in plaintext
      const { data, error } = await supabase.functions.invoke('manage-connection', {
        body: { action: 'list' },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return (data?.data || []) as PlatformConnection[];
    },
    enabled: !!user,
  });
}

export function useSyncedTransactions(platform?: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['synced_transactions', user?.id, platform],
    queryFn: async () => {
      if (!user) return [];
      let query = (supabase as any)
        .from('synced_transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('synced_at', { ascending: false });
      if (platform) query = query.eq('platform', platform);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as SyncedTransaction[];
    },
    enabled: !!user,
  });
}

export function useRevenueShare() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['revenue_share', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await (supabase as any)
        .from('revenue_share')
        .select('*')
        .eq('user_id', user.id)
        .order('period', { ascending: false });
      if (error) throw error;
      return (data || []) as RevenueShare[];
    },
    enabled: !!user,
  });
}

export function useSyncLogs() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['sync_logs', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await (supabase as any)
        .from('sync_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('started_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as SyncLog[];
    },
    enabled: !!user,
  });
}

export function useUpsertConnection() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (data: { platform: string; api_key: string; api_secret?: string; base_url?: string }) => {
      if (!user) throw new Error('Not authenticated');
      // Route through edge function — api_key is encrypted before hitting the DB
      const { data: result, error } = await supabase.functions.invoke('manage-connection', {
        body: {
          action: 'upsert',
          platform: data.platform,
          api_key: data.api_key,
          api_secret: data.api_secret || null,
          base_url: data.base_url || null,
        },
      });
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      return result?.data as PlatformConnection;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform_connections'] });
      toast.success('Connection saved');
    },
    onError: (error) => {
      toast.error(`Failed to save connection: ${error.message}`);
    },
  });
}

export function useDeleteConnection() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (connectionId: string) => {
      if (!user) throw new Error('Not authenticated');
      if (!connectionId?.trim()) throw new Error('Invalid connection ID');
      // Route through edge function for ownership verification
      const { data, error } = await supabase.functions.invoke('manage-connection', {
        body: { action: 'delete', connection_id: connectionId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform_connections'] });
      toast.success('Connection removed');
    },
    onError: (error) => {
      toast.error(`Failed to remove: ${error.message}`);
    },
  });
}

// Module-level polling state so it survives component unmounts/navigation
let _syncPollingInterval: ReturnType<typeof setInterval> | null = null;
let _syncQueryClient: any = null;

// Module-level sync step state — shared across components
type SyncStep = { __step: string; label: string } | null;
let _syncStep: SyncStep = null;
const _syncStepListeners = new Set<(step: SyncStep) => void>();

export function useSyncStep(): SyncStep {
  const [step, setStep] = useState<SyncStep>(_syncStep);
  useEffect(() => {
    const handler = (s: SyncStep) => setStep(s);
    _syncStepListeners.add(handler);
    return () => { _syncStepListeners.delete(handler); };
  }, []);
  return step;
}

function stopSyncPolling() {
  if (_syncPollingInterval) {
    clearInterval(_syncPollingInterval);
    _syncPollingInterval = null;
  }
}

function startSyncPolling(connectionId: string) {
  stopSyncPolling();
  let attempts = 0;
  const MAX_ATTEMPTS = 72; // 6 minutes max (72 × 5s)
  // Track when syncing state started to detect stuck syncs
  const syncStartedAt = Date.now();
  const STUCK_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

  _syncPollingInterval = setInterval(async () => {
    attempts++;
    try {
      const { data } = await (supabase as any)
        .from('platform_connections')
        .select('sync_status, sync_error, last_synced_at, updated_at')
        .eq('id', connectionId)
        .single();

      // Broadcast step updates so the UI can react without a full query invalidation
      if (data?.sync_status === 'syncing' && data?.sync_error) {
        try {
          const stepInfo = JSON.parse(data.sync_error);
          if (stepInfo?.__step) {
            // Emit to global sync step store
            _syncStep = stepInfo;
            _syncStepListeners.forEach(fn => fn({ ...stepInfo }));
          }
        } catch {}
      }

      if (data?.sync_status === 'success') {
        _syncStep = null;
        _syncStepListeners.forEach(fn => fn(null));
        stopSyncPolling();
        if (_syncQueryClient) {
          _syncQueryClient.invalidateQueries({ queryKey: ['synced_transactions'] });
          _syncQueryClient.invalidateQueries({ queryKey: ['sync_logs'] });
          _syncQueryClient.invalidateQueries({ queryKey: ['platform_connections'] });
          _syncQueryClient.invalidateQueries({ queryKey: ['revenue_share'] });
        }
        toast.success('Sync complete! Your data is up to date.');
      } else if (data?.sync_status === 'error') {
        _syncStep = null;
        _syncStepListeners.forEach(fn => fn(null));
        stopSyncPolling();
        if (_syncQueryClient) {
          _syncQueryClient.invalidateQueries({ queryKey: ['platform_connections'] });
        }
        // Don't show step-marker JSON as an error message
        let errMsg = data.sync_error || 'Unknown error';
        try { const p = JSON.parse(errMsg); if (p?.__step) errMsg = 'Sync failed unexpectedly.'; } catch {}
        toast.error(`Sync failed: ${errMsg}`);
      } else if (data?.sync_status === 'syncing' && Date.now() - syncStartedAt > STUCK_THRESHOLD_MS) {
        // Sync has been running too long — reset stuck state in DB and notify user
        stopSyncPolling();
        await (supabase as any)
          .from('platform_connections')
          .update({ sync_status: 'idle', sync_error: 'Sync timed out. Please try again.' })
          .eq('id', connectionId);
        if (_syncQueryClient) {
          _syncQueryClient.invalidateQueries({ queryKey: ['platform_connections'] });
          _syncQueryClient.invalidateQueries({ queryKey: ['sync_logs'] });
        }
        toast.error('Sync timed out. Your data may be partially updated — please sync again.', { duration: 8000 });
      } else if (attempts >= MAX_ATTEMPTS) {
        stopSyncPolling();
        toast.warning('Sync is taking longer than expected. Check back soon.');
      }
    } catch {
      // Silently ignore polling errors
    }
  }, 5000);
}

export function useSyncPlatform() {
  const queryClient = useQueryClient();
  // Keep module-level ref to queryClient updated
  _syncQueryClient = queryClient;

  return useMutation({
    mutationFn: async ({ platform, connectionId }: { platform: string; connectionId: string }) => {
      // Read sync preferences from localStorage and pass to edge function
      let preferences = { transactions: true, revshare: true, network: true };
      try {
        const raw = localStorage.getItem('sync_preferences');
        if (raw) preferences = { ...preferences, ...JSON.parse(raw) };
      } catch {}

      const { data, error } = await supabase.functions.invoke('sync-platform', {
        body: { platform, connection_id: connectionId, preferences },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return { ...data, connectionId };
    },
    onSuccess: ({ connectionId }) => {
      toast.info("Sync started — you'll be notified when it's done.", { duration: 4000 });
      startSyncPolling(connectionId);
    },
    onError: (error) => {
      const isApiKeyMissing = error.message?.toLowerCase().includes('api key missing') || error.message?.toLowerCase().includes('api key not configured');
      if (isApiKeyMissing) {
        toast.error('API key missing — go to Settings → Integrations and click Reconnect to re-enter your ReZen API key.', { duration: 8000 });
      } else {
        toast.error(`Sync failed: ${error.message}`);
      }
    },
  });
}

export function useAddRevenueShare() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (data: { agent_name: string; tier: number; amount: number; period: string; cap_contribution?: number; notes?: string }) => {
      if (!user) throw new Error('Not authenticated');
      const { data: result, error } = await (supabase as any)
        .from('revenue_share')
        .insert({ ...data, user_id: user.id, platform: 'real_broker' })
        .select()
        .single();
      if (error) throw error;
      return result as RevenueShare;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['revenue_share'] });
      toast.success('Revenue share entry added');
    },
    onError: (error) => {
      toast.error(`Failed to add: ${error.message}`);
    },
  });
}

export function useDeleteRevenueShare() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('revenue_share')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['revenue_share'] });
      toast.success('Entry removed');
    },
    onError: (error) => {
      toast.error(`Failed to remove: ${error.message}`);
    },
  });
}
