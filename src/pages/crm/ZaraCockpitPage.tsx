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
  Building2, Brain,
} from 'lucide-react';
import { usePushToTalk } from '@/hooks/usePushToTalk';
import { MicPermissionDialog } from '@/components/crm/zara/MicPermissionDialog';

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
  add_lead_note: 'Add note',
  add_lead_tag: 'Add tag',
  set_lead_status: 'Change status',
  schedule_follow_up: 'Schedule follow-up',
  approve_draft: 'Approve & send draft',
};

function ToolPill({ tool, onDecide, deciding }: {
  tool: ToolUiState;
  onDecide?: (pending_id: string, decision: 'approve' | 'deny') => void;
  deciding?: boolean;
}) {
  const [open, setOpen] = useState(tool.status === 'pending');
  const Icon = tool.status === 'running' ? Loader2 : Wrench;
  const tone =
    tool.status === 'error' || tool.status === 'denied' ? 'destructive'
      : tool.status === 'done' ? 'success'
      : tool.status === 'pending' ? 'warning'
      : 'warning';
  const isPending = tool.status === 'pending' && !!tool.pending_id;
  const borderCls = isPending
    ? 'border-amber-500/50 ring-1 ring-amber-500/20'
    : 'border-border/60';
  return (
    <div className={`my-2 rounded-lg border bg-card text-[12px] overflow-hidden ${borderCls}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors text-left"
      >
        <Icon className={`w-3.5 h-3.5 ${tool.status === 'running' ? 'animate-spin text-primary' : 'text-muted-foreground'}`} />
        <span className="font-medium font-mono text-[11px]">{tool.name}</span>
        <Pill size="sm" tone={tone as any}>{tool.status === 'pending' ? 'needs approval' : tool.status}</Pill>
        <ChevronDown className={`w-3 h-3 ml-auto text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="border-t border-border/60 bg-muted/20 p-2 space-y-2">
          {isPending && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5">
              <div className="text-[12px] font-semibold mb-1.5">
                {TOOL_LABELS[tool.name] ?? 'Action'} — approval required
              </div>
              <div className="text-[11.5px] text-muted-foreground mb-2">
                Zara wants to run <span className="font-mono">{tool.name}</span>. Review the input below and confirm.
              </div>
              {tool.input && (
                <pre className="text-[10.5px] font-mono whitespace-pre-wrap break-words bg-background rounded p-2 border border-border/40 max-h-48 overflow-auto mb-2">
                  {JSON.stringify(tool.input, null, 2)}
                </pre>
              )}
              <div className="flex items-center gap-2 justify-end">
                <button
                  disabled={deciding}
                  onClick={() => onDecide?.(tool.pending_id!, 'deny')}
                  className="px-3 py-1.5 text-[11.5px] rounded-md border border-border hover:bg-muted/60 disabled:opacity-50"
                >
                  Deny
                </button>
                <button
                  disabled={deciding}
                  onClick={() => onDecide?.(tool.pending_id!, 'approve')}
                  className="px-3 py-1.5 text-[11.5px] rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-1"
                >
                  {deciding ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                  Approve & run
                </button>
              </div>
            </div>
          )}
          {!isPending && tool.input && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Input</div>
              <pre className="text-[10.5px] font-mono whitespace-pre-wrap break-words bg-background rounded p-2 border border-border/40">
                {JSON.stringify(tool.input, null, 2)}
              </pre>
            </div>
          )}
          {tool.output && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Output</div>
              <pre className="text-[10.5px] font-mono whitespace-pre-wrap break-words bg-background rounded p-2 border border-border/40 max-h-64 overflow-auto">
                {JSON.stringify(tool.output, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MessageBubble({
  role, text, tools, onFeedback, messageId, onDecide, decidingId,
}: {
  role: 'user' | 'assistant';
  text: string;
  tools?: ToolUiState[];
  onFeedback?: (rating: 'up' | 'down') => void;
  messageId?: string | null;
  onDecide?: (pending_id: string, decision: 'approve' | 'deny') => void;
  decidingId?: string | null;
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
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [streamTools, setStreamTools] = useState<ToolUiState[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

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
        .select('id,role,content,tool_calls,tool_call_id,tool_name,tool_result,created_at')
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
  const decide = async (pending_id: string, decision: 'approve' | 'deny') => {
    setDecidingId(pending_id);
    try {
      const { data: u } = await supabase.auth.getSession();
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/zara-tool-approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${u.session?.access_token ?? ''}` },
        body: JSON.stringify({ pending_id, decision }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || 'Decision failed');
      toast.success(decision === 'approve' ? 'Action approved and executed' : 'Action denied');
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

    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) { toast.error('Not signed in'); setStreaming(false); return; }

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/zara-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ conversation_id: convId, message: text }),
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
      abortRef.current = null;
      qc.invalidateQueries({ queryKey: ['zara-messages', convId] });
      qc.invalidateQueries({ queryKey: ['zara-actions-feed'] });
      qc.invalidateQueries({ queryKey: ['zara-pending-count'] });
    }
  };

  // Build the rendered message list grouping assistant text + adjacent tool rows
  const rendered = useMemo(() => {
    const out: Array<{ kind: 'user' | 'assistant'; id: string; text: string; tools: ToolUiState[] }> = [];
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (m.role === 'user') {
        out.push({ kind: 'user', id: m.id, text: m.content ?? '', tools: [] });
      } else if (m.role === 'assistant') {
        // Collect tool results that immediately follow assistant's tool_calls
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
        out.push({ kind: 'assistant', id: m.id, text: m.content ?? '', tools });
      }
    }
    return out;
  }, [messages, pendingByUseId]);

  return (
    <div className="flex flex-1 min-h-0 h-full -mx-4 -my-4 bg-background">
      {/* LEFT — Conversations rail */}
      <aside className="w-[240px] shrink-0 border-r border-border/60 flex flex-col min-h-0">
        <div className="p-3 border-b border-border/60 space-y-2">
          <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90" size="sm" onClick={() => newConv.mutate()}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            New conversation
          </Button>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className="h-8 pl-7 text-[12px]" />
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
              onClick={() => setActiveId(c.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                const choice = window.prompt('Action: pin | archive', 'pin');
                if (choice === 'pin') togglePin(c);
                else if (choice === 'archive') archive(c);
              }}
              className={`w-full text-left px-2.5 py-2 rounded-md transition-colors ${
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
          <Link to="/crm/zara/queue" className="flex items-center justify-between text-[12px] px-2 py-1.5 rounded-md hover:bg-muted/60 transition-colors">
            <span className="flex items-center gap-1.5"><Inbox className="w-3.5 h-3.5" />Approval queue</span>
            <span className="flex items-center gap-1">
              {pendingCount > 0 && <Pill size="sm" tone="warning">{pendingCount}</Pill>}
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
            </span>
          </Link>
          <Link to="/crm/zara/projects" className="flex items-center justify-between text-[12px] px-2 py-1.5 rounded-md hover:bg-muted/60 transition-colors">
            <span className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" />Project catalog</span>
            <ChevronRight className="w-3 h-3 text-muted-foreground" />
          </Link>
          <Link to="/crm/zara/training" className="flex items-center justify-between text-[12px] px-2 py-1.5 rounded-md hover:bg-muted/60 transition-colors">
            <span className="flex items-center gap-1.5"><Brain className="w-3.5 h-3.5" />Self-awareness</span>
            <ChevronRight className="w-3 h-3 text-muted-foreground" />
          </Link>
          <Link to="/crm/settings#zara" className="flex items-center justify-between text-[12px] px-2 py-1.5 rounded-md hover:bg-muted/60 transition-colors">
            <span>Mode</span>
            <Pill size="sm" tone={modePill.tone}>{modePill.label}</Pill>
          </Link>
        </div>
      </aside>

      {/* CENTER — Chat */}
      <section className="flex-1 min-w-0 flex flex-col">
        <header className="px-5 py-3 border-b border-border/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <h1 className="text-[15px] font-semibold tracking-tight">Zara</h1>
            <Pill size="sm" tone={modePill.tone}>{modePill.label}</Pill>
          </div>
          <span className="text-[11px] text-muted-foreground">Cmd/Ctrl+J → focus chat</span>
        </header>

        <div ref={scrollerRef} className="flex-1 min-h-0 overflow-y-auto px-5 py-6">
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
                    Ask about leads, drafts, projects, or your week. Zara drafts replies — you approve sends.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 justify-center">
                  {QUICK_ACTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => { setInput(q); setTimeout(() => inputRef.current?.focus(), 0); }}
                      className="text-[12px] px-3 py-1.5 rounded-full border border-border bg-card hover:bg-muted/60 hover:border-primary/40 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </>
            )}

            {rendered.map((m) => (
              <div key={m.id} className="group">
                <MessageBubble
                  role={m.kind}
                  text={m.text}
                  tools={m.tools}
                  messageId={m.kind === 'assistant' ? m.id : null}
                  onFeedback={m.kind === 'assistant' ? (r) => sendFeedback(m.id, r) : undefined}
                  onDecide={decide}
                  decidingId={decidingId}
                />
              </div>
            ))}

            {streaming && (
              <div className="group">
                <MessageBubble role="assistant" text={streamText} tools={streamTools} onDecide={decide} decidingId={decidingId} />
                {!streamText && streamTools.length === 0 && (
                  <div className="flex items-center gap-2 text-[12px] text-muted-foreground px-2 pt-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Thinking…
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-border/60 px-5 py-3">
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
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
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
                    Cmd/Ctrl+Enter to send · Esc to discard
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
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    onSend();
                  }
                }}
                rows={1}
                placeholder={streaming ? 'Zara is replying…' : 'Ask Zara anything…'}
                disabled={streaming}
                className="flex-1 resize-none bg-transparent outline-none text-[14px] px-2 py-1.5 min-h-[28px] max-h-[200px] disabled:opacity-60"
              />
              <button
                type="button"
                title={ptt.state === 'recording' ? 'Release to send' : 'Hold to talk'}
                onMouseDown={(e) => { e.preventDefault(); ptt.start(); }}
                onMouseUp={(e) => { e.preventDefault(); ptt.stop(); }}
                onMouseLeave={() => { if (ptt.state === 'recording') ptt.stop(); }}
                onTouchStart={(e) => { e.preventDefault(); ptt.start(); }}
                onTouchEnd={(e) => { e.preventDefault(); ptt.stop(); }}
                disabled={streaming || ptt.state === 'transcribing'}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors disabled:opacity-40 ${
                  ptt.state === 'recording'
                    ? 'bg-destructive text-destructive-foreground animate-pulse'
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
              {streaming ? (
                <Button size="sm" variant="outline" onClick={() => abortRef.current?.abort()}>Stop</Button>
              ) : (
                <Button size="sm" onClick={onSend} disabled={!input.trim()} className="bg-primary text-primary-foreground hover:bg-primary/90">
                  <Send className="w-3.5 h-3.5 mr-1" />
                  Send
                </Button>
              )}
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
