import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  MessageSquare, Send, Plus, Trash2, Pencil, Users, ShieldOff,
  Calendar, CheckCircle2, XCircle, Clock, Phone, Inbox, Loader2,
  Sparkles, Search, ArrowRight, Filter, Settings as SettingsIcon, Zap, Activity, ShieldCheck, BarChart3,
} from 'lucide-react';
import {
  useSmsTemplates, useSaveSmsTemplate, useDeleteSmsTemplate,
  useSmsCampaigns, useSmsOptOuts, useSmsNumbers, useSmsSettings, useAllSmsLog,
  smsSegments, type MessagingChannel,
} from '@/hooks/useSms';
import { useCrmContacts, LEAD_STATUSES, LEAD_SOURCES, AGENTS } from '@/hooks/useCrmContacts';
import { BulkSendTextDialog } from '@/components/crm/leads/BulkSendTextDialog';
import { MessagingCenter } from '@/components/crm/sms/MessagingCenter';
import { DeliveryStatusPanel } from '@/components/crm/sms/DeliveryStatusPanel';
import { MessagingStatusPanel } from '@/components/crm/sms/MessagingStatusPanel';
import { WhatsAppHealthCheckPanel } from '@/components/crm/sms/WhatsAppHealthCheckPanel';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

// ============== Channel pill ==============
function ChannelToggle({
  channel, onChange, size = 'md',
}: { channel: MessagingChannel; onChange: (c: MessagingChannel) => void; size?: 'sm' | 'md' }) {
  const sm = size === 'sm';
  return (
    <div className={cn('inline-flex items-center gap-1 rounded-lg bg-muted p-0.5', sm && 'p-[3px]')}>
      <button
        onClick={() => onChange('sms')}
        className={cn(
          'rounded-md font-semibold transition-all flex items-center gap-1.5',
          sm ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-xs',
          channel === 'sms'
            ? 'bg-background shadow-sm text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <MessageSquare className={sm ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
        SMS
      </button>
      <button
        onClick={() => onChange('whatsapp')}
        className={cn(
          'rounded-md font-semibold transition-all flex items-center gap-1.5',
          sm ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-xs',
          channel === 'whatsapp'
            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <span className={cn('rounded-full bg-emerald-500', sm ? 'w-2 h-2' : 'w-2.5 h-2.5')} />
        WhatsApp
      </button>
    </div>
  );
}

export default function CrmSmsCenterPage() {
  const navigate = useNavigate();
  const [channel, setChannel] = useState<MessagingChannel>('sms');

  const { data: allTemplates = [] } = useSmsTemplates();
  const { data: allCampaigns = [] } = useSmsCampaigns();
  const { data: optOuts = [] } = useSmsOptOuts();
  const { data: numbers = [] } = useSmsNumbers();
  const { data: settings } = useSmsSettings();
  const { data: allContacts = [] } = useCrmContacts();
  const { data: logs = [] } = useAllSmsLog({ limit: 500 });

  // Filter by channel
  const templates = useMemo(() => allTemplates.filter(t => (t.channel || 'sms') === channel), [allTemplates, channel]);
  const campaigns = useMemo(() => allCampaigns.filter(c => (c.channel || 'sms') === channel), [allCampaigns, channel]);
  const channelLogs = useMemo(() => logs.filter(l => (l.channel || 'sms') === channel), [logs, channel]);

  const [tab, setTab] = useState('inbox');
  const [monitorTab, setMonitorTab] = useState<'stats' | 'status' | 'health' | 'delivery'>('stats');
  const [blastsTab, setBlastsTab] = useState<'compose' | 'history'>('compose');
  const [setupTab, setSetupTab] = useState<'config' | 'optouts'>('config');

  // Composer (bulk)
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerIds, setComposerIds] = useState<string[]>([]);

  // Filters for new blast
  const [fStatuses, setFStatuses] = useState<string[]>([]);
  const [fSources, setFSources] = useState<string[]>([]);
  const [fAgents, setFAgents] = useState<string[]>([]);
  const [fTags, setFTags] = useState<string>('');

  const filteredRecipients = useMemo(() => {
    const tagsArr = fTags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
    return allContacts.filter(c => {
      if (!c.phone) return false;
      if (fStatuses.length && !fStatuses.includes(c.status || '')) return false;
      if (fSources.length && !fSources.includes(c.source || '')) return false;
      if (fAgents.length && !fAgents.includes(c.assigned_to || '')) return false;
      if (tagsArr.length && !(c.tags || []).some(t => tagsArr.includes(t.toLowerCase()))) return false;
      return true;
    });
  }, [allContacts, fStatuses, fSources, fAgents, fTags]);

  const toggleArr = (arr: string[], v: string, set: (a: string[]) => void) => {
    set(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);
  };

  const launchBlast = () => {
    if (filteredRecipients.length === 0) return;
    setComposerIds(filteredRecipients.map(c => c.id));
    setComposerOpen(true);
  };

  // Stats for current channel
  const totals = useMemo(() => {
    return campaigns.reduce(
      (acc, c) => ({
        sent: acc.sent + (c.sent_count || 0),
        delivered: acc.delivered + (c.delivered_count || 0),
        failed: acc.failed + (c.failed_count || 0),
        replies: acc.replies + (c.reply_count || 0),
      }),
      { sent: 0, delivered: 0, failed: 0, replies: 0 }
    );
  }, [campaigns]);

  const isWa = channel === 'whatsapp';

  return (
    <div className="space-y-4 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Messaging Center</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Conversations, blasts &amp; templates — powered by Twilio
          </p>
        </div>
        <ChannelToggle channel={channel} onChange={setChannel} />
      </div>

      {/* WhatsApp readiness banner */}
      {isWa && (() => {
        const waFrom = settings?.whatsapp_from || '';
        const isSandbox = waFrom === '+14155238886';
        const hasConfig = !!(settings?.whatsapp_enabled && (waFrom || settings?.whatsapp_messaging_service_sid));
        return (
          <div className={cn(
            'rounded-lg border px-3 py-2 text-xs flex flex-wrap items-center gap-2',
            !hasConfig
              ? 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400'
              : isSandbox
                ? 'border-blue-500/30 bg-blue-500/5 text-blue-700 dark:text-blue-400'
                : 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400',
          )}>
            <span className="rounded-full bg-emerald-500 w-2 h-2 shrink-0" />
            {!hasConfig ? (
              <>
                <span className="font-medium">WhatsApp not configured.</span>
                <span>Add your Twilio WhatsApp sender (sandbox <code className="px-1 rounded bg-muted">+14155238886</code> or your approved business number) in Setup.</span>
                <Button size="sm" variant="outline" className="ml-auto h-6 text-[11px]" onClick={() => setTab('settings')}>
                  Open Setup
                </Button>
              </>
            ) : isSandbox ? (
              <>
                <span className="font-medium">Twilio Sandbox mode</span>
                <span>· sending from <code className="px-1 rounded bg-muted">+1 415 523 8886</code>. Recipients must opt in via the sandbox keyword first. Switch to your approved number in Setup once registered.</span>
              </>
            ) : (
              <>
                <span className="font-medium">Live WhatsApp Business</span>
                <span>· sending from <code className="px-1 rounded bg-muted">{waFrom}</code>. Outside the 24h window, only approved templates can start a conversation.</span>
              </>
            )}
          </div>
        );
      })()}

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid grid-cols-5 w-full sm:w-auto h-auto">
          <TabsTrigger value="inbox" className="gap-1.5 text-xs sm:text-sm py-2">
            <Inbox className="w-3.5 h-3.5" /><span>Inbox</span>
          </TabsTrigger>
          <TabsTrigger value="blasts" className="gap-1.5 text-xs sm:text-sm py-2">
            <Zap className="w-3.5 h-3.5" /><span>Blasts</span>
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-1.5 text-xs sm:text-sm py-2">
            <MessageSquare className="w-3.5 h-3.5" /><span>Templates</span>
          </TabsTrigger>
          <TabsTrigger value="monitor" className="gap-1.5 text-xs sm:text-sm py-2">
            <Activity className="w-3.5 h-3.5" /><span>Monitor</span>
          </TabsTrigger>
          <TabsTrigger value="setup" className="gap-1.5 text-xs sm:text-sm py-2">
            <SettingsIcon className="w-3.5 h-3.5" /><span>Setup</span>
          </TabsTrigger>
        </TabsList>

        {/* === INBOX (iMessage / WhatsApp conversation view) === */}
        <TabsContent value="inbox" className="mt-4">
          <MessagingCenter channel={channel} onChannelChange={setChannel} />
        </TabsContent>

        {/* === BLASTS (Compose + History) === */}
        <TabsContent value="blasts" className="mt-4 space-y-4">
          <SubTabBar
            value={blastsTab}
            onChange={(v) => setBlastsTab(v as any)}
            options={[
              { value: 'compose', label: 'New blast', icon: Send },
              { value: 'history', label: `History (${campaigns.length})`, icon: Clock },
            ]}
          />

          {blastsTab === 'compose' && (
            <Card className="p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-primary" />
                <h2 className="font-semibold">Target by segment, source, agent or tag</h2>
              </div>

              <FilterRow label="Pipeline stage" options={LEAD_STATUSES} selected={fStatuses} onToggle={(v) => toggleArr(fStatuses, v, setFStatuses)} />
              <FilterRow label="Lead source" options={LEAD_SOURCES} selected={fSources} onToggle={(v) => toggleArr(fSources, v, setFSources)} />
              <FilterRow label="Assigned to" options={AGENTS} selected={fAgents} onToggle={(v) => toggleArr(fAgents, v, setFAgents)} />

              <div className="space-y-1.5">
                <Label className="text-xs">Tags (comma-separated)</Label>
                <Input value={fTags} onChange={(e) => setFTags(e.target.value)} placeholder="vip, hot-lead, newsletter" />
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-border">
                <div className="text-sm">
                  <span className="font-semibold text-foreground">{filteredRecipients.length}</span>
                  <span className="text-muted-foreground"> recipients with phone numbers</span>
                </div>
                <Button onClick={launchBlast} disabled={filteredRecipients.length === 0} size="sm">
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                  Compose {channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} blast
                </Button>
              </div>
            </Card>
          )}

          {blastsTab === 'history' && (
            <div className="space-y-2">
              {campaigns.length === 0 ? (
                <Card className="p-8 text-center text-sm text-muted-foreground">
                  No {channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} blasts yet. Switch to <strong>New blast</strong> to send your first one.
                </Card>
              ) : (
                campaigns.map(c => (
                  <Card key={c.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium truncate">{c.name}</h3>
                          <CampaignStatusBadge status={c.status} />
                          <ChannelBadge channel={c.channel || 'sms'} />
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">{c.body}</p>
                        <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span><Users className="w-3 h-3 inline mr-1" />{c.recipients_count} recipients</span>
                          {c.scheduled_for && <span><Calendar className="w-3 h-3 inline mr-1" />{format(new Date(c.scheduled_for), 'MMM d, h:mm a')}</span>}
                          <span>{c.delivered_count}/{c.recipients_count} delivered</span>
                          {c.failed_count > 0 && <span className="text-red-600">{c.failed_count} failed</span>}
                          {c.reply_count > 0 && <span className="text-primary">{c.reply_count} replies</span>}
                        </div>
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          )}
        </TabsContent>

        {/* === TEMPLATES === */}
        <TabsContent value="templates" className="mt-4">
          <TemplatesTab channel={channel} templates={templates} />
        </TabsContent>

        {/* === MONITOR (Stats + Status + Health + Delivery) === */}
        <TabsContent value="monitor" className="mt-4 space-y-4">
          <SubTabBar
            value={monitorTab}
            onChange={(v) => setMonitorTab(v as any)}
            options={[
              { value: 'stats', label: 'Stats', icon: BarChart3 },
              { value: 'delivery', label: 'Delivery', icon: Activity },
              { value: 'status', label: 'System', icon: ShieldCheck },
              ...(isWa ? [{ value: 'health' as const, label: 'WA health', icon: ShieldCheck }] : []),
            ]}
          />

          {monitorTab === 'stats' && (
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-1">{channel === 'sms' ? 'SMS' : 'WhatsApp'} performance</h3>
                <p className="text-xs text-muted-foreground">Lifetime totals across this channel.</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <StatPill label="Sent" value={totals.sent} icon={Send} />
                <StatPill label="Delivered" value={totals.delivered} icon={CheckCircle2} tone="emerald" />
                <StatPill label="Failed" value={totals.failed} icon={XCircle} tone="red" />
                <StatPill label="Replies" value={totals.replies} icon={Inbox} tone="primary" />
                <StatPill label="Opt-outs" value={optOuts.length} icon={ShieldOff} tone="amber" />
              </div>
            </div>
          )}
          {monitorTab === 'delivery' && <DeliveryStatusPanel channel={channel} />}
          {monitorTab === 'status' && <MessagingStatusPanel />}
          {monitorTab === 'health' && isWa && <WhatsAppHealthCheckPanel />}
        </TabsContent>

        {/* === SETUP (Config + Opt-outs) === */}
        <TabsContent value="setup" className="mt-4 space-y-4">
          <SubTabBar
            value={setupTab}
            onChange={(v) => setSetupTab(v as any)}
            options={[
              { value: 'config', label: 'Configuration', icon: SettingsIcon },
              { value: 'optouts', label: `Opt-outs (${optOuts.length})`, icon: ShieldOff },
            ]}
          />

          {setupTab === 'config' && (
            <SettingsTab channel={channel} settings={settings} numbers={numbers} />
          )}

          {setupTab === 'optouts' && (
            <div className="space-y-2">
              {optOuts.length === 0 ? (
                <Card className="p-8 text-center text-sm text-muted-foreground">No opt-outs.</Card>
              ) : (
                <Card className="divide-y divide-border">
                  {optOuts.map(o => (
                    <div key={o.id} className="p-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="font-mono text-sm">{o.phone}</div>
                        <div className="text-xs text-muted-foreground">
                          {o.source} · {format(new Date(o.opted_out_at), 'MMM d, yyyy')}
                          {o.reason && ` · ${o.reason}`}
                        </div>
                      </div>
                      {o.re_opted_in_at && <Badge variant="outline" className="text-emerald-600 border-emerald-600/30">Re-opted in</Badge>}
                    </div>
                  ))}
                </Card>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>


      <BulkSendTextDialog
        open={composerOpen}
        onOpenChange={setComposerOpen}
        contactIds={composerIds}
        defaultChannel={channel}
      />
    </div>
  );
}

// ==================== Channel badge ====================
function ChannelBadge({ channel }: { channel: MessagingChannel }) {
  if (channel === 'whatsapp') {
    return (
      <Badge variant="outline" className="text-emerald-600 border-emerald-600/30 text-[10px] gap-1 px-1.5 h-5">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> WA
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] gap-1 px-1.5 h-5">
      <MessageSquare className="w-2.5 h-2.5" /> SMS
    </Badge>
  );
}

// ==================== Stat pill ====================
function StatPill({ label, value, icon: Icon, tone }: { label: string; value: number; icon: any; tone?: 'emerald' | 'red' | 'amber' | 'primary' }) {
  const toneClass = tone === 'emerald' ? 'text-emerald-600' :
                    tone === 'red' ? 'text-red-600' :
                    tone === 'amber' ? 'text-amber-600' :
                    tone === 'primary' ? 'text-primary' : 'text-foreground';
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className={cn('text-xl font-semibold', toneClass)}>{value.toLocaleString()}</div>
        </div>
        <Icon className={cn('w-4 h-4', toneClass)} />
      </div>
    </Card>
  );
}

// ==================== Filter row ====================
function FilterRow({ label, options, selected, onToggle }: { label: string; options: readonly string[]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {options.map(o => (
          <button
            key={o}
            onClick={() => onToggle(o)}
            className={cn(
              'px-2.5 py-1 text-xs rounded-md border transition-colors',
              selected.includes(o)
                ? 'bg-primary/15 border-primary/40 text-primary font-medium'
                : 'bg-background border-border text-muted-foreground hover:border-primary/30'
            )}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

// ==================== Campaign status ====================
function CampaignStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; Icon: any }> = {
    draft: { label: 'Draft', cls: 'text-muted-foreground border-border', Icon: Pencil },
    scheduled: { label: 'Scheduled', cls: 'text-amber-600 border-amber-600/30', Icon: Clock },
    sending: { label: 'Sending', cls: 'text-primary border-primary/30', Icon: Loader2 },
    sent: { label: 'Sent', cls: 'text-emerald-600 border-emerald-600/30', Icon: CheckCircle2 },
    failed: { label: 'Failed', cls: 'text-red-600 border-red-600/30', Icon: XCircle },
    cancelled: { label: 'Cancelled', cls: 'text-muted-foreground border-border', Icon: XCircle },
  };
  const m = map[status] || map.draft;
  const Icon = m.Icon;
  return (
    <Badge variant="outline" className={cn('gap-1 text-[10px]', m.cls)}>
      <Icon className={cn('w-3 h-3', status === 'sending' && 'animate-spin')} />
      {m.label}
    </Badge>
  );
}

// ==================== INBOX (conversation view) ====================
function InboxTab({
  logs, channel, contacts, onOpenLead,
}: {
  logs: any[];
  channel: MessagingChannel;
  contacts: any[];
  onOpenLead: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [activePhone, setActivePhone] = useState<string | null>(null);

  // Group messages by phone number → conversation threads
  const threads = useMemo(() => {
    const map = new Map<string, { phone: string; contact: any; messages: any[]; lastInbound: any | null }>();
    for (const l of logs) {
      const phone = l.direction === 'inbound' ? l.from_number : l.to_number;
      if (!phone) continue;
      const last10 = phone.replace(/\D/g, '').slice(-10);
      const key = last10 || phone;
      if (!map.has(key)) {
        const c = contacts.find(x => (x.phone || '').replace(/\D/g, '').endsWith(last10));
        map.set(key, { phone, contact: c, messages: [], lastInbound: null });
      }
      const t = map.get(key)!;
      t.messages.push(l);
      if (l.direction === 'inbound' && (!t.lastInbound || new Date(l.sent_at) > new Date(t.lastInbound.sent_at))) {
        t.lastInbound = l;
      }
    }
    // Sort messages inside each thread (oldest → newest), then sort threads by latest activity
    const arr = [...map.values()].map(t => ({
      ...t,
      messages: [...t.messages].sort((a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime()),
    }));
    arr.sort((a, b) => {
      const aT = new Date(a.messages[a.messages.length - 1]?.sent_at || 0).getTime();
      const bT = new Date(b.messages[b.messages.length - 1]?.sent_at || 0).getTime();
      return bT - aT;
    });
    return arr;
  }, [logs, contacts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter(t => {
      const name = `${t.contact?.first_name || ''} ${t.contact?.last_name || ''}`.toLowerCase();
      return name.includes(q) || t.phone.includes(q);
    });
  }, [threads, search]);

  const active = filtered.find(t => t.phone === activePhone) || filtered[0];

  if (threads.length === 0) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        No {channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} conversations yet. Send a message from any lead to get started.
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-3 h-[calc(100dvh-340px-var(--bottom-nav-pad,0px))] min-h-[400px]">
      {/* Thread list */}
      <Card className="flex flex-col overflow-hidden">
        <div className="p-2 border-b border-border">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations…"
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="divide-y divide-border">
            {filtered.map(t => {
              const last = t.messages[t.messages.length - 1];
              const isActive = active?.phone === t.phone;
              const hasUnreplied = t.lastInbound && (!last || last.direction === 'inbound');
              return (
                <button
                  key={t.phone}
                  onClick={() => setActivePhone(t.phone)}
                  className={cn(
                    'w-full text-left p-3 hover:bg-muted/50 transition-colors',
                    isActive && 'bg-primary/5 border-l-2 border-l-primary'
                  )}
                >
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-sm font-medium truncate">
                      {t.contact ? `${t.contact.first_name || ''} ${t.contact.last_name || ''}`.trim() || 'Unknown' : 'Unknown'}
                    </span>
                    {hasUnreplied && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                  </div>
                  <div className="text-[11px] text-muted-foreground font-mono truncate">{t.phone}</div>
                  <div className="text-xs text-muted-foreground truncate mt-1">
                    {last?.direction === 'outbound' && <span className="opacity-60">You: </span>}
                    {last?.body}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {last && formatDistanceToNow(new Date(last.sent_at), { addSuffix: true })}
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </Card>

      {/* Conversation pane */}
      <Card className="flex flex-col overflow-hidden">
        {active ? (
          <>
            <div className="p-3 border-b border-border flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">
                  {active.contact ? `${active.contact.first_name || ''} ${active.contact.last_name || ''}`.trim() || 'Unknown' : 'Unknown contact'}
                </div>
                <div className="text-xs text-muted-foreground font-mono">{active.phone}</div>
              </div>
              {active.contact && (
                <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => onOpenLead(active.contact.id)}>
                  Open lead <ArrowRight className="w-3 h-3" />
                </Button>
              )}
            </div>
            <ScrollArea className="flex-1 p-4 bg-muted/20">
              <div className="space-y-2.5">
                {active.messages.map((m: any) => (
                  <div key={m.id} className={cn('flex', m.direction === 'outbound' ? 'justify-end' : 'justify-start')}>
                    <div
                      className={cn(
                        'max-w-[75%] rounded-2xl px-3.5 py-2 text-sm',
                        m.direction === 'outbound'
                          ? 'bg-primary text-primary-foreground rounded-br-sm'
                          : 'bg-background border border-border rounded-bl-sm'
                      )}
                    >
                      <div className="whitespace-pre-wrap break-words">{m.body}</div>
                      {m.media_urls?.length > 0 && (
                        <div className="mt-1.5 grid grid-cols-2 gap-1">
                          {m.media_urls.map((u: string, i: number) => (
                            <img key={i} src={u} className="rounded max-h-32 object-cover" alt="" />
                          ))}
                        </div>
                      )}
                      <div className={cn('text-[10px] mt-1', m.direction === 'outbound' ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                        {format(new Date(m.sent_at), 'MMM d, h:mm a')}
                        {m.status && m.direction === 'outbound' && <> · {m.status}</>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="p-3 border-t border-border bg-background">
              <p className="text-xs text-muted-foreground text-center">
                💬 Reply by opening the lead and using the {channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} composer
              </p>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            Select a conversation
          </div>
        )}
      </Card>
    </div>
  );
}

// ==================== Templates Tab ====================
function TemplatesTab({ channel, templates }: { channel: MessagingChannel; templates: any[] }) {
  const save = useSaveSmsTemplate();
  const del = useDeleteSmsTemplate();
  const [editing, setEditing] = useState<{ id?: string; name: string; body: string; category: string; channel: MessagingChannel } | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          {channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} Templates ({templates.length})
        </h2>
        <Button size="sm" onClick={() => setEditing({ name: '', body: '', category: 'general', channel })}>
          <Plus className="w-3.5 h-3.5 mr-1" /> New template
        </Button>
      </div>

      {templates.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground space-y-2">
          <Sparkles className="w-6 h-6 mx-auto opacity-50" />
          <div>No {channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} templates yet.</div>
          <Button size="sm" variant="outline" onClick={() => setEditing({ name: '', body: '', category: 'general', channel })}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Create your first template
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {templates.map(t => {
            const seg = smsSegments(t.body);
            return (
              <Card key={t.id} className="p-3 group">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{t.name}</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{t.category}</div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button size="icon" variant="ghost" className="h-6 w-6"
                      onClick={() => setEditing({ id: t.id, name: t.name, body: t.body, category: t.category, channel: t.channel || 'sms' })}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive"
                      onClick={() => { if (confirm('Delete template?')) del.mutate(t.id); }}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">{t.body}</p>
                <div className="text-[10px] text-muted-foreground mt-2 flex items-center gap-2">
                  <span>{seg.chars} chars · {seg.count} segment{seg.count > 1 ? 's' : ''}</span>
                  <span>·</span>
                  <span>used {t.times_used || 0}×</span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Edit template' : 'New template'}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Channel</Label>
                  <Select value={editing.channel} onValueChange={(v: MessagingChannel) => setEditing({ ...editing, channel: v })}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sms">SMS / MMS</SelectItem>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Category</Label>
                  <Input value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} placeholder="follow-up, promo…" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Name</Label>
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Body — use {`{{first_name}}`}, {`{{agent_name}}`}, etc.</Label>
                <Textarea
                  value={editing.body}
                  onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                  className="min-h-[120px]"
                />
                <div className="text-[10px] text-muted-foreground">
                  {smsSegments(editing.body).chars} chars · {smsSegments(editing.body).count} segments
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              disabled={!editing?.name || !editing?.body || save.isPending}
              onClick={() => { if (!editing) return; save.mutate(editing as any, { onSuccess: () => setEditing(null) }); }}
            >
              {save.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================== Settings / Setup Tab ====================
function SettingsTab({
  channel, settings, numbers,
}: { channel: MessagingChannel; settings: any; numbers: any[] }) {
  const isWa = channel === 'whatsapp';
  return (
    <div className="space-y-3">
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          {isWa ? (
            <span className="w-4 h-4 rounded-full bg-emerald-500" />
          ) : (
            <MessageSquare className="w-4 h-4 text-primary" />
          )}
          <h2 className="font-semibold">{isWa ? 'WhatsApp' : 'SMS / MMS'} setup</h2>
        </div>
        <div className="text-sm text-muted-foreground space-y-2">
          {isWa ? (
            <>
              <p>WhatsApp Business runs through Twilio. To enable:</p>
              <ol className="list-decimal list-inside space-y-1 text-xs">
                <li>Connect Twilio under <strong>Connectors → Twilio</strong> (uses the same API key as SMS).</li>
                <li>In Twilio Console, enable a WhatsApp sender (sandbox <code className="px-1 bg-muted rounded">+1 415 523 8886</code> for testing, or a verified business number for production).</li>
                <li>Set the WhatsApp From number in this Setup page below.</li>
                <li>Configure the inbound webhook to{' '}
                  <code className="px-1 bg-muted rounded text-[10px]">{import.meta.env.VITE_SUPABASE_URL}/functions/v1/twilio-sms-webhook</code>
                </li>
              </ol>
            </>
          ) : (
            <>
              <p>SMS sending uses Twilio. To enable:</p>
              <ol className="list-decimal list-inside space-y-1 text-xs">
                <li>Connect Twilio under <strong>Connectors → Twilio</strong>.</li>
                <li>Add at least one Twilio phone number under <strong>CRM Settings → SMS numbers</strong> (or set a Messaging Service SID).</li>
                <li>Configure inbound webhook in Twilio to{' '}
                  <code className="px-1 bg-muted rounded text-[10px]">{import.meta.env.VITE_SUPABASE_URL}/functions/v1/twilio-sms-webhook</code>
                </li>
                <li>Set status callback to the same URL with{' '}
                  <code className="px-1 bg-muted rounded text-[10px]">?type=status</code>
                </li>
              </ol>
            </>
          )}
        </div>
      </Card>

      {!isWa && (
        <Card className="p-4 space-y-3">
          <h3 className="text-sm font-semibold">Active numbers</h3>
          {numbers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No numbers added yet. Configure one in CRM Settings.</p>
          ) : (
            <div className="divide-y divide-border">
              {numbers.map(n => (
                <div key={n.id} className="py-2 flex items-center justify-between">
                  <div>
                    <div className="font-mono text-sm">{n.phone}</div>
                    <div className="text-xs text-muted-foreground">{n.label || (n.is_company ? 'Company' : 'Agent')}</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {n.is_company && <Badge variant="outline" className="text-[10px]">Company</Badge>}
                    {n.is_active && <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-600/30">Active</Badge>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <Card className="p-4 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" />
          Quiet hours & compliance
        </h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Quiet hours</div>
            <div className="font-medium">
              {settings?.enforce_quiet_hours
                ? `${settings.quiet_hours_start}:00 – ${settings.quiet_hours_end}:00 (${settings.quiet_hours_timezone})`
                : 'Disabled'}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Default throttle</div>
            <div className="font-medium">{settings?.default_throttle_per_min || 60} msg/min</div>
          </div>
          <div className="col-span-2">
            <div className="text-xs text-muted-foreground">Opt-out footer</div>
            <div className="font-medium text-xs italic">"{settings?.optout_footer || 'Reply STOP to opt out.'}"</div>
            <div className="text-[10px] text-muted-foreground mt-1">
              {settings?.append_optout_first_msg ? 'Appended to first SMS to each contact' : 'Not appended automatically'}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
