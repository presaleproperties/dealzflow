import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { ZaraPageContext } from '@/hooks/useZaraPageContext';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export type StoredMsg = {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls: any[] | null;
  tool_call_id: string | null;
  tool_name: string | null;
  tool_result: any | null;
  created_at: string;
  metadata?: any;
  page_context?: any;
  input_tokens?: number | null;
  output_tokens?: number | null;
  model?: string | null;
};

export type ToolUiState = {
  id: string; name: string;
  status: 'running' | 'done' | 'error' | 'pending' | 'denied';
  input?: any; output?: any; pending_id?: string;
};

export type StreamSources = any;

export type Conv = {
  id: string;
  title: string;
  pinned: boolean;
  archived: boolean;
  last_message_at: string | null;
  created_at: string;
  last_message_snippet?: string | null;
};

/**
 * Encapsulates the shared chat behaviour for the dock:
 * - messages for active conversation (with realtime sync)
 * - SSE send with text/tool/sources streaming
 * - pending tool calls + approve/deny
 */
export function useZaraDockChat(conversationId: string | null, pageContext: ZaraPageContext) {
  const qc = useQueryClient();

  const { data: messages = [] } = useQuery({
    queryKey: ['zara-messages', conversationId],
    enabled: !!conversationId,
    queryFn: async (): Promise<StoredMsg[]> => {
      if (!conversationId) return [];
      const { data } = await supabase
        .from('zara_messages')
        .select('id,role,content,tool_calls,tool_call_id,tool_name,tool_result,created_at,metadata,page_context,input_tokens,output_tokens,model')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });
      return (data as StoredMsg[]) ?? [];
    },
  });

  // Realtime — both dock and cockpit subscribe to the same conversation; the
  // react-query invalidation handles de-dup since rows are keyed by id.
  useEffect(() => {
    if (!conversationId) return;
    const ch = supabase
      .channel(`zara-dock-msgs-${conversationId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'zara_messages', filter: `conversation_id=eq.${conversationId}` },
        () => qc.invalidateQueries({ queryKey: ['zara-messages', conversationId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [conversationId, qc]);

  const { data: pendingRows = [] } = useQuery({
    queryKey: ['zara-pending-tool-calls', conversationId],
    enabled: !!conversationId,
    queryFn: async () => {
      if (!conversationId) return [] as any[];
      const { data } = await supabase
        .from('zara_pending_tool_calls')
        .select('id,tool_use_id,tool_name,tool_input,status,created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });
      return (data as any[]) ?? [];
    },
  });
  const pendingByUseId = useMemo(() => {
    const m = new Map<string, { pending_id: string; status: string; tool_input: any }>();
    for (const r of pendingRows) m.set(r.tool_use_id, { pending_id: r.id, status: r.status, tool_input: r.tool_input });
    return m;
  }, [pendingRows]);

  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [streamTools, setStreamTools] = useState<ToolUiState[]>([]);
  const [streamSources, setStreamSources] = useState<StreamSources>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const send = useCallback(async (text: string, convIdOverride?: string | null, opts?: { replyMode?: 'normal' | 'action' }) => {
    const trimmed = text.trim();
    const convId = convIdOverride ?? conversationId;
    if (!trimmed || streaming || !convId) return;

    setStreaming(true);
    setStreamText('');
    setStreamTools([]);
    setStreamSources(null);

    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) { setStreaming(false); toast.error('Not signed in'); return; }

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/zara-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          conversation_id: convId,
          message: trimmed,
          page_context: pageContext,
          reply_mode: opts?.replyMode ?? 'normal',
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
          let ev = 'message'; let data = '';
          for (const l of evt.split('\n')) {
            if (l.startsWith('event:')) ev = l.slice(6).trim();
            else if (l.startsWith('data:')) data += l.slice(5).trim();
          }
          if (!data) continue;
          let payload: any; try { payload = JSON.parse(data); } catch { continue; }
          if (ev === 'text') setStreamText((s) => s + payload.delta);
          else if (ev === 'tool_start') setStreamTools((arr) => [...arr, { id: payload.id, name: payload.name, status: 'running', input: payload.input }]);
          else if (ev === 'tool_result') setStreamTools((arr) => arr.map((t) => t.id === payload.id
            ? { ...t, status: payload.output?.ok === false ? 'error' : 'done', output: payload.output } : t));
          else if (ev === 'tool_pending') {
            setStreamTools((arr) => [...arr, { id: payload.id, name: payload.name, status: 'pending', input: payload.input, pending_id: payload.pending_id }]);
            qc.invalidateQueries({ queryKey: ['zara-pending-tool-calls', convId] });
          } else if (ev === 'title') qc.invalidateQueries({ queryKey: ['zara-conversations'] });
          else if (ev === 'sources') setStreamSources(payload);
          else if (ev === 'warning') toast.warning(payload.message ?? 'Zara warning');
          else if (ev === 'error') toast.error(payload.message ?? 'Stream error');
          else if (ev === 'done') qc.invalidateQueries({ queryKey: ['zara-messages', convId] });
        }
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') toast.error(e.message ?? 'Send failed');
    } finally {
      setStreaming(false); setStreamText(''); setStreamTools([]); setStreamSources(null);
      abortRef.current = null;
      qc.invalidateQueries({ queryKey: ['zara-messages', convId] });
      qc.invalidateQueries({ queryKey: ['zara-conversations'] });
      qc.invalidateQueries({ queryKey: ['zara-pending-count'] });
    }
  }, [conversationId, pageContext, streaming, qc]);

  const [decidingId, setDecidingId] = useState<string | null>(null);
  const decide = useCallback(async (pending_id: string, decision: 'approve' | 'deny') => {
    setDecidingId(pending_id);
    try {
      const { data: u } = await supabase.auth.getSession();
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/zara-tool-approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u.session?.access_token ?? ''}` },
        body: JSON.stringify({ pending_id, decision }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || 'Decision failed');
      toast.success(decision === 'approve' ? 'Action approved' : 'Action denied');
      qc.invalidateQueries({ queryKey: ['zara-pending-tool-calls', conversationId] });
      qc.invalidateQueries({ queryKey: ['zara-messages', conversationId] });
    } catch (e: any) {
      toast.error(e.message ?? 'Decision failed');
    } finally { setDecidingId(null); }
  }, [conversationId, qc]);

  // Build a rendered list with tool pills attached to their assistant message.
  const rendered = useMemo(() => {
    const out: Array<{
      kind: 'user' | 'assistant';
      id: string; text: string;
      tools: ToolUiState[];
      sources?: any;
      page_context?: any;
      created_at: string;
      tokens?: { input?: number | null; output?: number | null; model?: string | null };
      referencedContactIds?: string[];
      referencedProjectIds?: string[];
    }> = [];
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (m.role === 'user') {
        out.push({ kind: 'user', id: m.id, text: m.content ?? '', tools: [], created_at: m.created_at, page_context: m.page_context });
      } else if (m.role === 'assistant') {
        const toolUses = (m.tool_calls ?? []) as Array<{ id: string; name: string; input: any }>;
        const tools: ToolUiState[] = toolUses.map((tu) => {
          const result = messages.find((x) => x.role === 'tool' && x.tool_call_id === tu.id);
          const pend = pendingByUseId.get(tu.id);
          const isPending = pend?.status === 'pending';
          const isDenied = pend?.status === 'denied';
          return {
            id: tu.id, name: tu.name,
            status: isPending ? 'pending' : isDenied ? 'denied' : result ? (result.tool_result?.ok === false ? 'error' : 'done') : 'done',
            input: tu.input, output: result?.tool_result,
            pending_id: isPending ? pend?.pending_id : undefined,
          };
        });
        out.push({
          kind: 'assistant', id: m.id, text: m.content ?? '',
          tools,
          sources: (m as any).metadata?.consulted_sources ?? null,
          created_at: m.created_at,
          tokens: { input: m.input_tokens, output: m.output_tokens, model: m.model },
          referencedContactIds: (m as any).metadata?.referenced_contact_ids ?? [],
          referencedProjectIds: (m as any).metadata?.referenced_project_ids ?? [],
        });
      }
    }
    return out;
  }, [messages, pendingByUseId]);

  return { messages, rendered, send, stop, streaming, streamText, streamTools, streamSources, decide, decidingId };
}

/** Lightweight conversation CRUD shared by the overlay. */
export function useZaraConversations() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['zara-conversations'],
    queryFn: async (): Promise<Conv[]> => {
      const { data } = await supabase
        .from('zara_conversations')
        .select('id,title,pinned,archived,last_message_at,created_at,last_message_snippet')
        .order('pinned', { ascending: false })
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(200);
      return (data as Conv[]) ?? [];
    },
    // Throttle re-renders: while the dock streams, last_message_at thrashes.
    // Keep prior data visible so the overlay doesn't blank out, and dedupe
    // refetches inside a short window.
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
  // Debounce realtime invalidations so streaming bursts don't refetch on every
  // assistant token (each token can update last_message_at via triggers).
  useEffect(() => {
    let pending = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (pending) return;
      pending = true;
      timer = setTimeout(() => {
        pending = false;
        qc.invalidateQueries({ queryKey: ['zara-conversations'] });
      }, 1500);
    };
    const ch = supabase
      .channel('zara-dock-convs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'zara_conversations' }, schedule)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const create = async (): Promise<Conv | null> => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { toast.error('Not signed in'); return null; }
    const { data, error } = await supabase.from('zara_conversations')
      .insert({ user_id: u.user.id, title: 'New conversation' }).select().single();
    if (error) { toast.error(error.message); return null; }
    qc.invalidateQueries({ queryKey: ['zara-conversations'] });
    return data as Conv;
  };
  const togglePin = async (c: Conv) => {
    await supabase.from('zara_conversations').update({ pinned: !c.pinned }).eq('id', c.id);
    qc.invalidateQueries({ queryKey: ['zara-conversations'] });
  };
  const rename = async (c: Conv, title: string) => {
    const t = title.trim();
    if (!t) return;
    await supabase.from('zara_conversations').update({ title: t }).eq('id', c.id);
    qc.invalidateQueries({ queryKey: ['zara-conversations'] });
  };
  const archive = async (c: Conv) => {
    await supabase.from('zara_conversations').update({ archived: !c.archived }).eq('id', c.id);
    qc.invalidateQueries({ queryKey: ['zara-conversations'] });
  };
  const remove = async (c: Conv) => {
    await supabase.from('zara_conversations').delete().eq('id', c.id);
    qc.invalidateQueries({ queryKey: ['zara-conversations'] });
  };

  return { ...query, create, togglePin, rename, archive, remove };
}
