import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import { Copy, RefreshCw, Database, Calendar, Globe, Zap, CalendarClock, Check, Save, Eye, EyeOff, Pencil, ArrowDownToLine } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import type { LucideIcon } from 'lucide-react';

/* ─── helpers ─── */
const BASE = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1`;

function copyUrl(url: string) {
  navigator.clipboard.writeText(url);
  toast.success('URL copied to clipboard');
}

const typeBadge: Record<string, { label: string; cls: string }> = {
  calendly_booking: { label: 'Calendly',           cls: 'bg-teal-500/15 text-teal-400 border-teal-500/30' },
  nurture_run:      { label: 'Nurture Run',        cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  zapier_lofty:     { label: 'Lofty (In)',         cls: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  zapier_outbound:  { label: 'Lofty (Out)',        cls: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
};

const statusBadge: Record<string, string> = {
  success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  error:   'bg-red-500/15 text-red-400 border-red-500/30',
  partial: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  running: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  failed:  'bg-red-500/15 text-red-400 border-red-500/30',
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
  secretKey?: string;
  secretLabel?: string;
}

const systems: SystemCard[] = [
  {
    name: 'Calendly', icon: Calendar,
    badgeLabel: 'Webhook Ready', badgeVariant: 'success',
    description: 'Auto-updates lead status on booking.',
    webhookUrl: `${BASE}/calendly-webhook`,
    setup: 'Add URL in Calendly Webhooks for invitee.created',
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
    description: '7-day Email nurture sequence.',
    webhookUrl: `${BASE}/nurture-runner`,
    setup: 'Runs daily at 8AM PT',
  },
];
/* ─── Component ─── */
export default function CrmIntegrationsPage() {
  const [syncLogs, setSyncLogs] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (showErrorToast = false) => {
    try {
      const [logRes, bookRes] = await Promise.all([
        supabase.from('sync_log').select('*').order('started_at', { ascending: false }).limit(10),
        supabase.from('booking_events').select('*').order('created_at', { ascending: false }).limit(10),
      ]);

      if (logRes.error) throw logRes.error;
      if (bookRes.error) throw bookRes.error;

      setSyncLogs(logRes.data ?? []);
      setBookings(bookRes.data ?? []);
      return true;
    } catch (error: any) {
      if (showErrorToast) {
        toast.error(`Failed to load integration activity: ${error.message || 'Unknown error'}`);
      }
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const [syncing, setSyncing] = useState(false);

  const handleRunAll = async () => {
    setSyncing(true);
    toast.info('Lofty now syncs via webhook — refreshing activity only.');
    try {
      const refreshed = await fetchData(true);
      if (refreshed) {
        toast.success('Integration activity refreshed');
      }
    } finally {
      setSyncing(false);
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
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} /> {syncing ? 'Refreshing...' : 'Refresh Activity'}
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

      {/* SECTION 2 — Lofty ↔ Zapier Two-Way Sync */}
      <LoftyZapierCard />

      {/* SECTION 3 — Connected Systems */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Connected Systems</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {systems.map((s) => (
            <SystemCardItem key={s.name} system={s} />
          ))}
        </div>
      </div>

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

/* ─── Lofty Zapier Inbound Sync Card ─── */
function LoftyZapierCard() {
  const inboundUrl = `${BASE}/lofty-ingest`;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2.5">
            <Zap className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">Lofty → DealsFlow (Zapier)</CardTitle>
            <CardDescription>Inbound lead sync — new & updated leads from Lofty flow into your CRM automatically</CardDescription>
          </div>
          <Badge variant="success" className="text-[10px] ml-auto">Ready</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">When a lead is created or updated in Lofty, Zapier sends it to this webhook. Duplicates are detected by Lofty ID, email, or phone.</p>
        <div className="flex items-center gap-1.5 bg-muted/40 rounded-lg px-2.5 py-1.5">
          <code className="text-[10px] text-muted-foreground truncate flex-1">{inboundUrl}</code>
          <button onClick={() => copyUrl(inboundUrl)} className="shrink-0 p-1 rounded hover:bg-muted transition-colors" aria-label="Copy URL">
            <Copy className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>
        <div className="text-[11px] text-muted-foreground/80 space-y-1">
          <p className="font-medium text-foreground">Zapier Setup:</p>
          <ol className="list-decimal list-inside space-y-0.5">
            <li>Create a Zap with Trigger: <strong>Lofty → New Lead</strong></li>
            <li>Add Action: <strong>Webhooks by Zapier → POST</strong></li>
            <li>Set URL to the webhook above</li>
            <li>Add header: <code className="bg-muted px-1 rounded">x-webhook-secret</code> = your ingest secret</li>
            <li>Map Lofty fields: first_name, last_name, email, phone, source, status, lead_id</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
function SystemCardItem({ system: s }: { system: SystemCard }) {
  const [showKey, setShowKey] = useState(false);
  const [editing, setEditing] = useState(false);
  const [keyValue, setKeyValue] = useState('');
  const [saving, setSaving] = useState(false);

  // Load stored key from localStorage
  useEffect(() => {
    if (s.secretKey) {
      const stored = localStorage.getItem(`integration_key_${s.secretKey}`);
      if (stored) setKeyValue(stored);
    }
  }, [s.secretKey]);

  const handleSaveKey = async () => {
    if (!s.secretKey) return;
    setSaving(true);
    // Store locally for display purposes
    localStorage.setItem(`integration_key_${s.secretKey}`, keyValue.trim());
    
    // Copy to clipboard so user can paste into the secret update form
    if (keyValue.trim()) {
      navigator.clipboard.writeText(keyValue.trim());
      toast.success(`${s.secretLabel} saved locally & copied to clipboard`);
    } else {
      localStorage.removeItem(`integration_key_${s.secretKey}`);
      toast.success(`${s.secretLabel} removed`);
    }
    setSaving(false);
    setEditing(false);
  };

  const maskedValue = keyValue ? `${keyValue.substring(0, 6)}${'•'.repeat(Math.min(20, keyValue.length - 6))}` : '';

  return (
    <Card className="flex flex-col">
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
        
        {/* Editable API Key */}
        {s.secretKey && (
          <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/20 p-2.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-medium text-muted-foreground">{s.secretLabel}</label>
              <div className="flex items-center gap-1">
                {keyValue && (
                  <button
                    onClick={() => setShowKey(!showKey)}
                    className="p-1 rounded hover:bg-muted transition-colors"
                    aria-label={showKey ? 'Hide key' : 'Show key'}
                  >
                    {showKey ? <EyeOff className="w-3 h-3 text-muted-foreground" /> : <Eye className="w-3 h-3 text-muted-foreground" />}
                  </button>
                )}
                <button
                  onClick={() => setEditing(!editing)}
                  className="p-1 rounded hover:bg-muted transition-colors"
                  aria-label="Edit key"
                >
                  <Pencil className="w-3 h-3 text-muted-foreground" />
                </button>
                {keyValue && (
                  <button
                    onClick={() => { navigator.clipboard.writeText(keyValue); toast.success('Key copied'); }}
                    className="p-1 rounded hover:bg-muted transition-colors"
                    aria-label="Copy key"
                  >
                    <Copy className="w-3 h-3 text-muted-foreground" />
                  </button>
                )}
              </div>
            </div>
            {editing ? (
              <div className="flex gap-1.5">
                <Input
                  value={keyValue}
                  onChange={e => setKeyValue(e.target.value)}
                  placeholder="Paste your API key..."
                  className="flex-1 font-mono text-[10px] h-7"
                />
                <Button size="sm" onClick={handleSaveKey} disabled={saving} className="h-7 px-2 text-[10px]">
                  <Save className="w-3 h-3 mr-1" /> Save
                </Button>
              </div>
            ) : (
              <p className="font-mono text-[10px] text-muted-foreground truncate">
                {keyValue ? (showKey ? keyValue : maskedValue) : <span className="italic">No key set — click ✏️ to add</span>}
              </p>
            )}
          </div>
        )}
        
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
  );
}

