// LeadEmailThreadDialog
// ---------------------------------------------------------------------------
// Full-screen email experience opened from the lead detail page.
//
// Layout (desktop ≥ md):
//   ┌─────────────────────────────────────────────────────────────────┐
//   │ NEW EMAIL                                                    × │
//   ├──────────────┬──────────────────────────────────────────────────┤
//   │              │  From / To / Subject                             │
//   │ Lead context │  ─────────────────────────────────────────────── │
//   │  + recent    │  Active message (header + iframe HTML body)      │
//   │  thread list │  ─────────────────────────────────────────────── │
//   │              │  ▼ Reply composer (signature + quoted history)   │
//   └──────────────┴──────────────────────────────────────────────────┘
//
// Data sources, in priority order:
//   1. crm_gmail_messages  — synced inbound + outbound Gmail with thread_id
//   2. crm_email_log       — sent emails (bridge-send-email writes here)
//
// The dialog merges both, groups by `gmail_thread_id` when present, and
// shows the most recent thread by default. Clicking any other email in the
// left list switches the active thread. Hitting Reply expands a composer
// inline beneath the latest message — pre-filled with the agent's default
// signature (via AgentSignatureBlock) and a quoted version of the message
// being replied to. Sending uses the existing `bridge-send-email` flow so
// the reply lands in crm_email_log and is auto-merged on the next render.

import { useState, useEffect, useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Pill } from '@/components/crm/shared/Pill';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCrmEmailLog } from '@/hooks/useCrmEmailLog';
import { useEmailSignatures } from '@/hooks/useEmailSignatures';
import { useEmailSettings } from '@/hooks/useEmailSettings';
import { useBridgeSendEmail } from '@/hooks/useBridgeEmail';
import { useAuth } from '@/hooks/useAuth';
import { AgentSignatureBlock } from '@/components/agent/AgentSignatureBlock';
import { RichTextEditor } from '@/components/crm/email/RichTextEditor';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import { X, Reply, Send, Loader2, Mail, ArrowDownLeft, ArrowUpRight, Eye, MousePointerClick } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatContactName } from '@/lib/format';
import type { CrmContact } from '@/hooks/useCrmContacts';
import { toast } from 'sonner';

interface Props {
  contact: CrmContact;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional: open directly to this email/thread when provided. */
  initialEmailId?: string | null;
}

/** Unified message shape — produced from either crm_gmail_messages or crm_email_log. */
type ThreadMessage = {
  id: string;
  threadKey: string;
  direction: 'inbound' | 'outbound';
  subject: string | null;
  fromEmail: string | null;
  fromName: string | null;
  toEmail: string | null;
  cc: string | null;
  bcc: string | null;
  bodyHtml: string | null;
  bodyText: string | null;
  ts: string;
  source: 'gmail' | 'log';
  openCount?: number;
  clickCount?: number;
  lastOpenedAt?: string | null;
  lastClickedAt?: string | null;
};

const IFRAME_STYLES = `
  :root { color-scheme: light; }
  html, body { margin: 0; padding: 0; background: #ffffff; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, "Plus Jakarta Sans", Roboto, sans-serif; font-size: 14.5px; line-height: 1.6; color: #1a1a1a; padding: 18px 22px; word-wrap: break-word; overflow-wrap: anywhere; -webkit-font-smoothing: antialiased; }
  p { margin: 0 0 12px; }
  a { color: hsl(220 90% 50%); text-decoration: underline; }
  img { max-width: 100%; height: auto; border-radius: 4px; }
  table { max-width: 100% !important; border-collapse: collapse; }
  blockquote { border-left: 3px solid #d4d4d8; margin: 12px 0; padding: 4px 14px; color: #555; background: #fafafa; }
  hr { border: 0; border-top: 1px solid #eee; margin: 18px 0; }
  details.quoted { margin-top: 14px; }
  details.quoted > summary { list-style: none; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: #6b7280; padding: 4px 10px; border-radius: 999px; background: #f3f4f6; user-select: none; }
  details.quoted > summary::-webkit-details-marker { display: none; }
  details.quoted > summary:hover { background: #e5e7eb; color: #111827; }
  details.quoted[open] > summary { margin-bottom: 10px; }
  .quoted-body { border-left: 3px solid #e5e7eb; padding: 8px 14px; color: #6b7280; background: #fafafa; border-radius: 0 6px 6px 0; }
  .quoted-body p { margin: 0 0 8px; font-size: 13.5px; }
`;

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

/**
 * Split plain-text email into "new" content vs "quoted history".
 * Heuristics: a line that matches an "On <date>... wrote:" attribution OR
 * starts with `>` (possibly nested `> > >`) marks the boundary. Everything
 * from the first such line onwards is treated as quoted history.
 */
function splitPlainTextReply(plain: string): { fresh: string; quoted: string } {
  const lines = plain.split(/\r?\n/);
  const attributionRe = /^\s*(on\s+.+?\bwrote:|-{2,}\s*original message\s*-{2,}|from:\s+.+@.+)/i;
  const quoteRe = /^\s*(>\s*)+/;
  let cutIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (attributionRe.test(ln) || quoteRe.test(ln)) { cutIdx = i; break; }
  }
  // Also handle the common case where the attribution is mid-paragraph (no newline before it)
  if (cutIdx === -1) {
    const m = plain.match(/\bon\s+\w{3},?\s+\w{3}\s+\d{1,2},?\s+\d{4}[^.]*?\bwrote:/i);
    if (m && m.index !== undefined) {
      const before = plain.slice(0, m.index).trimEnd();
      const after = plain.slice(m.index).trim();
      return { fresh: before, quoted: after };
    }
    return { fresh: plain.trim(), quoted: '' };
  }
  return {
    fresh: lines.slice(0, cutIdx).join('\n').trim(),
    quoted: lines.slice(cutIdx).join('\n').trim(),
  };
}

function plainToHtml(text: string, opts?: { stripQuoteMarks?: boolean }): string {
  if (!text) return '';
  const cleaned = opts?.stripQuoteMarks
    ? text.split(/\r?\n/).map(l => l.replace(/^\s*(>\s*)+/, '')).join('\n')
    : text;
  return cleaned
    .split(/\n{2,}/)
    .map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`)
    .join('');
}

function buildSrcDoc(html: string | null, text: string | null): string {
  const styleTag = `<style>${IFRAME_STYLES}</style>`;
  const raw = (html || '').trim();
  const looksHtml = /<\/[a-z][\s\S]*>/i.test(raw);
  if (looksHtml) {
    if (/<html[\s>]/i.test(raw)) {
      if (/<head[\s>]/i.test(raw)) return raw.replace(/<head([^>]*)>/i, `<head$1>${styleTag}`);
      return raw.replace(/<html([^>]*)>/i, `<html$1><head>${styleTag}</head>`);
    }
    return `<!DOCTYPE html><html><head><meta charset="utf-8">${styleTag}</head><body>${raw}</body></html>`;
  }
  const plain = (text || raw || '').trim();
  if (!plain) return `<!DOCTYPE html><html><head>${styleTag}</head><body><p style="color:#888">(No body.)</p></body></html>`;

  const { fresh, quoted } = splitPlainTextReply(plain);
  const freshHtml = plainToHtml(fresh || plain);
  const quotedHtml = quoted ? plainToHtml(quoted, { stripQuoteMarks: true }) : '';
  const body = quotedHtml
    ? `${freshHtml}<details class="quoted"><summary>··· Show quoted history</summary><div class="quoted-body">${quotedHtml}</div></details>`
    : freshHtml;

  return `<!DOCTYPE html><html><head><meta charset="utf-8">${styleTag}</head><body>${body}</body></html>`;
}

export function LeadEmailThreadDialog({ contact, open, onOpenChange, initialEmailId }: Props) {
  const { user } = useAuth();
  const { data: emailLog = [], isLoading: logLoading } = useCrmEmailLog(open ? contact.id : undefined);
  const { data: signatures = [] } = useEmailSignatures();
  const { data: emailSettings } = useEmailSettings();
  const sendBridge = useBridgeSendEmail();

  // Gmail-synced messages (inbound + outbound) for this contact.
  const { data: gmailMsgs = [], isLoading: gmailLoading } = useQuery({
    queryKey: ['lead-email-thread-gmail', contact.id],
    enabled: open && !!contact.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_gmail_messages')
        .select('id, gmail_thread_id, direction, from_email, from_name, to_emails, cc_emails, bcc_emails, subject, body_html, body_text, snippet, internal_date')
        .eq('contact_id', contact.id)
        .order('internal_date', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Merge → unified ThreadMessage[]
  const allMessages: ThreadMessage[] = useMemo(() => {
    const fromGmail: ThreadMessage[] = (gmailMsgs ?? []).map((m: any) => ({
      id: `gmail-${m.id}`,
      threadKey: m.gmail_thread_id || `gmail-${m.id}`,
      direction: (m.direction === 'inbound' ? 'inbound' : 'outbound'),
      subject: m.subject ?? null,
      fromEmail: m.from_email ?? null,
      fromName: m.from_name ?? null,
      toEmail: Array.isArray(m.to_emails) ? m.to_emails.join(', ') : (m.to_emails ?? null),
      cc: Array.isArray(m.cc_emails) ? m.cc_emails.join(', ') : null,
      bcc: Array.isArray(m.bcc_emails) ? m.bcc_emails.join(', ') : null,
      bodyHtml: m.body_html ?? null,
      bodyText: m.body_text ?? m.snippet ?? null,
      ts: m.internal_date,
      source: 'gmail',
    }));
    const fromLog: ThreadMessage[] = (emailLog ?? []).map((e: any) => ({
      id: `log-${e.id}`,
      threadKey: normalizeSubjectKey(e.subject) || `log-${e.id}`,
      direction: (e.direction === 'inbound' ? 'inbound' : 'outbound'),
      subject: e.subject ?? null,
      fromEmail: e.from_email ?? null,
      fromName: null,
      toEmail: e.to_email ?? null,
      cc: e.cc ?? null,
      bcc: e.bcc ?? null,
      bodyHtml: e.body_html ?? e.body ?? null,
      bodyText: e.body_text ?? null,
      ts: e.sent_at ?? e.created_at ?? new Date().toISOString(),
      source: 'log',
      openCount: e.open_count ?? 0,
      clickCount: e.click_count ?? 0,
      lastOpenedAt: e.last_opened_at,
      lastClickedAt: e.last_clicked_at,
    }));
    return [...fromGmail, ...fromLog].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  }, [gmailMsgs, emailLog]);

  // Group by thread → most-recent thread first.
  const threads = useMemo(() => {
    const map = new Map<string, ThreadMessage[]>();
    for (const m of allMessages) {
      const arr = map.get(m.threadKey) ?? [];
      arr.push(m);
      map.set(m.threadKey, arr);
    }
    return Array.from(map.entries())
      .map(([key, msgs]) => ({
        key,
        messages: msgs.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime()),
        lastTs: msgs.reduce((acc, m) => Math.max(acc, new Date(m.ts).getTime()), 0),
        subject: msgs.find(m => m.subject)?.subject ?? '(no subject)',
      }))
      .sort((a, b) => b.lastTs - a.lastTs);
  }, [allMessages]);

  // Active thread selection.
  const [activeKey, setActiveKey] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    if (initialEmailId) {
      const target = allMessages.find(m => m.id === initialEmailId || m.id.endsWith(initialEmailId));
      if (target) { setActiveKey(target.threadKey); return; }
    }
    if (!activeKey && threads.length) setActiveKey(threads[0].key);
  }, [open, initialEmailId, threads, allMessages, activeKey]);

  const activeThread = threads.find(t => t.key === activeKey) ?? threads[0] ?? null;

  // Reply composer state.
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyHtml, setReplyHtml] = useState('<p></p>');
  const composerRef = useRef<HTMLDivElement | null>(null);

  // Reset on close / thread change.
  useEffect(() => {
    if (!open) {
      setReplyOpen(false);
      setReplyHtml('<p></p>');
      setActiveKey(null);
    }
  }, [open]);
  useEffect(() => {
    setReplyOpen(false);
    setReplyHtml('<p></p>');
  }, [activeKey]);

  const defaultSig = useMemo(() => {
    if (!signatures?.length) return emailSettings?.signature_html ?? '';
    const def = signatures.find(s => s.is_default) ?? signatures[0];
    return def.html || '';
  }, [signatures, emailSettings]);

  const lastInThread = activeThread?.messages[activeThread.messages.length - 1] ?? null;

  const handleStartReply = () => {
    setReplyOpen(true);
    setReplyHtml('<p></p><p></p>');
    requestAnimationFrame(() => {
      composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  // Keyboard: "R" to reply, Esc handled by Dialog itself.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (t as any)?.isContentEditable) return;
      if (e.key === 'r' || e.key === 'R') {
        if (!replyOpen && lastInThread && contact.email) {
          e.preventDefault();
          handleStartReply();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, replyOpen, lastInThread, contact.email]);


  const handleSendReply = async () => {
    if (!contact.email) { toast.error('This lead has no email address'); return; }
    const bodyText = replyHtml.replace(/<[^>]*>/g, '').trim();
    if (!bodyText) { toast.error('Write a reply before sending'); return; }
    if (!lastInThread) return;

    const subject = lastInThread.subject?.toLowerCase().startsWith('re:')
      ? lastInThread.subject
      : `Re: ${lastInThread.subject ?? ''}`.trim();

    const quotedHeader = `${format(parseISO(lastInThread.ts), 'EEE, MMM d, yyyy \'at\' h:mm a')} ${lastInThread.fromName || lastInThread.fromEmail || ''} wrote:`;
    const quotedBody = (lastInThread.bodyHtml || `<p>${escapeHtml(lastInThread.bodyText || '')}</p>`);

    const finalHtml = `
      ${replyHtml}
      ${defaultSig ? `<br/>${defaultSig}` : ''}
      <br/><br/>
      <div style="color:#666;font-size:13px;border-left:3px solid #e5e5e5;padding:4px 14px;margin:14px 0;">
        <div style="margin-bottom:8px;color:#888;">${escapeHtml(quotedHeader)}</div>
        ${quotedBody}
      </div>
    `;

    try {
      await sendBridge.mutateAsync({
        to: contact.email,
        subject: subject || '(no subject)',
        html: finalHtml,
        contact_id: contact.id,
      });
      setReplyOpen(false);
      setReplyHtml('<p></p>');
    } catch {
      /* toast handled by hook */
    }
  };

  const isLoading = (logLoading || gmailLoading) && allMessages.length === 0;
  const fullName = formatContactName(contact.first_name, contact.last_name);

  const headerInitials = initialsFor(fullName, contact.email);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[1280px] w-[96vw] h-[90vh] p-0 gap-0 overflow-hidden flex flex-col rounded-2xl border-border/70 shadow-[0_30px_80px_-20px_hsl(var(--foreground)/0.25)]"
      >
        <DialogTitle className="sr-only">Email thread with {fullName}</DialogTitle>
        <DialogDescription className="sr-only">
          {threads.length} thread{threads.length === 1 ? '' : 's'} with this lead
        </DialogDescription>

        {/* Header bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/70 bg-gradient-to-b from-card to-card/95 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[11.5px] font-semibold shrink-0">
              {headerInitials}
            </div>
            <div className="min-w-0 leading-tight">
              <div className="flex items-center gap-2">
                <span className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                  {replyOpen ? 'Reply' : 'Email'}
                </span>
                <span className="h-3 w-px bg-border" />
                <span className="text-[13px] font-semibold text-foreground truncate max-w-[280px]">
                  {fullName}
                </span>
              </div>
              {contact.email && (
                <div className="text-[11px] text-muted-foreground truncate max-w-[360px]">
                  {contact.email}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col md:flex-row">
          {/* Left rail — lead context + recent threads */}
          <aside className="w-full md:w-[300px] lg:w-[340px] flex-shrink-0 border-r border-border/70 bg-muted/20 overflow-y-auto">
            <div className="p-4 border-b border-border/70">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/80 mb-2">
                Lead
              </h3>
              <dl className="space-y-1.5 text-[12.5px]">
                <Field label="Type" value={contact.contact_type ?? '—'} />
                <Field label="Phone" value={contact.phone ?? '—'} />
                <Field label="Pipeline" value={contact.status ?? '—'} />
                <Field label="Segment" value={contact.lead_type ?? '—'} />
              </dl>
            </div>

            <div className="p-4">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/80 mb-2.5 flex items-center justify-between">
                <span>Threads</span>
                <span className="text-muted-foreground/60 tabular-nums normal-case tracking-normal">{threads.length}</span>
              </h3>
              {isLoading && threads.length === 0 ? (
                <div className="space-y-2">
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                </div>
              ) : threads.length === 0 ? (
                <div className="text-[12px] text-muted-foreground py-6 text-center">
                  <Mail className="w-5 h-5 mx-auto mb-2 opacity-40" />
                  No emails yet.
                </div>
              ) : (
                <ul className="space-y-1">
                  {threads.map(t => {
                    const last = t.messages[t.messages.length - 1];
                    const isActive = t.key === activeThread?.key;
                    const lastDir = last.direction;
                    return (
                      <li key={t.key}>
                        <button
                          onClick={() => setActiveKey(t.key)}
                          className={cn(
                            'w-full text-left px-2.5 py-2 rounded-md border transition-colors group relative',
                            isActive
                              ? 'bg-card border-border shadow-sm'
                              : 'border-transparent hover:bg-card hover:border-border/60',
                          )}
                        >
                          {isActive && (
                            <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-primary" />
                          )}
                          <div className="flex items-start gap-2">
                            <div className={cn(
                              'w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5',
                              lastDir === 'inbound'
                                ? 'bg-blue-500/10 border-blue-500/30 text-blue-600'
                                : 'bg-primary/10 border-primary/30 text-primary',
                            )}>
                              {lastDir === 'inbound'
                                ? <ArrowDownLeft className="w-3 h-3" />
                                : <ArrowUpRight className="w-3 h-3" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[12px] font-semibold text-foreground line-clamp-1 leading-snug">
                                {t.subject}
                              </p>
                              <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                                <span className="truncate flex-1">
                                  {lastDir === 'inbound' ? (last.fromName || last.fromEmail) : 'You'}
                                </span>
                                <span className="tabular-nums whitespace-nowrap">
                                  {formatDistanceToNow(parseISO(last.ts), { addSuffix: false })}
                                </span>
                                {t.messages.length > 1 && (
                                  <span className="px-1 py-px rounded bg-muted text-[9.5px] tabular-nums font-medium">
                                    {t.messages.length}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </aside>

          {/* Right pane — thread + composer */}
          <main className="flex-1 min-w-0 min-h-0 flex flex-col bg-muted/10">
            {!activeThread ? (
              <div className="flex-1 flex items-center justify-center text-muted-foreground text-[13px]">
                Select a thread to view the conversation.
              </div>
            ) : (
              <>
                {/* Thread header — sticky, refined hierarchy */}
                <div className="px-6 py-3.5 border-b border-border/70 bg-card/95 backdrop-blur flex-shrink-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h2 className="text-[15.5px] font-semibold text-foreground leading-snug truncate tracking-[-0.005em]">
                        {activeThread.subject}
                      </h2>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="tabular-nums">{activeThread.messages.length} message{activeThread.messages.length === 1 ? '' : 's'}</span>
                        {lastInThread && (
                          <>
                            <span className="text-muted-foreground/40">·</span>
                            <span className="tabular-nums">last {formatDistanceToNow(parseISO(lastInThread.ts), { addSuffix: true })}</span>
                          </>
                        )}
                      </div>
                    </div>
                    {!replyOpen && (
                      <Button
                        size="sm"
                        onClick={handleStartReply}
                        disabled={!lastInThread || !contact.email}
                        className="gap-1.5 h-8 text-[12px] shadow-sm"
                      >
                        <Reply className="w-3.5 h-3.5" /> Reply
                        <kbd className="ml-1 hidden sm:inline-flex items-center px-1 rounded bg-primary-foreground/15 text-[9.5px] font-mono">R</kbd>
                      </Button>
                    )}
                  </div>
                </div>

                {/* Scrollable thread body */}
                <div className="flex-1 min-h-0 overflow-y-auto">
                  <div className="px-6 py-5 space-y-2.5 max-w-[920px] mx-auto">
                    {activeThread.messages.map((m, idx) => (
                      <MessageCard
                        key={m.id}
                        message={m}
                        isLatest={idx === activeThread.messages.length - 1}
                        contactEmail={contact.email}
                        defaultExpanded={idx === activeThread.messages.length - 1}
                      />
                    ))}

                    {/* Quiet "tap to reply" prompt when composer is closed */}
                    {!replyOpen && contact.email && (
                      <button
                        type="button"
                        onClick={handleStartReply}
                        className="w-full mt-4 group flex items-center gap-3 px-4 py-3.5 rounded-xl border border-dashed border-border/70 bg-card/50 hover:bg-card hover:border-border transition-colors text-left"
                      >
                        <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                          <Reply className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[12.5px] font-medium text-foreground">Reply to {lastInThread?.fromName || contact.email}</div>
                          <div className="text-[11px] text-muted-foreground">Press R or click here to draft a response</div>
                        </div>
                        <span className="text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground group-hover:text-foreground transition-colors">Reply</span>
                      </button>
                    )}
                    {!contact.email && (
                      <div className="text-[11.5px] text-muted-foreground text-center py-4">No email on file for this lead.</div>
                    )}
                  </div>
                </div>

                {/* Anchored reply composer — sticky at bottom while open */}
                {replyOpen && (
                  <div ref={composerRef} className="flex-shrink-0 border-t-2 border-primary/30 bg-card shadow-[0_-12px_30px_-15px_hsl(var(--foreground)/0.18)] max-h-[58%] overflow-y-auto">
                    {/* Compact header — "Replying to ..." context */}
                    <div className="px-5 py-2.5 border-b border-border/60 bg-muted/30 flex items-center justify-between gap-3 sticky top-0 z-10 backdrop-blur">
                      <div className="min-w-0 flex items-center gap-2 text-[11.5px]">
                        <Pill size="sm" tone="primary" className="!gap-0.5">
                          <Reply className="w-2.5 h-2.5" /> Reply
                        </Pill>
                        <span className="text-muted-foreground truncate">
                          to <span className="text-foreground font-medium">{contact.email}</span>
                        </span>
                      </div>
                      <button
                        onClick={() => setReplyOpen(false)}
                        className="text-[11px] text-muted-foreground hover:text-foreground transition-colors shrink-0"
                      >
                        Discard
                      </button>
                    </div>

                    <div className="px-5 pt-4 pb-2">
                      <RichTextEditor content={replyHtml} onChange={setReplyHtml} placeholder="Write your reply..." />
                    </div>

                    {/* Compact disclosure row — signature + quoted side-by-side */}
                    <div className="px-5 pb-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                      {defaultSig && (
                        <details className="group">
                          <summary className="list-none cursor-pointer text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground inline-flex items-center gap-1.5 hover:text-foreground">
                            <span className="group-open:rotate-90 transition-transform inline-block">▸</span>
                            Signature
                          </summary>
                          <div className="mt-2 p-3 rounded-md border border-border/60 bg-background overflow-hidden max-w-[560px]">
                            <AgentSignatureBlock html={defaultSig} />
                          </div>
                        </details>
                      )}
                      {lastInThread && (
                        <details className="group">
                          <summary className="list-none cursor-pointer text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground inline-flex items-center gap-1.5 hover:text-foreground">
                            <span className="group-open:rotate-90 transition-transform inline-block">▸</span>
                            Quoted message
                          </summary>
                          <div className="mt-2 p-3 rounded-md border-l-2 border-border bg-muted/20 text-[12px] text-muted-foreground max-h-48 max-w-[560px] overflow-y-auto">
                            <div className="mb-2 text-[10.5px]">
                              {format(parseISO(lastInThread.ts), 'MMM d, yyyy h:mm a')} · {lastInThread.fromName || lastInThread.fromEmail || '—'}
                            </div>
                            <div className="line-clamp-6 whitespace-pre-wrap">
                              {(lastInThread.bodyText || '').slice(0, 600) || '(rich content quoted in send)'}
                            </div>
                          </div>
                        </details>
                      )}
                    </div>

                    <div className="px-5 py-3 border-t border-border/60 flex items-center justify-between gap-2 bg-muted/10 sticky bottom-0 backdrop-blur">
                      <div className="text-[10.5px] text-muted-foreground hidden sm:block">
                        Sending as <span className="text-foreground font-medium">{user?.email}</span>
                      </div>
                      <div className="flex items-center gap-2 ml-auto">
                        <Button variant="ghost" onClick={() => setReplyOpen(false)} className="h-9">
                          Cancel
                        </Button>
                        <Button
                          onClick={handleSendReply}
                          disabled={sendBridge.isPending}
                          className="h-9 gap-2 shadow-sm"
                        >
                          {sendBridge.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                          Send Reply
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------------------------------------------- */

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-medium min-w-[60px]">{label}:</dt>
      <dd className="text-[12.5px] text-foreground truncate">{value}</dd>
    </div>
  );
}

function initialsFor(name?: string | null, email?: string | null): string {
  const base = (name || email || '?').trim();
  const parts = base.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
}

function MessageCard({
  message, isLatest, contactEmail, defaultExpanded = true,
}: { message: ThreadMessage; isLatest: boolean; contactEmail?: string | null; defaultExpanded?: boolean }) {
  const inbound = message.direction === 'inbound';
  const srcDoc = useMemo(() => buildSrcDoc(message.bodyHtml, message.bodyText), [message.bodyHtml, message.bodyText]);
  const fromAddr = message.fromEmail || (inbound ? contactEmail : 'You');
  const toAddr = message.toEmail || (inbound ? 'You' : contactEmail);
  const fromLabel = message.fromName || message.fromEmail || (inbound ? contactEmail : 'You');
  const initials = initialsFor(message.fromName, message.fromEmail || (inbound ? contactEmail : 'You'));

  const [expanded, setExpanded] = useState(defaultExpanded);
  const snippet = useMemo(() => {
    const t = (message.bodyText || message.bodyHtml?.replace(/<[^>]*>/g, ' ') || '').replace(/\s+/g, ' ').trim();
    return t.slice(0, 140);
  }, [message.bodyText, message.bodyHtml]);

  return (
    <article className={cn(
      'rounded-xl border bg-card overflow-hidden transition-shadow',
      isLatest ? 'border-border shadow-sm' : 'border-border/60',
    )}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left px-4 py-2.5 border-b border-border/60 bg-muted/10 hover:bg-muted/20 transition-colors"
      >
        <div className="flex items-start gap-2.5">
          <div className={cn(
            'w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[10.5px] font-semibold',
            inbound ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300' : 'bg-primary/15 text-primary',
          )}>
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[12px] font-semibold text-foreground truncate max-w-[200px]">
                {fromLabel}
              </span>
              <Pill size="sm" tone={inbound ? 'info' : 'primary'} className="!gap-0.5">
                {inbound
                  ? <ArrowDownLeft className="w-2.5 h-2.5" />
                  : <ArrowUpRight className="w-2.5 h-2.5" />}
                {inbound ? 'In' : 'Out'}
              </Pill>
              {!inbound && (message.openCount ?? 0) > 0 && (
                <Pill size="sm" tone="success" className="!gap-0.5">
                  <Eye className="w-2.5 h-2.5" />
                  {message.openCount}
                </Pill>
              )}
              {!inbound && (message.clickCount ?? 0) > 0 && (
                <Pill size="sm" className="!gap-0.5 bg-purple-500/15 text-purple-700 dark:text-purple-300">
                  <MousePointerClick className="w-2.5 h-2.5" />
                  {message.clickCount}
                </Pill>
              )}
              <span className="text-[10.5px] text-muted-foreground ml-auto tabular-nums whitespace-nowrap">
                {format(parseISO(message.ts), 'MMM d · h:mm a')}
              </span>
            </div>
            {expanded ? (
              <div className="mt-1 text-[11px] text-muted-foreground truncate">
                to {toAddr || '—'}{message.cc ? ` · cc ${message.cc}` : ''}
              </div>
            ) : (
              <div className="mt-1 text-[11.5px] text-muted-foreground truncate">
                {snippet || '(no body)'}
              </div>
            )}
          </div>
        </div>
      </button>
      {expanded && (
        <div className="bg-white">
          <AutoSizingFrame srcDoc={srcDoc} title={`Email body ${message.id}`} />
        </div>
      )}
    </article>
  );
}

function AutoSizingFrame({ srcDoc, title }: { srcDoc: string; title: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(320);
  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    let ro: ResizeObserver | null = null;
    const onLoad = () => {
      try {
        const doc = frame.contentDocument;
        if (!doc) return;
        const measure = () => {
          const h = Math.max(doc.body?.scrollHeight ?? 0, doc.documentElement?.scrollHeight ?? 0);
          if (h > 0) setHeight(Math.min(h + 8, 1200));
        };
        measure();
        if ('ResizeObserver' in window && doc.body) {
          ro = new ResizeObserver(measure);
          ro.observe(doc.body);
        }
        doc.querySelectorAll('img').forEach((img) => {
          if (!(img as HTMLImageElement).complete) {
            img.addEventListener('load', measure, { once: true });
            img.addEventListener('error', measure, { once: true });
          }
        });
      } catch { /* noop */ }
    };
    frame.addEventListener('load', onLoad);
    return () => { frame.removeEventListener('load', onLoad); ro?.disconnect(); };
  }, [srcDoc]);
  return (
    <iframe
      ref={ref}
      title={title}
      srcDoc={srcDoc}
      className="w-full border-0 block"
      style={{ height: `${height}px`, minHeight: 200 }}
      sandbox="allow-same-origin allow-popups"
    />
  );
}

/** Strip Re:/Fwd: prefixes for grouping log emails by subject when no thread id exists. */
function normalizeSubjectKey(subject?: string | null): string {
  if (!subject) return '';
  return subject.replace(/^(re|fwd|fw)\s*:\s*/i, '').trim().toLowerCase();
}
