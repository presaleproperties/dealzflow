import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Layers, Activity } from 'lucide-react';

interface LeadSource {
  id: string;
  slug: string;
  display_name: string;
  source_type: string;
  description: string | null;
  is_active: boolean;
  default_lead_type: string | null;
  total_leads_ingested: number;
  last_event_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
}

interface RecentEvent {
  id: string;
  source_slug: string;
  event_type: string;
  email: string | null;
  status: string;
  contact_id: string | null;
  error_message: string | null;
  created_at: string;
}

const typeColor: Record<string, string> = {
  webhook: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  api: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  manual: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  form: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  ads: 'bg-pink-500/15 text-pink-400 border-pink-500/30',
  calendar: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
};

const statusColor: Record<string, string> = {
  received: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  processed: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  failed: 'bg-red-500/15 text-red-400 border-red-500/30',
  skipped: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
};

export function LeadSourcesPanel() {
  const [sources, setSources] = useState<LeadSource[]>([]);
  const [events, setEvents] = useState<RecentEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: srcs }, { data: evts }] = await Promise.all([
      supabase.from('crm_lead_sources').select('*').order('display_name'),
      supabase.from('crm_source_events').select('id, source_slug, event_type, email, status, contact_id, error_message, created_at').order('created_at', { ascending: false }).limit(20),
    ]);
    setSources((srcs as LeadSource[]) || []);
    setEvents((evts as RecentEvent[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleActive = async (id: string, next: boolean) => {
    const { error } = await supabase.from('crm_lead_sources').update({ is_active: next }).eq('id', id);
    if (error) {
      toast.error('Failed to update source: ' + error.message);
      return;
    }
    toast.success(next ? 'Source enabled' : 'Source disabled');
    setSources(prev => prev.map(s => s.id === id ? { ...s, is_active: next } : s));
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            <CardTitle>Lead Sources</CardTitle>
          </div>
          <CardDescription>
            Every integration that feeds leads into the CRM. New sources can be added here as you connect more channels.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead>Last Event</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sources.map(s => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="font-medium">{s.display_name}</div>
                      {s.description && <div className="text-xs text-muted-foreground">{s.description}</div>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={typeColor[s.source_type] || ''}>{s.source_type}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s.total_leads_ingested}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {s.last_event_at ? formatDistanceToNow(new Date(s.last_event_at), { addSuffix: true }) : '—'}
                    </TableCell>
                    <TableCell>
                      {s.last_error ? (
                        <Badge variant="outline" className="bg-red-500/15 text-red-400 border-red-500/30" title={s.last_error}>
                          Error
                        </Badge>
                      ) : s.last_event_at ? (
                        <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                          Healthy
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-zinc-500/15 text-zinc-400 border-zinc-500/30">
                          No data
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Switch checked={s.is_active} onCheckedChange={(v) => toggleActive(s.id, v)} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <CardTitle>Recent Inbound Events</CardTitle>
          </div>
          <CardDescription>Last 20 raw events received from any source. Use this for debugging & replay.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : events.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">No events yet — they'll appear here as soon as a source sends data.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map(e => (
                  <TableRow key={e.id}>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                    </TableCell>
                    <TableCell className="text-sm">{e.source_slug}</TableCell>
                    <TableCell className="text-sm">{e.event_type}</TableCell>
                    <TableCell className="text-sm">{e.email || '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusColor[e.status] || ''} title={e.error_message || ''}>
                        {e.status}
                      </Badge>
                    </TableCell>
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
