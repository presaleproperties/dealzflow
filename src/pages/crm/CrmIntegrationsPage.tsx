import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import { Copy, RefreshCw, Database, MessageCircle, Calendar, Mail, Phone, Globe, Zap, CalendarClock, ArrowUpRight, Check, Save } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import type { LucideIcon } from 'lucide-react';

/* ─── helpers ─── */
const BASE = 'https://svbilqvudkkdhslxebce.supabase.co/functions/v1';

function copyUrl(url: string) {
  navigator.clipboard.writeText(url);
  toast.success('URL copied to clipboard');
}

const typeBadge: Record<string, { label: string; cls: string }> = {
  lofty_pull:       { label: 'Lofty Pull',       cls: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  manychat_ingest:  { label: 'ManyChat',          cls: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
  calendly_booking: { label: 'Calendly',           cls: 'bg-teal-500/15 text-teal-400 border-teal-500/30' },
  mailerlite_event: { label: 'MailerLite',         cls: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  nurture_run:      { label: 'Nurture Run',        cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
};

const statusBadge: Record<string, string> = {
  success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  error:   'bg-red-500/15 text-red-400 border-red-500/30',
  partial: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  running: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
};

/* ─── Connected Systems data ─── */
interface SystemCard {
  name: string;
  icon: LucideIcon;
  badgeLabel: string;
  badgeVariant: 'default' | 'success' | 'warning' | 'info';
  description: string;
  webhookUrl?: string;
  setup?: string;
}

const systems: SystemCard[] = [
  {
    name: 'Lofty CRM', icon: Database,
    badgeLabel: 'API Key Connected', badgeVariant: 'success',
    description: 'Bi-directional lead sync. Auto-pulls from Lofty every 15 min + pushes new CRM leads to Lofty.',
    setup: 'API key configured — sync is automatic',
  },
  {
    name: 'ManyChat (TikTok + IG)', icon: MessageCircle,
    badgeLabel: 'Webhook Ready', badgeVariant: 'success',
    description: 'Captures leads from TikTok and Instagram DMs.',
    webhookUrl: `${BASE}/lead-webhook?source=instagram_dm`,
    setup: 'Add URL as External Request in ManyChat',
  },
  {
    name: 'Calendly', icon: Calendar,
    badgeLabel: 'Webhook Ready', badgeVariant: 'success',
    description: 'Auto-updates lead status on booking.',
    webhookUrl: `${BASE}/calendly-webhook`,
    setup: 'Add URL in Calendly Webhooks for invitee.created',
  },
  {
    name: 'MailerLite', icon: Mail,
    badgeLabel: 'Needs Webhook', badgeVariant: 'warning',
    description: 'Tracks email opens/clicks for scoring.',
    webhookUrl: `${BASE}/engagement-webhook`,
    setup: 'Add in MailerLite Integrations → Webhooks',
  },
  {
    name: 'WhatsApp Business', icon: Phone,
    badgeLabel: 'Needs Templates', badgeVariant: 'warning',
    description: 'Sends nurture messages. Templates need Meta approval.',
  },
  {
    name: 'Google Calendar', icon: CalendarClock,
    badgeLabel: 'Connected', badgeVariant: 'success',
    description: 'Syncs showings with Google Calendar.',
  },
  {
    name: 'presaleproperties.com', icon: Globe,
    badgeLabel: 'Partial', badgeVariant: 'warning',
    description: 'Website forms + Zara widget feed leads.',
    webhookUrl: `${BASE}/lead-webhook?source=website`,
  },
  {
    name: 'Nurture Engine', icon: Zap,
    badgeLabel: 'Ready', badgeVariant: 'info',
    description: '7-day WhatsApp + Email sequence.',
    webhookUrl: `${BASE}/nurture-runner`,
    setup: 'Runs daily at 8AM PT',
  },
];

/* ─── Component ─── */
export default function CrmIntegrationsPage() {
  const [syncLogs, setSyncLogs] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const [logRes, bookRes] = await Promise.all([
      supabase.from('sync_log').select('*').order('started_at', { ascending: false }).limit(10),
      supabase.from('booking_events').select('*').order('created_at', { ascending: false }).limit(10),
    ]);
    if (logRes.data) setSyncLogs(logRes.data);
    if (bookRes.data) setBookings(bookRes.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const [syncing, setSyncing] = useState(false);

  const handleRunAll = async () => {
    setSyncing(true);
    toast.info('Syncing with Lofty...');
    try {
      const { data, error } = await supabase.functions.invoke('lofty-pull', {
        body: { source: 'manual' },
      });
      if (error) throw error;
      if (data?.success) {
        toast.success(`Lofty sync complete: ${data.created} created, ${data.updated} updated, ${data.total_fetched} total`);
      } else {
        toast.error(`Sync failed: ${data?.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      toast.error(`Sync error: ${err.message || 'Unknown error'}`);
    } finally {
      setSyncing(false);
      fetchData();
    }
  };

  return (
    <div className="space-y-8 p-4 md:p-6 max-w-[1400px] mx-auto">
      {/* Top bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Integrations Hub</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Connect and monitor all external systems feeding into DealsFlow</p>
        </div>
        <Button onClick={handleRunAll} disabled={syncing} className="gap-2 shrink-0">
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} /> {syncing ? 'Syncing...' : 'Sync with Lofty'}
        </Button>
      </div>

      {/* SECTION 1 — Sync History */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Sync History</CardTitle>
          <CardDescription>Last 10 sync runs — auto-refreshes every 30 seconds</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : syncLogs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <RefreshCw className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No sync history yet</p>
              <p className="text-xs mt-1">Runs will appear here once integrations start syncing</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Processed</TableHead>
                  <TableHead className="text-right">Created</TableHead>
                  <TableHead className="text-right">Updated</TableHead>
                  <TableHead className="text-right">Errors</TableHead>
                  <TableHead>Started At</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {syncLogs.map((row) => {
                  const tb = typeBadge[row.sync_type] ?? { label: row.sync_type, cls: 'bg-muted text-muted-foreground' };
                  const sb = statusBadge[row.status] ?? statusBadge.partial;
                  return (
                    <TableRow key={row.id}>
                      <TableCell><span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tb.cls}`}>{tb.label}</span></TableCell>
                      <TableCell><span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${sb}`}>{row.status}</span></TableCell>
                      <TableCell className="text-right font-mono text-xs">{row.records_processed}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{row.records_created}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{row.records_updated}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{row.error_count}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {row.started_at ? formatDistanceToNow(new Date(row.started_at), { addSuffix: true }) : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{row.duration_ms != null ? `${row.duration_ms}ms` : '—'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* SECTION 2 — Connected Systems */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Connected Systems</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {systems.map((s) => (
            <Card key={s.name} className="flex flex-col">
              <CardHeader className="pb-2 flex-row items-start gap-3 space-y-0">
                <div className="rounded-lg bg-muted/60 p-2.5">
                  <s.icon className="w-5 h-5 text-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-sm font-semibold leading-tight">{s.name}</CardTitle>
                  <Badge variant={s.badgeVariant} className="mt-1.5 text-[10px]">{s.badgeLabel}</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col gap-3 pt-0">
                <p className="text-xs text-muted-foreground leading-relaxed">{s.description}</p>
                {s.webhookUrl && (
                  <div className="flex items-center gap-1.5 bg-muted/40 rounded-lg px-2.5 py-1.5 mt-auto">
                    <code className="text-[10px] text-muted-foreground truncate flex-1">{s.webhookUrl}</code>
                    <button onClick={() => copyUrl(s.webhookUrl!)} className="shrink-0 p-1 rounded hover:bg-muted transition-colors" aria-label="Copy URL">
                      <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  </div>
                )}
                {s.setup && (
                  <p className="text-[10px] text-muted-foreground/70 italic">Setup: {s.setup}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* SECTION 2b — Outbound: Push to Lofty */}
      <LoftyOutboundSection />

      {/* SECTION 3 — Recent Bookings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Recent Bookings</CardTitle>
          <CardDescription>Calendar bookings from external sources</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : bookings.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No bookings yet</p>
              <p className="text-xs mt-1">Bookings from Calendly and other sources will appear here</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Event Type</TableHead>
                  <TableHead>Scheduled At</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bookings.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.lead_name ?? '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{b.lead_email ?? '—'}</TableCell>
                    <TableCell className="text-xs">{b.event_type ?? '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {b.scheduled_at ? format(new Date(b.scheduled_at), 'MMM d, yyyy h:mm a') : '—'}
                    </TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{b.source ?? '—'}</Badge></TableCell>
                    <TableCell><Badge variant="success" className="text-[10px] capitalize">{b.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Outbound Lofty Push Section ─── */
const LOFTY_WEBHOOK_KEY = 'lofty_outbound_webhook_url';

export function getLoftyOutboundWebhookUrl(): string | null {
  return localStorage.getItem(LOFTY_WEBHOOK_KEY);
}

function LoftyOutboundSection() {
  const [url, setUrl] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(LOFTY_WEBHOOK_KEY);
    if (stored) setUrl(stored);
  }, []);

  const handleSave = () => {
    const trimmed = url.trim();
    if (trimmed) {
      localStorage.setItem(LOFTY_WEBHOOK_KEY, trimmed);
    } else {
      localStorage.removeItem(LOFTY_WEBHOOK_KEY);
    }
    setSaved(true);
    toast.success(trimmed ? 'Outbound Lofty webhook saved' : 'Outbound webhook removed');
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <ArrowUpRight className="w-5 h-5 text-foreground" />
          <CardTitle className="text-lg">Push Leads to Lofty</CardTitle>
        </div>
        <CardDescription>
          Every new lead added in DealsFlow will be automatically sent to Lofty via your Zapier webhook.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="lofty-webhook" className="text-xs font-medium text-muted-foreground">
            Zapier Webhook URL (Catch Hook)
          </Label>
          <div className="flex gap-2">
            <Input
              id="lofty-webhook"
              placeholder="https://hooks.zapier.com/hooks/catch/..."
              value={url}
              onChange={e => { setUrl(e.target.value); setSaved(false); }}
              className="flex-1 font-mono text-xs"
            />
            <Button onClick={handleSave} size="sm" className="gap-1.5 shrink-0">
              {saved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
              {saved ? 'Saved' : 'Save'}
            </Button>
          </div>
        </div>
        <div className="rounded-lg bg-muted/40 p-3 space-y-1.5">
          <p className="text-xs font-medium text-foreground">Setup Instructions:</p>
          <ol className="text-[11px] text-muted-foreground space-y-1 list-decimal list-inside">
            <li>In Zapier, create a new Zap with <strong>Webhooks by Zapier → Catch Hook</strong> as the trigger</li>
            <li>Copy the webhook URL and paste it above</li>
            <li>Add an action step: <strong>Lofty → Create Lead</strong></li>
            <li>Map the fields: first_name, last_name, email, phone, source, status</li>
            <li>Turn on the Zap — new leads will flow automatically!</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
