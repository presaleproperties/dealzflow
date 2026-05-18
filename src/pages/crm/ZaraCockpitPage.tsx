import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pill } from '@/components/crm/shared/Pill';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Plus, Pin, Search, Send, Mic, MicOff, Sparkles, Inbox, ChevronRight,
  Activity as ActivityIcon, ThumbsUp, ThumbsDown, Wrench, Loader2, ChevronDown,
  Building2, Brain, FileText, Menu,
} from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useKeyboardInset } from '@/hooks/useKeyboardInset';
import { usePushToTalk } from '@/hooks/usePushToTalk';
import { MicPermissionDialog } from '@/components/crm/zara/MicPermissionDialog';
import { useZaraPin } from '@/hooks/useZaraPin';
import { PinnedLeadChip } from '@/components/crm/zara/PinnedLeadChip';
import { SlashCommandPalette } from '@/components/crm/zara/SlashCommandPalette';
import { ZaraKillSwitch } from '@/components/crm/zara/ZaraKillSwitch';
import { AutonomyControl } from '@/components/crm/zara/AutonomyControl';
import { DynamicSuggestions } from '@/components/crm/zara/DynamicSuggestions';
import { useZaraLeadMemory } from '@/hooks/useZaraLeadMemory';
import { useZaraNoteIntelligence } from '@/hooks/useZaraNoteIntelligence';


type Conv = {
  id: string; title: string; pinned: boolean; archived: boolean;
  last_message_at: string | null; created_at: string;
};

type StoredMsg = {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls: any[] | null;
  tool_call_id: string | null;
  tool_name: string | null;
  tool_result: any | null;
  created_at: string;
  metadata?: any;
};

type ToolUiState = {
  id: string; name: string;
  status: 'running' | 'done' | 'error' | 'pending' | 'denied';
  input?: any; output?: any;
  pending_id?: string;
};

type ActionRow = {
  id: string; action: string; tool_name: string | null;
  contact_id: string | null; result_summary: string | null; occurred_at: string;
};

const QUICK_ACTIONS = [
  'Morning briefing',
  'Show me my hot leads',
  "What needs my attention?",
  'List pending drafts',
  'List projects in Surrey',
];

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

const TOOL_LABELS: Record<string, string> = {
  update_lead: 'Update lead',
  confirm_update_lead: 'Confirm lead update',
  draft_email: 'Draft email',
  draft_sms: 'Draft SMS',
  draft_whatsapp: 'Draft WhatsApp',
  add_lead_note: 'Add note',
  add_lead_tag: 'Add tag',
  set_lead_status: 'Change status',
  schedule_follow_up: 'Schedule follow-up',
  approve_draft: 'Approve & send draft',
};

const MESSAGE_TOOLS = new Set(['draft_email', 'draft_sms', 'draft_whatsapp']);

function isEmptyInput(input: any) {
  if (!input) return true;
  if (typeof input !== 'object') return false;
  return Object.keys(input).length === 0;
}

type MessageOverrides = { subject?: string; body?: string; cta_text?: string; cta_url?: string };

function uniq(arr: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of arr) {
    const t = (v ?? '').toString().trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

function ChipRow({ label, items, tone = 'default' }: { label: string; items: string[]; tone?: 'default' | 'warn' | 'good' }) {
  if (!items.length) return null;
  const toneCls =
    tone === 'warn' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'
      : tone === 'good' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
      : 'bg-muted/60 text-foreground border-border/60';
  return (
    <div className="flex items-start gap-2 text-[11px]">
      <span className="shrink-0 text-muted-foreground uppercase tracking-wider text-[10px] pt-0.5 w-[68px]">{label}</span>
      <div className="flex flex-wrap gap-1">
        {items.slice(0, 6).map((it, i) => (
          <span key={i} className={`inline-block px-1.5 py-0.5 rounded border text-[11px] leading-tight ${toneCls}`}>
            {it}
          </span>
        ))}
      </div>
    </div>
  );
}

function LeadIntelligenceSummary({ contactId }: { contactId?: string }) {
  const { data: memory } = useZaraLeadMemory(contactId);
  const { data: noteIntel } = useZaraNoteIntelligence(contactId);

  if (!contactId) return null;

  const facts = memory?.facts ?? ({} as any);
  const latestIntel = noteIntel?.[0];
  const noteCount = noteIntel?.length ?? 0;

  const objections = uniq([
    ...(facts.objections ?? []),
    ...(facts.emotional_objections ?? []),
    facts.last_objection,
    ...(noteIntel ?? []).flatMap((n) => n.objections ?? []),
  ]);
  const motivations = uniq([
    ...(facts.motivations ?? []),
    ...(noteIntel ?? []).flatMap((n) => n.motivations ?? []),
  ]);
  const concerns = uniq((noteIntel ?? []).flatMap((n) => n.financial_concerns ?? []));
  const emotional = uniq([
    facts.emotional_hesitation,
    ...(noteIntel ?? []).map((n) => n.emotional_state),
  ]);
  const style = memory?.recommended_style || latestIntel?.recommended_style;
  const nextStep = memory?.recommended_next_step || latestIntel?.recommended_next_step;
  const summary = (memory?.intelligence_summary || latestIntel?.summary || '').trim();

  const hasAnything =
    summary || objections.length || motivations.length || concerns.length ||
    emotional.length || style || nextStep || noteCount > 0;

  if (!hasAnything) {
    return (
      <div className="rounded-md border border-dashed border-border/60 bg-muted/20 px-3 py-2 text-[11.5px] text-muted-foreground">
        No lead intelligence on file yet — draft is grounded only in profile + activity data.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-primary/30 bg-primary/[0.04] px-3 py-2.5 space-y-2">
      <div className="flex items-center gap-2">
        <Brain className="w-3.5 h-3.5 text-primary" />
        <span className="text-[11px] uppercase tracking-wider text-primary font-semibold">
          Using lead intelligence
        </span>
        <span className="text-[10.5px] text-muted-foreground ml-auto">
          {noteCount} note{noteCount === 1 ? '' : 's'} analyzed
        </span>
      </div>
      {summary && (
        <div className="text-[12px] leading-snug text-foreground italic">"{summary}"</div>
      )}
      <div className="space-y-1.5">
        <ChipRow label="Feels" items={emotional} />
        <ChipRow label="Wants" items={motivations} tone="good" />
        <ChipRow label="Blocks" items={objections} tone="warn" />
        <ChipRow label="Money" items={concerns} tone="warn" />
      </div>
      {(style || nextStep) && (
        <div className="pt-1.5 border-t border-border/40 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          {style && (
            <div>
              <span className="text-muted-foreground">Style: </span>
              <span className="text-foreground">{style}</span>
            </div>
          )}
          {nextStep && (
            <div>
              <span className="text-muted-foreground">Next: </span>
              <span className="text-foreground">{nextStep}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


function EditableMessagePreview({
  toolName, input, onChange,
}: {
  toolName: string;
  input: any;
  onChange: (overrides: MessageOverrides) => void;
}) {
  const isEmail = toolName === 'draft_email';
  const initialSubject = (input?.subject ?? '').toString();
  const initialBody = (input?.body ?? '').toString();
  const initialCtaText = (input?.cta_text ?? '').toString();
  const initialCtaUrl = (input?.cta_url ?? '').toString();
  const purpose = input?.purpose;

  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [ctaText, setCtaText] = useState(initialCtaText);
  const [ctaUrl, setCtaUrl] = useState(initialCtaUrl);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const hasCta = !!(initialCtaText || initialCtaUrl);
  const showCtaSection = isEmail; // always allow editing CTA on emails, but hidden inside details

  useEffect(() => {
    const o: MessageOverrides = {};
    if (subject !== initialSubject) o.subject = subject;
    if (body !== initialBody) o.body = body;
    if (ctaText !== initialCtaText) o.cta_text = ctaText;
    if (ctaUrl !== initialCtaUrl) o.cta_url = ctaUrl;
    onChange(o);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, body, ctaText, ctaUrl]);

  return (
    <div className="rounded-md border border-border/60 bg-background overflow-hidden">
      {isEmail && (
        <div className="px-3 py-2 border-b border-border/60 bg-muted/20">
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            maxLength={300}
            className="w-full bg-transparent outline-none text-[13px] font-semibold leading-snug placeholder:text-muted-foreground placeholder:font-normal"
          />
        </div>
      )}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Message body"
        rows={Math.min(20, Math.max(6, body.split('\n').length + 1))}
        maxLength={20000}
        className="w-full bg-transparent outline-none resize-y px-3 py-3 text-[13.5px] leading-[1.65] text-foreground placeholder:text-muted-foreground min-h-[160px]"
      />
      {(showCtaSection || purpose) && (
        <div className="border-t border-border/40">
          <button
            type="button"
            onClick={() => setDetailsOpen((o) => !o)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
          >
            <ChevronDown className={`w-3 h-3 transition-transform ${detailsOpen ? 'rotate-180' : ''}`} />
            <span>Purpose & CTA</span>
            {!detailsOpen && (
              <span className="ml-auto text-[10.5px] text-muted-foreground/70">
                {purpose ? (purpose === 'project_details' ? 'Project details' : 'Follow-up') : ''}
                {purpose && hasCta ? ' · ' : ''}
                {hasCta ? 'CTA set' : ''}
              </span>
            )}
          </button>
          {detailsOpen && (
            <div className="px-3 pb-3 pt-1 space-y-2">
              {purpose && (
                <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
                  Template · {purpose === 'project_details' ? 'Project details' : 'Follow-up'}
                </div>
              )}
              {showCtaSection && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">CTA label</div>
                    <input
                      type="text"
                      value={ctaText}
                      onChange={(e) => setCtaText(e.target.value)}
                      placeholder="Book a time"
                      maxLength={500}
                      className="w-full bg-background border border-border/60 rounded px-2 py-1 text-[12px] outline-none focus:border-primary/60"
                    />
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">CTA URL</div>
                    <input
                      type="url"
                      value={ctaUrl}
                      onChange={(e) => setCtaUrl(e.target.value)}
                      placeholder="https://…"
                      maxLength={500}
                      className="w-full bg-background border border-border/60 rounded px-2 py-1 text-[12px] outline-none focus:border-primary/60"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReadOnlyMessagePreview({ toolName, input }: { toolName: string; input: any }) {
  const isEmail = toolName === 'draft_email';
  const subject = input?.subject?.trim?.();
  const body = (input?.body ?? '').toString();
  const purpose = input?.purpose;
  const cta = input?.cta_text && input?.cta_url ? { text: input.cta_text, url: input.cta_url } : null;
  return (
    <div className="rounded-md border border-border/60 bg-background overflow-hidden">
      {isEmail && (
        <div className="px-3 py-2 border-b border-border/60 bg-muted/30 space-y-0.5">
          {subject ? (
            <div className="text-[13px] font-semibold leading-snug">{subject}</div>
          ) : (
            <div className="text-[12px] italic text-muted-foreground">No subject</div>
          )}
          {purpose && (
            <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
              {purpose === 'project_details' ? 'Project details template' : 'Follow-up template'}
            </div>
          )}
        </div>
      )}
      <div className="px-3 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap text-foreground">
        {body || <span className="italic text-muted-foreground">Empty body</span>}
      </div>
      {cta && (
        <div className="px-3 pb-3">
          <span className="inline-block px-3 py-1.5 text-[11.5px] rounded-md bg-primary/10 text-primary border border-primary/30">
            {cta.text} →
          </span>
        </div>
      )}
    </div>
  );
}

function ToolPill({ tool, onDecide, deciding }: {
  tool: ToolUiState;
  onDecide?: (pending_id: string, decision: 'approve' | 'deny', overrides?: MessageOverrides) => void;
  deciding?: boolean;
}) {
  const [open, setOpen] = useState(tool.status === 'pending');
  const [showRaw, setShowRaw] = useState(false);
  const [showIntel, setShowIntel] = useState(false);
  const [overrides, setOverrides] = useState<MessageOverrides>({});
  const Icon = tool.status === 'running' ? Loader2 : Wrench;
  const tone =
    tool.status === 'error' || tool.status === 'denied' ? 'destructive'
      : tool.status === 'done' ? 'success'
      : tool.status === 'pending' ? 'warning'
      : 'warning';
  const isPending = tool.status === 'pending' && !!tool.pending_id;
  const isMessage = MESSAGE_TOOLS.has(tool.name);
  const empty = isEmptyInput(tool.input);
  const borderCls = isPending
    ? 'border-amber-500/50 ring-1 ring-amber-500/20'
    : 'border-border/60';
  const label = TOOL_LABELS[tool.name] ?? tool.name;
  const isEdited = Object.keys(overrides).length > 0;

  return (
    <div className={`my-2 rounded-lg border bg-card text-[12px] overflow-hidden ${borderCls}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors text-left"
      >
        <Icon className={`w-3.5 h-3.5 ${tool.status === 'running' ? 'animate-spin text-primary' : 'text-muted-foreground'}`} />
        <span className="font-medium text-[12px]">{label}</span>
        <Pill size="sm" tone={tone as any}>{tool.status === 'pending' ? 'needs approval' : tool.status}</Pill>
        {isEdited && isPending && <Pill size="sm" tone="warning">edited</Pill>}
        <ChevronDown className={`w-3 h-3 ml-auto text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="border-t border-border/60 bg-muted/10 p-3 space-y-3">
          {isPending && isMessage && empty && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-[12px] text-destructive">
              Zara tried to queue a {tool.name === 'draft_email' ? 'draft email' : 'draft message'} without writing it.
              Deny this and ask her to write the actual message.
            </div>
          )}

          {isPending && isMessage && !empty && (
            <>
              <EditableMessagePreview
                toolName={tool.name}
                input={tool.input}
                onChange={setOverrides}
              />
              <div className="flex items-center gap-3 flex-wrap text-[11px]">
                <button
                  onClick={() => setShowIntel((s) => !s)}
                  className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline inline-flex items-center gap-1"
                >
                  <ChevronDown className={`w-3 h-3 transition-transform ${showIntel ? 'rotate-180' : ''}`} />
                  {showIntel ? 'Hide lead intelligence' : 'Using lead intelligence'}
                </button>
                <button
                  onClick={() => setShowRaw((s) => !s)}
                  className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline inline-flex items-center gap-1"
                >
                  <ChevronDown className={`w-3 h-3 transition-transform ${showRaw ? 'rotate-180' : ''}`} />
                  {showRaw ? 'Hide raw JSON' : 'View raw JSON'}
                </button>
              </div>
              {showIntel && <LeadIntelligenceSummary contactId={tool.input?.contact_id} />}
              {showRaw && (
                <pre className="text-[10.5px] font-mono whitespace-pre-wrap break-words bg-background rounded p-2 border border-border/40 max-h-48 overflow-auto">
                  {JSON.stringify({ ...tool.input, ...overrides }, null, 2)}
                </pre>
              )}
              <div className="flex items-center gap-2 justify-end flex-wrap pt-1 border-t border-border/40">
                <button
                  disabled={deciding}
                  onClick={() => onDecide?.(tool.pending_id!, 'deny')}
                  className="px-3 py-1.5 text-[12px] rounded-md border border-border hover:bg-muted/60 disabled:opacity-50"
                >
                  Deny
                </button>
                <button
                  disabled={deciding}
                  onClick={() => onDecide?.(tool.pending_id!, 'approve', overrides)}
                  className="px-3 py-1.5 text-[12px] rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-1"
                >
                  {deciding ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                  {isEdited ? 'Approve edited & send' : 'Approve & send'}
                </button>
              </div>
            </>
          )}


          {isPending && !isMessage && (
            <div className="space-y-2">
              <div className="text-[12px] text-muted-foreground">
                {label} — approval required.
              </div>
              {!empty && (
                <pre className="text-[10.5px] font-mono whitespace-pre-wrap break-words bg-background rounded p-2 border border-border/40 max-h-48 overflow-auto">
                  {JSON.stringify(tool.input, null, 2)}
                </pre>
              )}
              <div className="flex items-center gap-2 justify-end">
                <button
                  disabled={deciding}
                  onClick={() => onDecide?.(tool.pending_id!, 'deny')}
                  className="px-3 py-1.5 text-[12px] rounded-md border border-border hover:bg-muted/60 disabled:opacity-50"
                >
                  Deny
                </button>
                <button
                  disabled={deciding}
                  onClick={() => onDecide?.(tool.pending_id!, 'approve')}
                  className="px-3 py-1.5 text-[12px] rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-1"
                >
                  {deciding ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                  Approve & run
                </button>
              </div>
            </div>
          )}

          {!isPending && isMessage && !empty && (
            <ReadOnlyMessagePreview toolName={tool.name} input={tool.input} />
          )}

          {!isPending && !isMessage && tool.input && !empty && (
            <pre className="text-[10.5px] font-mono whitespace-pre-wrap break-words bg-background rounded p-2 border border-border/40 max-h-40 overflow-auto">
              {JSON.stringify(tool.input, null, 2)}
            </pre>
          )}

          {tool.output && tool.status !== 'pending' && (
            <details className="text-[11px]">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Result</summary>
              <pre className="mt-1 text-[10.5px] font-mono whitespace-pre-wrap break-words bg-background rounded p-2 border border-border/40 max-h-48 overflow-auto">
                {JSON.stringify(tool.output, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function SourcesPill({ sources }: { sources: any }) {
  const [open, setOpen] = useState(false);
  const counts = {
    k: sources?.chunks?.length ?? 0,
    w: sources?.wins?.length ?? 0,
    p: sources?.projects?.length ?? 0,
    m: sources?.market?.length ?? 0,
  };
  const total = counts.k + counts.w + counts.p + counts.m;
  if (!total) return null;
  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
        title="Knowledge sources Zara consulted for this reply"
      >
        <Brain className="w-3 h-3 text-primary" />
        Consulted {total} source{total === 1 ? '' : 's'}
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-1 rounded-md border border-border/60 bg-card p-2 text-[11px] space-y-1.5">
          {counts.k > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-0.5">Playbook · {counts.k}</div>
              {sources.chunks.map((c: any, i: number) => (
                <div key={c.id ?? i} className="text-foreground/80 truncate">
                  K{i + 1} · {c.title ?? 'Untitled'} · <span className="text-muted-foreground tabular-nums">{(c.similarity * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          )}
          {counts.w > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-0.5">Past wins · {counts.w}</div>
              {sources.wins.map((w: any, i: number) => (
                <div key={w.id ?? i} className="text-foreground/80 truncate">
                  W{i + 1} · {w.profile ?? '—'} · <span className="text-muted-foreground tabular-nums">{(w.similarity * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          )}
          {counts.p > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-0.5">Projects · {counts.p}</div>
              {sources.projects.map((p: any, i: number) => (
                <div key={p.id ?? i} className="text-foreground/80 truncate">
                  P{i + 1} · {p.name}{p.city ? ` (${p.city})` : ''} · <span className="text-muted-foreground tabular-nums">{(p.similarity * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          )}
          {counts.m > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-0.5">Market intel · {counts.m}</div>
              {sources.market.map((m: any, i: number) => (
                <div key={m.id ?? i} className="text-foreground/80 truncate">M{i + 1} · {m.week_of} · {m.headline ?? ''}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MessageBubble({
  role, text, tools, onFeedback, messageId, onDecide, decidingId, sources,
}: {
  role: 'user' | 'assistant';
  text: string;
  tools?: ToolUiState[];
  onFeedback?: (rating: 'up' | 'down') => void;
  messageId?: string | null;
  onDecide?: (pending_id: string, decision: 'approve' | 'deny', overrides?: MessageOverrides) => void;
  decidingId?: string | null;
  sources?: any;
}) {
  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl bg-primary text-primary-foreground px-4 py-2.5 text-[14px] whitespace-pre-wrap">
          {text}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] space-y-1">
        {tools?.map((t) => (
          <ToolPill
            key={t.id}
            tool={t}
            onDecide={onDecide}
            deciding={!!t.pending_id && decidingId === t.pending_id}
          />
        ))}
        {text && (
          <div className="rounded-2xl bg-muted/40 border border-border/40 px-4 py-2.5 text-[14px] prose prose-sm prose-neutral dark:prose-invert max-w-none prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-headings:mt-3 prose-headings:mb-1">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
          </div>
        )}
        {sources && <SourcesPill sources={sources} />}
        {messageId && onFeedback && text && (
          <div className="flex items-center gap-1 px-1 pt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => onFeedback('up')} className="p-1 rounded hover:bg-muted/60" title="Helpful"><ThumbsUp className="w-3 h-3 text-muted-foreground" /></button>
            <button onClick={() => onFeedback('down')} className="p-1 rounded hover:bg-muted/60" title="Not helpful"><ThumbsDown className="w-3 h-3 text-muted-foreground" /></button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ZaraCockpitPage() {
  const qc = useQueryClient();
  const { pinnedId } = useZaraPin();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [streamTools, setStreamTools] = useState<ToolUiState[]>([]);
  const [streamSources, setStreamSources] = useState<any>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputWrapRef = useRef<HTMLDivElement>(null);

  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    inputRef.current?.focus();
    const handler = () => inputRef.current?.focus();
    window.addEventListener('zara:focus-input', handler);
    return () => window.removeEventListener('zara:focus-input', handler);
  }, []);

  // Accept ?prompt= handoffs from the project catalog / self-awareness pages.
  useEffect(() => {
    const p = searchParams.get('prompt');
    if (p) {
      setInput(p);
      setSearchParams({}, { replace: true });
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [searchParams, setSearchParams]);

  const { data: settings } = useQuery({
    queryKey: ['zara-settings'],
    queryFn: async () => {
      const { data } = await supabase.from('zara_settings').select('mode').eq('id', 1).maybeSingle();
      return (data as { mode: 'off' | 'sandbox' | 'live' } | null) ?? { mode: 'sandbox' as const };
    },
  });

  const { data: pendingCount = 0 } = useQuery({
    queryKey: ['zara-pending-count'],
    queryFn: async () => {
      const { count } = await supabase.from('zara_suggested_replies').select('id', { count: 'exact', head: true }).eq('status', 'pending');
      return count ?? 0;
    },
    refetchInterval: 15_000,
  });

  const { data: conversations = [] } = useQuery({
    queryKey: ['zara-conversations'],
    queryFn: async (): Promise<Conv[]> => {
      const { data } = await supabase
        .from('zara_conversations')
        .select('id, title, pinned, archived, last_message_at, created_at')
        .eq('archived', false)
        .order('pinned', { ascending: false })
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(100);
      return (data as Conv[]) ?? [];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel('zara-cockpit-conv')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'zara_conversations' }, () => {
        qc.invalidateQueries({ queryKey: ['zara-conversations'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  // Load messages for active conversation
  const { data: messages = [] } = useQuery({
    queryKey: ['zara-messages', activeId],
    queryFn: async (): Promise<StoredMsg[]> => {
      if (!activeId) return [];
      const { data } = await supabase
        .from('zara_messages')
        .select('id,role,content,tool_calls,tool_call_id,tool_name,tool_result,created_at,metadata')
        .eq('conversation_id', activeId)
        .order('created_at', { ascending: true });
      return (data as StoredMsg[]) ?? [];
    },
    enabled: !!activeId,
  });

  // Pending tool calls awaiting approval for this conversation
  const { data: pendingRows = [] } = useQuery({
    queryKey: ['zara-pending-tool-calls', activeId],
    queryFn: async () => {
      if (!activeId) return [] as Array<{ id: string; tool_use_id: string; tool_name: string; tool_input: any; status: string }>;
      const { data } = await supabase
        .from('zara_pending_tool_calls')
        .select('id,tool_use_id,tool_name,tool_input,status,created_at')
        .eq('conversation_id', activeId)
        .order('created_at', { ascending: true });
      return (data as any[]) ?? [];
    },
    enabled: !!activeId,
    refetchInterval: streaming ? 1500 : false,
  });
  const pendingByUseId = useMemo(() => {
    const m = new Map<string, { pending_id: string; status: string; tool_input: any }>();
    for (const r of pendingRows) m.set(r.tool_use_id, { pending_id: r.id, status: r.status, tool_input: r.tool_input });
    return m;
  }, [pendingRows]);

  // Approve / deny pending tool call
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const decide = async (pending_id: string, decision: 'approve' | 'deny', overrides?: MessageOverrides) => {
    setDecidingId(pending_id);
    try {
      const { data: u } = await supabase.auth.getSession();
      const hasOverrides = overrides && Object.keys(overrides).length > 0;
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/zara-tool-approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${u.session?.access_token ?? ''}` },
        body: JSON.stringify({ pending_id, decision, overrides: hasOverrides ? overrides : undefined }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || 'Decision failed');
      toast.success(decision === 'approve' ? (hasOverrides ? 'Edited draft sent' : 'Action approved and executed') : 'Action denied');
      qc.invalidateQueries({ queryKey: ['zara-pending-tool-calls', activeId] });
      qc.invalidateQueries({ queryKey: ['zara-messages', activeId] });
      qc.invalidateQueries({ queryKey: ['zara-actions-feed'] });
    } catch (e: any) {
      toast.error(e.message ?? 'Decision failed');
    } finally {
      setDecidingId(null);
    }
  };

  // Auto-scroll on new content
  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, streamText, streamTools.length]);

  const filteredConvs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, search]);

  const newConv = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error('Not signed in');
      const { data, error } = await supabase.from('zara_conversations')
        .insert({ user_id: u.user.id, title: 'New conversation' }).select().single();
      if (error) throw error;
      return data as Conv;
    },
    onSuccess: (c) => {
      setActiveId(c.id);
      qc.invalidateQueries({ queryKey: ['zara-conversations'] });
      setTimeout(() => inputRef.current?.focus(), 50);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const togglePin = async (c: Conv) => {
    await supabase.from('zara_conversations').update({ pinned: !c.pinned }).eq('id', c.id);
    qc.invalidateQueries({ queryKey: ['zara-conversations'] });
  };
  const archive = async (c: Conv) => {
    await supabase.from('zara_conversations').update({ archived: true }).eq('id', c.id);
    if (activeId === c.id) setActiveId(null);
    qc.invalidateQueries({ queryKey: ['zara-conversations'] });
  };

  const { data: actions = [] } = useQuery({
    queryKey: ['zara-actions-feed'],
    queryFn: async (): Promise<ActionRow[]> => {
      const { data } = await supabase.from('zara_actions_log')
        .select('id, action, tool_name, contact_id, result_summary, occurred_at')
        .order('occurred_at', { ascending: false }).limit(15);
      return (data as ActionRow[]) ?? [];
    },
  });
  useEffect(() => {
    const ch = supabase.channel('zara-cockpit-actions')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'zara_actions_log' }, () => {
        qc.invalidateQueries({ queryKey: ['zara-actions-feed'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const modePill = (() => {
    const m = settings?.mode ?? 'sandbox';
    if (m === 'off') return { label: 'Off', tone: 'muted' as const };
    if (m === 'sandbox') return { label: 'Sandbox', tone: 'warning' as const };
    return { label: 'LIVE', tone: 'success' as const };
  })();

  // ── SSE streaming send ──────────────────────────────────────────────
  const sendFeedback = async (messageId: string, rating: 'up' | 'down') => {
    try {
      const { data: u } = await supabase.auth.getSession();
      await fetch(`${SUPABASE_URL}/functions/v1/zara-tool-execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${u.session?.access_token ?? ''}` },
        body: JSON.stringify({ tool: 'log_training_feedback', args: { message_id: messageId, rating }, ctx: { user_id: u.session?.user?.id } }),
      });
      toast.success('Feedback recorded');
    } catch (e: any) {
      toast.error('Could not log feedback');
    }
  };

  const [transcript, setTranscript] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLTextAreaElement>(null);

  const pttStartYRef = useRef<number | null>(null);
  const pttCancelArmedRef = useRef(false);

  const ptt = usePushToTalk({
    onTranscript: (t) => {
      setTranscript((prev) => (prev ? `${prev.trim()} ${t}` : t));
      requestAnimationFrame(() => {
        const el = transcriptRef.current;
        if (el) {
          el.style.height = 'auto';
          el.style.height = Math.min(el.scrollHeight, 220) + 'px';
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
        }
      });
    },
  });

  const sendTranscript = () => {
    const text = (transcript ?? '').trim();
    if (!text) { setTranscript(null); return; }
    setInput(text);
    setTranscript(null);
    setTimeout(() => onSend(), 0);
  };

  const appendTranscriptToInput = () => {
    const text = (transcript ?? '').trim();
    if (!text) { setTranscript(null); return; }
    setInput((prev) => (prev ? `${prev.trim()} ${text}` : text));
    setTranscript(null);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 200) + 'px'; el.focus(); }
    });
  };

  useEffect(() => {
    if (ptt.state !== 'recording') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        ptt.cancel();
        pttStartYRef.current = null;
        pttCancelArmedRef.current = false;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ptt.state, ptt.cancel]);

  const onSend = async () => {
    const text = input.trim();
    if (!text || streaming) return;
    if (settings?.mode === 'off') {
      toast.error('Zara is off. Enable her in /crm/settings.');
      return;
    }

    let convId = activeId;
    if (!convId) {
      const created = await newConv.mutateAsync();
      convId = created.id;
    }

    setInput('');
    setStreaming(true);
    setStreamText('');
    setStreamTools([]);
    setStreamSources(null);

    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) { toast.error('Not signed in'); setStreaming(false); return; }

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/zara-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          conversation_id: convId,
          message: text,
          page_context: pinnedId ? { surface: 'zara-cockpit', contact_id: pinnedId } : { surface: 'zara-cockpit' },
        }),
        signal: abort.signal,
      });
      if (!res.ok || !res.body) {
        const t = await res.text().catch(() => '');
        throw new Error(t || `Chat failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const events = buf.split('\n\n');
        buf = events.pop() ?? '';
        for (const evt of events) {
          const lines = evt.split('\n');
          let ev = 'message';
          let data = '';
          for (const l of lines) {
            if (l.startsWith('event:')) ev = l.slice(6).trim();
            else if (l.startsWith('data:')) data += l.slice(5).trim();
          }
          if (!data) continue;
          let payload: any;
          try { payload = JSON.parse(data); } catch { continue; }
          if (ev === 'text') {
            setStreamText((s) => s + payload.delta);
          } else if (ev === 'tool_start') {
            setStreamTools((arr) => [...arr, { id: payload.id, name: payload.name, status: 'running', input: payload.input }]);
          } else if (ev === 'tool_result') {
            setStreamTools((arr) => arr.map((t) => t.id === payload.id
              ? { ...t, status: payload.output?.ok === false ? 'error' : 'done', output: payload.output }
              : t));
          } else if (ev === 'tool_pending') {
            setStreamTools((arr) => [...arr, {
              id: payload.id, name: payload.name, status: 'pending',
              input: payload.input, pending_id: payload.pending_id,
            }]);
            qc.invalidateQueries({ queryKey: ['zara-pending-tool-calls', convId] });
          } else if (ev === 'title') {
            qc.invalidateQueries({ queryKey: ['zara-conversations'] });
          } else if (ev === 'sources') {
            setStreamSources(payload);
          } else if (ev === 'warning') {
            toast.warning(payload.message ?? 'Zara warning');
          } else if (ev === 'error') {
            toast.error(payload.message ?? 'Stream error');
          } else if (ev === 'done') {
            // refetch persisted messages so the UI shows the canonical record
            qc.invalidateQueries({ queryKey: ['zara-messages', convId] });
          }
        }
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') toast.error(e.message ?? 'Send failed');
    } finally {
      setStreaming(false);
      setStreamText('');
      setStreamTools([]);
      setStreamSources(null);
      abortRef.current = null;
      qc.invalidateQueries({ queryKey: ['zara-messages', convId] });
      qc.invalidateQueries({ queryKey: ['zara-actions-feed'] });
      qc.invalidateQueries({ queryKey: ['zara-pending-count'] });
    }
  };

  // Build the rendered message list grouping assistant text + adjacent tool rows
  const rendered = useMemo(() => {
    const out: Array<{ kind: 'user' | 'assistant'; id: string; text: string; tools: ToolUiState[]; sources?: any }> = [];
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (m.role === 'user') {
        out.push({ kind: 'user', id: m.id, text: m.content ?? '', tools: [] });
      } else if (m.role === 'assistant') {
        const toolUses = (m.tool_calls ?? []) as Array<{ id: string; name: string; input: any }>;
        const tools: ToolUiState[] = toolUses.map((tu) => {
          const result = messages.find((x) => x.role === 'tool' && x.tool_call_id === tu.id);
          const pend = pendingByUseId.get(tu.id);
          const isPending = pend?.status === 'pending';
          const isDenied = pend?.status === 'denied';
          return {
            id: tu.id, name: tu.name,
            status: isPending ? 'pending'
              : isDenied ? 'denied'
              : result ? (result.tool_result?.ok === false ? 'error' : 'done') : 'done',
            input: tu.input, output: result?.tool_result,
            pending_id: isPending ? pend?.pending_id : undefined,
          };
        });
        const sources = (m as any).metadata?.consulted_sources ?? null;
        out.push({ kind: 'assistant', id: m.id, text: m.content ?? '', tools, sources });
      }
    }
    return out;
  }, [messages, pendingByUseId]);

  // Mobile rail drawer
  const [railOpen, setRailOpen] = useState(false);
  useKeyboardInset(true);

  const railContent = (
    <>
        <div className="p-3 border-b border-border/60 space-y-2">
          <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90" size="sm" onClick={() => { newConv.mutate(); setRailOpen(false); }}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            New conversation
          </Button>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className="h-9 pl-7 text-[14px] sm:text-[12px] sm:h-8" />
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-1.5 space-y-0.5">
          {filteredConvs.length === 0 && (
            <div className="text-center text-[11px] text-muted-foreground py-8 px-3">
              No conversations yet. Start one with "New conversation".
            </div>
          )}
          {filteredConvs.map((c) => (
            <button
              key={c.id}
              onClick={() => { setActiveId(c.id); setRailOpen(false); }}
              onContextMenu={(e) => {
                e.preventDefault();
                const choice = window.prompt('Action: pin | archive', 'pin');
                if (choice === 'pin') togglePin(c);
                else if (choice === 'archive') archive(c);
              }}
              className={`w-full text-left px-2.5 py-2.5 sm:py-2 rounded-md transition-colors ${
                activeId === c.id ? 'bg-primary/10 text-foreground' : 'hover:bg-muted/60 text-foreground/90'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                {c.pinned && <Pin className="w-3 h-3 text-primary shrink-0" />}
                <span className="text-[13px] font-medium truncate">{c.title}</span>
              </div>
              <div className="text-[10.5px] text-muted-foreground">
                {c.last_message_at
                  ? formatDistanceToNow(new Date(c.last_message_at), { addSuffix: true })
                  : formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
              </div>
            </button>
          ))}
        </div>
        <div className="p-2.5 border-t border-border/60 space-y-1.5">
          <Link to="/crm/zara/queue" onClick={() => setRailOpen(false)} className="flex items-center justify-between text-[12px] px-2 py-2 sm:py-1.5 rounded-md hover:bg-muted/60 transition-colors">
            <span className="flex items-center gap-1.5"><Inbox className="w-3.5 h-3.5" />Approval queue</span>
            <span className="flex items-center gap-1">
              {pendingCount > 0 && <Pill size="sm" tone="warning">{pendingCount}</Pill>}
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
            </span>
          </Link>
          <Link to="/crm/zara/projects" onClick={() => setRailOpen(false)} className="flex items-center justify-between text-[12px] px-2 py-2 sm:py-1.5 rounded-md hover:bg-muted/60 transition-colors">
            <span className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" />Project catalog</span>
            <ChevronRight className="w-3 h-3 text-muted-foreground" />
          </Link>
          <Link to="/crm/zara/training" onClick={() => setRailOpen(false)} className="flex items-center justify-between text-[12px] px-2 py-2 sm:py-1.5 rounded-md hover:bg-muted/60 transition-colors">
            <span className="flex items-center gap-1.5"><Brain className="w-3.5 h-3.5" />Self-awareness</span>
            <ChevronRight className="w-3 h-3 text-muted-foreground" />
          </Link>
          <Link to="/crm/zara/engagement" onClick={() => setRailOpen(false)} className="flex items-center justify-between text-[12px] px-2 py-2 sm:py-1.5 rounded-md hover:bg-muted/60 transition-colors">
            <span className="flex items-center gap-1.5"><ActivityIcon className="w-3.5 h-3.5" />Engagement status</span>
            <ChevronRight className="w-3 h-3 text-muted-foreground" />
          </Link>
          <Link to="/crm/zara/audit" onClick={() => setRailOpen(false)} className="flex items-center justify-between text-[12px] px-2 py-2 sm:py-1.5 rounded-md hover:bg-muted/60 transition-colors">
            <span className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" />Outbound audit</span>
            <ChevronRight className="w-3 h-3 text-muted-foreground" />
          </Link>
          <Link to="/crm/settings#zara" onClick={() => setRailOpen(false)} className="flex items-center justify-between text-[12px] px-2 py-2 sm:py-1.5 rounded-md hover:bg-muted/60 transition-colors">
            <span>Mode</span>
            <Pill size="sm" tone={modePill.tone}>{modePill.label}</Pill>
          </Link>
        </div>
    </>
  );

  return (
    <div className="flex flex-1 min-h-0 h-full -mx-4 -my-4 bg-background">
      {/* LEFT — Conversations rail (desktop) */}
      <aside className="hidden md:flex w-[240px] shrink-0 border-r border-border/60 flex-col min-h-0">
        {railContent}
      </aside>

      {/* Mobile rail drawer */}
      <Sheet open={railOpen} onOpenChange={setRailOpen}>
        <SheetContent side="left" className="w-[280px] p-0 flex flex-col">
          {railContent}
        </SheetContent>
      </Sheet>

      {/* CENTER — Chat */}
      <section className="flex-1 min-w-0 flex flex-col">
        <header className="px-3 sm:px-5 py-3 border-b border-border/60 flex items-center justify-between gap-2 sm:gap-3"
          style={{ paddingTop: 'calc(12px + env(safe-area-inset-top))' }}>
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setRailOpen(true)}
              className="md:hidden p-2 -ml-2 rounded-md hover:bg-muted/60 min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Open conversations"
            >
              <Menu className="w-5 h-5" />
            </button>
            <Sparkles className="w-4 h-4 text-primary shrink-0" />
            <h1 className="text-[15px] font-semibold tracking-tight truncate">Zara</h1>
            <Pill size="sm" tone={modePill.tone}>{modePill.label}</Pill>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <AutonomyControl />
            <span className="text-[11px] text-muted-foreground hidden lg:inline">Cmd/Ctrl+J · type / for commands</span>
          </div>

        </header>

        <ZaraKillSwitch />
        <PinnedLeadChip />

        <div ref={scrollerRef} className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-5 py-4 sm:py-6">
          <div className="max-w-2xl mx-auto space-y-4">

            {rendered.length === 0 && !streaming && (
              <>
                <div className="text-center py-10">
                  <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-primary" />
                  </div>
                  <h2 className="text-[18px] font-semibold tracking-tight mb-1.5">
                    {activeId ? 'Continue this conversation' : 'Start a conversation with Zara'}
                  </h2>
                  <p className="text-[13px] text-muted-foreground max-w-md mx-auto">
                    Ask about leads, drafts, projects, or your week. Pin a lead with <code className="font-mono">/lead</code> · slash <code className="font-mono">/</code> for commands.
                  </p>
                </div>
                <DynamicSuggestions onPick={(q) => { setInput(q); setTimeout(() => inputRef.current?.focus(), 0); }} />
              </>
            )}


            {rendered.map((m) => (
              <div key={m.id} className="group">
                <MessageBubble
                  role={m.kind}
                  text={m.text}
                  tools={m.tools}
                  sources={(m as any).sources}
                  messageId={m.kind === 'assistant' ? m.id : null}
                  onFeedback={m.kind === 'assistant' ? (r) => sendFeedback(m.id, r) : undefined}
                  onDecide={decide}
                  decidingId={decidingId}
                />
              </div>
            ))}

            {streaming && (
              <div className="group">
                <MessageBubble role="assistant" text={streamText} tools={streamTools} sources={streamSources} onDecide={decide} decidingId={decidingId} />
                {!streamText && streamTools.length === 0 && (
                  <div className="flex items-center gap-2 text-[12px] text-muted-foreground px-2 pt-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Thinking…
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div
          className="border-t border-border/60 px-3 sm:px-5 py-3"
          style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom) + var(--keyboard-inset-bottom, 0px))' }}
        >
          <div className="max-w-2xl mx-auto">

            {transcript !== null && (
              <div className="mb-2 rounded-2xl border border-primary/40 bg-primary/5 p-3 animate-in fade-in slide-in-from-bottom-1">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-primary">
                    <Mic className="w-3.5 h-3.5" /> Transcript preview · edit before sending
                  </div>
                  <button
                    type="button"
                    onClick={() => setTranscript(null)}
                    className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Discard
                  </button>
                </div>
                <textarea
                  ref={transcriptRef}
                  value={transcript}
                  onChange={(e) => {
                    setTranscript(e.target.value);
                    const el = e.currentTarget;
                    el.style.height = 'auto';
                    el.style.height = Math.min(el.scrollHeight, 220) + 'px';
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      sendTranscript();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setTranscript(null);
                    }
                  }}
                  rows={2}
                  placeholder="Transcribed text…"
                  className="w-full resize-none bg-transparent outline-none text-[14px] leading-snug min-h-[44px] max-h-[220px] text-foreground"
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="text-[10.5px] text-muted-foreground">
                    Enter to send · Shift+Enter for newline · Esc to discard
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="outline" onClick={appendTranscriptToInput} disabled={!transcript.trim()}>
                      Append to message
                    </Button>
                    <Button
                      size="sm"
                      onClick={sendTranscript}
                      disabled={!transcript.trim() || streaming}
                      className="bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      <Send className="w-3.5 h-3.5 mr-1" /> Send
                    </Button>
                  </div>
                </div>
              </div>
            )}
            <div ref={inputWrapRef} className="relative">
              <SlashCommandPalette
                input={input}
                onSelect={(v) => { setInput(v); setTimeout(() => inputRef.current?.focus(), 0); }}
                onCompose={(text) => { setInput(text); setTimeout(() => { inputRef.current?.focus(); onSend(); }, 0); }}
                anchorRef={inputWrapRef}
              />
            <div className="relative flex items-end gap-2 rounded-2xl border border-border bg-card focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/15 transition-all p-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  const el = e.currentTarget;
                  el.style.height = 'auto';
                  el.style.height = Math.min(el.scrollHeight, 200) + 'px';
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    onSend();
                  }
                }}
                rows={1}
                placeholder={streaming ? 'Zara is replying…' : 'Ask Zara anything…'}
                disabled={streaming}
                className="flex-1 resize-none bg-transparent outline-none text-[16px] sm:text-[14px] px-2 py-1.5 min-h-[28px] max-h-[200px] disabled:opacity-60"
              />
              <div className="relative">
                {ptt.state === 'recording' && (
                  <div className="absolute -top-9 left-1/2 -translate-x-1/2 px-2 py-1 rounded-md bg-foreground text-background text-[10.5px] whitespace-nowrap shadow-sm pointer-events-none">
                    Swipe up / Esc to cancel
                  </div>
                )}
                <button
                  type="button"
                  title={ptt.state === 'recording' ? 'Release to send · swipe up to cancel' : 'Hold to talk'}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pttStartYRef.current = e.clientY;
                    pttCancelArmedRef.current = false;
                    ptt.start();
                  }}
                  onMouseMove={(e) => {
                    if (ptt.state !== 'recording' || pttStartYRef.current == null) return;
                    pttCancelArmedRef.current = pttStartYRef.current - e.clientY > 60;
                  }}
                  onMouseUp={(e) => {
                    e.preventDefault();
                    if (pttCancelArmedRef.current) ptt.cancel(); else ptt.stop();
                    pttStartYRef.current = null;
                    pttCancelArmedRef.current = false;
                  }}
                  onMouseLeave={() => {
                    if (ptt.state === 'recording') {
                      if (pttCancelArmedRef.current) ptt.cancel(); else ptt.stop();
                    }
                    pttStartYRef.current = null;
                    pttCancelArmedRef.current = false;
                  }}
                  onTouchStart={(e) => {
                    e.preventDefault();
                    pttStartYRef.current = e.touches[0]?.clientY ?? null;
                    pttCancelArmedRef.current = false;
                    ptt.start();
                  }}
                  onTouchMove={(e) => {
                    if (ptt.state !== 'recording' || pttStartYRef.current == null) return;
                    const y = e.touches[0]?.clientY ?? pttStartYRef.current;
                    pttCancelArmedRef.current = pttStartYRef.current - y > 60;
                  }}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    if (pttCancelArmedRef.current) ptt.cancel(); else ptt.stop();
                    pttStartYRef.current = null;
                    pttCancelArmedRef.current = false;
                  }}
                  disabled={streaming || ptt.state === 'transcribing'}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors disabled:opacity-40 ${
                    ptt.state === 'recording'
                      ? (pttCancelArmedRef.current ? 'bg-muted text-muted-foreground' : 'bg-destructive text-destructive-foreground animate-pulse')
                      : ptt.state === 'transcribing'
                      ? 'bg-muted text-muted-foreground'
                      : 'text-muted-foreground hover:bg-muted/60'
                  }`}
                >
                  {ptt.state === 'transcribing' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : ptt.state === 'recording' ? (
                    <MicOff className="w-4 h-4" />
                  ) : (
                    <Mic className="w-4 h-4" />
                  )}
                </button>
              </div>
              {streaming ? (
                <Button size="sm" variant="outline" onClick={() => abortRef.current?.abort()}>Stop</Button>
              ) : (
                <Button size="sm" onClick={onSend} disabled={!input.trim()} className="bg-primary text-primary-foreground hover:bg-primary/90">
                  <Send className="w-3.5 h-3.5 mr-1" />
                  Send
                </Button>
              )}
            </div>
            </div>
            <div className="mt-2 text-center text-[10.5px] text-muted-foreground">
              <Link to="/crm/zara/about" className="hover:text-foreground transition-colors">
                Cmd/Ctrl+Enter to send · Hold mic to talk · {ptt.state === 'recording' ? 'recording…' : ptt.state === 'transcribing' ? 'transcribing…' : streaming ? 'streaming…' : 'ready'}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* RIGHT — Live activity */}
      <aside className="hidden xl:flex w-[320px] shrink-0 border-l border-border/60 flex-col min-h-0">
        <header className="px-4 py-3 border-b border-border/60 flex items-center gap-2">
          <ActivityIcon className="w-4 h-4 text-primary" />
          <h2 className="text-[13px] font-semibold tracking-tight">Live activity</h2>
        </header>
        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3">
          <div className="rounded-lg border border-border/60 bg-card p-3">
            <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Zara today</div>
            <div className="grid grid-cols-2 gap-2 text-[12px]">
              <Link to="/crm/zara/queue" className="rounded-md bg-muted/30 hover:bg-muted/60 p-2 transition-colors">
                <div className="text-[18px] font-semibold tabular-nums leading-none mb-1">{pendingCount}</div>
                <div className="text-[10.5px] text-muted-foreground">Drafts pending</div>
              </Link>
              <div className="rounded-md bg-muted/30 p-2">
                <div className="text-[18px] font-semibold tabular-nums leading-none mb-1">{actions.length}</div>
                <div className="text-[10.5px] text-muted-foreground">Recent actions</div>
              </div>
            </div>
          </div>

          <div>
            <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-semibold mb-2 px-1">Live feed</div>
            {actions.length === 0 ? (
              <div className="text-[12px] text-muted-foreground px-1 py-4 text-center">
                No actions yet. Zara's feed appears here in real time.
              </div>
            ) : (
              <div className="space-y-1">
                {actions.map((a) => (
                  <div key={a.id} className="rounded-md hover:bg-muted/40 px-2 py-1.5 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-[12px] font-medium truncate">{a.tool_name ?? a.action}</div>
                      <div className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                        {formatDistanceToNow(new Date(a.occurred_at), { addSuffix: false })}
                      </div>
                    </div>
                    {a.result_summary && (
                      <div className="text-[11px] text-muted-foreground truncate">{a.result_summary}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </aside>

      <MicPermissionDialog
        error={ptt.error}
        onClose={ptt.dismissError}
        onRetry={ptt.retry}
      />
    </div>
  );
}
