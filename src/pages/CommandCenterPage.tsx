import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { AppLayout } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Wifi } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

import { HeroKPIs } from '@/components/command-center/HeroKPIs';
import { NeedsAttention } from '@/components/command-center/NeedsAttention';
import { ZaraFunnel } from '@/components/command-center/ZaraFunnel';
import { LeadSources } from '@/components/command-center/LeadSources';
import { PipelineStatus } from '@/components/command-center/PipelineStatus';
import { CalendarWidget } from '@/components/command-center/CalendarWidget';
import { ActivityFeed } from '@/components/command-center/ActivityFeed';
import { QuickActions } from '@/components/command-center/QuickActions';
import { TodaysFocus } from '@/components/command-center/TodaysFocus';

// ─── Query keys (centralised so realtime can invalidate them) ──────────────────
const QK = {
  prospects:    (uid: string) => ['cc-prospects',     uid] as const,
  zaraCaptures: (uid: string) => ['cc-zara-captures', uid] as const,
  zaraFunnel:   (uid: string) => ['cc-zara-funnel',   uid] as const,
  unread:       (uid: string) => ['cc-unread',        uid] as const,
  activity:     (uid: string) => ['cc-activity',      uid] as const,
};

// ─── Greeting helper ───────────────────────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Good morning';
  if (h >= 12 && h < 17) return 'Good afternoon';
  return 'Good evening';
}

// ─── Realtime hook — invalidates queries on table changes ──────────────────────
function useRealtimeInvalidation(uid: string | undefined, onUpdate: () => void) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!uid) return;

    const invalidateProspects = () => {
      qc.invalidateQueries({ queryKey: QK.prospects(uid) });
      onUpdate();
    };
    const invalidateConversations = () => {
      qc.invalidateQueries({ queryKey: QK.unread(uid) });
      onUpdate();
    };
    const invalidateZara = () => {
      qc.invalidateQueries({ queryKey: QK.zaraCaptures(uid) });
      qc.invalidateQueries({ queryKey: QK.zaraFunnel(uid) });
      qc.invalidateQueries({ queryKey: QK.activity(uid) });
      onUpdate();
    };

    // Subscribe to pipeline_prospects changes
    const prospectsChannel = supabase
      .channel('cc-pipeline-prospects')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'pipeline_prospects',
        filter: `user_id=eq.${uid}`,
      }, invalidateProspects)
      .subscribe();

    // Subscribe to conversations changes
    const conversationsChannel = supabase
      .channel('cc-conversations')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'conversations',
        filter: `user_id=eq.${uid}`,
      }, invalidateConversations)
      .subscribe();

    // Subscribe to zara_activity changes (no user_id filter — join via conversations)
    const zaraChannel = supabase
      .channel('cc-zara-activity')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'zara_activity',
      }, invalidateZara)
      .subscribe();

    return () => {
      supabase.removeChannel(prospectsChannel);
      supabase.removeChannel(conversationsChannel);
      supabase.removeChannel(zaraChannel);
    };
  }, [uid, qc, onUpdate]);
}

// ─── Data hook ─────────────────────────────────────────────────────────────────
function useCommandCenterData() {
  const { user } = useAuth();
  const uid = user?.id;

  // Active leads (pipeline_prospects where status not closed/lost)
  const { data: prospects = [] } = useQuery({
    queryKey: QK.prospects(uid ?? ''),
    queryFn: async () => {
      const { data } = await supabase
        .from('pipeline_prospects')
        .select('id,client_name,source,temperature,budget,status,notes,created_at,updated_at')
        .not('status', 'in', '("closed","lost","Closed","Lost")')
        .order('temperature', { ascending: false })
        .order('created_at', { ascending: true });
      return data ?? [];
    },
    enabled: !!uid,
  });

  // Pipeline value (sum of budgets)
  const pipelineValue = prospects.reduce((s: number, p: any) => s + (p.budget ?? 0), 0);
  const activeLeads = prospects.length;
  const hotLeads = prospects.filter((p: any) =>
    p.temperature?.toLowerCase() === 'hot',
  ).length;

  // "Needs attention" = stale (updated > 48h ago, ordered hot first)
  const needsAttention = [...prospects].sort((a: any, b: any) => {
    const tempOrder = { hot: 0, warm: 1, cold: 2 };
    const ta = tempOrder[(a.temperature?.toLowerCase() as keyof typeof tempOrder)] ?? 3;
    const tb = tempOrder[(b.temperature?.toLowerCase() as keyof typeof tempOrder)] ?? 3;
    if (ta !== tb) return ta - tb;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  }).filter((p: any) => {
    const hoursAgo = (Date.now() - new Date(p.updated_at).getTime()) / 3_600_000;
    return hoursAgo > 48;
  });

  // Lead sources — normalize display names
  const LEAD_SOURCE_NORMALIZE: Record<string, string> = {
    tiktok: 'TikTok', tik_tok: 'TikTok', 'tik tok': 'TikTok',
    instagram: 'Instagram', ig: 'Instagram', insta: 'Instagram',
    facebook: 'Facebook', 'facebook ads': 'Facebook Ads', fb: 'Facebook',
    google: 'Google', 'google ads': 'Google Ads',
    referral: 'Referral', ref: 'Referral',
    youtube: 'YouTube', yt: 'YouTube',
    whatsapp: 'WhatsApp',
    sms: 'SMS',
    manychat: 'ManyChat',
    team: 'Team',
    'past client': 'Past Client',
  };
  const sourceMap: Record<string, number> = {};
  prospects.forEach((p: any) => {
    const raw = p.source?.trim() || 'Unknown';
    const key = raw.toLowerCase();
    const normalized = LEAD_SOURCE_NORMALIZE[key] || raw;
    sourceMap[normalized] = (sourceMap[normalized] || 0) + 1;
  });
  const sourceData = Object.entries(sourceMap)
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);

  // Pipeline by status
  const statusMap: Record<string, number> = {};
  prospects.forEach((p: any) => {
    const s = p.status?.toLowerCase()?.trim() || 'active';
    statusMap[s] = (statusMap[s] || 0) + 1;
  });
  const statusData = Object.entries(statusMap)
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);

  // Zara captures (7d)
  const { data: zaraCaptures = 0 } = useQuery({
    queryKey: QK.zaraCaptures(uid ?? ''),
    queryFn: async () => {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const { count } = await supabase
        .from('zara_activity')
        .select('*', { count: 'exact', head: true })
        .eq('action_type', 'captured')
        .gte('created_at', sevenDaysAgo.toISOString());
      return count ?? 0;
    },
    enabled: !!uid,
  });

  // Zara funnel data
  const { data: zaraFunnelData } = useQuery({
    queryKey: QK.zaraFunnel(uid ?? ''),
    queryFn: async () => {
      const [capturedRes, syncedRes, qualifiedRes] = await Promise.all([
        supabase
          .from('zara_activity')
          .select('*', { count: 'exact', head: true })
          .eq('action_type', 'captured'),
        supabase
          .from('zara_activity')
          .select('*', { count: 'exact', head: true })
          .eq('action_type', 'synced_to_leads'),
        supabase
          .from('zara_activity')
          .select('*', { count: 'exact', head: true })
          .eq('action_type', 'qualified'),
      ]);
      return {
        widgetCaptures: capturedRes.count ?? 0,
        hasContactInfo: Math.round((capturedRes.count ?? 0) * 0.72),
        syncedToLeads: syncedRes.count ?? 0,
        qualified: qualifiedRes.count ?? 0,
      };
    },
    enabled: !!uid,
  });

  // Unread messages (conversations with heat > 0)
  const { data: unreadMessages = 0 } = useQuery({
    queryKey: QK.unread(uid ?? ''),
    queryFn: async () => {
      const { count } = await supabase
        .from('conversations')
        .select('*', { count: 'exact', head: true })
        .gt('heat', 0)
        .neq('status', 'closed');
      return count ?? 0;
    },
    enabled: !!uid,
  });

  // Zara activity feed
  const { data: activityFeed = [] } = useQuery({
    queryKey: QK.activity(uid ?? ''),
    queryFn: async () => {
      const { data } = await supabase
        .from('zara_activity')
        .select('id,action_type,description,created_at')
        .order('created_at', { ascending: false })
        .limit(15);
      return data ?? [];
    },
    enabled: !!uid,
  });

  return {
    pipelineValue,
    activeLeads,
    hotLeads,
    zaraCaptures,
    unreadMessages,
    needsAttention,
    sourceData,
    statusData,
    zaraFunnelData: zaraFunnelData ?? { widgetCaptures: 0, hasContactInfo: 0, syncedToLeads: 0, qualified: 0 },
    activityFeed,
  };
}

// ─── Page ──────────────────────────────────────────────────────────────────────
const FadeUp = ({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 14 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay, duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
    className={className}
  >
    {children}
  </motion.div>
);

export default function CommandCenterPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [liveFlash, setLiveFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>();

  const onLiveUpdate = useCallback(() => {
    setLastUpdated(new Date());
    setLiveFlash(true);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setLiveFlash(false), 2000);
  }, []);

  // Manual refresh — invalidate all cc-* queries
  const handleRefresh = useCallback(() => {
    if (!user?.id) return;
    const uid = user.id;
    qc.invalidateQueries({ queryKey: QK.prospects(uid) });
    qc.invalidateQueries({ queryKey: QK.zaraCaptures(uid) });
    qc.invalidateQueries({ queryKey: QK.zaraFunnel(uid) });
    qc.invalidateQueries({ queryKey: QK.unread(uid) });
    qc.invalidateQueries({ queryKey: QK.activity(uid) });
    onLiveUpdate();
  }, [user?.id, qc, onLiveUpdate]);

  // Wire up realtime subscriptions
  useRealtimeInvalidation(user?.id, onLiveUpdate);

  const {
    pipelineValue,
    activeLeads,
    hotLeads,
    zaraCaptures,
    unreadMessages,
    needsAttention,
    sourceData,
    statusData,
    zaraFunnelData,
    activityFeed,
  } = useCommandCenterData();

  return (
    <AppLayout>
      <Header
        title="Command Center"
        subtitle={`${getGreeting()}, ${user?.user_metadata?.full_name?.split(' ')[0] || 'there'}`}
        showAddDeal={false}
        action={
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {/* Live indicator dot */}
            <AnimatePresence>
              {liveFlash && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{ duration: 0.25 }}
                  className="flex items-center gap-1 text-success font-semibold"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                  <span className="hidden sm:inline text-[11px]">Live</span>
                </motion.span>
              )}
            </AnimatePresence>
            <Wifi className={cn(
              'w-3.5 h-3.5 transition-colors duration-500',
              liveFlash ? 'text-success' : 'text-muted-foreground/40',
            )} />
            <span className="hidden sm:inline text-[11px]">
              {format(lastUpdated, 'h:mm a')}
            </span>
            <button
              onClick={handleRefresh}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted/50 hover:bg-muted transition-colors text-xs font-medium"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        }
      />

      <div className="p-4 md:p-6 space-y-5 pb-28 lg:pb-10">

        {/* ── ROW 1: Hero KPIs ─────────────────────────────────────────── */}
        <FadeUp delay={0.02}>
          <HeroKPIs
            data={{ pipelineValue, activeLeads, hotLeads, zaraCaptures, unreadMessages }}
          />
        </FadeUp>

        {/* ── Today's Focus ─────────────────────────────────────────────── */}
        <FadeUp delay={0.08}>
          <TodaysFocus />
        </FadeUp>

        {/* ── ROW 2: Needs Attention (60%) + Zara Funnel (40%) ─────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          <FadeUp delay={0.14} className="lg:col-span-3">
            <div style={{ minHeight: '380px' }} className="h-full">
              <NeedsAttention prospects={needsAttention as any} />
            </div>
          </FadeUp>
          <FadeUp delay={0.2} className="lg:col-span-2">
            <div style={{ minHeight: '380px' }} className="h-full">
              <ZaraFunnel data={zaraFunnelData} />
            </div>
          </FadeUp>
        </div>

        {/* ── ROW 3: Lead Sources (33%) + Pipeline Status (34%) + Calendar (33%) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <FadeUp delay={0.28}>
            <div style={{ minHeight: '380px' }} className="h-full">
              <LeadSources data={sourceData} />
            </div>
          </FadeUp>
          <FadeUp delay={0.33}>
            <div style={{ minHeight: '380px' }} className="h-full">
              <PipelineStatus data={statusData} />
            </div>
          </FadeUp>
          <FadeUp delay={0.38}>
            <div style={{ minHeight: '380px' }} className="h-full">
              <CalendarWidget />
            </div>
          </FadeUp>
        </div>

        {/* ── ROW 4: Activity Feed (60%) + Quick Actions (40%) ─────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          <FadeUp delay={0.44} className="lg:col-span-3">
            <div style={{ minHeight: '340px' }} className="h-full">
              <ActivityFeed entries={activityFeed as any} />
            </div>
          </FadeUp>
          <FadeUp delay={0.48} className="lg:col-span-2">
            <div style={{ minHeight: '340px' }} className="h-full">
              <QuickActions />
            </div>
          </FadeUp>
        </div>

      </div>
    </AppLayout>
  );
}
