// /crm/zara/founder — Founder Intelligence System (Uzair Memory Engine).
// Admin-only. 4 tabs: Modules & Principles, Teach Zara, Real Conversations, Lessons.
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Pill } from "@/components/crm/shared/Pill";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { Plus, Send, Sparkles, Loader2, Upload, BookOpen, Brain, MessageSquare, FileText, Trash2, Check } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const sb = supabase as any;

type Module = { id: string; slug: string; name: string; description: string | null; sort_order: number };
type Principle = {
  id: string; module_id: string; title: string; body: string; examples: string[]; tags: string[];
  weight: number; active: boolean; created_at: string;
};
type TeachMsg = {
  id: string; session_id: string; role: "user" | "assistant"; content: string; meta: any; created_at: string;
};
type Convo = {
  id: string; title: string; channel: string; outcome: string | null; lead_persona: string | null;
  emotional_state: string | null; tags: string[]; analyzed_at: string | null; created_at: string; transcript: string; analysis: any;
};
type Lesson = {
  id: string; module_id: string | null; summary: string; detail: string | null; tags: string[];
  source_kind: string; source_id: string | null; promoted_principle_id: string | null; created_at: string;
};

const CHANNELS = ["sms", "ig_dm", "fb_messenger", "email", "whatsapp", "call_notes", "other"];
const OUTCOMES = ["booked_appointment", "reply_recovered", "ghost_recovered", "objection_handled", "nurture", "lost"];
const PERSONAS = ["investor", "end_user", "first_time", "family", "assignment", "downsizer", "other"];

export default function ZaraFounderPage() {
  const qc = useQueryClient();

  const { data: modules = [] } = useQuery({
    queryKey: ["founder-modules"],
    queryFn: async () => {
      const { data, error } = await sb.from("zara_founder_modules").select("*").order("sort_order");
      if (error) throw error;
      return data as Module[];
    },
  });

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-[1400px] mx-auto">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">Founder Intelligence</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Uzair Memory Engine — teach Zara how you think, communicate, qualify, calm, and build trust with presale buyers.
        </p>
      </header>

      <Tabs defaultValue="modules" className="w-full">
        <TabsList>
          <TabsTrigger value="modules"><BookOpen className="h-4 w-4 mr-1.5" />Modules</TabsTrigger>
          <TabsTrigger value="teach"><Brain className="h-4 w-4 mr-1.5" />Teach Zara</TabsTrigger>
          <TabsTrigger value="conversations"><MessageSquare className="h-4 w-4 mr-1.5" />Real Conversations</TabsTrigger>
          <TabsTrigger value="lessons"><FileText className="h-4 w-4 mr-1.5" />Lessons</TabsTrigger>
        </TabsList>

        <TabsContent value="modules" className="mt-4"><ModulesPane modules={modules} /></TabsContent>
        <TabsContent value="teach" className="mt-4"><TeachPane modules={modules} /></TabsContent>
        <TabsContent value="conversations" className="mt-4"><ConversationsPane /></TabsContent>
        <TabsContent value="lessons" className="mt-4"><LessonsPane modules={modules} /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ────────────── MODULES + PRINCIPLES ────────────── */
function ModulesPane({ modules }: { modules: Module[] }) {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => { if (!active && modules.length) setActive(modules[0].id); }, [modules, active]);

  return (
    <div className="grid grid-cols-12 gap-4">
      <aside className="col-span-12 md:col-span-4 lg:col-span-3 border rounded-lg p-2 bg-card/30">
        <ScrollArea className="h-[70vh]">
          <ul className="space-y-1">
            {modules.map((m) => (
              <li key={m.id}>
                <button
                  onClick={() => setActive(m.id)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition ${
                    active === m.id ? "bg-primary/10 text-foreground" : "hover:bg-muted/50 text-muted-foreground"
                  }`}
                >
                  <div className="font-medium text-foreground">{m.name}</div>
                  {m.description && <div className="text-[11px] mt-0.5 line-clamp-2">{m.description}</div>}
                </button>
              </li>
            ))}
          </ul>
        </ScrollArea>
      </aside>

      <main className="col-span-12 md:col-span-8 lg:col-span-9">
        {active && <ModulePrinciples module={modules.find((m) => m.id === active)!} />}
      </main>
    </div>
  );
}

function ModulePrinciples({ module: mod }: { module: Module }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: principles = [], isLoading } = useQuery({
    queryKey: ["founder-principles", mod.id],
    queryFn: async () => {
      const { data, error } = await sb.from("zara_founder_principles")
        .select("*").eq("module_id", mod.id).order("active", { ascending: false }).order("weight", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw error;
      return data as Principle[];
    },
  });

  const toggleActive = useMutation({
    mutationFn: async (p: Principle) => {
      const { error } = await sb.from("zara_founder_principles").update({ active: !p.active }).eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["founder-principles", mod.id] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("zara_founder_principles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["founder-principles", mod.id] }); },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-lg font-semibold">{mod.name}</h2>
          {mod.description && <p className="text-sm text-muted-foreground">{mod.description}</p>}
        </div>
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" />Add principle</Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : principles.length === 0 ? (
        <div className="text-sm text-muted-foreground border rounded-md p-6 text-center">
          No principles yet. Add one or use the Teach Zara tab to capture them naturally.
        </div>
      ) : (
        <ul className="space-y-3">
          {principles.map((p) => (
            <li key={p.id} className={`border rounded-lg p-4 ${p.active ? "" : "opacity-60"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-medium text-[15px]">{p.title}</h3>
                    <Pill tone="muted" size="sm">w{p.weight}</Pill>
                    {!p.active && <Pill tone="muted" size="sm">inactive</Pill>}
                  </div>
                  <p className="text-sm mt-1.5 text-muted-foreground">{p.body}</p>
                  {p.examples?.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {p.examples.map((ex, i) => (
                        <li key={i} className="text-[13px] italic text-foreground/80 border-l-2 border-primary/40 pl-2">"{ex}"</li>
                      ))}
                    </ul>
                  )}
                  {p.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {p.tags.map((t) => <Pill key={t} tone="muted" size="sm">{t}</Pill>)}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => toggleActive.mutate(p)}>
                    {p.active ? "Disable" : "Enable"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { if (confirm("Delete this principle?")) remove.mutate(p.id); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <PrincipleEditor open={open} onOpenChange={setOpen} moduleId={mod.id} onSaved={() => qc.invalidateQueries({ queryKey: ["founder-principles", mod.id] })} />
    </div>
  );
}

function PrincipleEditor({
  open, onOpenChange, moduleId, initial, onSaved,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; moduleId: string;
  initial?: Partial<Principle>; onSaved?: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [examples, setExamples] = useState((initial?.examples ?? []).join("\n"));
  const [tags, setTags] = useState((initial?.tags ?? []).join(", "));
  const [weight, setWeight] = useState(initial?.weight ?? 5);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(initial?.title ?? ""); setBody(initial?.body ?? "");
      setExamples((initial?.examples ?? []).join("\n"));
      setTags((initial?.tags ?? []).join(", "));
      setWeight(initial?.weight ?? 5);
    }
  }, [open, initial]);

  const save = async () => {
    if (!title.trim() || !body.trim()) { toast.error("Title and body required"); return; }
    setSaving(true);
    const { data: u } = await sb.auth.getUser();
    const payload = {
      module_id: moduleId,
      title: title.trim(),
      body: body.trim(),
      examples: examples.split("\n").map((s) => s.trim()).filter(Boolean),
      tags: tags.split(",").map((s) => s.trim()).filter(Boolean),
      weight: Math.min(Math.max(Number(weight) || 5, 1), 10),
      source_kind: "manual",
      created_by: u?.user?.id ?? null,
    };
    const { error } = await sb.from("zara_founder_principles").insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved");
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>New founder principle</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Trust converts better than pressure" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Body</label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="The reasoning behind this principle…" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Examples (one per line)</label>
            <Textarea value={examples} onChange={(e) => setExamples(e.target.value)} rows={3} placeholder="Honestly, most buyers get stuck because everything starts looking the same." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Tags (comma)</label>
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="softener, tone" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Weight 1–10</label>
              <Input type="number" min={1} max={10} value={weight} onChange={(e) => setWeight(Number(e.target.value))} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ────────────── TEACH ZARA ────────────── */
function TeachPane({ modules }: { modules: Module[] }) {
  const qc = useQueryClient();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [focusSlug, setFocusSlug] = useState<string>("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [promoteFor, setPromoteFor] = useState<{ moduleSlug: string; proposal: any } | null>(null);

  const { data: messages = [], refetch } = useQuery({
    queryKey: ["founder-teach-messages", sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const { data, error } = await sb.from("zara_founder_teach_messages")
        .select("*").eq("session_id", sessionId).order("created_at", { ascending: true });
      if (error) throw error;
      return data as TeachMsg[];
    },
  });

  const send = async () => {
    const msg = text.trim(); if (!msg) return;
    setSending(true); setText("");
    try {
      const { data, error } = await sb.functions.invoke("zara-founder-teach", {
        body: { sessionId, message: msg, focusModuleSlug: focusSlug || null },
      });
      if (error) throw error;
      if (data?.sessionId && data.sessionId !== sessionId) setSessionId(data.sessionId);
      await refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally { setSending(false); }
  };

  const promoteProposal = async (moduleSlug: string, prop: any) => {
    const mod = modules.find((m) => m.slug === moduleSlug);
    if (!mod) { toast.error("Unknown module"); return; }
    const { data: u } = await sb.auth.getUser();
    const { error } = await sb.from("zara_founder_principles").insert({
      module_id: mod.id,
      title: String(prop?.title ?? "").slice(0, 200),
      body: String(prop?.body ?? "").slice(0, 2000),
      examples: Array.isArray(prop?.examples) ? prop.examples.map(String) : [],
      tags: Array.isArray(prop?.tags) ? prop.tags.map(String) : [],
      weight: Math.min(Math.max(Number(prop?.weight) || 5, 1), 10),
      source_kind: "teach_session",
      source_id: sessionId,
      created_by: u?.user?.id ?? null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Promoted to principle");
    qc.invalidateQueries({ queryKey: ["founder-principles"] });
  };

  return (
    <div className="grid grid-cols-12 gap-4">
      <aside className="col-span-12 md:col-span-3 border rounded-lg p-3 bg-card/30">
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Focus module</div>
        <Select value={focusSlug || "any"} onValueChange={(v) => setFocusSlug(v === "any" ? "" : v)}>
          <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any module</SelectItem>
            {modules.map((m) => <SelectItem key={m.slug} value={m.slug}>{m.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="mt-4 text-xs text-muted-foreground leading-relaxed">
          Speak naturally. Explain your reasoning, share buyer observations, describe how you'd handle a scenario.
          Zara will summarize, extract structured lessons, and propose new founder principles to save.
        </div>
        <Button variant="ghost" size="sm" className="mt-3 w-full" onClick={() => { setSessionId(null); }}>
          New session
        </Button>
      </aside>

      <main className="col-span-12 md:col-span-9 border rounded-lg flex flex-col h-[70vh] bg-background">
        <ScrollArea className="flex-1 p-4">
          {messages.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center mt-12">
              <Sparkles className="h-5 w-5 mx-auto mb-2 opacity-60" />
              Start teaching. Try: <em>"Most buyers ghost because nobody guides them emotionally — they get overwhelmed by floor plans."</em>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((m) => (
                <div key={m.id} className={m.role === "user" ? "ml-auto max-w-[80%]" : "max-w-[85%]"}>
                  {m.role === "user" ? (
                    <div className="bg-primary text-primary-foreground rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap">{m.content}</div>
                  ) : (
                    <div>
                      <div className="text-sm prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      </div>
                      {Array.isArray(m.meta?.lessons) && m.meta.lessons.length > 0 && (
                        <div className="mt-2 border-l-2 border-primary/40 pl-3 space-y-1">
                          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Lessons stored</div>
                          {m.meta.lessons.map((l: any, i: number) => (
                            <div key={i} className="text-[13px]">
                              <Pill tone="muted" size="sm">{l.module_slug}</Pill> {l.summary}
                            </div>
                          ))}
                        </div>
                      )}
                      {Array.isArray(m.meta?.proposed_principles) && m.meta.proposed_principles.length > 0 && (
                        <div className="mt-3 space-y-2">
                          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Proposed principles</div>
                          {m.meta.proposed_principles.map((p: any, i: number) => (
                            <div key={i} className="border rounded-md p-3 bg-card/40">
                              <div className="flex items-center gap-2">
                                <Pill tone="primary" size="sm">{p.module_slug}</Pill>
                                <div className="font-medium text-sm">{p.title}</div>
                              </div>
                              <div className="text-[13px] text-muted-foreground mt-1">{p.body}</div>
                              <div className="flex justify-end mt-2">
                                <Button size="sm" variant="outline" onClick={() => promoteProposal(p.module_slug, p)}>
                                  <Check className="h-3.5 w-3.5 mr-1" />Save as principle
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {Array.isArray(m.meta?.clarifying_questions) && m.meta.clarifying_questions.length > 0 && (
                        <div className="mt-2 text-[13px] text-muted-foreground">
                          {m.meta.clarifying_questions.map((q: string, i: number) => (
                            <div key={i}>→ {q}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="text-[10px] text-muted-foreground mt-1">{formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}</div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
        <div className="border-t p-3 flex gap-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }}
            placeholder="Speak naturally to Zara… (⌘/Ctrl + Enter to send)"
            rows={2}
            className="resize-none"
          />
          <Button onClick={send} disabled={sending || !text.trim()}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </main>
    </div>
  );
}

/* ────────────── REAL CONVERSATIONS ────────────── */
function ConversationsPane() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");

  const { data: items = [] } = useQuery({
    queryKey: ["founder-conversations"],
    queryFn: async () => {
      const { data, error } = await sb.from("zara_founder_conversations")
        .select("*").order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data as Convo[];
    },
  });

  const analyze = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await sb.functions.invoke("zara-founder-analyze-conversation", { body: { conversationId: id } });
      if (error) throw error;
      return data;
    },
    onSuccess: () => { toast.success("Analyzed"); qc.invalidateQueries({ queryKey: ["founder-conversations"] }); qc.invalidateQueries({ queryKey: ["founder-lessons"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("zara_founder_conversations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["founder-conversations"] }); },
  });

  const filtered = useMemo(() => {
    const q = filter.toLowerCase().trim();
    if (!q) return items;
    return items.filter((c) =>
      c.title.toLowerCase().includes(q) ||
      (c.outcome ?? "").toLowerCase().includes(q) ||
      (c.lead_persona ?? "").toLowerCase().includes(q) ||
      (c.tags ?? []).some((t) => t.toLowerCase().includes(q))
    );
  }, [items, filter]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-2">
        <Input placeholder="Search title, outcome, persona, tag…" value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-sm" />
        <Button onClick={() => setOpen(true)} size="sm"><Upload className="h-4 w-4 mr-1" />Upload conversation</Button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-sm text-muted-foreground border rounded-md p-6 text-center">
          No conversations yet. Upload an SMS thread, IG DM, FB Messenger chat, or email thread to start.
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((c) => (
            <li key={c.id} className="border rounded-lg p-3 bg-card/30">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-[14px]">{c.title}</span>
                    <Pill tone="muted" size="sm">{c.channel}</Pill>
                    {c.outcome && <Pill tone="primary" size="sm">{c.outcome}</Pill>}
                    {c.lead_persona && <Pill tone="muted" size="sm">{c.lead_persona}</Pill>}
                    {c.emotional_state && <Pill tone="muted" size="sm">{c.emotional_state}</Pill>}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                    {c.analyzed_at ? " · analyzed" : " · not analyzed"}
                  </div>
                  {(c.tags ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {c.tags.map((t) => <Pill key={t} tone="muted" size="sm">{t}</Pill>)}
                    </div>
                  )}
                  {c.analysis?.progression && (
                    <div className="mt-2 text-[13px] text-muted-foreground italic">{c.analysis.progression}</div>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => analyze.mutate(c.id)} disabled={analyze.isPending}>
                    {analyze.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : c.analyzed_at ? "Re-analyze" : "Analyze"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { if (confirm("Delete?")) remove.mutate(c.id); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConversationUploadDialog open={open} onOpenChange={setOpen} onSaved={() => qc.invalidateQueries({ queryKey: ["founder-conversations"] })} />
    </div>
  );
}

function ConversationUploadDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const [title, setTitle] = useState("");
  const [channel, setChannel] = useState("sms");
  const [outcome, setOutcome] = useState<string>("");
  const [persona, setPersona] = useState<string>("");
  const [transcript, setTranscript] = useState("");
  const [tags, setTags] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setTitle(""); setChannel("sms"); setOutcome(""); setPersona(""); setTranscript(""); setTags(""); setNotes(""); } }, [open]);

  const save = async () => {
    if (!title.trim() || !transcript.trim()) { toast.error("Title and transcript required"); return; }
    setSaving(true);
    const { data: u } = await sb.auth.getUser();
    const { data, error } = await sb.from("zara_founder_conversations").insert({
      title: title.trim(),
      channel,
      transcript: transcript.trim(),
      outcome: outcome || null,
      lead_persona: persona || null,
      tags: tags.split(",").map((s) => s.trim()).filter(Boolean),
      notes: notes.trim() || null,
      created_by: u?.user?.id ?? null,
    }).select("id").single();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved");
    onOpenChange(false);
    onSaved();
    // Fire-and-forget analyze
    sb.functions.invoke("zara-founder-analyze-conversation", { body: { conversationId: data!.id } })
      .then(() => onSaved())
      .catch(() => {});
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Upload real conversation</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Short title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="grid grid-cols-3 gap-2">
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CHANNELS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={outcome || "none"} onValueChange={(v) => setOutcome(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Outcome" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No outcome</SelectItem>
                {OUTCOMES.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={persona || "none"} onValueChange={(v) => setPersona(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Persona" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No persona</SelectItem>
                {PERSONAS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Input placeholder="Tags (comma) — e.g. investor, pricing, ghost" value={tags} onChange={(e) => setTags(e.target.value)} />
          <Textarea placeholder="Paste the full conversation transcript here…" rows={10} value={transcript} onChange={(e) => setTranscript(e.target.value)} />
          <Textarea placeholder="Optional notes (context, what worked, what you'd do differently)" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save & analyze"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ────────────── LESSONS ────────────── */
function LessonsPane({ modules }: { modules: Module[] }) {
  const qc = useQueryClient();
  const [moduleFilter, setModuleFilter] = useState<string>("all");

  const { data: lessons = [] } = useQuery({
    queryKey: ["founder-lessons", moduleFilter],
    queryFn: async () => {
      let q = sb.from("zara_founder_lessons").select("*").order("created_at", { ascending: false }).limit(200);
      if (moduleFilter !== "all") q = q.eq("module_id", moduleFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data as Lesson[];
    },
  });

  const promote = useMutation({
    mutationFn: async (l: Lesson) => {
      if (!l.module_id) throw new Error("Lesson has no module");
      const { data: u } = await sb.auth.getUser();
      const { data: p, error } = await sb.from("zara_founder_principles").insert({
        module_id: l.module_id,
        title: l.summary.slice(0, 80),
        body: l.detail || l.summary,
        tags: l.tags,
        weight: 5,
        source_kind: "teach_session",
        source_id: l.source_id,
        created_by: u?.user?.id ?? null,
      }).select("id").single();
      if (error) throw error;
      await sb.from("zara_founder_lessons").update({ promoted_principle_id: p!.id }).eq("id", l.id);
    },
    onSuccess: () => { toast.success("Promoted"); qc.invalidateQueries({ queryKey: ["founder-lessons"] }); qc.invalidateQueries({ queryKey: ["founder-principles"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const modName = (id: string | null) => modules.find((m) => m.id === id)?.name ?? "—";

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Select value={moduleFilter} onValueChange={setModuleFilter}>
          <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All modules</SelectItem>
            {modules.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {lessons.length === 0 ? (
        <div className="text-sm text-muted-foreground border rounded-md p-6 text-center">No lessons captured yet.</div>
      ) : (
        <ul className="space-y-2">
          {lessons.map((l) => (
            <li key={l.id} className="border rounded-md p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Pill tone="muted" size="sm">{modName(l.module_id)}</Pill>
                    <Pill tone="muted" size="sm">{l.source_kind}</Pill>
                    {l.promoted_principle_id && <Pill tone="primary" size="sm">promoted</Pill>}
                  </div>
                  <div className="text-sm mt-1">{l.summary}</div>
                  {l.detail && <div className="text-[13px] text-muted-foreground mt-1">{l.detail}</div>}
                  {l.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {l.tags.map((t) => <Pill key={t} tone="muted" size="sm">{t}</Pill>)}
                    </div>
                  )}
                </div>
                {!l.promoted_principle_id && l.module_id && (
                  <Button size="sm" variant="outline" onClick={() => promote.mutate(l)}>
                    <Check className="h-3.5 w-3.5 mr-1" />Promote
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
