import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { AppLayout } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Wifi, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

import { HeroKPIs } from '@/components/command-center/HeroKPIs';
import { NeedsAttention } from '@/components/command-center/NeedsAttention';
import { TodaysFocus } from '@/components/command-center/TodaysFocus';
import { PipelineInsights } from '@/components/command-center/PipelineInsights';
import { CalendarWidget } from '@/components/command-center/CalendarWidget';
import { FacebookAdsWidget } from '@/components/command-center/FacebookAdsWidget';

// ─── Query keys ────────────────────────────────────────────────────────────────
const QK = {
  prospects:    (uid: string) => ['cc-prospects',     uid] as const,
  zaraCaptures: (uid: string) => ['cc-zara-captures', uid] as const,
  unread:       (uid: string) => ['cc-unread',        uid] as const,
};

// ─── Greeting helper ───────────────────────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Good morning';
  if (h >= 12 && h < 17) return 'Good afternoon';
  return 'Good evening';
}

// ─── Lead source normalization ─────────────────────────────────────────────────
const LEAD_SOURCE_NORMALIZE: Record<string, string> = {
  tiktok: 'TikTok', tik_tok: 'TikTok', 'tik tok': 'TikTok',
  instagram: 'Instagram', ig: 'Instagram', insta: 'Instagram',
  facebook: 'Facebook', 'facebook ads': 'Facebook Ads', fb: 'Facebook',
  google: 'Google', 'google ads': 'Google Ads',
  referral: 'Referral', ref: 'Referral',
  youtube: 'YouTube', yt: 'YouTube',
  whatsapp: 'WhatsApp', sms: 'SMS', manychat: 'ManyChat',
  team: 'Team', 'past client': 'Past Client',
};

// ─── Realtime hook ─────────────────────────────────────────────────────────────
function useRealtimeInvalidation(uid: string | undefined, onUpdate: () => void) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!uid) return;
    const invalidateAll = () => {
      qc.invalidateQueries({ queryKey: QK.prospects(uid) });
      qc.invalidateQueries({ queryKey: QK.zaraCaptures(uid) });
      qc.invalidateQueries({ queryKey: QK.unread(uid) });
      onUpdate();
    };
    const ch1 = supabase.channel('cc-pipeline')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pipeline_prospects', filter: `user_id=eq.${uid}` }, invalidateAll)
      .subscribe();
    const ch2 = supabase.channel('cc-convos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations', filter: `user_id=eq.${uid}` }, invalidateAll)
      .subscribe();
    return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2); };
  }, [uid, qc, onUpdate]);
}

// ─── Data hook ─────────────────────────────────────────────────────────────────
function useCommandCenterData() {
  const { user } = useAuth();
  const uid = user?.id;

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

  const pipelineValue = prospects.reduce((s: number, p: any) => s + (p.budget ?? 0), 0);
  const activeLeads = prospects.length;
  const hotLeads = prospects.filter((p: any) => p.temperature?.toLowerCase() === 'hot').length;

  const needsAttention = [...prospects]
    .filter((p: any) => (Date.now() - new Date(p.updated_at).getTime()) / 3_600_000 > 48)
    .sort((a: any, b: any) => {
      const tempOrder = { hot: 0, warm: 1, cold: 2 } as const;
      const ta = tempOrder[(a.temperature?.toLowerCase() as keyof typeof tempOrder)] ?? 3;
      const tb = tempOrder[(b.temperature?.toLowerCase() as keyof typeof tempOrder)] ?? 3;
      return ta !== tb ? ta - tb : new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

  const sourceMap: Record<string, number> = {};
  prospects.forEach((p: any) => {
    const raw = p.source?.trim() || 'Unknown';
    const normalized = LEAD_SOURCE_NORMALIZE[raw.toLowerCase()] || raw;
    sourceMap[normalized] = (sourceMap[normalized] || 0) + 1;
  });
  const sourceData = Object.entries(sourceMap).map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count);

  const statusMap: Record<string, number> = {};
  prospects.forEach((p: any) => {
    const s = p.status?.toLowerCase()?.trim() || 'active';
    statusMap[s] = (statusMap[s] || 0) + 1;
  });
  const statusData = Object.entries(statusMap).map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count);

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

  return { pipelineValue, activeLeads, hotLeads, zaraCaptures, unreadMessages, needsAttention, sourceData, statusData };
}

// ─── Section wrapper ───────────────────────────────────────────────────────────
const FadeUp = ({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) => (
  <motion.div
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    className={className}
  >
    {children}
  </motion.div>
);

// ─── Quick nav pills ───────────────────────────────────────────────────────────
const NAV_PILLS = [
  { label: 'Pipeline', to: '/pipeline' },
  { label: 'Deals', to: '/deals' },
  
  { label: 'Analytics', to: '/analytics' },
  { label: 'Forecast', to: '/forecast' },
  { label: 'Settings', to: '/settings' },
];

// ─── Page ──────────────────────────────────────────────────────────────────────
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

  const handleRefresh = useCallback(() => {
    if (!user?.id) return;
    const uid = user.id;
    Object.values(QK).forEach(fn => qc.invalidateQueries({ queryKey: fn(uid) }));
    onLiveUpdate();
  }, [user?.id, qc, onLiveUpdate]);

  useRealtimeInvalidation(user?.id, onLiveUpdate);

  const {
    pipelineValue, activeLeads, hotLeads, zaraCaptures, unreadMessages,
    needsAttention, sourceData, statusData,
  } = useCommandCenterData();

  const firstName = user?.user_metadata?.full_name?.split(' ')[0] || 'there';

  return (
    <AppLayout>
      <Header
        title="Command Center"
        subtitle={`${getGreeting()}, ${firstName}`}
        showAddDeal={false}
        action={
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
            <span className="hidden sm:inline text-[11px]">{format(lastUpdated, 'h:mm a')}</span>
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

      <div className="p-4 md:p-6 space-y-6 pb-28 lg:pb-10 max-w-[1440px] mx-auto">

        {/* ── ROW 1: Compact KPIs ─────────────────────────────── */}
        <FadeUp delay={0.03}>
          <HeroKPIs data={{ pipelineValue, activeLeads, hotLeads, zaraCaptures, unreadMessages }} />
        </FadeUp>

        {/* ── ROW 2: Calendar (full width) ─────────────────────── */}
        <FadeUp delay={0.06}>
          <CalendarWidget />
        </FadeUp>

        {/* ── ROW 3: Needs Attention + Today's Focus ────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <FadeUp delay={0.09} className="lg:col-span-2">
            <div className="h-full" style={{ minHeight: '360px' }}>
              <NeedsAttention prospects={needsAttention as any} />
            </div>
          </FadeUp>
          <FadeUp delay={0.12} className="lg:col-span-1">
            <div className="h-full">
              <TodaysFocus />
            </div>
          </FadeUp>
        </div>

        {/* ── ROW 4: Facebook Ads + Pipeline Insights side by side ── */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <FadeUp delay={0.15}>
            <div className="h-full" style={{ minHeight: '420px' }}>
              <FacebookAdsWidget />
            </div>
          </FadeUp>
          <FadeUp delay={0.18}>
            <div className="h-full" style={{ minHeight: '380px' }}>
              <PipelineInsights sourceData={sourceData} statusData={statusData} />
            </div>
          </FadeUp>
        </div>

      </div>
    </AppLayout>
  );
}
