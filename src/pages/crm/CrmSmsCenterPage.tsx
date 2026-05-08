import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  MessageSquare, Send, Plus, Trash2, Pencil, Users, ShieldOff,
  Calendar, CheckCircle2, XCircle, Clock, Inbox, Loader2,
  Sparkles, ArrowRight, Filter, Settings as SettingsIcon, AlertTriangle,
  Phone, Eye, FlaskConical, BarChart3, ChevronRight, RotateCw,
} from 'lucide-react';
import {
  useSmsTemplates, useSaveSmsTemplate, useDeleteSmsTemplate,
  useSmsCampaigns, useSmsOptOuts, useSmsNumbers, useSmsSettings, useAllSmsLog,
  useSendSms, smsSegments, renderSmsTemplate, SMS_VARIABLES,
} from '@/hooks/useSms';
import { useCrmContacts, LEAD_STATUSES, LEAD_SOURCES } from '@/hooks/useCrmContacts';
import { useAgentNames } from '@/hooks/useTeamAgents';
import { BulkSendTextDialog } from '@/components/crm/leads/BulkSendTextDialog';
import { MessagingCenter } from '@/components/crm/sms/MessagingCenter';
import { format, formatDistanceToNow, subDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ════════════════════════════════════════════════════════════════════
// Page
// ════════════════════════════════════════════════════════════════════
export default function CrmSmsCenterPage() {
  const { data: allTemplates = [] } = useSmsTemplates();
  const { data: allCampaigns = [] } = useSmsCampaigns();
  const { data: optOuts = [] } = useSmsOptOuts();
  const { data: numbers = [] } = useSmsNumbers();
  const { data: settings } = useSmsSettings();
  const { data: allContacts = [] } = useCrmContacts();
  const { data: logs = [] } = useAllSmsLog({ limit: 1000 });

  // SMS-only filter (WhatsApp removed)
  const templates = useMemo(() => allTemplates.filter(t => (t.channel || 'sms') === 'sms'), [allTemplates]);
  const campaigns = useMemo(() => allCampaigns.filter(c => (c.channel || 'sms') === 'sms'), [allCampaigns]);
  const channelLogs = useMemo(() => logs.filter(l => (l.channel || 'sms') === 'sms'), [logs]);

  const [tab, setTab] = useState('inbox');
  const [statsRange, setStatsRange] = useState<'7d' | '30d' | 'all'>('7d');
  const [failedDrawerOpen, setFailedDrawerOpen] = useState(false);

  // Composer (single dialog — only compose surface)
  const [composerOpen, setComposerOpen] = useState(false);

  // ─── Stats (range-aware) ─────────────────────────────────────
  const since = useMemo(() => {
    if (statsRange === 'all') return null;
    return subDays(new Date(), statsRange === '7d' ? 7 : 30);
  }, [statsRange]);

  const rangeLogs = useMemo(() => {
    if (!since) return channelLogs;
    return channelLogs.filter(l => new Date(l.sent_at) >= since);
  }, [channelLogs, since]);

  const stats = useMemo(() => {
    let sent = 0, delivered = 0, failed = 0, replies = 0;
    for (const l of rangeLogs) {
      if (l.direction === 'inbound') replies++;
      else {
        sent++;
        if (['delivered', 'read'].includes(l.status)) delivered++;
        if (['failed', 'undelivered'].includes(l.status)) failed++;
      }
    }
    return { sent, delivered, failed, replies };
  }, [rangeLogs]);

  // Failed sends in last 24h (header pill)
  const failed24h = useMemo(() => {
    const cutoff = subDays(new Date(), 1);
    return channelLogs.filter(l =>
      l.direction === 'outbound' &&
      ['failed', 'undelivered'].includes(l.status) &&
      new Date(l.sent_at) >= cutoff,
    );
  }, [channelLogs]);

  // Scheduled queue (next pending)
  const scheduledQueue = useMemo(() =>
    channelLogs
      .filter(l => l.status === 'scheduled' && l.scheduled_for && new Date(l.scheduled_for) > new Date())
      .sort((a, b) => new Date(a.scheduled_for!).getTime() - new Date(b.scheduled_for!).getTime()),
    [channelLogs],
  );

  // Setup checklist
  const checklist = useMemo(() => {
    const hasNumbers = numbers.length > 0 || !!settings?.messaging_service_sid;
    const hasQuiet = !!settings?.enforce_quiet_hours;
    const hasOptoutFooter = !!settings?.append_optout_first_msg;
    const hasInbound = (channelLogs || []).some(l => l.direction === 'inbound');
    const items = [
      { label: 'Twilio number connected', done: hasNumbers, hint: 'Add a number in Settings → Numbers' },
      { label: 'Inbound webhook receiving', done: hasInbound, hint: 'Set webhook in Twilio Console (see Settings)' },
      { label: 'Quiet hours configured', done: hasQuiet, hint: 'Protects clients from late-night texts' },
      { label: 'STOP footer auto-appended', done: hasOptoutFooter, hint: 'Required for compliance on first contact' },
    ];
    return { items, complete: items.filter(i => i.done).length, total: items.length };
  }, [numbers, settings, channelLogs]);

  const TAB_META: Record<string, { label: string; subtitle: string; icon: typeof Inbox }> = {
    inbox:     { label: 'Inbox',     subtitle: 'One-on-one conversations with leads.',         icon: Inbox },
    templates: { label: 'Templates', subtitle: 'Reusable SMS snippets with merge tags.',       icon: MessageSquare },
    history:   { label: 'History',   subtitle: 'Past blasts with delivery + reply stats.',     icon: Clock },
    settings:  { label: 'Settings',  subtitle: 'Numbers, opt-outs, quiet hours, deliverability.', icon: SettingsIcon },
  };
  const active = TAB_META[tab] ?? TAB_META.inbox;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      {/* ============ Compact header — tabs + New Blast + status chips ============ */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="-mx-1 overflow-x-auto no-scrollbar">
          <div className="inline-flex items-center gap-0.5 p-0.5 mx-1 rounded-xl border border-border/70 bg-card shadow-sm">
            {(['inbox', 'templates', 'history', 'settings'] as const).map(v => {
              const meta = TAB_META[v];
              const isActive = tab === v;
              return (
                <button
                  key={v}
                  onClick={() => setTab(v)}
                  className={cn(
                    'inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-semibold whitespace-nowrap transition-all',
                    isActive
                      ? 'bg-foreground text-background shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                  )}
                >
                  <meta.icon className="h-3.5 w-3.5" />
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {failed24h.length > 0 && (
            <button
              onClick={() => setFailedDrawerOpen(true)}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border border-destructive/40 bg-destructive/5 text-destructive text-[11px] font-medium hover:bg-destructive/10 transition-colors"
            >
              <AlertTriangle className="w-3 h-3" />
              {failed24h.length} failed · 24h
            </button>
          )}
          {scheduledQueue.length > 0 && (
            <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400 text-[11px] font-medium">
              <Clock className="w-3 h-3" />
              {scheduledQueue.length} scheduled · {format(new Date(scheduledQueue[0].scheduled_for!), 'MMM d, h:mm a')}
            </span>
          )}
          <Button size="sm" className="h-8 gap-1.5" onClick={() => setComposerOpen(true)}>
            <Send className="w-3.5 h-3.5" />
            New Blast
          </Button>
        </div>
      </div>

      {numbers.length === 0 && !settings?.messaging_service_sid && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex items-start gap-3">
          <MessageSquare className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground mb-1">SMS line is being set up</p>
            <p className="text-[13px] text-muted-foreground leading-relaxed">
              Your admin will provision a Twilio number for you shortly. You can browse templates and draft
              campaigns now — they'll send the moment your number goes live.
            </p>
          </div>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="sr-only">
          <TabsTrigger value="inbox">Inbox</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="inbox" className="mt-4">
          <MessagingCenter channel="sms" onChannelChange={() => { /* SMS-only */ }} />
        </TabsContent>

        <TabsContent value="templates" className="mt-4">
          <TemplatesTab templates={templates} />
        </TabsContent>

        <TabsContent value="history" className="mt-4 space-y-2">
          {campaigns.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              No SMS blasts yet. Click <strong>New Blast</strong> to send your first one.
            </Card>
          ) : (
            campaigns.map(c => (
              <Card key={c.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium truncate">{c.name}</h3>
                      <CampaignStatusBadge status={c.status} />
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
        </TabsContent>

        <TabsContent value="settings" className="mt-4 space-y-4">
          <SettingsTab
            checklist={checklist}
            stats={stats}
            statsRange={statsRange}
            onStatsRangeChange={setStatsRange}
            settings={settings}
            numbers={numbers}
            optOuts={optOuts}
            templates={templates}
          />
        </TabsContent>
      </Tabs>

      {/* ============ Bulk send dialog (single composer surface) ============ */}
      <BulkSendTextDialog
        open={composerOpen}
        onOpenChange={setComposerOpen}
        contactIds={[]}
        audiencePicker
        defaultChannel="sms"
      />

      {/* ============ Failed-sends drawer ============ */}
      <Sheet open={failedDrawerOpen} onOpenChange={setFailedDrawerOpen}>
        <SheetContent className="w-full sm:max-w-lg flex flex-col">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              Failed sends · last 24 hours
            </SheetTitle>
            <SheetDescription>
              {failed24h.length} message{failed24h.length === 1 ? '' : 's'} couldn't be delivered
            </SheetDescription>
          </SheetHeader>
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-2">
              {failed24h.map(l => (
                <Card key={l.id} className="p-3">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="font-mono text-xs text-muted-foreground">{l.to_number}</div>
                    <span className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(l.sent_at), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-sm line-clamp-2 mb-1.5">{l.body}</p>
                  <div className="text-[11px] text-destructive flex items-center gap-1.5">
                    <XCircle className="w-3 h-3" />
                    {explainFailure(l.error_code, l.error_message)}
                  </div>
                </Card>
              ))}
              {failed24h.length === 0 && (
                <div className="text-sm text-muted-foreground py-8 text-center">All clear — no failed sends.</div>
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// SEND tab removed — single composer surface is <BulkSendTextDialog audiencePicker />.

// ════════════════════════════════════════════════════════════════════
// SETTINGS tab — checklist + numbers + templates + opt-outs + stats
// ════════════════════════════════════════════════════════════════════
function SettingsTab({
  checklist, stats, statsRange, onStatsRangeChange,
  settings, numbers, optOuts, templates,
}: any) {
  const [view, setView] = useState<'overview' | 'optouts'>('overview');
  return (
    <>
      <SubTabBar
        value={view}
        onChange={(v) => setView(v as any)}
        options={[
          { value: 'overview', label: 'Overview', icon: SettingsIcon },
          { value: 'optouts', label: `Opt-outs (${optOuts.length})`, icon: ShieldOff },
        ]}
      />

      {view === 'overview' && (
        <div className="space-y-4">
          {/* Setup checklist */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Setup checklist</h3>
              <span className="text-xs text-muted-foreground">{checklist.complete} / {checklist.total} complete</span>
            </div>
            <div className="space-y-1.5">
              {checklist.items.map((it: any, i: number) => (
                <div key={i} className="flex items-start gap-2.5 py-1.5">
                  {it.done ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className={cn('text-sm', it.done ? 'text-muted-foreground line-through' : 'font-medium')}>
                      {it.label}
                    </div>
                    {!it.done && <div className="text-[11px] text-muted-foreground">{it.hint}</div>}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Performance */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <BarChart3 className="w-4 h-4" /> Performance
              </h3>
              <div className="inline-flex rounded-md bg-muted p-0.5 text-xs">
                {(['7d', '30d', 'all'] as const).map(r => (
                  <button
                    key={r}
                    onClick={() => onStatsRangeChange(r)}
                    className={cn(
                      'px-2.5 py-1 rounded-sm font-medium transition-colors',
                      statsRange === r ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {r === 'all' ? 'All' : r}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <StatPill label="Sent" value={stats.sent} icon={Send} />
              <StatPill label="Delivered" value={stats.delivered} icon={CheckCircle2} tone="emerald" />
              <StatPill label="Failed" value={stats.failed} icon={XCircle} tone="red" />
              <StatPill label="Replies" value={stats.replies} icon={Inbox} tone="primary" />
            </div>
          </Card>

          {/* Numbers */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Phone className="w-4 h-4" /> Active numbers
              </h3>
              <span className="text-xs text-muted-foreground">{numbers.length} configured</span>
            </div>
            {numbers.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/70 bg-muted/30 p-4">
                <p className="text-sm font-medium text-foreground mb-1">No SMS line yet</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Your admin needs to provision a Twilio number and link it to your account before you
                  can send or receive texts. Inbox & campaigns will light up automatically once that's done.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {numbers.map((n: any) => (
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

          {/* Quiet hours / compliance */}
          <Card className="p-4 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" /> Quiet hours & compliance
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

          {/* Webhook helper */}
          <Card className="p-4 space-y-2">
            <h3 className="text-sm font-semibold">Twilio webhook</h3>
            <p className="text-xs text-muted-foreground">Point your Twilio number's inbound + status callback to:</p>
            <code className="block text-[11px] bg-muted rounded px-2 py-1.5 break-all">
              {import.meta.env.VITE_SUPABASE_URL}/functions/v1/twilio-sms-webhook
            </code>
            <p className="text-[10px] text-muted-foreground">Status callbacks: append <code className="px-1 bg-muted rounded">?type=status</code></p>
          </Card>
        </div>
      )}

      {view === 'optouts' && (
        <div className="space-y-2">
          {optOuts.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">No opt-outs.</Card>
          ) : (
            <Card className="divide-y divide-border">
              {optOuts.map((o: any) => (
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
    </>
  );
}

// ════════════════════════════════════════════════════════════════════
// Templates tab — with live preview, merge-tag picker, "Send to me"
// ════════════════════════════════════════════════════════════════════
const STARTER_PACK = [
  { name: 'First touch — new lead', category: 'follow-up', body: "Hi {{first_name}}, this is {{agent_name}} with {{company}}. Saw you were looking at homes in {{city}} — happy to help! When's a good time to chat?" },
  { name: 'Showing confirmation', category: 'showing', body: "Hi {{first_name}}, confirming our showing today. Looking forward to it! Reply CANCEL if anything changes." },
  { name: 'Open house invite', category: 'open-house', body: "Hi {{first_name}}, we're hosting an open house this weekend you might love. Want me to send the address?" },
  { name: '24h follow-up', category: 'follow-up', body: "Hi {{first_name}}, just checking in — any questions about the property we discussed?" },
  { name: 'Nurture — market update', category: 'nurture', body: "Hi {{first_name}}, quick {{city}} market update for you: prices held steady this month. Want the full report?" },
  { name: 'Birthday', category: 'nurture', body: "Happy birthday, {{first_name}}! Hope you have a great day. — {{agent_name}}" },
  { name: 'Listing alert', category: 'listing', body: "Hi {{first_name}}, new listing in {{city}} matches what you're after. Want a link?" },
  { name: 'Re-engage', category: 'nurture', body: "Hi {{first_name}}, it's been a while! Still on the hunt? Markets shifted — happy to send a fresh batch." },
];

function TemplatesTab({ templates }: { templates: any[] }) {
  const save = useSaveSmsTemplate();
  const del = useDeleteSmsTemplate();
  const sendSms = useSendSms();
  const { data: settings } = useSmsSettings();
  const { data: numbers = [] } = useSmsNumbers();
  const [editing, setEditing] = useState<{ id?: string; name: string; body: string; category: string } | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const sample = useMemo(() => Object.fromEntries(SMS_VARIABLES.map(v => [v.tag.replace(/[{}]/g, '').trim(), v.sample])), []);
  const myPhone = (settings as any)?.test_phone || numbers.find((n: any) => n.is_active)?.phone;

  const installStarterPack = async () => {
    let installed = 0;
    for (const t of STARTER_PACK) {
      const exists = templates.some(x => x.name === t.name);
      if (exists) continue;
      await save.mutateAsync({ ...t, channel: 'sms' as any });
      installed++;
    }
    if (installed === 0) toast.info('Starter pack already installed');
    else toast.success(`Added ${installed} starter template${installed === 1 ? '' : 's'}`);
  };

  const sendToMe = async (body: string) => {
    if (!myPhone) {
      toast.error('Add your test phone in CRM Settings or activate a number first.');
      return;
    }
    const rendered = renderSmsTemplate(body, sample);
    await sendSms.mutateAsync({ to: myPhone, body: rendered, channel: 'sms' });
  };

  // group by category
  const grouped = useMemo(() => {
    const m: Record<string, any[]> = {};
    for (const t of templates) {
      const k = t.category || 'general';
      if (!m[k]) m[k] = [];
      m[k].push(t);
    }
    return Object.entries(m).sort(([a], [b]) => a.localeCompare(b));
  }, [templates]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">SMS Templates ({templates.length})</h2>
        <div className="flex items-center gap-2">
          {templates.length === 0 && (
            <Button size="sm" variant="outline" onClick={installStarterPack} disabled={save.isPending}>
              <Sparkles className="w-3.5 h-3.5 mr-1" /> Install starter pack
            </Button>
          )}
          <Button size="sm" onClick={() => setEditing({ name: '', body: '', category: 'general' })}>
            <Plus className="w-3.5 h-3.5 mr-1" /> New template
          </Button>
        </div>
      </div>

      {templates.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground space-y-3">
          <Sparkles className="w-6 h-6 mx-auto opacity-50" />
          <div>No SMS templates yet. Install the starter pack to get going in seconds.</div>
          <div className="flex items-center justify-center gap-2">
            <Button size="sm" variant="outline" onClick={installStarterPack} disabled={save.isPending}>
              {save.isPending && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
              <Sparkles className="w-3.5 h-3.5 mr-1" /> Install 8 starter templates
            </Button>
            <Button size="sm" onClick={() => setEditing({ name: '', body: '', category: 'general' })}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Create your own
            </Button>
          </div>
        </Card>
      ) : (
        grouped.map(([cat, list]) => (
          <div key={cat} className="space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-1">{cat}</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {list.map(t => {
                const seg = smsSegments(t.body);
                return (
                  <Card key={t.id} className="p-3 group">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{t.name}</div>
                      </div>
                      <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Send to me"
                          onClick={() => sendToMe(t.body)} disabled={sendSms.isPending}>
                          <FlaskConical className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Edit"
                          onClick={() => setEditing({ id: t.id, name: t.name, body: t.body, category: t.category })}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="Delete"
                          onClick={() => setConfirmDel(t.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
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
          </div>
        ))
      )}

      {/* Editor */}
      <TemplateEditor
        editing={editing}
        onClose={() => setEditing(null)}
        onSave={(t) => save.mutate({ ...t, channel: 'sms' as any } as any, { onSuccess: () => setEditing(null) })}
        onTestSend={(body) => sendToMe(body)}
        isSaving={save.isPending}
        sample={sample}
        canTestSend={!!myPhone}
      />

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this template?</AlertDialogTitle>
            <AlertDialogDescription>This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (confirmDel) { del.mutate(confirmDel); setConfirmDel(null); } }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TemplateEditor({
  editing, onClose, onSave, onTestSend, isSaving, sample, canTestSend,
}: {
  editing: { id?: string; name: string; body: string; category: string } | null;
  onClose: () => void;
  onSave: (t: { id?: string; name: string; body: string; category: string }) => void;
  onTestSend: (body: string) => void;
  isSaving: boolean;
  sample: Record<string, string>;
  canTestSend: boolean;
}) {
  const [local, setLocal] = useState(editing);
  const textareaRef = useMemo(() => ({ current: null as HTMLTextAreaElement | null }), [editing?.id]);
  // Sync prop
  useMemo(() => setLocal(editing), [editing]);

  if (!local) {
    return (
      <Dialog open={!!editing} onOpenChange={(o) => !o && onClose()}>
        <DialogContent />
      </Dialog>
    );
  }

  const seg = smsSegments(local.body);
  const preview = renderSmsTemplate(local.body, sample);

  const insertTag = (tag: string) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? local.body.length;
    const end = el?.selectionEnd ?? local.body.length;
    const next = local.body.slice(0, start) + tag + local.body.slice(end);
    setLocal({ ...local, body: next });
    requestAnimationFrame(() => {
      el?.focus();
      const pos = start + tag.length;
      el?.setSelectionRange(pos, pos);
    });
  };

  return (
    <Dialog open={!!editing} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{local.id ? 'Edit template' : 'New template'}</DialogTitle>
          <DialogDescription>
            Use merge tags like <code className="px-1 bg-muted rounded">{`{{first_name}}`}</code> to personalize each text.
          </DialogDescription>
        </DialogHeader>
        <div className="grid sm:grid-cols-2 gap-4">
          {/* Editor side */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Name</Label>
                <Input value={local.name} onChange={(e) => setLocal({ ...local, name: e.target.value })} placeholder="First touch" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Category</Label>
                <Input value={local.category} onChange={(e) => setLocal({ ...local, category: e.target.value })} placeholder="follow-up" />
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Message body</Label>
                <span className={cn('text-[10px]', seg.chars > 160 ? 'text-amber-600' : 'text-muted-foreground')}>
                  {seg.chars} chars · {seg.count} segment{seg.count > 1 ? 's' : ''}
                </span>
              </div>
              <Textarea
                ref={(el) => { textareaRef.current = el; }}
                value={local.body}
                onChange={(e) => setLocal({ ...local, body: e.target.value })}
                className="min-h-[140px] font-mono text-[13px]"
                placeholder="Hi {{first_name}}, this is {{agent_name}}…"
              />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Insert merge tag</Label>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {SMS_VARIABLES.map(v => (
                  <button
                    key={v.tag}
                    type="button"
                    onClick={() => insertTag(v.tag)}
                    className="px-2 py-0.5 text-[10.5px] rounded-full border border-border bg-background hover:border-primary/50 hover:text-primary transition-colors"
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Live preview side */}
          <div className="space-y-2">
            <Label className="text-xs flex items-center gap-1.5">
              <Eye className="w-3 h-3" /> Live preview
            </Label>
            <div className="rounded-2xl bg-muted/30 p-3 min-h-[200px]">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">As a recipient sees it:</div>
              <div className="bg-[#007AFF] text-white rounded-2xl rounded-bl-sm px-3.5 py-2 text-sm whitespace-pre-wrap break-words max-w-[85%]">
                {preview || <span className="opacity-60">Your message will appear here…</span>}
              </div>
            </div>
            <div className="text-[10px] text-muted-foreground">Sample data: {sample.first_name}, {sample.city}, {sample.agent_name}</div>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          {canTestSend && local.body && (
            <Button variant="outline" size="sm" onClick={() => onTestSend(local.body)}>
              <FlaskConical className="w-3.5 h-3.5 mr-1.5" /> Send to me
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!local.name || !local.body || isSaving}
            onClick={() => onSave(local)}
          >
            {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
            Save template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ════════════════════════════════════════════════════════════════════
// Bits
// ════════════════════════════════════════════════════════════════════
function SubTabBar<T extends string>({
  value, onChange, options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string; icon: any }>;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-0.5 w-full sm:w-auto overflow-x-auto">
      {options.map(o => {
        const Icon = o.icon;
        const active = value === o.value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              'px-3 py-1.5 text-xs rounded-md font-medium transition-all flex items-center gap-1.5 whitespace-nowrap',
              active
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

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

// Map raw Twilio error codes to friendly explanations
function explainFailure(code: string | null, message: string | null): string {
  if (!code && !message) return 'Unknown error';
  const c = (code || '').toString();
  const map: Record<string, string> = {
    '21610': 'Recipient unsubscribed (STOP). Reach out via another channel.',
    '21614': 'Invalid phone number — not SMS-capable.',
    '21408': 'No permission to send to this country. Enable in Twilio Geo Permissions.',
    '30003': 'Phone unreachable — likely off or out of coverage.',
    '30004': 'Recipient blocked the message.',
    '30005': 'Unknown destination — number may not exist.',
    '30006': 'Landline or unreachable carrier.',
    '30007': 'Carrier flagged as spam. Tweak the message wording.',
    '30008': 'Unknown error from carrier.',
    '21211': 'Phone number isn\'t in a valid format.',
  };
  return map[c] || message || `Twilio error ${c}`;
}
