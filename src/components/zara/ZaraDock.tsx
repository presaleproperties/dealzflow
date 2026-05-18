import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { Sparkles, X, History, Maximize2, Send, Plus, Pin, Search, Loader2, ChevronDown, Copy, Check, Trash2, Archive, Edit2, Download, MoreVertical, Eraser, Zap } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pill } from '@/components/crm/shared/Pill';
import { useZaraDock } from '@/stores/useZaraDock';
import { useZaraPageContext } from '@/hooks/useZaraPageContext';
import { useZaraDockChat, useZaraConversations, type Conv } from '@/hooks/useZaraDockChat';
import { getChipsForSurface } from '@/lib/zaraDockChips';
import { ZaraQueuedEmailsPanel } from '@/components/crm/leads/ZaraQueuedEmailsPanel';
import { ZaraDraftCard } from '@/components/zara/ZaraDraftCard';

const DRAFT_TOOL_CHANNEL: Record<string, 'email' | 'sms' | 'whatsapp'> = {
  draft_email: 'email',
  draft_sms: 'sms',
  draft_whatsapp: 'whatsapp',
};

const HIDDEN_PATTERNS: RegExp[] = [
  /^\/crm\/zara\/?$/, // cockpit
  /^\/crm\/zara\/about\/?$/,
  /^\/crm\/zara\/train\/?$/,
  /^\/crm\/zara\/training\/?$/,
  /^\/crm\/zara\/templates\/?$/,
  /^\/crm\/zara\/projects\/[^/]+\/?$/,
];

function shouldHide(pathname: string) {
  if (!pathname.startsWith('/crm')) return true;
  return HIDDEN_PATTERNS.some((re) => re.test(pathname));
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'conversation';
}

function CopyButton({ text, className = '' }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true); setTimeout(() => setCopied(false), 1200);
        });
      }}
      className={`inline-flex items-center gap-1 text-[10.5px] text-muted-foreground hover:text-foreground transition-colors ${className}`}
      title="Copy"
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function MdCode({ children, ...props }: any) {
  const text = String(children ?? '');
  const isBlock = text.includes('\n') || (props.className && /language-/.test(props.className));
  if (!isBlock) {
    return <code className="px-1 py-0.5 rounded bg-muted/60 font-mono text-[12px]">{children}</code>;
  }
  return (
    <div className="relative my-2 rounded-md border border-border/60 bg-muted/30">
      <div className="absolute right-1.5 top-1.5 z-10">
        <CopyButton text={text} />
      </div>
      <pre className="overflow-x-auto p-3 text-[12px] font-mono"><code {...props}>{children}</code></pre>
    </div>
  );
}

/**
 * Post-process rendered markdown nodes to turn lead / project names into links.
 * Builds a normalized lookup from referenced ids once per message render.
 */
function useNameLinks(contactIds: string[], projectIds: string[]) {
  const { data: contacts = [] } = useQuery({
    queryKey: ['zara-link-contacts', contactIds.join(',')],
    enabled: contactIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from('crm_contacts').select('id, first_name, last_name').in('id', contactIds);
      const rows = (data as Array<{ id: string; first_name: string | null; last_name: string | null }> | null) ?? [];
      return rows.map((r) => ({ id: r.id, full_name: [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || null }));
    },
  });
  const { data: projects = [] } = useQuery({
    queryKey: ['zara-link-projects', projectIds.join(',')],
    enabled: projectIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from('presale_projects').select('id, name').in('id', projectIds);
      return (data as Array<{ id: string; name: string | null }>) ?? [];
    },
  });
  return useMemo(() => {
    const nameMap: Array<{ regex: RegExp; href: string }> = [];
    for (const c of contacts) {
      const n = (c.full_name ?? '').trim();
      if (n.length < 3) continue;
      nameMap.push({ regex: new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'), href: `/crm/leads/${c.id}` });
    }
    for (const p of projects) {
      const n = (p.name ?? '').trim();
      if (n.length < 3) continue;
      nameMap.push({ regex: new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'), href: `/crm/zara/projects/${p.id}` });
    }
    return nameMap;
  }, [contacts, projects]);
}

function linkifyText(text: string, links: Array<{ regex: RegExp; href: string }>): React.ReactNode {
  if (!links.length) return text;
  const parts: React.ReactNode[] = [text];
  for (const { regex, href } of links) {
    const next: React.ReactNode[] = [];
    for (const part of parts) {
      if (typeof part !== 'string') { next.push(part); continue; }
      const m = part.match(regex);
      if (!m) { next.push(part); continue; }
      const idx = part.indexOf(m[0]);
      next.push(part.slice(0, idx));
      next.push(<Link key={`${href}-${idx}-${m[0]}`} to={href} className="text-primary underline decoration-primary/40 hover:decoration-primary">{m[0]}</Link>);
      next.push(part.slice(idx + m[0].length));
    }
    parts.length = 0; parts.push(...next);
  }
  return <>{parts.map((p, i) => <span key={i}>{p}</span>)}</>;
}

function SourcesPill({ sources }: { sources: any }) {
  const [open, setOpen] = useState(false);
  const total = (sources?.chunks?.length ?? 0) + (sources?.wins?.length ?? 0) + (sources?.projects?.length ?? 0) + (sources?.market?.length ?? 0);
  if (!total) return null;
  return (
    <div className="mt-1">
      <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 text-[10.5px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
        Consulted {total} source{total === 1 ? '' : 's'}
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-1 rounded-md border border-border/60 bg-card p-2 text-[11px] space-y-1">
          {(sources.chunks ?? []).map((c: any, i: number) => (
            <div key={c.id ?? i} className="truncate">K{i + 1} · {c.title ?? 'Untitled'} · <span className="text-muted-foreground tabular-nums">{((c.similarity ?? 0) * 100).toFixed(0)}%</span></div>
          ))}
          {(sources.wins ?? []).map((w: any, i: number) => (
            <div key={w.id ?? i} className="truncate">W{i + 1} · {w.profile ?? '—'}</div>
          ))}
          {(sources.projects ?? []).map((p: any, i: number) => (
            <div key={p.id ?? i} className="truncate">P{i + 1} · {p.name}{p.city ? ` (${p.city})` : ''}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// Parse a trailing `###NEXT### ... ###/NEXT###` block out of assistant text.
// Returns { body, nextActions } — only keeps chips that would change CRM state
// (drafting, sending, booking, scheduling, logging, updating, etc.).
// Read-only chips (show/list/explain/summarize/open) are filtered out so the
// chip rail is reserved for one-tap actions, not navigation.
const STATE_CHANGE_VERBS = /^(draft|send|reply|book|reschedule|schedule|log|add|update|change|set|assign|tag|untag|create|remind|follow[- ]?up|move|mark|note|invite|share project|email|text|call|whatsapp)\b/i;
const READ_ONLY_PREFIXES = /^(show|list|view|see|open|tell|explain|summari[sz]e|what|who|when|where|why|how|recap|find|search|describe)\b/i;
function splitNextBlock(text: string): { body: string; nextActions: string[] } {
  const re = /###NEXT###\s*([\s\S]*?)\s*###\/NEXT###\s*$/i;
  const m = text.match(re);
  if (!m) return { body: text, nextActions: [] };
  const body = text.slice(0, m.index).trimEnd();
  const lines = m[1]
    .split('\n')
    .map((l) => l.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean)
    .filter((l) => STATE_CHANGE_VERBS.test(l) && !READ_ONLY_PREFIXES.test(l));
  return { body, nextActions: lines.slice(0, 3) };
}

function MessageBubble({ m, onChip }: { m: any; onChip?: (text: string) => void }) {
  const links = useNameLinks(m.referencedContactIds ?? [], m.referencedProjectIds ?? []);
  const fullTime = format(new Date(m.created_at), 'PPpp');
  const tokenStr = m.tokens ? `${m.tokens.input ?? '?'}→${m.tokens.output ?? '?'} · ${m.tokens.model ?? ''}` : '';

  if (m.kind === 'user') {
    return (
      <div className="flex justify-end group">
        <div className="max-w-[88%]">
          <div className="rounded-2xl bg-primary text-primary-foreground px-3.5 py-2 text-[13px] leading-relaxed whitespace-pre-wrap shadow-sm">{m.text}</div>
          <div className="text-[10px] text-muted-foreground text-right mt-1" title={fullTime}>
            {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
          </div>
        </div>
      </div>
    );
  }

  const { body, nextActions } = splitNextBlock(m.text ?? '');

  // Assistant: no bubble background per brand — text-forward editorial.
  return (
    <div className="flex justify-start group">
      <div className="max-w-full w-full space-y-1.5">
        {(m.tools ?? []).map((t: any) => (
          <div key={t.id} className="rounded-md border border-border/60 bg-card text-[11px] px-2 py-1 inline-flex items-center gap-1.5">
            <Pill size="sm" tone={t.status === 'error' ? 'danger' : t.status === 'pending' ? 'warning' : 'success'}>{t.status}</Pill>
            <span className="font-mono">{t.name}</span>
          </div>
        ))}
        {body && (
          <div className="relative text-[13.5px] leading-relaxed text-foreground prose prose-sm prose-neutral dark:prose-invert max-w-none prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-headings:font-semibold prose-headings:tracking-tight prose-a:text-primary">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code: MdCode as any,
                p: ({ children }) => <p>{typeof children === 'string' ? linkifyText(children, links) : children}</p>,
                li: ({ children }) => <li>{typeof children === 'string' ? linkifyText(children, links) : children}</li>,
              }}
            >{body}</ReactMarkdown>
            <div className="absolute -bottom-5 right-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <CopyButton text={body} />
            </div>
          </div>
        )}
        {nextActions.length > 0 && onChip && (
          <div className="pt-1.5 flex flex-wrap gap-1.5">
            {nextActions.map((a) => (
              <button
                key={a}
                onClick={() => onChip(a)}
                className="text-[11.5px] px-2.5 py-1 rounded-full bg-foreground/[0.04] text-foreground/80 hover:bg-primary/10 hover:text-primary transition-colors"
              >
                {a}
              </button>
            ))}
          </div>
        )}
        {m.sources && <SourcesPill sources={m.sources} />}
        <div className="text-[10px] text-muted-foreground" title={`${fullTime}${tokenStr ? ` · ${tokenStr}` : ''}`}>
          {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
        </div>
      </div>
    </div>
  );
}


function ConversationListOverlay({
  onPick, onClose,
}: { onPick: (id: string) => void; onClose: () => void }) {
  const { data: convs = [], create, togglePin, rename, archive, remove } = useZaraConversations();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'all' | 'active' | 'archived'>('active');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
    const onFocus = () => searchRef.current?.focus();
    window.addEventListener('zara-dock:focus-search', onFocus);
    return () => window.removeEventListener('zara-dock:focus-search', onFocus);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = convs.filter((c) => {
      if (tab === 'active') return !c.archived;
      if (tab === 'archived') return c.archived;
      return true;
    });
    if (q) {
      list = list.filter((c) =>
        c.title.toLowerCase().includes(q) ||
        (c.last_message_snippet ?? '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [convs, search, tab]);

  const grouped = useMemo(() => {
    if (search.trim()) return null;
    const now = Date.now();
    const day = 24 * 3600 * 1000;
    const buckets: Record<string, Conv[]> = { Pinned: [], Today: [], Yesterday: [], 'This week': [], Earlier: [] };
    for (const c of filtered) {
      if (c.pinned) { buckets.Pinned.push(c); continue; }
      const t = c.last_message_at ? new Date(c.last_message_at).getTime() : new Date(c.created_at).getTime();
      const age = now - t;
      if (age < day) buckets.Today.push(c);
      else if (age < 2 * day) buckets.Yesterday.push(c);
      else if (age < 7 * day) buckets['This week'].push(c);
      else buckets.Earlier.push(c);
    }
    return buckets;
  }, [filtered, search]);

  const exportMd = async (c: Conv) => {
    const { data: msgs } = await supabase.from('zara_messages')
      .select('role,content,created_at').eq('conversation_id', c.id).order('created_at', { ascending: true });
    const lines = [`# ${c.title}`, ''];
    for (const m of (msgs ?? []) as any[]) {
      if (!m.content) continue;
      lines.push(`**${m.role}** · ${m.created_at}`);
      lines.push('');
      lines.push(m.content);
      lines.push('');
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `zara-${slugify(c.title)}-${format(new Date(), 'yyyy-MM-dd')}.md`;
    a.click(); URL.revokeObjectURL(url);
  };

  const handleNew = async () => {
    const c = await create();
    if (c) onPick(c.id);
  };

  const Row = ({ c }: { c: Conv }) => {
    const [menuOpen, setMenuOpen] = useState(false);
    const [renaming, setRenaming] = useState(false);
    const [draft, setDraft] = useState(c.title);
    return (
      <div className="relative group flex items-center gap-1 px-2 py-1.5 rounded-md hover:bg-muted/60 transition-colors">
        {renaming ? (
          <input
            autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
            onBlur={() => { setRenaming(false); if (draft.trim()) rename(c, draft); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { setRenaming(false); if (draft.trim()) rename(c, draft); }
              else if (e.key === 'Escape') { setRenaming(false); setDraft(c.title); }
            }}
            className="flex-1 bg-transparent border-b border-primary/60 outline-none text-[12.5px]"
          />
        ) : (
          <button onClick={() => onPick(c.id)} className="flex-1 text-left min-w-0">
            <div className="flex items-center gap-1.5">
              {c.pinned && <Pin className="w-3 h-3 text-primary shrink-0" />}
              <span className="text-[12.5px] font-medium truncate">{c.title}</span>
            </div>
            {c.last_message_snippet && (
              <div className="text-[11px] text-muted-foreground truncate">{c.last_message_snippet}</div>
            )}
            <div className="text-[10px] text-muted-foreground">
              {formatDistanceToNow(new Date(c.last_message_at ?? c.created_at), { addSuffix: true })}
            </div>
          </button>
        )}
        <button onClick={() => setMenuOpen((o) => !o)} className="p-1 rounded hover:bg-muted opacity-0 group-hover:opacity-100">
          <MoreVertical className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 z-20 w-40 rounded-md border border-border bg-popover shadow-md py-1 text-[12px]">
            <button onClick={() => { togglePin(c); setMenuOpen(false); }} className="w-full text-left px-2 py-1 hover:bg-muted/60 flex items-center gap-1.5"><Pin className="w-3 h-3" />{c.pinned ? 'Unpin' : 'Pin'}</button>
            <button onClick={() => { setRenaming(true); setMenuOpen(false); }} className="w-full text-left px-2 py-1 hover:bg-muted/60 flex items-center gap-1.5"><Edit2 className="w-3 h-3" />Rename</button>
            <button onClick={() => { archive(c); setMenuOpen(false); }} className="w-full text-left px-2 py-1 hover:bg-muted/60 flex items-center gap-1.5"><Archive className="w-3 h-3" />{c.archived ? 'Unarchive' : 'Archive'}</button>
            <button onClick={() => { exportMd(c); setMenuOpen(false); }} className="w-full text-left px-2 py-1 hover:bg-muted/60 flex items-center gap-1.5"><Download className="w-3 h-3" />Export</button>
            <button onClick={() => { if (confirm('Delete this conversation?')) remove(c); setMenuOpen(false); }} className="w-full text-left px-2 py-1 hover:bg-muted/60 text-destructive flex items-center gap-1.5"><Trash2 className="w-3 h-3" />Delete</button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="absolute inset-0 z-20 bg-background flex flex-col">
      <div className="p-2.5 border-b border-border/60 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-[12px] font-semibold tracking-tight">Conversations</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted/60"><X className="w-3.5 h-3.5" /></button>
        </div>
        <Button size="sm" onClick={handleNew} className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="w-3.5 h-3.5 mr-1.5" />New conversation
        </Button>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title + recent messages" className="h-8 pl-7 text-[12px]" />
        </div>
        <div className="flex gap-1 text-[11px]">
          {(['active', 'all', 'archived'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-2 py-1 rounded-md ${tab === t ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/40'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-1.5">
        {filtered.length === 0 && (
          <div className="text-center text-[11px] text-muted-foreground py-8 px-3">
            No conversations yet. Start one with the button above or hit Cmd/Ctrl+K.
          </div>
        )}
        {grouped ? (
          Object.entries(grouped).map(([label, list]) => (
            list.length === 0 ? null : (
              <div key={label} className="mb-2">
                <div className="sticky top-0 bg-background text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-2 py-1">{label}</div>
                {list.map((c) => <Row key={c.id} c={c} />)}
              </div>
            )
          ))
        ) : (
          filtered.map((c) => <Row key={c.id} c={c} />)
        )}
      </div>
    </div>
  );
}

export function ZaraDock() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const pageContext = useZaraPageContext();
  const { open, setOpen, conversationId, setConversationId, showHistory, setShowHistory } = useZaraDock();
  const { create, archive, data: convs = [] } = useZaraConversations();
  const { rendered, send, stop, streaming, streamText, streamTools, streamSources, decide } =
    useZaraDockChat(conversationId, pageContext);

  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [actionOnly, setActionOnly] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('zara-dock:action-only') === '1';
  });
  useEffect(() => {
    try { window.localStorage.setItem('zara-dock:action-only', actionOnly ? '1' : '0'); } catch {}
  }, [actionOnly]);

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
    refetchInterval: 20_000,
  });

  const modePill = (() => {
    const m = settings?.mode ?? 'sandbox';
    if (m === 'off') return { label: 'Off', tone: 'muted' as const };
    if (m === 'sandbox') return { label: 'Sandbox', tone: 'warning' as const };
    return { label: 'LIVE', tone: 'success' as const };
  })();

  // Auto-scroll
  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: 'smooth' });
  }, [rendered.length, streamText, streamTools.length]);

  // Focus listeners
  useEffect(() => {
    const focus = () => inputRef.current?.focus();
    const newAndFocus = async () => {
      const c = await create();
      if (c) {
        setConversationId(c.id);
        setShowHistory(false);
        setTimeout(focus, 80);
      }
    };
    window.addEventListener('zara-dock:focus-input', focus);
    window.addEventListener('zara-dock:new-and-focus', newAndFocus);
    return () => {
      window.removeEventListener('zara-dock:focus-input', focus);
      window.removeEventListener('zara-dock:new-and-focus', newAndFocus);
    };
  }, [create, setConversationId, setShowHistory]);

  const ensureConv = async (): Promise<string | null> => {
    if (conversationId) return conversationId;
    const c = await create();
    if (c) { setConversationId(c.id); return c.id; }
    return null;
  };

  // Clear chat — archive the current convo (preserves audit trail) and start a fresh one.
  const clearChat = async () => {
    if (streaming) { stop(); }
    const current = convs.find((c) => c.id === conversationId);
    if (current && !current.archived && rendered.length > 0) {
      await archive(current);
    }
    setConversationId(null);
    setShowHistory(false);
    setInput('');
    setTimeout(() => inputRef.current?.focus(), 60);
  };

  const onSend = async (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text || streaming) return;
    if (settings?.mode === 'off') { toast.error('Zara is off.'); return; }
    const id = await ensureConv();
    if (!id) return;
    setInput('');
    send(text, id, { replyMode: actionOnly ? 'action' : 'normal' });
  };

  const onChip = async (prompt: string, needsContact: boolean) => {
    if (needsContact && pageContext.contact_id) {
      onSend(prompt); // <current_view> handles the rest
    } else {
      onSend(prompt);
    }
  };

  if (shouldHide(pathname)) return null;

  const chips = getChipsForSurface(pageContext.surface);

  return (
    <>
      {/* Launcher (closed state) — glassy halo pill, lifted off the edge so
          it sits above any preview/native chrome at the bottom. */}
      {!open && (
        <div
          className="fixed z-[60]"
          style={{
            bottom: 'calc(max(24px, env(safe-area-inset-bottom)) + var(--bottom-nav-pad, 0px))',
            right: 80,
          }}
        >
          <div className="zara-halo" style={{ borderRadius: 9999 }}>
            <button
              onClick={() => setOpen(true)}
              title="Talk to Zara (Cmd/Ctrl+J)"
              className="zara-launcher !relative !top-0 !right-0 !bottom-0"
              style={{ position: 'relative' }}
            >
              <Sparkles className="w-5 h-5" />
              {pendingCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] rounded-full bg-destructive text-destructive-foreground text-[9.5px] font-semibold flex items-center justify-center px-1">
                  {pendingCount}
                </span>
              )}
            </button>
          </div>
        </div>
      )}


      {/* Open panel — glass slide-over, no hard border */}
      {open && (
        <div
          className="fixed inset-y-0 right-0 z-40 w-full md:w-[400px] zara-glass-strong flex flex-col animate-slide-in-right"
          style={{ top: 0, borderRadius: 0 }}
        >
          {/* Header */}
          <header className="h-12 px-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="zara-eyebrow">Zara</span>
              <Pill size="sm" tone={modePill.tone}>{modePill.label}</Pill>
            </div>
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setActionOnly((v) => !v)}
                className={`p-2 rounded-full transition-colors ${actionOnly ? 'bg-primary/15 text-primary' : 'hover:bg-foreground/5 text-foreground/70'}`}
                title={actionOnly ? 'Action-only mode on — click to turn off' : 'Action-only mode: click-to-send actions + one question'}
                aria-pressed={actionOnly}
              ><Zap className="w-4 h-4" /></button>
              <button onClick={clearChat} disabled={rendered.length === 0 && !streaming} className="p-2 rounded-full hover:bg-foreground/5 disabled:opacity-30 disabled:hover:bg-transparent" title="Clear chat"><Eraser className="w-4 h-4" /></button>
              <button onClick={() => navigate('/crm/zara')} className="p-2 rounded-full hover:bg-foreground/5" title="Open full cockpit"><Maximize2 className="w-4 h-4" /></button>
              <button onClick={() => setShowHistory(true)} className="p-2 rounded-full hover:bg-foreground/5" title="Conversations (/)"><History className="w-4 h-4" /></button>
              <button onClick={() => setOpen(false)} className="p-2 rounded-full hover:bg-foreground/5" title="Close (Esc)"><X className="w-4 h-4" /></button>
            </div>
          </header>

          {/* History overlay sits above body when toggled */}
          <div className="relative flex-1 min-h-0 flex flex-col">
            {showHistory && (
              <ConversationListOverlay
                onPick={(id) => { setConversationId(id); setShowHistory(false); }}
                onClose={() => setShowHistory(false)}
              />
            )}

            {/* Body */}
            <div ref={scrollerRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2.5">
              {pageContext.contact_id && (
                <ZaraQueuedEmailsPanel contactId={pageContext.contact_id} />
              )}
              {rendered.length === 0 && !streaming && (
                <div className="text-center pt-16 pb-6 px-2">
                  <div className="text-[13px] text-muted-foreground/80 tracking-tight">
                    Ask Zara anything about {pageContext.label.toLowerCase()}.
                  </div>
                  {pageContext.contact_id && (
                    <div className="zara-eyebrow mt-2 opacity-70">Pinned to this lead</div>
                  )}
                </div>
              )}
              {rendered.map((m) => <MessageBubble key={m.id} m={m} onChip={(t) => onSend(t)} />)}
              {streaming && (
                <MessageBubble m={{
                  kind: 'assistant', id: 'stream', text: streamText, tools: streamTools, sources: streamSources,
                  created_at: new Date().toISOString(), referencedContactIds: [], referencedProjectIds: [],
                }} onChip={(t) => onSend(t)} />
              )}
              {streaming && !streamText && streamTools.length === 0 && (
                <div className="flex items-center gap-2 text-[12px] text-muted-foreground py-1">
                  <span className="inline-flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-pulse" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-pulse" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-pulse" style={{ animationDelay: '300ms' }} />
                  </span>
                  Thinking…
                </div>
              )}
            </div>

            {/* Composer — borderless, glass-on-glass */}
            <div className="p-2.5 shrink-0">
              <div className="rounded-2xl bg-foreground/[0.05] focus-within:bg-foreground/[0.08] focus-within:ring-1 focus-within:ring-primary/30 transition p-1.5 flex items-end gap-1.5">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    const el = e.currentTarget;
                    el.style.height = 'auto';
                    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
                  }}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); onSend(); }
                  }}
                  rows={1}
                  placeholder={streaming ? 'Zara is replying…' : 'Ask Zara…'}
                  disabled={streaming}
                  className="flex-1 resize-none bg-transparent outline-none text-[13px] px-2 py-1.5 min-h-[28px] max-h-[160px] disabled:opacity-60"
                />
                {streaming ? (
                  <Button size="sm" variant="ghost" onClick={stop}>Stop</Button>
                ) : (
                  <button
                    onClick={() => onSend()}
                    disabled={!input.trim()}
                    className="zara-quiet-action !py-1.5 !px-2.5 disabled:opacity-40"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
