// /crm/zara/training-chat — internal admin-only "Train Zara" interface.
// Allows Uzair to chat with Zara, give per-message feedback, save winning/bad responses,
// trigger scenario drills, propose prompt updates, and answer Ask-Uzair questions.
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Pill } from "@/components/crm/shared/Pill";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import ReactMarkdown from "react-markdown";
import {
  Plus, Send, Sparkles, MessageSquare, Bookmark, ThumbsDown, CheckCircle2,
  XCircle, AlertCircle, Loader2, Wand2, Trash2, Library, HelpCircle,
} from "lucide-react";
import { useKeyboardInset } from "@/hooks/useKeyboardInset";

// ─────────────────────────────────────────────────────────
type Session = {
  id: string;
  title: string;
  scenario_kind: string | null;
  message_count: number;
  last_message_at: string;
  created_at: string;
};

type Msg = {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  scenario_kind: string | null;
  feedback_kind: string | null;
  feedback_note: string | null;
  ask_uzair: boolean;
  meta: any;
  created_at: string;
};

type PromptUpdate = {
  id: string;
  kind: "addendum" | "rule_change" | "ask_uzair";
  proposal: string;
  rationale: string | null;
  status: "pending" | "approved" | "rejected" | "archived";
  created_at: string;
};

const SCENARIOS: { key: string; label: string }[] = [
  { key: "new_lead", label: "New lead" },
  { key: "floor_plan_download", label: "Floor plan download" },
  { key: "no_response", label: "No response" },
  { key: "investor_lead", label: "Investor lead" },
  { key: "first_time_buyer", label: "First-time buyer" },
  { key: "assignment_buyer", label: "Assignment buyer" },
  { key: "cold_reactivation", label: "Cold lead reactivation" },
  { key: "appointment_no_show", label: "Appointment no-show" },
  { key: "project_comparison", label: "Project comparison" },
  { key: "pricing_objection", label: "Pricing objection" },
  { key: "nervous_buyer", label: "Nervous buyer" },
  { key: "best_unit_ask", label: "Buyer asking for best unit" },
];

const FEEDBACK_BUTTONS: { kind: string; label: string; tone: "good" | "bad" | "save" }[] = [
  { kind: "sounds_like_uzair", label: "Sounds like Uzair", tone: "good" },
  { kind: "too_robotic", label: "Too robotic", tone: "bad" },
  { kind: "too_pushy", label: "Too pushy", tone: "bad" },
  { kind: "too_long", label: "Too long", tone: "bad" },
  { kind: "too_soft", label: "Too soft", tone: "bad" },
  { kind: "too_generic", label: "Too generic", tone: "bad" },
  { kind: "wrong_strategy", label: "Wrong strategy", tone: "bad" },
  { kind: "needs_uzair", label: "Needs Uzair", tone: "bad" },
  { kind: "save_as_winning", label: "Save as winning", tone: "save" },
  { kind: "save_as_bad", label: "Save as bad", tone: "save" },
];

// ─────────────────────────────────────────────────────────
export default function ZaraTrainingChatPage() {
  const navigate = useNavigate();
  const { sessionId: routeSessionId } = useParams<{ sessionId?: string }>();
  const qc = useQueryClient();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(routeSessionId ?? null);
  const [composer, setComposer] = useState("");
  const [pendingFeedbackFor, setPendingFeedbackFor] = useState<{ messageId: string; kind: string; saveAs?: "winning" | "bad" } | null>(null);
  const [feedbackNote, setFeedbackNote] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActiveSessionId(routeSessionId ?? null);
  }, [routeSessionId]);

  // Sessions list
  const sessionsQ = useQuery({
    queryKey: ["zara-training-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("zara_training_sessions")
        .select("*")
        .order("last_message_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Session[];
    },
  });

  // Messages for active session
  const messagesQ = useQuery({
    queryKey: ["zara-training-messages", activeSessionId],
    enabled: !!activeSessionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("zara_training_messages")
        .select("*")
        .eq("session_id", activeSessionId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Msg[];
    },
  });

  // Pending prompt updates
  const promptUpdatesQ = useQuery({
    queryKey: ["zara-prompt-updates", "pending"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("zara_prompt_updates")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as PromptUpdate[];
    },
  });

  // Scroll to bottom on new message
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messagesQ.data?.length]);

  // ── Mutations
  const sendMut = useMutation({
    mutationFn: async (args: { message?: string; scenarioKind?: string; title?: string; sessionIdOverride?: string | null }) => {
      const { data, error } = await supabase.functions.invoke("zara-training-chat", {
        body: {
          sessionId: args.sessionIdOverride ?? activeSessionId ?? undefined,
          message: args.message ?? "",
          scenarioKind: args.scenarioKind,
          title: args.title,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).detail || (data as any).error);
      return data as { sessionId: string; assistantMessageId: string; content: string; askUzair: boolean };
    },
    onSuccess: (data, vars) => {
      qc.invalidateQueries({ queryKey: ["zara-training-sessions"] });
      qc.invalidateQueries({ queryKey: ["zara-training-messages", data.sessionId] });
      qc.invalidateQueries({ queryKey: ["zara-prompt-updates", "pending"] });
      if (!activeSessionId || activeSessionId !== data.sessionId) {
        setActiveSessionId(data.sessionId);
        navigate(`/crm/zara/training-chat/${data.sessionId}`, { replace: true });
      }
      setComposer("");
    },
    onError: (e: any) => toast.error(e?.message || "Send failed"),
  });

  const feedbackMut = useMutation({
    mutationFn: async (args: { messageId: string; kind: string; note?: string; saveAs?: "winning" | "bad" }) => {
      const { data, error } = await supabase.functions.invoke("zara-training-feedback", {
        body: args,
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).detail || (data as any).error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["zara-training-messages", activeSessionId] });
      toast.success("Feedback saved");
    },
    onError: (e: any) => toast.error(e?.message || "Feedback failed"),
  });

  const proposeMut = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("zara-propose-prompt-update", { body: {} });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).detail || (data as any).error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["zara-prompt-updates", "pending"] });
      toast.success("Prompt update proposed");
    },
    onError: (e: any) => toast.error(e?.message || "Propose failed"),
  });

  const reviewPromptMut = useMutation({
    mutationFn: async (args: { id: string; status: "approved" | "rejected"; note?: string }) => {
      const { error } = await supabase
        .from("zara_prompt_updates")
        .update({ status: args.status, review_note: args.note ?? null, reviewed_at: new Date().toISOString() })
        .eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["zara-prompt-updates", "pending"] });
      toast.success("Updated");
    },
  });

  const deleteSessionMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("zara_training_sessions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["zara-training-sessions"] });
      if (activeSessionId === id) {
        setActiveSessionId(null);
        navigate("/crm/zara/training-chat", { replace: true });
      }
    },
  });

  const onSubmitFeedback = () => {
    if (!pendingFeedbackFor) return;
    feedbackMut.mutate({
      messageId: pendingFeedbackFor.messageId,
      kind: pendingFeedbackFor.kind,
      note: feedbackNote.trim() || undefined,
      saveAs: pendingFeedbackFor.saveAs,
    });
    setPendingFeedbackFor(null);
    setFeedbackNote("");
  };

  const messages = messagesQ.data ?? [];

  return (
    <div className="flex h-[calc(100dvh-var(--crm-header-h,3.5rem))] w-full overflow-hidden bg-background">
      {/* LEFT RAIL: sessions + scenarios */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-border/40 bg-card/30">
        <div className="p-3 border-b border-border/40">
          <Button
            size="sm"
            className="w-full"
            onClick={() => {
              setActiveSessionId(null);
              navigate("/crm/zara/training-chat");
            }}
          >
            <Plus className="h-4 w-4 mr-1" /> New session
          </Button>
        </div>

        <div className="px-3 pt-3 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Scenario drills</div>
        <ScrollArea className="max-h-56 px-2">
          <div className="flex flex-col gap-1 pb-2">
            {SCENARIOS.map((s) => (
              <button
                key={s.key}
                className="text-left text-xs px-2 py-1.5 rounded hover:bg-accent text-foreground/80"
                onClick={() => sendMut.mutate({ scenarioKind: s.key, sessionIdOverride: null, title: `Drill: ${s.label}` })}
                disabled={sendMut.isPending}
              >
                {s.label}
              </button>
            ))}
          </div>
        </ScrollArea>

        <div className="px-3 pt-3 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Recent sessions</div>
        <ScrollArea className="flex-1 px-2">
          <div className="flex flex-col gap-1 pb-3">
            {(sessionsQ.data ?? []).map((s) => (
              <div
                key={s.id}
                className={`group flex items-center gap-1 rounded px-2 py-1.5 text-xs cursor-pointer ${
                  activeSessionId === s.id ? "bg-accent text-foreground" : "hover:bg-accent/50 text-foreground/80"
                }`}
                onClick={() => {
                  setActiveSessionId(s.id);
                  navigate(`/crm/zara/training-chat/${s.id}`);
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="truncate">{s.title}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {s.message_count} msgs · {formatDistanceToNow(new Date(s.last_message_at), { addSuffix: true })}
                  </div>
                </div>
                <button
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm("Delete this training session?")) deleteSessionMut.mutate(s.id);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
            {sessionsQ.data?.length === 0 && (
              <div className="px-2 py-3 text-xs text-muted-foreground">No sessions yet — start a scenario drill above.</div>
            )}
          </div>
        </ScrollArea>
      </aside>

      {/* CENTER: chat */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between px-4 py-3 border-b border-border/40">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="h-4 w-4 text-primary shrink-0" />
            <h1 className="text-sm font-semibold truncate">Train Zara</h1>
            <span className="text-xs text-muted-foreground hidden sm:inline">Internal · admin-only</span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => proposeMut.mutate()} disabled={proposeMut.isPending}>
              {proposeMut.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Wand2 className="h-3 w-3 mr-1" />}
              Propose prompt update
            </Button>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
          {!activeSessionId && (
            <EmptyState onPickScenario={(key, label) => sendMut.mutate({ scenarioKind: key, title: `Drill: ${label}`, sessionIdOverride: null })} />
          )}

          {activeSessionId && messages.length === 0 && messagesQ.isLoading && (
            <div className="text-sm text-muted-foreground">Loading…</div>
          )}

          <div className="flex flex-col gap-4 max-w-3xl mx-auto">
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                msg={m}
                onFeedback={(kind, saveAs) => {
                  // Buttons that need a note: bad / save / wrong_strategy / needs_uzair
                  const needsNote = ["save_as_winning", "save_as_bad", "wrong_strategy", "needs_uzair"].includes(kind);
                  if (needsNote || saveAs) {
                    setPendingFeedbackFor({ messageId: m.id, kind, saveAs });
                    setFeedbackNote("");
                  } else {
                    feedbackMut.mutate({ messageId: m.id, kind });
                  }
                }}
              />
            ))}

            {sendMut.isPending && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Zara is thinking…
              </div>
            )}
          </div>
        </div>

        {/* COMPOSER */}
        <div className="border-t border-border/40 p-3">
          <div className="max-w-3xl mx-auto flex gap-2">
            <Textarea
              value={composer}
              onChange={(e) => setComposer(e.target.value)}
              placeholder={activeSessionId ? "Reply to Zara… (Enter to send, Shift+Enter for newline)" : "Type to start a new session, or pick a scenario drill →"}
              className="min-h-[60px] resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  if (composer.trim()) sendMut.mutate({ message: composer.trim() });
                }
              }}
            />
            <Button
              size="sm"
              onClick={() => composer.trim() && sendMut.mutate({ message: composer.trim() })}
              disabled={!composer.trim() || sendMut.isPending}
              className="self-end"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </main>

      {/* RIGHT RAIL: pending prompt updates / ask-uzair queue */}
      <aside className="hidden lg:flex w-80 shrink-0 flex-col border-l border-border/40 bg-card/30">
        <div className="px-3 py-3 border-b border-border/40 flex items-center gap-2">
          <Library className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Pending review</span>
        </div>
        <ScrollArea className="flex-1 px-3 py-3">
          <div className="flex flex-col gap-3">
            {(promptUpdatesQ.data ?? []).map((pu) => (
              <div key={pu.id} className="rounded border border-border/60 p-3 text-xs bg-background">
                <div className="flex items-center gap-1 mb-1">
                  <Pill tone={pu.kind === "ask_uzair" ? "warning" : "neutral"} size="sm">
                    {pu.kind === "ask_uzair" ? "Ask Uzair" : pu.kind}
                  </Pill>
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {formatDistanceToNow(new Date(pu.created_at), { addSuffix: true })}
                  </span>
                </div>
                <div className="whitespace-pre-wrap text-foreground/90">{pu.proposal}</div>
                {pu.rationale && <div className="mt-1 text-[11px] text-muted-foreground">{pu.rationale}</div>}
                <div className="mt-2 flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => reviewPromptMut.mutate({ id: pu.id, status: "approved" })}
                  >
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px] text-muted-foreground"
                    onClick={() => reviewPromptMut.mutate({ id: pu.id, status: "rejected" })}
                  >
                    <XCircle className="h-3 w-3 mr-1" /> Reject
                  </Button>
                </div>
              </div>
            ))}
            {promptUpdatesQ.data?.length === 0 && (
              <div className="text-xs text-muted-foreground">Nothing pending. Use "Propose prompt update" to summarize recent feedback.</div>
            )}
          </div>
        </ScrollArea>
      </aside>

      {/* Feedback note dialog */}
      <Dialog open={!!pendingFeedbackFor} onOpenChange={(open) => !open && setPendingFeedbackFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {pendingFeedbackFor?.saveAs === "winning"
                ? "Save as winning response"
                : pendingFeedbackFor?.saveAs === "bad"
                ? "Save as bad response"
                : `Feedback: ${pendingFeedbackFor?.kind?.replace(/_/g, " ")}`}
            </DialogTitle>
          </DialogHeader>
          <Textarea
            value={feedbackNote}
            onChange={(e) => setFeedbackNote(e.target.value)}
            placeholder={
              pendingFeedbackFor?.saveAs === "winning"
                ? "Why does this work? (optional)"
                : pendingFeedbackFor?.saveAs === "bad"
                ? "What's wrong with it?"
                : "Anything Zara should remember? (optional)"
            }
            className="min-h-[100px]"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingFeedbackFor(null)}>Cancel</Button>
            <Button onClick={onSubmitFeedback} disabled={feedbackMut.isPending}>
              {feedbackMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
function EmptyState({ onPickScenario }: { onPickScenario: (key: string, label: string) => void }) {
  return (
    <div className="max-w-2xl mx-auto py-12 text-center">
      <Sparkles className="h-8 w-8 mx-auto text-primary mb-3" />
      <h2 className="text-lg font-semibold">Train Zara on your voice</h2>
      <p className="text-sm text-muted-foreground mt-1">
        Pick a scenario and Zara will simulate a lead message, then ask how you'd handle it. Rate her drafts and she'll learn.
      </p>
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-2 max-w-xl mx-auto">
        {SCENARIOS.map((s) => (
          <Button
            key={s.key}
            variant="outline"
            size="sm"
            className="justify-start text-xs"
            onClick={() => onPickScenario(s.key, s.label)}
          >
            <MessageSquare className="h-3 w-3 mr-1.5" />
            {s.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
function MessageBubble({
  msg,
  onFeedback,
}: {
  msg: Msg;
  onFeedback: (kind: string, saveAs?: "winning" | "bad") => void;
}) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] ${isUser ? "" : "w-full"}`}>
        {!isUser && msg.meta?.scenario_lead_message && (
          <div className="mb-2 rounded border-l-2 border-primary/50 bg-primary/5 px-3 py-2 text-xs">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Simulated lead</div>
            <div className="whitespace-pre-wrap text-foreground/90">{msg.meta.scenario_lead_message}</div>
          </div>
        )}

        <div
          className={`rounded-lg px-3.5 py-2.5 text-sm ${
            isUser ? "bg-primary text-primary-foreground" : "bg-card border border-border/60"
          }`}
        >
          {isUser ? (
            <div className="whitespace-pre-wrap">{msg.content}</div>
          ) : (
            <div className="prose prose-sm prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1">
              <ReactMarkdown>{msg.content}</ReactMarkdown>
            </div>
          )}
        </div>

        {!isUser && msg.ask_uzair && msg.meta?.ask_uzair_question && (
          <div className="mt-1 flex items-start gap-1 text-xs text-amber-600 dark:text-amber-400">
            <HelpCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>Ask Uzair: {msg.meta.ask_uzair_question}</span>
          </div>
        )}

        {!isUser && (
          <div className="mt-2 flex flex-wrap gap-1">
            {FEEDBACK_BUTTONS.map((b) => {
              const active = msg.feedback_kind === b.kind;
              const isSave = b.tone === "save";
              const isGood = b.tone === "good";
              return (
                <button
                  key={b.kind}
                  onClick={() => onFeedback(b.kind, b.kind === "save_as_winning" ? "winning" : b.kind === "save_as_bad" ? "bad" : undefined)}
                  className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                    active
                      ? isGood
                        ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                        : isSave
                        ? "bg-primary/15 border-primary/40 text-primary"
                        : "bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300"
                      : "border-border/60 text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {isSave && <Bookmark className="h-2.5 w-2.5 inline mr-0.5" />}
                  {isGood && <CheckCircle2 className="h-2.5 w-2.5 inline mr-0.5" />}
                  {!isSave && !isGood && <ThumbsDown className="h-2.5 w-2.5 inline mr-0.5" />}
                  {b.label}
                </button>
              );
            })}
          </div>
        )}

        {msg.feedback_note && (
          <div className="mt-1 text-[11px] text-muted-foreground italic">Note: {msg.feedback_note}</div>
        )}
      </div>
    </div>
  );
}
