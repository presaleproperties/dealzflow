/**
 * Tier 4 — UnifiedComposer.
 *
 * The ONE composer surface for the CRM. Mounted at the app root via
 * <ComposerMount/>. All entry points (QuickActionBar, LeadsTable row icons,
 * Inbox reply button, Cmd+E, Cmd+T, inbox Compose) push state into the
 * `useComposerStore` and this component renders.
 *
 * Right-side slide-over (600px on desktop), full-bleed on mobile.
 *
 * Smart Send button:
 *   • Email  → "Send now" (gold)             → bridge-send-email
 *   • Text + kill_switch=false + within cap  → "Send now" (gold) → send-sms
 *   • Text + kill_switch=true or cap hit     → "Stage for approval" (amber)
 *                                              → INSERT sms_outbound_queue
 *
 * Variable rendering is server-side via the crm-render-template edge fn,
 * which resolves {{agent_name}} from auth.uid() (acting user) — NOT from
 * the lead's assigned agent. Satisfies Acceptance E.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  X, Mail, MessageSquare, Send, Loader2, Sparkles, Paperclip,
  Calendar as CalendarIcon, AlertTriangle, FileText, ChevronDown,
} from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { usePresaleAgentStore } from '@/stores/usePresaleAgent';
import { useComposerStore } from '@/stores/useComposer';
import { TemplatePickerSheet } from '@/components/crm/templates/TemplatePickerSheet';
import type { PickerTemplate } from '@/lib/templatePicker';
import { uploadSmsMedia } from '@/lib/smsMediaUpload';
import { useCrmLeadSegments } from '@/hooks/useCrmLeadSegments';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type RecipientTab = 'single' | 'segment' | 'custom';

// ---- Attachment validation limits
const EMAIL_MAX_FILE = 20 * 1024 * 1024; // 20MB / file
const EMAIL_MAX_TOTAL = 25 * 1024 * 1024; // 25MB combined
const EMAIL_MAX_COUNT = 10;
const MMS_MAX_FILE = 5 * 1024 * 1024;    // Twilio hard limit
const MMS_MAX_COUNT = 10;
const MMS_ALLOWED = /^(image\/|video\/|audio\/|application\/pdf)/;

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function validateAttachments(files: File[], channel: 'email' | 'text'): string | null {
  if (channel === 'email') {
    if (files.length > EMAIL_MAX_COUNT) return `Max ${EMAIL_MAX_COUNT} attachments`;
    const total = files.reduce((s, f) => s + f.size, 0);
    if (total > EMAIL_MAX_TOTAL) return `Total exceeds ${fmtBytes(EMAIL_MAX_TOTAL)}`;
    const oversized = files.find((f) => f.size > EMAIL_MAX_FILE);
    if (oversized) return `${oversized.name} exceeds ${fmtBytes(EMAIL_MAX_FILE)}`;
  } else {
    if (files.length > MMS_MAX_COUNT) return `Max ${MMS_MAX_COUNT} MMS attachments`;
    const oversized = files.find((f) => f.size > MMS_MAX_FILE);
    if (oversized) return `${oversized.name} exceeds 5MB (Twilio MMS limit)`;
    const bad = files.find((f) => !MMS_ALLOWED.test(f.type));
    if (bad) return `${bad.name}: unsupported MMS type (${bad.type || 'unknown'})`;
  }
  return null;
}

const LEAD_VARS = [
  'first_name', 'last_name', 'full_name', 'email', 'phone',
  'project', 'address', 'city', 'pipeline_status',
];
const SENDER_VARS = [
  'agent_name', 'agent_phone', 'agent_email', 'agent_calendly',
  'agent_signature', 'agent_photo',
];

function smsSegmentCount(body: string): { chars: number; segments: number; gsm: boolean } {
  const chars = body.length;
  // Conservative: assume GSM if all chars in basic GSM-7 set, else UCS-2
  const gsm = /^[\x00-\x7F€£¥èéùìòÇØøÅåÆæßÉÄÖÑÜ§¿äöñü\s]*$/.test(body);
  const seg = gsm ? (chars <= 160 ? 1 : Math.ceil(chars / 153)) : (chars <= 70 ? 1 : Math.ceil(chars / 67));
  return { chars, segments: seg, gsm };
}

function inVancouverQuietHours(d = new Date()): boolean {
  // 21:00–08:00 America/Vancouver
  const opts: Intl.DateTimeFormatOptions = { hour: '2-digit', hour12: false, timeZone: 'America/Vancouver' };
  const hourStr = new Intl.DateTimeFormat('en-US', opts).format(d);
  const hour = parseInt(hourStr, 10);
  return hour >= 21 || hour < 8;
}

// ---- Recipient parsing helpers (Segment + Custom list)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Conservative: 10–15 digits after stripping non-digits, optional leading +.
function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return null;
  if (!hasPlus && digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}
function normalizeEmail(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  return EMAIL_RE.test(v) ? v : null;
}

export type CustomListParse = {
  valid: string[];          // deduped, normalized
  invalid: string[];        // unparseable rows
  duplicates: number;       // count removed by dedup
  totalRows: number;        // non-empty rows entered
};

function parseCustomList(input: string, channel: 'email' | 'text'): CustomListParse {
  const rows = input
    .split(/[\n,;\t]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  let duplicates = 0;
  for (const row of rows) {
    const normalized = channel === 'email' ? normalizeEmail(row) : normalizePhone(row);
    if (!normalized) { invalid.push(row); continue; }
    if (seen.has(normalized)) { duplicates++; continue; }
    seen.add(normalized);
    valid.push(normalized);
  }
  return { valid, invalid, duplicates, totalRows: rows.length };
}

export function UnifiedComposer() {
  const {
    open, channel, mode, leadId, threadId, initialSubject, initialBody,
    initialToEmail, initialToPhone, initialToName, instance, closeComposer,
  } = useComposerStore();

  const { user } = useAuth();
  const { data: profile } = useProfile();
  const presaleAgent = usePresaleAgentStore((s) => s.agent);

  // -- Local form state — reset whenever a new instance opens.
  const [activeChannel, setActiveChannel] = useState<'email' | 'text'>(channel);
  const [recipientTab, setRecipientTab] = useState<RecipientTab>('single');
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [toEmail, setToEmail] = useState(initialToEmail);
  const [toPhone, setToPhone] = useState(initialToPhone);
  const [toName, setToName] = useState(initialToName);
  const [scheduleOn, setScheduleOn] = useState(false);
  const [scheduleAt, setScheduleAt] = useState<string>(''); // datetime-local
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  // Recipient tab state
  const [segmentId, setSegmentId] = useState<string>('');
  const [customInput, setCustomInput] = useState('');
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  // Generate / revoke object URLs for image previews.
  useEffect(() => {
    const next: Record<string, string> = {};
    attachments.forEach((f) => {
      if (f.type.startsWith('image/')) {
        const key = `${f.name}:${f.size}:${f.lastModified}`;
        next[key] = previewUrls[key] ?? URL.createObjectURL(f);
      }
    });
    // Revoke any urls no longer referenced
    Object.entries(previewUrls).forEach(([k, url]) => {
      if (!next[k]) URL.revokeObjectURL(url);
    });
    setPreviewUrls(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachments]);

  useEffect(() => {
    return () => {
      Object.values(previewUrls).forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = (files: File[]) => {
    if (files.length === 0) return;
    const merged = [...attachments, ...files];
    const err = validateAttachments(merged, activeChannel);
    if (err) { toast.error(err); return; }
    setAttachments(merged);
  };

  // Reset on each new instance (openComposer call bumps `instance`).
  useEffect(() => {
    if (!open) return;
    setActiveChannel(channel);
    setRecipientTab('single');
    setSubject(initialSubject);
    setBody(initialBody);
    setToEmail(initialToEmail);
    setToPhone(initialToPhone);
    setToName(initialToName);
    setScheduleOn(false);
    setScheduleAt('');
    setAttachments([]);
  }, [instance, open, channel, initialSubject, initialBody, initialToEmail, initialToPhone, initialToName]);

  // Hydrate recipient from lead if leadId provided but no explicit to* given.
  const leadQuery = useQuery({
    queryKey: ['composer-lead', leadId],
    enabled: open && !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_contacts')
        .select('id, first_name, last_name, email, phone, temperature')
        .eq('id', leadId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  useEffect(() => {
    if (!leadQuery.data) return;
    const c = leadQuery.data as any;
    const display = [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || c.phone || 'Lead';
    if (!initialToEmail && c.email) setToEmail(c.email);
    if (!initialToPhone && c.phone) setToPhone(c.phone);
    if (!initialToName) setToName(display);
  }, [leadQuery.data, initialToEmail, initialToPhone, initialToName]);

  // Kill switch + daily cap from system_settings (cached).
  const settingsQuery = useQuery({
    queryKey: ['system-settings-sms'],
    queryFn: async () => {
      const { data } = await supabase
        .from('system_settings')
        .select('key, value')
        .in('key', ['sms_kill_switch', 'sms_daily_cap']);
      const rows = (data ?? []) as { key: string; value: any }[];
      const get = (k: string) => rows.find((r) => r.key === k)?.value;
      return {
        killSwitch: get('sms_kill_switch') === true || get('sms_kill_switch')?.enabled === true,
        dailyCap: typeof get('sms_daily_cap') === 'number' ? get('sms_daily_cap') : 500,
      };
    },
    staleTime: 30_000,
  });

  // Today's SMS sent count (rough cap check).
  const smsCountQuery = useQuery({
    queryKey: ['sms-today-count'],
    enabled: open && activeChannel === 'text',
    queryFn: async () => {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const { count } = await supabase
        .from('crm_sms_log')
        .select('id', { count: 'exact', head: true })
        .eq('direction', 'outbound')
        .gte('sent_at', startOfDay.toISOString());
      return count ?? 0;
    },
    staleTime: 30_000,
  });

  // -- Derived
  const segInfo = useMemo(() => smsSegmentCount(body), [body]);
  const channelBlocked = activeChannel === 'text' && (
    (settingsQuery.data?.killSwitch ?? true) ||
    (smsCountQuery.data ?? 0) >= (settingsQuery.data?.dailyCap ?? 500)
  );
  const quietHoursWarn = activeChannel === 'text' && inVancouverQuietHours();
  const senderName = profile?.full_name || presaleAgent?.name || user?.email || '';
  const senderEmail = user?.email || presaleAgent?.email || '';
  const senderPhone = presaleAgent?.phone || '';

  // -- Actions
  const insertVar = (name: string) => {
    const ta = bodyRef.current;
    const token = `{{${name}}}`;
    if (!ta) { setBody((b) => b + token); return; }
    const start = ta.selectionStart ?? body.length;
    const end = ta.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    setTimeout(() => {
      ta.focus();
      const pos = start + token.length;
      ta.setSelectionRange(pos, pos);
    }, 0);
  };

  const applyTemplate = (t: PickerTemplate) => {
    if (t.kind === 'email') {
      if (t.subject) setSubject(t.subject);
      setBody(t.body);
      if (activeChannel !== 'email') setActiveChannel('email');
    } else {
      setBody(t.body);
      if (activeChannel !== 'text') setActiveChannel('text');
    }
    setPickerOpen(false);
    toast.success(`Loaded "${t.name}"`);
  };

  const renderViaServer = async (
    text: string,
    subj: string | null,
    chan: 'email' | 'sms',
  ): Promise<{ text: string; subject: string | null }> => {
    try {
      const { data, error } = await supabase.functions.invoke('crm-render-template', {
        body: { text, subject: subj, lead_id: leadId, channel: chan },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return { text: data.text ?? text, subject: data.subject ?? subj };
    } catch (e) {
      // Soft-fail: send raw so the user isn't blocked by a transient error.
      console.warn('[UnifiedComposer] render fallback', e);
      return { text, subject: subj };
    }
  };

  // Upload email attachments to private `email-attachments` bucket and return
  // 30-day signed URLs. External recipients aren't authed so signed URLs are
  // required (never use getPublicUrl — see storage-bucket-lockdown memory).
  const uploadEmailAttachments = async (): Promise<{ name: string; url: string; size: number; type: string }[]> => {
    if (attachments.length === 0) return [];
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) throw new Error('Not authenticated');
    const out: { name: string; url: string; size: number; type: string }[] = [];
    for (const f of attachments) {
      const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
      const { error } = await supabase.storage
        .from('email-attachments')
        .upload(path, f, { contentType: f.type || 'application/octet-stream', upsert: false });
      if (error) throw new Error(`Upload failed (${f.name}): ${error.message}`);
      const { data: signed, error: signErr } = await supabase.storage
        .from('email-attachments')
        .createSignedUrl(path, 60 * 60 * 24 * 30); // 30 days
      if (signErr || !signed?.signedUrl) throw new Error(signErr?.message || 'Could not sign URL');
      out.push({ name: f.name, url: signed.signedUrl, size: f.size, type: f.type });
    }
    return out;
  };

  const buildAttachmentsHtml = (
    files: { name: string; url: string; size: number; type: string }[],
  ): string => {
    if (files.length === 0) return '';
    const rows = files
      .map(
        (f) =>
          `<li style="margin:4px 0;"><a href="${f.url}" style="color:#D7A542;text-decoration:none;">📎 ${f.name}</a> <span style="color:#888;font-size:12px;">(${fmtBytes(f.size)})</span></li>`,
      )
      .join('');
    return `<div style="margin-top:20px;padding-top:12px;border-top:1px solid #e5e5e5;font-family:Plus Jakarta Sans,system-ui,sans-serif;font-size:14px;"><div style="color:#666;margin-bottom:6px;">Attachments (links valid 30 days):</div><ul style="list-style:none;padding:0;margin:0;">${rows}</ul></div>`;
  };

  const handleSend = async () => {
    if (sending) return;
    // Re-validate attachments against current channel (channel toggle may have changed)
    const attachErr = validateAttachments(attachments, activeChannel);
    if (attachErr) { toast.error(attachErr); return; }
    setSending(true);
    try {
      if (activeChannel === 'email') {
        if (!toEmail.trim()) { toast.error('Recipient email required'); return; }
        if (!subject.trim()) { toast.error('Subject required'); return; }
        const rendered = await renderViaServer(body, subject, 'email');
        const uploaded = await uploadEmailAttachments();
        const html = rendered.text + buildAttachmentsHtml(uploaded);
        const { data, error } = await supabase.functions.invoke('bridge-send-email', {
          body: {
            to: toEmail.trim(),
            subject: rendered.subject || subject,
            html,
            contact_id: leadId,
            send_at: scheduleOn && scheduleAt ? new Date(scheduleAt).toISOString() : null,
            attachments: uploaded.map((a) => ({ name: a.name, url: a.url, type: a.type, size: a.size })),
          },
        });
        if (error) throw new Error(error.message);
        if ((data as any)?.error) throw new Error((data as any).error);
        toast.success(scheduleOn ? 'Email scheduled' : 'Email sent');
        closeComposer();
      } else {
        if (!toPhone.trim()) { toast.error('Recipient phone required'); return; }
        if (!body.trim() && attachments.length === 0) { toast.error('Message body or media required'); return; }
        const rendered = await renderViaServer(body, null, 'sms');
        const mediaUrls = attachments.length > 0 ? await uploadSmsMedia(attachments) : [];
        if (channelBlocked) {
          // Stage for approval — INSERT directly to sms_outbound_queue.
          const reason = (settingsQuery.data?.killSwitch ?? true)
            ? 'kill_switch'
            : 'daily_cap_reached';
          const { error } = await supabase.from('sms_outbound_queue').insert({
            contact_id: leadId,
            to_number: toPhone.trim(),
            body: rendered.text,
            status: 'pending_approval',
            reason,
            scheduled_for: scheduleOn && scheduleAt ? new Date(scheduleAt).toISOString() : null,
            metadata: {
              staged_via: 'unified_composer',
              quiet_hours: quietHoursWarn,
              media_urls: mediaUrls,
            },
          });
          if (error) throw error;
          toast.success('Staged for approval', {
            description: 'Admin must approve before delivery.',
          });
          closeComposer();
        } else {
          // Direct send path (still hits send-sms which has its own safety net).
          const { data, error } = await supabase.functions.invoke('send-sms', {
            body: {
              contact_id: leadId,
              to: toPhone.trim(),
              body: rendered.text,
              media_urls: mediaUrls,
              scheduled_for: scheduleOn && scheduleAt ? new Date(scheduleAt).toISOString() : null,
            },
          });
          if (error) throw new Error(error.message);
          if ((data as any)?.error) throw new Error((data as any).error);
          toast.success(mediaUrls.length > 0 ? 'MMS sent' : 'Text sent');
          closeComposer();
        }
      }
    } catch (e: any) {
      toast.error('Send failed', { description: e?.message ?? String(e) });
    } finally {
      setSending(false);
    }
  };

  const handleSaveDraft = () => {
    // Lightweight draft persistence — localStorage keyed by lead+channel.
    try {
      const key = `composer:draft:${activeChannel}:${leadId ?? 'none'}`;
      localStorage.setItem(key, JSON.stringify({ subject, body, toEmail, toPhone, savedAt: Date.now() }));
      toast.success('Draft saved');
    } catch {
      toast.error('Could not save draft');
    }
  };

  const sendLabel = activeChannel === 'email'
    ? (scheduleOn ? 'Schedule' : 'Send now')
    : (channelBlocked ? 'Stage for approval' : (scheduleOn ? 'Schedule' : 'Send now'));

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => { if (!o) closeComposer(); }}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-[600px] p-0 flex flex-col gap-0 [&>button]:hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-background/95 backdrop-blur">
            <div className="flex items-center gap-3 min-w-0">
              <h2 className="text-[15px] font-semibold tracking-tight truncate">
                {activeChannel === 'email' ? 'New Email' : 'New Text'}
              </h2>
              {/* Channel toggle */}
              <div className="flex items-center rounded-md border border-border/60 p-0.5 bg-muted/40">
                <button
                  type="button"
                  onClick={() => setActiveChannel('email')}
                  className={cn(
                    'px-2.5 py-1 rounded text-[11.5px] font-medium inline-flex items-center gap-1.5 transition-colors',
                    activeChannel === 'email' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Mail className="w-3 h-3" /> Email
                </button>
                <button
                  type="button"
                  onClick={() => setActiveChannel('text')}
                  className={cn(
                    'px-2.5 py-1 rounded text-[11.5px] font-medium inline-flex items-center gap-1.5 transition-colors',
                    activeChannel === 'text' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <MessageSquare className="w-3 h-3" /> Text
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={closeComposer}
              className="w-8 h-8 inline-flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
              aria-label="Close composer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body — scrollable */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {/* From */}
            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">From</Label>
              <div className="h-9 px-3 rounded-md border border-border/60 bg-muted/30 flex items-center text-[13px] text-foreground/90">
                {activeChannel === 'email' ? (
                  <>
                    <span className="truncate">{senderName ? `${senderName} <${senderEmail}>` : senderEmail}</span>
                  </>
                ) : (
                  <span className="truncate">
                    {senderPhone ? `Twilio · ${senderPhone}` : 'Twilio (default agent number)'}
                  </span>
                )}
              </div>
            </div>

            {/* Recipient tabs */}
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">To</Label>
              <div className="flex items-center gap-1 rounded-md border border-border/60 p-0.5 bg-muted/40 w-fit">
                {(['single', 'segment', 'custom'] as RecipientTab[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setRecipientTab(t)}
                    className={cn(
                      'px-2.5 py-1 rounded text-[11px] font-medium capitalize transition-colors',
                      recipientTab === t ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {t === 'single' ? 'Single lead' : t === 'segment' ? 'Segment' : 'Custom list'}
                  </button>
                ))}
              </div>
              {recipientTab === 'single' && (
                <div className="space-y-1.5">
                  <Input
                    value={activeChannel === 'email' ? toEmail : toPhone}
                    onChange={(e) =>
                      activeChannel === 'email' ? setToEmail(e.target.value) : setToPhone(e.target.value)
                    }
                    placeholder={activeChannel === 'email' ? 'recipient@example.com' : '+1 604…'}
                    className="h-9 text-[13px]"
                  />
                  {toName && (
                    <p className="text-[11px] text-muted-foreground">Lead: {toName}</p>
                  )}
                </div>
              )}
              {recipientTab === 'segment' && (
                <div className="rounded-md border border-dashed border-border/60 p-3 text-[12px] text-muted-foreground">
                  Segment recipients — pick from Leads → Save filter. Mass-send fan-out goes through campaigns, not the inbox.
                </div>
              )}
              {recipientTab === 'custom' && (
                <div className="rounded-md border border-dashed border-border/60 p-3 text-[12px] text-muted-foreground">
                  Custom list — paste emails/phones (one per line). Coming in Tier 5.
                </div>
              )}
            </div>

            {/* Subject (email only) */}
            {activeChannel === 'email' && (
              <div className="space-y-1">
                <Label className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Subject</Label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Subject…"
                  className="h-9 text-[13px]"
                />
              </div>
            )}

            {/* Body */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                  {activeChannel === 'email' ? 'Body' : 'Message'}
                </Label>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button" variant="ghost" size="sm"
                    className="h-7 px-2 text-[11px] gap-1"
                    onClick={() => setPickerOpen(true)}
                  >
                    <FileText className="w-3 h-3" /> Use template
                  </Button>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[11px] gap-1">
                        <Sparkles className="w-3 h-3" /> Variable <ChevronDown className="w-3 h-3" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-2" align="end">
                      <p className="text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground mb-1 px-1">Lead</p>
                      <div className="grid grid-cols-2 gap-0.5 mb-2">
                        {LEAD_VARS.map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => insertVar(v)}
                            className="text-left text-[11px] px-2 py-1 rounded hover:bg-muted text-foreground/80"
                          >
                            {`{{${v}}}`}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground mb-1 px-1">Sender</p>
                      <div className="grid grid-cols-2 gap-0.5">
                        {SENDER_VARS.map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => insertVar(v)}
                            className="text-left text-[11px] px-2 py-1 rounded hover:bg-muted text-foreground/80"
                          >
                            {`{{${v}}}`}
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <Textarea
                ref={bodyRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={activeChannel === 'email'
                  ? 'Write your message… use {{first_name}} for personalization'
                  : 'Type your text… keep it short. {{first_name}} works.'}
                className={cn(
                  'text-[13px] resize-none',
                  activeChannel === 'email' ? 'min-h-[280px]' : 'min-h-[140px]',
                )}
              />
              {activeChannel === 'text' && (
                <div className="flex items-center justify-between text-[10.5px] text-muted-foreground tabular-nums">
                  <span>{segInfo.chars} chars · {segInfo.segments} segment{segInfo.segments === 1 ? '' : 's'}</span>
                  {!segInfo.gsm && <span className="text-amber-600">Unicode (shorter per segment)</span>}
                </div>
              )}
            </div>

            {/* Attachments */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                  {activeChannel === 'email' ? 'Attachments' : 'MMS media'}
                </Label>
                <label className="inline-flex items-center gap-1 text-[11px] text-primary cursor-pointer hover:underline">
                  <Paperclip className="w-3 h-3" /> Add
                  <input
                    type="file"
                    multiple
                    accept={activeChannel === 'text' ? 'image/*,video/*,audio/*,application/pdf' : undefined}
                    className="hidden"
                    onChange={(e) => {
                      addFiles(Array.from(e.target.files ?? []));
                      e.currentTarget.value = '';
                    }}
                  />
                </label>
              </div>
              <p className="text-[10.5px] text-muted-foreground">
                {activeChannel === 'email'
                  ? `Up to ${EMAIL_MAX_COUNT} files · ${fmtBytes(EMAIL_MAX_FILE)} each · ${fmtBytes(EMAIL_MAX_TOTAL)} total. Sent as secure download links (30-day expiry).`
                  : `Up to ${MMS_MAX_COUNT} files · 5MB each · images, video, audio, or PDF only.`}
              </p>
              {attachments.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {attachments.map((f, i) => {
                    const key = `${f.name}:${f.size}:${f.lastModified}`;
                    const url = previewUrls[key];
                    return (
                      <div
                        key={key + i}
                        className="relative rounded-md border border-border/60 bg-muted/30 p-2 flex items-center gap-2"
                      >
                        {url ? (
                          <img
                            src={url}
                            alt={f.name}
                            className="w-10 h-10 rounded object-cover shrink-0 border border-border/40"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded shrink-0 bg-muted flex items-center justify-center">
                            <FileText className="w-4 h-4 text-muted-foreground" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-[11.5px] font-medium truncate">{f.name}</p>
                          <p className="text-[10.5px] text-muted-foreground tabular-nums">
                            {fmtBytes(f.size)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setAttachments((a) => a.filter((_, j) => j !== i))}
                          className="text-muted-foreground hover:text-destructive shrink-0 p-1 rounded hover:bg-background"
                          aria-label={`Remove ${f.name}`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="rounded-md border border-border/60 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[12px] font-medium inline-flex items-center gap-1.5">
                  <CalendarIcon className="w-3.5 h-3.5" /> Schedule send
                </Label>
                <Switch checked={scheduleOn} onCheckedChange={setScheduleOn} />
              </div>
              {scheduleOn && (
                <Input
                  type="datetime-local"
                  value={scheduleAt}
                  onChange={(e) => setScheduleAt(e.target.value)}
                  className="h-9 text-[13px]"
                />
              )}
              {quietHoursWarn && (
                <div className="rounded border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-[11.5px] text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>Outside quiet hours (9pm–8am Vancouver) — auto-queue for 8am.</span>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-border/60 bg-background/95 backdrop-blur px-4 py-3 flex items-center justify-between gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={closeComposer} className="text-[12px]">
              Cancel
            </Button>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={handleSaveDraft} className="text-[12px]">
                Save draft
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSend}
                disabled={sending}
                className={cn(
                  'text-[12px] gap-1.5 min-w-[120px]',
                  channelBlocked
                    ? 'bg-amber-500 hover:bg-amber-600 text-white'
                    : 'bg-primary hover:bg-primary/90 text-primary-foreground',
                )}
              >
                {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                {sendLabel}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <TemplatePickerSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        leadId={leadId}
        userId={user?.id ?? null}
        channel={activeChannel === 'email' ? 'email' : 'sms'}
        onPick={applyTemplate}
      />
    </>
  );
}
