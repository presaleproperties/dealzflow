import { useState, useMemo, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Variable, FileText, Image as ImageIcon, Send, Loader2, Calendar, AlertTriangle, X, Users, MessageSquare, Filter, ChevronDown } from 'lucide-react';
import {
  useBulkSendSms, useSmsTemplates, useSmsOptOuts, SMS_VARIABLES, smsSegments, type MessagingChannel,
} from '@/hooks/useSms';
import { cn } from '@/lib/utils';
import { useCrmContacts, LEAD_STATUSES, LEAD_SOURCES } from '@/hooks/useCrmContacts';
import { useAgentNames } from '@/hooks/useTeamAgents';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-resolved recipient ids. Ignored when `audiencePicker` is true. */
  contactIds: string[];
  onComplete?: () => void;
  defaultChannel?: MessagingChannel;
  /** When true, show in-dialog audience filter (pipeline / source / agent / tags). */
  audiencePicker?: boolean;
}

export function BulkSendTextDialog({ open, onOpenChange, contactIds, onComplete, defaultChannel = 'sms', audiencePicker = false }: Props) {
  const bulkSend = useBulkSendSms();
  const [channel, setChannel] = useState<MessagingChannel>(defaultChannel);
  const { data: templates = [] } = useSmsTemplates();
  const { data: allContacts = [] } = useCrmContacts();
  const { data: optOuts = [] } = useSmsOptOuts();
  const agentNames = useAgentNames();

  // Audience filters (only used when audiencePicker=true)
  const [fStatuses, setFStatuses] = useState<string[]>([]);
  const [fSources, setFSources] = useState<string[]>([]);
  const [fAgents, setFAgents] = useState<string[]>([]);
  const [fTags, setFTags] = useState<string>('');
  const [audienceOpen, setAudienceOpen] = useState(true);
  const toggleArr = (arr: string[], v: string, set: (a: string[]) => void) => {
    set(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);
  };
  const optOutPhones = useMemo(
    () => new Set(optOuts.filter(o => !o.re_opted_in_at).map(o => (o.phone || '').replace(/\D/g, '').slice(-10))),
    [optOuts],
  );
  const audienceIds = useMemo(() => {
    if (!audiencePicker) return null;
    const tagsArr = fTags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
    return allContacts.filter(c => {
      if (!c.phone) return false;
      if (optOutPhones.has((c.phone || '').replace(/\D/g, '').slice(-10))) return false;
      if (fStatuses.length && !fStatuses.includes(c.status || '')) return false;
      if (fSources.length && !fSources.includes(c.source || '')) return false;
      if (fAgents.length && !fAgents.includes(c.assigned_to || '')) return false;
      if (tagsArr.length && !(c.tags || []).some(t => tagsArr.includes(t.toLowerCase()))) return false;
      return true;
    }).map(c => c.id);
  }, [audiencePicker, allContacts, optOutPhones, fStatuses, fSources, fAgents, fTags]);
  const effectiveIds = audiencePicker ? (audienceIds || []) : contactIds;

  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [pendingMediaUrl, setPendingMediaUrl] = useState('');
  const [scheduled, setScheduled] = useState(false);
  const [scheduledFor, setScheduledFor] = useState('');
  const [throttle, setThrottle] = useState(60);
  const [varOpen, setVarOpen] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!open) {
      setName(''); setBody(''); setMediaUrls([]); setPendingMediaUrl('');
      setScheduled(false); setScheduledFor(''); setThrottle(60);
    } else if (open && !name) {
      setName(`Blast — ${new Date().toLocaleDateString()}`);
    }
  }, [open]); // eslint-disable-line

  const recipients = useMemo(() => {
    const set = new Set(effectiveIds);
    return allContacts.filter(c => set.has(c.id));
  }, [allContacts, effectiveIds]);

  const reachable = useMemo(
    () => recipients.filter(r => !!r.phone && r.phone.replace(/\D/g, '').length >= 8),
    [recipients]
  );
  const skippedNoPhone = recipients.length - reachable.length;

  const seg = smsSegments(body);

  const insertAtCursor = (text: string) => {
    const el = textareaRef.current;
    if (!el) { setBody(prev => prev + text); return; }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + text + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + text.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const handleUpload = async (file: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `sms-bulk/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from('crm-media').upload(path, file, { upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from('crm-media').getPublicUrl(path);
      if (data?.publicUrl) setMediaUrls(prev => [...prev, data.publicUrl]);
    } catch (e: any) {
      toast.error(e?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSend = () => {
    if (!body.trim()) return toast.error('Write a message first');
    if (reachable.length === 0) return toast.error('No recipients with valid phone numbers');
    if (scheduled && !scheduledFor) return toast.error('Pick a scheduled time');

    bulkSend.mutate(
      {
        name: name || `Blast — ${new Date().toISOString()}`,
        body,
        media_urls: mediaUrls,
        contact_ids: reachable.map(r => r.id),
        scheduled_for: scheduled ? new Date(scheduledFor).toISOString() : undefined,
        throttle_per_min: throttle,
        channel,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          onComplete?.();
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("p-0 overflow-hidden", audiencePicker ? "max-w-3xl" : "max-w-2xl")}>
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            Send mass {channel === 'whatsapp' ? 'WhatsApp' : 'text'}
          </DialogTitle>
          <div className="flex items-center gap-1 mt-2 p-0.5 rounded-md bg-muted w-fit">
            <button
              onClick={() => setChannel('sms')}
              className={cn(
                'px-2.5 py-1 text-[11px] rounded font-medium transition-colors flex items-center gap-1',
                channel === 'sms' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
              )}
            >
              <MessageSquare className="w-3 h-3" /> SMS / MMS
            </button>
            <button
              onClick={() => setChannel('whatsapp')}
              className={cn(
                'px-2.5 py-1 text-[11px] rounded font-medium transition-colors flex items-center gap-1',
                channel === 'whatsapp' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'
              )}
            >
              <span className="w-3 h-3 rounded-full bg-emerald-500" /> WhatsApp
            </button>
          </div>
        </DialogHeader>

        <div className="px-5 py-4 space-y-4 max-h-[78vh] overflow-y-auto">
          {/* Audience picker (in-dialog) */}
          {audiencePicker && (
            <div className="rounded-lg border border-border bg-muted/20">
              <button
                type="button"
                onClick={() => setAudienceOpen(o => !o)}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
              >
                <Filter className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold">Audience</span>
                <Badge variant="outline" className="text-[10px] font-medium">
                  {effectiveIds.length} match
                </Badge>
                <ChevronDown className={cn("w-3.5 h-3.5 ml-auto text-muted-foreground transition-transform", audienceOpen && "rotate-180")} />
              </button>
              {audienceOpen && (
                <div className="px-3 pb-3 space-y-2.5 border-t border-border/60">
                  <AudienceRow label="Pipeline" options={LEAD_STATUSES} selected={fStatuses} onToggle={(v) => toggleArr(fStatuses, v, setFStatuses)} />
                  <AudienceRow label="Source" options={LEAD_SOURCES} selected={fSources} onToggle={(v) => toggleArr(fSources, v, setFSources)} />
                  <AudienceRow label="Assigned" options={agentNames} selected={fAgents} onToggle={(v) => toggleArr(fAgents, v, setFAgents)} />
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Tags</Label>
                    <Input value={fTags} onChange={(e) => setFTags(e.target.value)} placeholder="vip, hot-lead" className="h-8 text-xs" />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Recipients summary */}
          <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg bg-muted/40 border border-border">
            <Badge variant="outline" className="font-medium">
              {reachable.length} recipients
            </Badge>
            {skippedNoPhone > 0 && (
              <Badge variant="outline" className="text-amber-600 border-amber-600/30">
                {skippedNoPhone} skipped (no phone)
              </Badge>
            )}
            <span className="text-xs text-muted-foreground ml-auto">
              Opt-outs auto-excluded · Quiet hours respected
            </span>
          </div>

          {/* Campaign name */}
          <div className="space-y-1.5">
            <Label className="text-xs">Campaign name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional internal label" />
          </div>

          {/* Composer */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Message</Label>
              <div className="text-[11px] text-muted-foreground">
                {seg.chars} chars · {seg.count} segment{seg.count > 1 ? 's' : ''}
              </div>
            </div>
            <Textarea
              ref={textareaRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Hi {{first_name}}, quick update on…"
              className="min-h-[140px] resize-none"
            />
            <div className="flex flex-wrap items-center gap-1.5">
              <Popover open={varOpen} onOpenChange={setVarOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                    <Variable className="w-3.5 h-3.5" /> Variable
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-1" align="start">
                  <ScrollArea className="max-h-64">
                    {SMS_VARIABLES.map(v => (
                      <button
                        key={v.tag}
                        onClick={() => { insertAtCursor(v.tag); setVarOpen(false); }}
                        className="w-full text-left p-2 rounded text-xs hover:bg-muted"
                      >
                        <div className="font-mono text-primary">{v.tag}</div>
                        <div className="text-muted-foreground">{v.label}</div>
                      </button>
                    ))}
                  </ScrollArea>
                </PopoverContent>
              </Popover>

              <Popover open={tplOpen} onOpenChange={setTplOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                    <FileText className="w-3.5 h-3.5" /> Template
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-1" align="start">
                  {(() => {
                    const ch = templates.filter(t => (t.channel || 'sms') === channel);
                    if (ch.length === 0) return <div className="p-3 text-xs text-muted-foreground">No {channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} templates yet.</div>;
                    return (
                      <ScrollArea className="max-h-72">
                        {ch.map(t => (
                          <button
                            key={t.id}
                            onClick={() => { setBody(t.body); setMediaUrls(t.default_media_urls || []); setTplOpen(false); }}
                            className="w-full text-left p-2 rounded hover:bg-muted"
                          >
                            <div className="text-xs font-medium">{t.name}</div>
                            <div className="text-[11px] text-muted-foreground line-clamp-2">{t.body}</div>
                          </button>
                        ))}
                      </ScrollArea>
                    );
                  })()}
                </PopoverContent>
              </Popover>

              <Popover open={mediaOpen} onOpenChange={setMediaOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                    <ImageIcon className="w-3.5 h-3.5" /> Media {mediaUrls.length > 0 && `(${mediaUrls.length})`}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-3 space-y-2" align="start">
                  <Button variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()} className="w-full">
                    {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Upload image'}
                  </Button>
                  <input
                    ref={fileRef} type="file" accept="image/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.currentTarget.value = ''; }}
                  />
                  <div className="text-[11px] text-muted-foreground">Or paste URL</div>
                  <div className="flex gap-1.5">
                    <Input value={pendingMediaUrl} onChange={(e) => setPendingMediaUrl(e.target.value)} placeholder="https://…" className="h-8 text-xs" />
                    <Button size="sm" onClick={() => { if (pendingMediaUrl) { setMediaUrls(p => [...p, pendingMediaUrl]); setPendingMediaUrl(''); } }}>Add</Button>
                  </div>
                  {mediaUrls.length > 0 && (
                    <div className="space-y-1 pt-2 border-t border-border">
                      {mediaUrls.map((u, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-xs">
                          <span className="truncate flex-1">{u}</span>
                          <button onClick={() => setMediaUrls(p => p.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Schedule + throttle */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" /> Schedule
                </Label>
                <Switch checked={scheduled} onCheckedChange={setScheduled} />
              </div>
              {scheduled && (
                <Input
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                  className="h-8 text-xs"
                />
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Throttle (msgs / min)</Label>
              <Input
                type="number" min={1} max={300}
                value={throttle}
                onChange={(e) => setThrottle(Number(e.target.value) || 60)}
                className="h-8 text-xs"
              />
            </div>
          </div>

          {body && (
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Preview (first recipient)</div>
              <div className="text-sm whitespace-pre-wrap">
                {body.replace(/\{\{first_name\}\}/g, reachable[0]?.first_name || 'there')
                     .replace(/\{\{last_name\}\}/g, reachable[0]?.last_name || '')
                     .replace(/\{\{full_name\}\}/g, `${reachable[0]?.first_name || ''} ${reachable[0]?.last_name || ''}`.trim() || 'there')}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border bg-muted/20">
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <AlertTriangle className="w-3 h-3" />
            STOP/HELP auto-handled
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSend} disabled={bulkSend.isPending || !body.trim() || reachable.length === 0}>
              {bulkSend.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              <span className="ml-1.5">{scheduled ? 'Schedule blast' : `Send to ${reachable.length}`}</span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
