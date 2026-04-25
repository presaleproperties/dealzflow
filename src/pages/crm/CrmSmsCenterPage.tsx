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
import {
  MessageSquare, Send, Plus, Trash2, Pencil, Users, BarChart3, ShieldOff,
  Calendar, CheckCircle2, XCircle, Clock, Phone, Inbox, Settings as SettingsIcon, Loader2,
} from 'lucide-react';
import {
  useSmsTemplates, useSaveSmsTemplate, useDeleteSmsTemplate,
  useSmsCampaigns, useSmsOptOuts, useSmsNumbers, useSmsSettings, useAllSmsLog,
  smsSegments,
} from '@/hooks/useSms';
import { useCrmContacts, LEAD_STATUSES, LEAD_SOURCES, AGENTS } from '@/hooks/useCrmContacts';
import { BulkSendTextDialog } from '@/components/crm/leads/BulkSendTextDialog';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

export default function CrmSmsCenterPage() {
  const navigate = useNavigate();
  const { data: templates = [] } = useSmsTemplates();
  const { data: campaigns = [] } = useSmsCampaigns();
  const { data: optOuts = [] } = useSmsOptOuts();
  const { data: numbers = [] } = useSmsNumbers();
  const { data: settings } = useSmsSettings();
  const { data: allContacts = [] } = useCrmContacts();
  const { data: logs = [] } = useAllSmsLog({ limit: 200 });

  const [tab, setTab] = useState('campaigns');

  // Composer
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

  // Campaign analytics summary
  const totals = useMemo(() => {
    return campaigns.reduce(
      (acc, c) => ({
        sent: acc.sent + (c.sent_count || 0),
        delivered: acc.delivered + (c.delivered_count || 0),
        failed: acc.failed + (c.failed_count || 0),
        replies: acc.replies + (c.reply_count || 0),
        optouts: acc.optouts + (c.optout_count || 0),
      }),
      { sent: 0, delivered: 0, failed: 0, replies: 0, optouts: 0 }
    );
  }, [campaigns]);

  return (
    <div className="space-y-4 p-4 sm:p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">SMS Center</h1>
          <p className="text-sm text-muted-foreground">Templates, blasts, replies, and compliance</p>
        </div>
        <div className="flex items-center gap-2">
          {numbers.length === 0 && !settings?.messaging_service_sid ? (
            <Badge variant="outline" className="text-amber-600 border-amber-600/30 gap-1">
              <Phone className="w-3 h-3" /> Twilio not connected
            </Badge>
          ) : (
            <Badge variant="outline" className="text-emerald-600 border-emerald-600/30 gap-1">
              <CheckCircle2 className="w-3 h-3" /> Twilio ready
            </Badge>
          )}
        </div>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <StatPill label="Sent" value={totals.sent} icon={Send} />
        <StatPill label="Delivered" value={totals.delivered} icon={CheckCircle2} tone="emerald" />
        <StatPill label="Failed" value={totals.failed} icon={XCircle} tone="red" />
        <StatPill label="Replies" value={totals.replies} icon={Inbox} tone="primary" />
        <StatPill label="Opt-outs" value={optOuts.length} icon={ShieldOff} tone="amber" />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid grid-cols-5 w-full sm:w-auto h-auto">
          <TabsTrigger value="campaigns" className="gap-1 sm:gap-1.5 flex-col sm:flex-row text-[10px] sm:text-sm py-2"><Send className="w-3.5 h-3.5" /><span>Blasts</span></TabsTrigger>
          <TabsTrigger value="new" className="gap-1 sm:gap-1.5 flex-col sm:flex-row text-[10px] sm:text-sm py-2"><Plus className="w-3.5 h-3.5" /><span>New</span></TabsTrigger>
          <TabsTrigger value="templates" className="gap-1 sm:gap-1.5 flex-col sm:flex-row text-[10px] sm:text-sm py-2"><MessageSquare className="w-3.5 h-3.5" /><span>Templates</span></TabsTrigger>
          <TabsTrigger value="inbox" className="gap-1 sm:gap-1.5 flex-col sm:flex-row text-[10px] sm:text-sm py-2"><Inbox className="w-3.5 h-3.5" /><span>Inbox</span></TabsTrigger>
          <TabsTrigger value="optouts" className="gap-1 sm:gap-1.5 flex-col sm:flex-row text-[10px] sm:text-sm py-2"><ShieldOff className="w-3.5 h-3.5" /><span>Opt-outs</span></TabsTrigger>
        </TabsList>

        {/* === New blast === */}
        <TabsContent value="new" className="space-y-3 mt-4">
          <Card className="p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              <h2 className="font-semibold">Target by segment, tag, or filter</h2>
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
                Compose blast
              </Button>
            </div>
          </Card>
        </TabsContent>

        {/* === Campaigns === */}
        <TabsContent value="campaigns" className="space-y-2 mt-4">
          {campaigns.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              No blasts yet. Use <strong>New</strong> to send your first mass text.
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

        {/* === Templates === */}
        <TabsContent value="templates" className="mt-4">
          <TemplatesTab />
        </TabsContent>

        {/* === Inbox === */}
        <TabsContent value="inbox" className="space-y-2 mt-4">
          {logs.filter(l => l.direction === 'inbound').length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">No inbound replies yet.</Card>
          ) : (
            logs.filter(l => l.direction === 'inbound').map(l => (
              <Card key={l.id} className="p-3 hover:bg-muted/30 cursor-pointer transition-colors"
                onClick={() => l.contact_id && navigate(`/crm/leads/${l.contact_id}`)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      <Phone className="w-3 h-3" />
                      <span className="font-mono">{l.from_number}</span>
                      <span>·</span>
                      <span>{formatDistanceToNow(new Date(l.sent_at), { addSuffix: true })}</span>
                    </div>
                    <p className="text-sm">{l.body}</p>
                  </div>
                </div>
              </Card>
            ))
          )}
        </TabsContent>

        {/* === Opt-outs === */}
        <TabsContent value="optouts" className="space-y-2 mt-4">
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
        </TabsContent>
      </Tabs>

      <BulkSendTextDialog
        open={composerOpen}
        onOpenChange={setComposerOpen}
        contactIds={composerIds}
      />
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

// ==================== Templates Tab ====================
function TemplatesTab() {
  const { data: templates = [] } = useSmsTemplates();
  const save = useSaveSmsTemplate();
  const del = useDeleteSmsTemplate();
  const [editing, setEditing] = useState<{ id?: string; name: string; body: string; category: string } | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Templates ({templates.length})</h2>
        <Button size="sm" onClick={() => setEditing({ name: '', body: '', category: 'general' })}>
          <Plus className="w-3.5 h-3.5 mr-1" /> New template
        </Button>
      </div>

      {templates.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">No templates yet.</Card>
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
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditing({ id: t.id, name: t.name, body: t.body, category: t.category })}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => { if (confirm('Delete template?')) del.mutate(t.id); }}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">{t.body}</p>
                <div className="text-[10px] text-muted-foreground mt-2">
                  {seg.chars} chars · {seg.count} segment{seg.count > 1 ? 's' : ''} · used {t.times_used || 0}×
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
              <div className="space-y-1.5">
                <Label className="text-xs">Name</Label>
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Category</Label>
                <Input value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} placeholder="follow-up, promo, intro…" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Body — use {`{{first_name}}`}, {`{{agent_name}}`}, etc.</Label>
                <Textarea
                  value={editing.body}
                  onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                  className="min-h-[120px]"
                />
                <div className="text-[10px] text-muted-foreground">{smsSegments(editing.body).chars} chars · {smsSegments(editing.body).count} segments</div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              disabled={!editing?.name || !editing?.body || save.isPending}
              onClick={() => { if (!editing) return; save.mutate(editing, { onSuccess: () => setEditing(null) }); }}
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
