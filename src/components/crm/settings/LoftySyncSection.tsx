import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Database, Copy, ChevronDown, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

const WEBHOOK_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/lofty-ingest`;

export default function LoftySyncSection() {
  const [setupOpen, setSetupOpen] = useState(false);

  // Fetch sync stats
  const { data: syncStats } = useQuery({
    queryKey: ['lofty-sync-stats'],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);

      const [todayRes, weekRes, totalRes, lastRes] = await Promise.all([
        supabase.from('crm_sync_log').select('id', { count: 'exact', head: true })
          .gte('created_at', today.toISOString())
          .in('event_type', ['lead.created', 'lead.updated']),
        supabase.from('crm_sync_log').select('id', { count: 'exact', head: true })
          .gte('created_at', weekAgo.toISOString())
          .in('event_type', ['lead.created', 'lead.updated']),
        supabase.from('crm_sync_log').select('id', { count: 'exact', head: true })
          .in('event_type', ['lead.created', 'lead.updated']),
        supabase.from('crm_sync_log').select('created_at')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      return {
        today: todayRes.count ?? 0,
        week: weekRes.count ?? 0,
        total: totalRes.count ?? 0,
        lastSync: lastRes.data?.created_at ?? null,
      };
    },
    refetchInterval: 30000,
  });

  // Fetch recent sync logs
  const { data: syncLogs = [] } = useQuery({
    queryKey: ['lofty-sync-logs'],
    queryFn: async () => {
      const { data } = await supabase
        .from('crm_sync_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      return data ?? [];
    },
    refetchInterval: 30000,
  });

  // Connection status
  const connectionStatus = (() => {
    if (!syncStats) return 'pending';
    if (syncStats.total === 0) return 'pending';
    const lastSync = syncStats.lastSync ? new Date(syncStats.lastSync) : null;
    if (!lastSync) return 'pending';
    const hoursSince = (Date.now() - lastSync.getTime()) / 3600000;
    if (hoursSince > 24) return 'error';
    return 'connected';
  })();

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  return (
    <Card className="rounded-[10px] lg:rounded-xl border-primary/20">
      <CardHeader className="px-3 sm:px-6 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-primary/10">
              <Database className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base sm:text-lg">Lofty → Dealzflow Live Sync</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Automatically sync leads from Lofty CRM via Zapier</p>
            </div>
          </div>
          <StatusBadge status={connectionStatus} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4 px-3 sm:px-6">
        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Today" value={syncStats?.today ?? 0} />
          <StatCard label="This Week" value={syncStats?.week ?? 0} />
          <StatCard label="Total Synced" value={syncStats?.total ?? 0} />
          <StatCard
            label="Last Sync"
            value={syncStats?.lastSync ? formatDistanceToNow(new Date(syncStats.lastSync), { addSuffix: true }) : 'Never'}
            isText
          />
        </div>

        {/* Zapier Setup Guide */}
        <Collapsible open={setupOpen} onOpenChange={setSetupOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full justify-between h-10 text-sm">
              <span>📋 Zapier Setup Guide</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${setupOpen ? 'rotate-180' : ''}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3">
            <div className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-4 text-sm">
              <p className="font-semibold text-foreground">Connect Lofty to Dealzflow in 5 minutes:</p>
              <ol className="space-y-2.5 text-muted-foreground list-decimal list-inside">
                <li>Open <a href="https://zapier.com" target="_blank" rel="noopener" className="text-primary underline">zapier.com</a> and create a new Zap</li>
                <li><strong>Trigger:</strong> Choose "Lofty" → Event: "New Lead" — connect your Lofty account</li>
                <li><strong>Action:</strong> Choose "Webhooks by Zapier" → Event: "POST"</li>
                <li>
                  <strong>Configure the POST:</strong>
                  <ul className="ml-5 mt-1.5 space-y-1 list-disc text-xs">
                    <li>URL: paste the webhook URL below</li>
                    <li>Payload Type: JSON</li>
                    <li>Data: Map Lofty fields → <code>id</code>, <code>first_name</code>, <code>last_name</code>, <code>email</code>, <code>phone</code>, <code>source</code>, <code>status</code>, <code>tags</code>, <code>address</code>, <code>notes</code></li>
                    <li>Headers: add <code>x-webhook-secret</code> → paste the secret below</li>
                    <li>Headers: add <code>Content-Type</code> → <code>application/json</code></li>
                  </ul>
                </li>
                <li>Test the Zap — you should see "Success" and the lead appears in Dealzflow</li>
                <li>Turn the Zap <strong>ON</strong></li>
              </ol>

              {/* Webhook URL */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Webhook URL</label>
                <div className="flex items-center gap-2">
                  <Input value={WEBHOOK_URL} readOnly className="text-xs font-mono h-8 bg-card" />
                  <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => copyToClipboard(WEBHOOK_URL, 'Webhook URL')}>
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              {/* Secret hint */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Webhook Secret</label>
                <p className="text-xs text-muted-foreground">
                  The secret is configured in your backend environment. Use the value you set for <code>LOFTY_INGEST_SECRET</code> as the <code>x-webhook-secret</code> header in Zapier.
                </p>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Sync Log Table */}
        {syncLogs.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-foreground">Recent Sync Activity</h4>
            <div className="rounded-lg border border-border/60 overflow-hidden max-h-[300px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="text-xs h-8">Time</TableHead>
                    <TableHead className="text-xs h-8">Lead</TableHead>
                    <TableHead className="text-xs h-8">Event</TableHead>
                    <TableHead className="text-xs h-8">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {syncLogs.map((log: Record<string, unknown>) => (
                    <TableRow key={log.id as string} className="hover:bg-muted/20">
                      <TableCell className="text-xs text-muted-foreground py-2">
                        {formatDistanceToNow(new Date(log.created_at as string), { addSuffix: true })}
                      </TableCell>
                      <TableCell className="text-xs py-2">
                        <div>
                          <span className="text-foreground">{(log.contact_name as string) || '—'}</span>
                          {log.contact_email && <span className="text-muted-foreground ml-1 text-[10px]">({log.contact_email as string})</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs py-2">
                        <Badge variant="outline" className="text-[10px] border-0 bg-muted/50">
                          {formatEventType(log.event_type as string)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs py-2">
                        {(log.status as string) === 'success' ? (
                          <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Success</span>
                        ) : (
                          <span className="text-destructive flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Failed</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'connected')
    return <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 gap-1" variant="outline">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Connected
    </Badge>;
  if (status === 'error')
    return <Badge className="bg-destructive/15 text-destructive border-destructive/30 gap-1" variant="outline">
      <span className="w-1.5 h-1.5 rounded-full bg-destructive" /> No syncs in 24h
    </Badge>;
  return <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 gap-1" variant="outline">
    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Pending setup
  </Badge>;
}

function StatCard({ label, value, isText }: { label: string; value: string | number; isText?: boolean }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-center">
      <p className={`font-bold text-foreground ${isText ? 'text-sm' : 'text-lg'}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function formatEventType(type: string | null): string {
  const map: Record<string, string> = {
    'lead.created': 'Created',
    'lead.updated': 'Updated',
    'lead.error': 'Error',
    'sync.completed': 'Full Sync',
  };
  return map[type ?? ''] || type || 'Unknown';
}
