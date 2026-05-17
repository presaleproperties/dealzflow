import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pill } from '@/components/crm/shared/Pill';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { Plus, Pin, Archive, Search, Send, Mic, Sparkles, Inbox, ChevronRight, Activity as ActivityIcon } from 'lucide-react';

type Conv = {
  id: string;
  title: string;
  pinned: boolean;
  archived: boolean;
  last_message_at: string | null;
  created_at: string;
};

type ActionRow = {
  id: string;
  action: string;
  tool_name: string | null;
  contact_id: string | null;
  result_summary: string | null;
  occurred_at: string;
};

const QUICK_ACTIONS = [
  'Morning briefing',
  'Show me cold leads',
  "What needs my attention?",
  'Which projects fit my top hot lead?',
  'How are you doing this week?',
  'Where are you weak?',
];

export default function ZaraCockpitPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Focus input on mount + when global shortcut fires
  useEffect(() => {
    inputRef.current?.focus();
    const handler = () => inputRef.current?.focus();
    window.addEventListener('zara:focus-input', handler);
    return () => window.removeEventListener('zara:focus-input', handler);
  }, []);

  // Settings → mode pill
  const { data: settings } = useQuery({
    queryKey: ['zara-settings'],
    queryFn: async () => {
      const { data } = await supabase
        .from('zara_settings')
        .select('mode')
        .eq('id', 1)
        .maybeSingle();
      return (data as { mode: 'off' | 'sandbox' | 'live' } | null) ?? { mode: 'sandbox' as const };
    },
  });

  // Pending draft count → queue link badge
  const { data: pendingCount = 0 } = useQuery({
    queryKey: ['zara-pending-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('zara_suggested_replies')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      return count ?? 0;
    },
    refetchInterval: 15_000,
  });

  // Conversations
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

  // Realtime conversations refresh
  useEffect(() => {
    const ch = supabase
      .channel('zara-cockpit-conv')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'zara_conversations' }, () => {
        qc.invalidateQueries({ queryKey: ['zara-conversations'] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const filteredConvs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, search]);

  // New conversation
  const newConv = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error('Not signed in');
      const { data, error } = await supabase
        .from('zara_conversations')
        .insert({ user_id: u.user.id, title: 'New conversation' })
        .select()
        .single();
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

  // Pin / archive / rename
  const togglePin = async (c: Conv) => {
    await supabase.from('zara_conversations').update({ pinned: !c.pinned }).eq('id', c.id);
    qc.invalidateQueries({ queryKey: ['zara-conversations'] });
  };
  const archive = async (c: Conv) => {
    await supabase.from('zara_conversations').update({ archived: true }).eq('id', c.id);
    if (activeId === c.id) setActiveId(null);
    qc.invalidateQueries({ queryKey: ['zara-conversations'] });
  };
  const rename = async (c: Conv) => {
    const next = prompt('Rename conversation', c.title);
    if (!next || next === c.title) return;
    await supabase.from('zara_conversations').update({ title: next }).eq('id', c.id);
    qc.invalidateQueries({ queryKey: ['zara-conversations'] });
  };

  // Live activity feed
  const { data: actions = [] } = useQuery({
    queryKey: ['zara-actions-feed'],
    queryFn: async (): Promise<ActionRow[]> => {
      const { data } = await supabase
        .from('zara_actions_log')
        .select('id, action, tool_name, contact_id, result_summary, occurred_at')
        .order('occurred_at', { ascending: false })
        .limit(15);
      return (data as ActionRow[]) ?? [];
    },
  });
  useEffect(() => {
    const ch = supabase
      .channel('zara-cockpit-actions')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'zara_actions_log' }, () => {
        qc.invalidateQueries({ queryKey: ['zara-actions-feed'] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const modePill = (() => {
    const m = settings?.mode ?? 'sandbox';
    if (m === 'off') return { label: 'Off', tone: 'muted' as const };
    if (m === 'sandbox') return { label: 'Sandbox', tone: 'warning' as const };
    return { label: 'LIVE', tone: 'success' as const };
  })();

  const onSend = async () => {
    const text = input.trim();
    if (!text) return;
    if (settings?.mode === 'off') {
      toast.error('Zara is currently off. Enable her in /crm/settings.');
      return;
    }
    // Phase 2 will wire SSE streaming; for now stage a conversation + user message.
    let convId = activeId;
    if (!convId) {
      const created = await newConv.mutateAsync();
      convId = created.id;
    }
    toast.info("Zara's brain ships in phase 2 — message captured");
    setInput('');
  };

  return (
    <div className="flex flex-1 min-h-0 h-full -mx-4 -my-4 bg-background">
      {/* LEFT — Conversations rail */}
      <aside className="w-[240px] shrink-0 border-r border-border/60 flex flex-col min-h-0">
        <div className="p-3 border-b border-border/60 space-y-2">
          <Button
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            size="sm"
            onClick={() => newConv.mutate()}
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            New conversation
          </Button>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search"
              className="h-8 pl-7 text-[12px]"
            />
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
                const choice = window.prompt('Action: pin | archive | rename', 'rename');
                if (choice === 'pin') togglePin(c);
                else if (choice === 'archive') archive(c);
                else if (choice === 'rename') rename(c);
              }}
              className={`w-full text-left px-2.5 py-2 rounded-md transition-colors group ${
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
          <Link
            to="/crm/zara/queue"
            className="flex items-center justify-between text-[12px] px-2 py-1.5 rounded-md hover:bg-muted/60 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <Inbox className="w-3.5 h-3.5" />
              Approval queue
            </span>
            <span className="flex items-center gap-1">
              {pendingCount > 0 && <Pill size="sm" tone="warning">{pendingCount}</Pill>}
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
            </span>
          </Link>
          <Link
            to="/crm/settings#zara"
            className="flex items-center justify-between text-[12px] px-2 py-1.5 rounded-md hover:bg-muted/60 transition-colors"
          >
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
          <span className="text-[11px] text-muted-foreground">Cmd/Ctrl+J anywhere → focus chat</span>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-6">
          <div className="max-w-2xl mx-auto space-y-6">
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
                  onClick={() => {
                    setInput(q);
                    setTimeout(() => inputRef.current?.focus(), 0);
                  }}
                  className="text-[12px] px-3 py-1.5 rounded-full border border-border bg-card hover:bg-muted/60 hover:border-primary/40 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-border/60 px-5 py-3">
          <div className="max-w-2xl mx-auto">
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
                placeholder="Ask Zara anything…"
                className="flex-1 resize-none bg-transparent outline-none text-[14px] px-2 py-1.5 min-h-[28px] max-h-[200px]"
              />
              <button
                type="button"
                title="Voice input (Phase 2)"
                disabled
                className="w-8 h-8 rounded-lg text-muted-foreground hover:bg-muted/60 flex items-center justify-center disabled:opacity-40"
              >
                <Mic className="w-4 h-4" />
              </button>
              <Button
                size="sm"
                onClick={onSend}
                disabled={!input.trim()}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Send className="w-3.5 h-3.5 mr-1" />
                Send
              </Button>
            </div>
            <div className="mt-2 text-center text-[10.5px] text-muted-foreground">
              <Link to="/crm/zara/about" className="hover:text-foreground transition-colors">
                Zara status · Phase 1 shell · brain ships next
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
            <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
              Zara today
            </div>
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
            <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-semibold mb-2 px-1">
              Live feed
            </div>
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
    </div>
  );
}
