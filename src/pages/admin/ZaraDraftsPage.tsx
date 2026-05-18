// Zara Drafts — Uzair's approval inbox for AI-generated outbound drafts.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { useIsAdmin } from '@/hooks/useAdmin';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Sparkles, Mail, MessageSquare, Send, X, Clock, VolumeX, RefreshCw,
  CheckCircle2, AlertTriangle, Flame, ArrowLeft,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

type Draft = {
  id: string;
  contact_id: string;
  channel: 'email' | 'sms' | 'whatsapp';
  trigger_kind: string;
  subject: string | null;
  body: string;
  original_subject: string | null;
  original_body: string | null;
  reasoning: string | null;
  confidence: number | null;
  scheduled_for: string;
  status: string;
  reject_reason: string | null;
  source_event: any;
  send_meta: any;
  created_at: string;
};

const FEEDBACK_LABELS: { key: string; label: string; tone: 'good' | 'bad' | 'neutral' }[] = [
  { key: 'sounds_like_uzair', label: 'Sounds Like Uzair', tone: 'good' },
  { key: 'good_tone', label: 'Good Tone', tone: 'good' },
  { key: 'good_investor_angle', label: 'Good Investor Angle', tone: 'good' },
  { key: 'too_robotic', label: 'Too Robotic', tone: 'bad' },
  { key: 'too_pushy', label: 'Too Pushy', tone: 'bad' },
  { key: 'too_long', label: 'Too Long', tone: 'bad' },
  { key: 'too_salesy', label: 'Too Salesy', tone: 'bad' },
  { key: 'weak_cta', label: 'Weak CTA', tone: 'bad' },
  { key: 'needs_more_trust', label: 'Needs More Trust Building', tone: 'neutral' },
  { key: 'escalate_to_uzair', label: 'Escalate To Uzair', tone: 'neutral' },
];

type Contact = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  tags: string[] | null;
  language: string | null;
};

const TRIGGER_LABEL: Record<string, string> = {
  cold_nudge: 'Cold nudge',
  new_lead_welcome: 'New lead',
  presale_burst: 'Presale activity',
  post_showing: 'Post-showing',
  manual: 'Manual',
};

function ChannelIcon({ ch, className }: { ch: string; className?: string }) {
  if (ch === 'email') return <Mail className={className} />;
  return <MessageSquare className={className} />;
}

export default function ZaraDraftsPage() {
  const { data: isAdmin, isLoading: checking } = useIsAdmin();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'pending' | 'snoozed' | 'sent' | 'rejected' | 'failed'>('pending');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [contacts, setContacts] = useState<Record<string, Contact>>({});
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    if (!checking && !isAdmin) navigate('/');
  }, [checking, isAdmin, navigate]);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('crm_zara_drafts')
      .select('*')
      .eq('status', tab)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      toast.error('Failed to load drafts');
      setLoading(false);
      return;
    }
    const list = (data ?? []) as Draft[];
    setDrafts(list);
    const ids = Array.from(new Set(list.map((d) => d.contact_id)));
    if (ids.length) {
      const { data: cs } = await supabase
        .from('crm_contacts')
        .select('id, first_name, last_name, email, phone, tags, language')
        .in('id', ids);
      const map: Record<string, Contact> = {};
      (cs ?? []).forEach((c: any) => { map[c.id] = c; });
      setContacts(map);
    }
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tab]);

  // realtime
  useEffect(() => {
    const ch = supabase.channel('zara-drafts-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_zara_drafts' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, [tab]);

  const selected = useMemo(() => drafts.find((d) => d.id === selectedId) ?? null, [drafts, selectedId]);
  const selectedContact = selected ? contacts[selected.contact_id] : null;

  useEffect(() => {
    if (selected) {
      setEditSubject(selected.subject ?? '');
      setEditBody(selected.body);
      setSelectedLabels([]);
    }
  }, [selectedId]); // eslint-disable-line

  async function runPlanner() {
    setPlanning(true);
    try {
      const { data, error } = await supabase.functions.invoke('zara-plan-outbound', { body: { limit: 25 } });
      if (error) throw error;
      const r: any = data;
      if (r?.ok) toast.success(`Planner: ${r.generated} new draft${r.generated === 1 ? '' : 's'}`);
      else toast.warning(`Planner: ${r?.reason ?? 'no drafts generated'}`);
      load();
    } catch (e: any) {
      toast.error(`Planner failed: ${e.message ?? e}`);
    } finally { setPlanning(false); }
  }

  async function act(action: 'approve' | 'reject' | 'snooze' | 'mute', extra: Record<string, unknown> = {}) {
    if (!selected) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('zara-draft-action', {
        body: { draft_id: selected.id, action, ...extra },
      });
      if (error) throw error;
      const r: any = data;
      if (r?.error || r?.ok === false) toast.error(`${action} failed: ${r.error ?? 'unknown'}`);
      else toast.success(`${action === 'approve' ? 'Sent' : action.charAt(0).toUpperCase() + action.slice(1) + 'd'}`);
      setSelectedId(null);
      load();
    } catch (e: any) { toast.error(e.message ?? String(e)); }
    finally { setBusy(false); }
  }

  if (checking) return null;

  return (
    <AppLayout>
      <Header title="Zara Drafts" subtitle="Co-pilot approval inbox" />
      <div className="container max-w-7xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin/zara')} className="-ml-2">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold tracking-tight">Zara Drafts</h1>
            <Badge variant="outline" className="ml-1 text-[10px]">Co-pilot mode</Badge>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
            <Button size="sm" onClick={runPlanner} disabled={planning}>
              <Sparkles className={`h-4 w-4 mr-1 ${planning ? 'animate-pulse' : ''}`} />
              {planning ? 'Planning…' : 'Run planner now'}
            </Button>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => { setSelectedId(null); setTab(v as any); }}>
          <TabsList>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="snoozed">Snoozed</TabsTrigger>
            <TabsTrigger value="sent">Sent</TabsTrigger>
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
            <TabsTrigger value="failed">Failed</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4">
          {/* List */}
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[calc(100dvh-260px)]">
                {loading ? (
                  <div className="p-3 space-y-2">
                    {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
                  </div>
                ) : drafts.length === 0 ? (
                  <div className="p-10 text-center text-sm text-muted-foreground">
                    No {tab} drafts. {tab === 'pending' && 'Run the planner to generate some.'}
                  </div>
                ) : (
                  <ul>
                    {drafts.map((d) => {
                      const c = contacts[d.contact_id];
                      const name = c ? [c.first_name, c.last_name].filter(Boolean).join(' ') || '(unnamed)' : '…';
                      const isSel = d.id === selectedId;
                      return (
                        <li key={d.id}>
                          <button
                            onClick={() => setSelectedId(d.id)}
                            className={`w-full text-left px-4 py-3 border-b border-border hover:bg-muted/40 transition ${isSel ? 'bg-muted/60' : ''}`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <ChannelIcon ch={d.channel} className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="font-medium text-sm truncate">{name}</span>
                              <Badge variant="outline" className="text-[10px] ml-auto">{TRIGGER_LABEL[d.trigger_kind] ?? d.trigger_kind}</Badge>
                            </div>
                            <div className="text-xs text-muted-foreground line-clamp-2">{d.subject ? `${d.subject} — ` : ''}{d.body}</div>
                            <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {formatDistanceToNow(new Date(d.created_at), { addSuffix: true })}
                              {d.confidence != null && <span>· {Math.round(d.confidence * 100)}% conf</span>}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Detail / editor */}
          <Card>
            <CardContent className="p-5">
              {!selected ? (
                <div className="h-[calc(100dvh-260px)] flex items-center justify-center text-sm text-muted-foreground">
                  Select a draft to review.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <ChannelIcon ch={selected.channel} className="h-4 w-4 text-muted-foreground" />
                        <span className="font-semibold">
                          {selectedContact ? [selectedContact.first_name, selectedContact.last_name].filter(Boolean).join(' ') || '(unnamed)' : '…'}
                        </span>
                        <Badge variant="outline">{TRIGGER_LABEL[selected.trigger_kind] ?? selected.trigger_kind}</Badge>
                        {selected.confidence != null && (
                          <span className="text-xs text-muted-foreground">{Math.round(selected.confidence * 100)}% confidence</span>
                        )}
                      </div>
                      <Link to={`/crm/leads/${selected.contact_id}`} className="text-xs text-primary hover:underline">
                        Open lead →
                      </Link>
                    </div>
                  </div>

                  {selected.reasoning && (
                    <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Why now:</span> {selected.reasoning}
                    </div>
                  )}

                  {selected.channel === 'email' && (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Subject</label>
                      <Input
                        value={editSubject}
                        onChange={(e) => setEditSubject(e.target.value)}
                        disabled={selected.status !== 'pending' && selected.status !== 'snoozed'}
                        className="mt-1"
                      />
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      Body {selected.channel !== 'email' && `(${editBody.length} chars)`}
                    </label>
                    <Textarea
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      rows={selected.channel === 'email' ? 8 : 5}
                      disabled={selected.status !== 'pending' && selected.status !== 'snoozed'}
                      className="mt-1 font-mono text-sm"
                    />
                  </div>

                  {selected.status === 'pending' || selected.status === 'snoozed' ? (
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => act('approve', { subject: editSubject, body: editBody })} disabled={busy}>
                        <Send className="h-4 w-4 mr-1" /> Approve & send
                      </Button>
                      <Button variant="outline" onClick={() => act('snooze', { snooze_hours: 24 })} disabled={busy}>
                        <Clock className="h-4 w-4 mr-1" /> Snooze 24h
                      </Button>
                      <Button variant="outline" onClick={() => setRejectOpen(true)} disabled={busy}>
                        <X className="h-4 w-4 mr-1" /> Reject
                      </Button>
                      <Button variant="outline" onClick={() => act('mute')} disabled={busy} className="ml-auto">
                        <VolumeX className="h-4 w-4 mr-1" /> Mute lead
                      </Button>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground space-y-1">
                      <div className="flex items-center gap-2">
                        {selected.status === 'sent' && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                        {selected.status === 'rejected' && <X className="h-4 w-4 text-muted-foreground" />}
                        {selected.status === 'failed' && <AlertTriangle className="h-4 w-4 text-rose-500" />}
                        <span className="capitalize">{selected.status}</span>
                      </div>
                      {selected.reject_reason && <div>Reason: {selected.reject_reason}</div>}
                      {selected.send_meta?.error && <div className="text-rose-500">Error: {String(selected.send_meta.error)}</div>}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject draft</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="Why? (helps train Zara)"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button onClick={() => { setRejectOpen(false); act('reject', { reason: rejectReason }); setRejectReason(''); }}>
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
