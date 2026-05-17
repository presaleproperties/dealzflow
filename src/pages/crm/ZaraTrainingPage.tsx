// Zara Self-Awareness & Training Loop — exposes Zara's capabilities (tools),
// recent approval decisions, training feedback, and lets you review/apply
// auto-generated prompt evolution suggestions that get appended as system
// prompt addenda used on the next chat turn.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Pill } from '@/components/crm/shared/Pill';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import {
  ArrowLeft, Sparkles, Wrench, ShieldCheck, ShieldAlert, Brain, ThumbsUp,
  ThumbsDown, GraduationCap, CheckCircle2, XCircle, Loader2, Building2,
  Activity as ActivityIcon, BookOpen, Plus, Trash2, RefreshCw, AlertCircle,
} from 'lucide-react';

// Mirrors supabase/functions/_shared/zara-tool-defs.ts — kept in sync manually.
// Marked "approval" = mutation that requires user confirmation in the cockpit.
type ToolInfo = {
  name: string;
  label: string;
  group: 'Read' | 'Write' | 'Drafts' | 'Projects' | 'Research' | 'Training';
  approval?: boolean;
  description: string;
};

const TOOLS: ToolInfo[] = [
  { name: 'get_lead_context',       label: 'Get lead context',       group: 'Read',     description: 'Fetch a lead profile, recent activity, and notes.' },
  { name: 'search_leads',           label: 'Search leads',           group: 'Read',     description: 'Find leads by name, email, phone, tag, or status.' },
  { name: 'show_engagement_score',  label: 'Show engagement score',  group: 'Read',     description: 'Pull the engagement score and signal breakdown.' },
  { name: 'list_pending_drafts',    label: 'List pending drafts',    group: 'Drafts',   description: 'List drafts waiting for your approval.' },
  { name: 'send_briefing_summary',  label: 'Send morning briefing',  group: 'Read',     description: 'Compile a morning briefing of hot leads and pending work.' },
  { name: 'update_lead',            label: 'Update lead',            group: 'Write',    approval: true, description: 'Edit a lead\'s fields (status, contact, notes).' },
  { name: 'confirm_update_lead',    label: 'Confirm lead update',    group: 'Write',    description: 'Confirm a previously proposed lead update.' },
  { name: 'add_lead_note',          label: 'Add note',               group: 'Write',    approval: true, description: 'Add a note to a lead\'s timeline.' },
  { name: 'add_lead_tag',           label: 'Add tag',                group: 'Write',    approval: true, description: 'Add a tag to a lead.' },
  { name: 'set_lead_status',        label: 'Set status',             group: 'Write',    approval: true, description: 'Change a lead\'s pipeline status.' },
  { name: 'schedule_follow_up',     label: 'Schedule follow-up',     group: 'Write',    approval: true, description: 'Schedule a follow-up task or reminder.' },
  { name: 'draft_email',            label: 'Draft email',            group: 'Drafts',   approval: true, description: 'Compose an email draft for your review.' },
  { name: 'draft_sms',              label: 'Draft SMS',              group: 'Drafts',   approval: true, description: 'Compose an SMS draft for your review.' },
  { name: 'approve_draft',          label: 'Approve & send draft',   group: 'Drafts',   approval: true, description: 'Send a previously drafted message.' },
  { name: 'list_projects',          label: 'List projects',          group: 'Projects', description: 'List projects in the catalog with filters.' },
  { name: 'project_details',        label: 'Project details',        group: 'Projects', description: 'Pull a single project\'s full record.' },
  { name: 'recommend_projects_for_lead', label: 'Recommend projects', group: 'Projects', description: 'Match projects to a lead\'s preferences.' },
  { name: 'web_research',           label: 'Web research',           group: 'Research', description: 'Search the web for context (e.g., a developer or area).' },
  { name: 'log_training_feedback',  label: 'Log feedback',           group: 'Training', description: 'Record good/bad/correction feedback for self-improvement.' },
];

const GROUP_ORDER: ToolInfo['group'][] = ['Read', 'Write', 'Drafts', 'Projects', 'Research', 'Training'];

export default function ZaraTrainingPage() {
  const qc = useQueryClient();

  const { data: feedback = [] } = useQuery({
    queryKey: ['zara-training-feedback'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('zara_training_feedback')
        .select('id,decision,notes,applied_to_prompt,created_at,contact_id,message_id')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: evolution = [] } = useQuery({
    queryKey: ['zara-prompt-evolution'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('zara_prompt_evolution')
        .select('id,pattern,suggestion,status,created_at,example_feedback_ids,applied_at')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: addenda = [] } = useQuery({
    queryKey: ['zara-addenda'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('zara_system_prompt_addenda')
        .select('id,addendum,active,created_at,source_evolution_id')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: decisions = [] } = useQuery({
    queryKey: ['zara-recent-decisions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('zara_approval_decisions')
        .select('id,decision,decided_via,decided_at,edit_distance,reject_reason')
        .order('decided_at', { ascending: false })
        .limit(40);
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── Knowledge base (RAG corpus) ───────────────────────────────
  const { data: kbDocs = [] } = useQuery({
    queryKey: ['zara-kb-documents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('zara_knowledge_documents')
        .select('id,title,source_type,status,total_chunks,total_tokens,error_message,retrieval_count,indexed_at,uploaded_at')
        .order('uploaded_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: kbStats } = useQuery({
    queryKey: ['zara-kb-stats'],
    queryFn: async () => {
      const [docs, chunks, wins] = await Promise.all([
        supabase.from('zara_knowledge_documents').select('id,status', { count: 'exact', head: false }),
        supabase.from('zara_knowledge_chunks').select('id', { count: 'exact', head: true }),
        supabase.from('zara_winning_conversations').select('id', { count: 'exact', head: true }),
      ]);
      const indexed = (docs.data ?? []).filter((d: any) => d.status === 'indexed').length;
      const failed = (docs.data ?? []).filter((d: any) => d.status === 'failed').length;
      return {
        totalDocs: docs.data?.length ?? 0,
        indexed,
        failed,
        chunks: chunks.count ?? 0,
        wins: wins.count ?? 0,
      };
    },
  });

  const [kbTitle, setKbTitle] = useState('');
  const [kbType, setKbType] = useState<'playbook' | 'script' | 'faq' | 'note'>('playbook');
  const [kbContent, setKbContent] = useState('');

  const addKb = useMutation({
    mutationFn: async () => {
      if (!kbTitle.trim() || !kbContent.trim()) throw new Error('Title and content required');
      const { data: u } = await supabase.auth.getUser();
      const { data: doc, error } = await supabase
        .from('zara_knowledge_documents')
        .insert({
          title: kbTitle.trim(),
          source_type: kbType,
          raw_content: kbContent,
          status: 'pending',
          created_by: u.user?.id ?? null,
        })
        .select('id')
        .single();
      if (error) throw error;
      const { error: invErr } = await supabase.functions.invoke('zara-ingest-document', {
        body: { documentId: doc.id },
      });
      if (invErr) throw invErr;
      return doc.id;
    },
    onSuccess: () => {
      toast.success('Indexed. Zara will use it on the next turn.');
      setKbTitle(''); setKbContent('');
      qc.invalidateQueries({ queryKey: ['zara-kb-documents'] });
      qc.invalidateQueries({ queryKey: ['zara-kb-stats'] });
    },
    onError: (e: any) => toast.error(e.message ?? 'Could not index'),
  });

  const reindexKb = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('zara_knowledge_documents').update({ status: 'pending', error_message: null }).eq('id', id);
      const { error } = await supabase.functions.invoke('zara-ingest-document', { body: { documentId: id } });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Re-indexed');
      qc.invalidateQueries({ queryKey: ['zara-kb-documents'] });
      qc.invalidateQueries({ queryKey: ['zara-kb-stats'] });
    },
    onError: (e: any) => toast.error(e.message ?? 'Re-index failed'),
  });

  const deleteKb = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('zara_knowledge_documents').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Deleted');
      qc.invalidateQueries({ queryKey: ['zara-kb-documents'] });
      qc.invalidateQueries({ queryKey: ['zara-kb-stats'] });
    },
    onError: (e: any) => toast.error(e.message ?? 'Delete failed'),
  });

  const decisionStats = useMemo(() => {
    const total = decisions.length;
    let approved = 0, edited = 0, rejected = 0;
    decisions.forEach((d: any) => {
      if (d.decision === 'approved') approved++;
      else if (d.decision === 'edited') edited++;
      else if (d.decision === 'rejected') rejected++;
    });
    return { total, approved, edited, rejected };
  }, [decisions]);

  const feedbackStats = useMemo(() => {
    let good = 0, bad = 0, corr = 0;
    feedback.forEach((f: any) => {
      if (f.decision === 'good') good++;
      else if (f.decision === 'bad') bad++;
      else if (f.decision === 'correction') corr++;
    });
    return { good, bad, corr, total: feedback.length };
  }, [feedback]);

  const applySuggestion = useMutation({
    mutationFn: async (evo: any) => {
      const { error: insErr } = await supabase
        .from('zara_system_prompt_addenda')
        .insert({ addendum: evo.suggestion, source_evolution_id: evo.id, active: true });
      if (insErr) throw insErr;
      const { error: upErr } = await supabase
        .from('zara_prompt_evolution')
        .update({ status: 'applied', applied_at: new Date().toISOString() })
        .eq('id', evo.id);
      if (upErr) throw upErr;
    },
    onSuccess: () => {
      toast.success('Applied. Zara will use this on the next turn.');
      qc.invalidateQueries({ queryKey: ['zara-prompt-evolution'] });
      qc.invalidateQueries({ queryKey: ['zara-addenda'] });
    },
    onError: (e: any) => toast.error(e.message ?? 'Could not apply'),
  });

  const rejectSuggestion = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('zara_prompt_evolution')
        .update({ status: 'rejected' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Rejected');
      qc.invalidateQueries({ queryKey: ['zara-prompt-evolution'] });
    },
    onError: (e: any) => toast.error(e.message ?? 'Could not reject'),
  });

  const toggleAddendum = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from('zara_system_prompt_addenda')
        .update({ active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['zara-addenda'] });
    },
    onError: (e: any) => toast.error(e.message ?? 'Could not update'),
  });

  return (
    <div className="flex flex-col min-h-[calc(100dvh-var(--crm-subnav-h,48px))]">
      {/* Header */}
      <header className="px-5 py-3 border-b border-border/60 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Link to="/crm/zara" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <Brain className="w-4 h-4 text-primary" />
          <h1 className="text-[15px] font-semibold tracking-tight">Self-awareness & training</h1>
        </div>
        <div className="flex items-center gap-2 text-[12px]">
          <Link to="/crm/zara/projects" className="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1">
            <Building2 className="w-3.5 h-3.5" /> Project catalog
          </Link>
        </div>
      </header>

      <div className="flex-1 px-5 py-5 max-w-5xl mx-auto w-full space-y-7">
        {/* Stats strip */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          <StatCard
            icon={<Wrench className="w-3.5 h-3.5" />}
            label="Capabilities"
            value={String(TOOLS.length)}
            sub={`${TOOLS.filter(t => t.approval).length} need approval`}
          />
          <StatCard
            icon={<ActivityIcon className="w-3.5 h-3.5" />}
            label="Recent decisions"
            value={String(decisionStats.total)}
            sub={`${decisionStats.approved} approved · ${decisionStats.edited} edited · ${decisionStats.rejected} rejected`}
          />
          <StatCard
            icon={<GraduationCap className="w-3.5 h-3.5" />}
            label="Feedback signals"
            value={String(feedbackStats.total)}
            sub={`${feedbackStats.good} good · ${feedbackStats.bad} bad · ${feedbackStats.corr} correction`}
          />
          <StatCard
            icon={<Sparkles className="w-3.5 h-3.5" />}
            label="Active addenda"
            value={String(addenda.filter((a: any) => a.active).length)}
            sub={`${evolution.filter((e: any) => e.status === 'pending_review').length} suggestions pending`}
          />
        </section>

        {/* Zara Brain — knowledge base */}
        <section>
          <SectionHeader
            title="Zara Brain — knowledge base"
            subtitle="Playbooks, scripts, FAQs, and notes Zara retrieves from on every reply. Embeddings via OpenAI text-embedding-3-small."
          />

          {/* KB stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-3">
            <StatCard
              icon={<BookOpen className="w-3.5 h-3.5" />}
              label="Documents"
              value={String(kbStats?.totalDocs ?? 0)}
              sub={`${kbStats?.indexed ?? 0} indexed · ${kbStats?.failed ?? 0} failed`}
            />
            <StatCard
              icon={<Brain className="w-3.5 h-3.5" />}
              label="Chunks indexed"
              value={String(kbStats?.chunks ?? 0)}
              sub="≈400 tokens each, 50-token overlap"
            />
            <StatCard
              icon={<Sparkles className="w-3.5 h-3.5" />}
              label="Winning conversations"
              value={String(kbStats?.wins ?? 0)}
              sub="closed-deal patterns Zara mirrors"
            />
            <StatCard
              icon={<ActivityIcon className="w-3.5 h-3.5" />}
              label="Coverage"
              value={kbStats && kbStats.indexed > 0 ? 'Active' : 'Empty'}
              sub={kbStats && kbStats.indexed === 0 ? 'Add a document below to start grounding' : 'Zara grounds every reply in your corpus'}
            />
          </div>

          {/* Add document */}
          <div className="rounded-lg border border-border/60 bg-card p-3 mb-3">
            <div className="text-[11.5px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Add document</div>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_140px] gap-2 mb-2">
              <Input
                value={kbTitle}
                onChange={(e) => setKbTitle(e.target.value)}
                placeholder="e.g. Surrey presale objection handling"
                className="h-9 text-[13px]"
              />
              <select
                value={kbType}
                onChange={(e) => setKbType(e.target.value as any)}
                className="h-9 px-3 rounded-md border border-input bg-background text-[13px]"
              >
                <option value="playbook">Playbook</option>
                <option value="script">Script</option>
                <option value="faq">FAQ</option>
                <option value="note">Note</option>
              </select>
            </div>
            <Textarea
              value={kbContent}
              onChange={(e) => setKbContent(e.target.value)}
              placeholder="Paste the playbook, script, or notes. Markdown is fine. Will be chunked at ~400 tokens with 50-token overlap."
              className="text-[13px] min-h-[140px] mb-2"
            />
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10.5px] text-muted-foreground">
                {kbContent.length.toLocaleString()} chars · ~{Math.ceil(kbContent.length / 4).toLocaleString()} tokens
              </div>
              <Button
                size="sm"
                disabled={addKb.isPending || !kbTitle.trim() || !kbContent.trim()}
                onClick={() => addKb.mutate()}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {addKb.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
                Index document
              </Button>
            </div>
          </div>

          {/* Document list */}
          {kbDocs.length === 0 ? (
            <EmptyCard>No documents yet. Add Uzair's playbooks, objection scripts, or project FAQs to ground every reply.</EmptyCard>
          ) : (
            <div className="rounded-lg border border-border/60 bg-card divide-y divide-border/60">
              {kbDocs.map((d: any) => {
                const tone =
                  d.status === 'indexed' ? 'success'
                  : d.status === 'failed' ? 'danger'
                  : d.status === 'embedding' || d.status === 'chunking' || d.status === 'pending' ? 'warning'
                  : 'neutral';
                const busy = reindexKb.isPending || deleteKb.isPending;
                return (
                  <div key={d.id} className="px-3 py-2.5 flex items-start gap-2 text-[12px]">
                    <BookOpen className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="font-medium truncate max-w-[300px]">{d.title}</span>
                        <Pill size="sm" tone={tone as any}>{d.status}</Pill>
                        <Pill size="sm" tone="neutral">{d.source_type}</Pill>
                        {d.times_retrieved > 0 && (
                          <span className="text-[10.5px] text-muted-foreground">retrieved {d.times_retrieved}×</span>
                        )}
                      </div>
                      <div className="text-[10.5px] text-muted-foreground">
                        {d.total_chunks ?? 0} chunks · {(d.total_tokens ?? 0).toLocaleString()} tokens · {formatDistanceToNow(new Date(d.created_at), { addSuffix: true })}
                      </div>
                      {d.error_message && (
                        <div className="text-[11px] text-destructive mt-1 flex items-start gap-1">
                          <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                          <span>{d.error_message}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => reindexKb.mutate(d.id)} title="Re-index">
                        <RefreshCw className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => { if (confirm(`Delete "${d.title}"? Chunks will be removed.`)) deleteKb.mutate(d.id); }}
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <SectionHeader
            title="What Zara can do"
            subtitle="Tools available on every chat turn. Mutations require your approval in the cockpit."
          />
          <div className="space-y-4">
            {GROUP_ORDER.map((g) => {
              const items = TOOLS.filter((t) => t.group === g);
              if (!items.length) return null;
              return (
                <div key={g}>
                  <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
                    {g} · {items.length}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {items.map((t) => (
                      <div key={t.name} className="rounded-lg border border-border/60 bg-card p-2.5">
                        <div className="flex items-start gap-2 mb-1">
                          {t.approval ? (
                            <ShieldAlert className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                          ) : (
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="text-[12.5px] font-medium leading-tight">{t.label}</div>
                            <div className="text-[10.5px] font-mono text-muted-foreground mt-0.5">{t.name}</div>
                          </div>
                          {t.approval && <Pill size="sm" tone="warning">approval</Pill>}
                        </div>
                        <div className="text-[11.5px] text-muted-foreground leading-snug">{t.description}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Prompt evolution */}
        <section>
          <SectionHeader
            title="Prompt evolution"
            subtitle="Auto-suggested system-prompt updates derived from your feedback. Approved suggestions get appended to Zara's next turn."
          />
          {evolution.length === 0 ? (
            <EmptyCard>No suggestions yet. As you give feedback, patterns will surface here.</EmptyCard>
          ) : (
            <div className="space-y-2">
              {evolution.map((e: any) => {
                const pending = e.status === 'pending_review';
                const tone = pending ? 'warning' : e.status === 'applied' ? 'success' : 'danger';
                const busy = applySuggestion.isPending || rejectSuggestion.isPending;
                return (
                  <div key={e.id} className="rounded-lg border border-border/60 bg-card p-3">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="text-[11.5px] uppercase tracking-wider text-muted-foreground font-semibold">
                        Pattern · {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                      </div>
                      <Pill size="sm" tone={tone as any}>{e.status.replace('_', ' ')}</Pill>
                    </div>
                    <div className="text-[12.5px] text-foreground mb-2 italic">"{e.pattern}"</div>
                    <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-semibold mb-0.5">Suggested addendum</div>
                    <div className="text-[12.5px] text-foreground/90 whitespace-pre-wrap bg-muted/30 rounded-md p-2 border border-border/40 mb-2">
                      {e.suggestion}
                    </div>
                    {pending && (
                      <div className="flex items-center gap-2 justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => rejectSuggestion.mutate(e.id)}
                        >
                          <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
                        </Button>
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => applySuggestion.mutate(e)}
                          className="bg-primary text-primary-foreground hover:bg-primary/90"
                        >
                          {applySuggestion.isPending ? (
                            <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                          )}
                          Apply
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Active addenda */}
        <section>
          <SectionHeader
            title="Active prompt addenda"
            subtitle="Persistent additions injected into Zara's system prompt every turn."
          />
          {addenda.length === 0 ? (
            <EmptyCard>No addenda yet. Apply a suggestion above to add one.</EmptyCard>
          ) : (
            <div className="space-y-2">
              {addenda.map((a: any) => (
                <div key={a.id} className="rounded-lg border border-border/60 bg-card p-3">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-semibold">
                      Added {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                    </div>
                    <div className="flex items-center gap-2">
                      <Pill size="sm" tone={a.active ? 'success' : 'neutral'}>{a.active ? 'active' : 'off'}</Pill>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleAddendum.mutate({ id: a.id, active: !a.active })}
                      >
                        {a.active ? 'Disable' : 'Enable'}
                      </Button>
                    </div>
                  </div>
                  <div className="text-[12.5px] text-foreground/90 whitespace-pre-wrap">{a.addendum}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Recent feedback */}
        <section>
          <SectionHeader
            title="Recent feedback"
            subtitle="Thumbs up/down and corrections you've sent. These power the suggestions above."
          />
          {feedback.length === 0 ? (
            <EmptyCard>No feedback yet. Use the 👍 / 👎 on Zara's replies to teach her.</EmptyCard>
          ) : (
            <div className="rounded-lg border border-border/60 bg-card divide-y divide-border/60">
              {feedback.map((f: any) => (
                <div key={f.id} className="px-3 py-2 flex items-start gap-2 text-[12px]">
                  {f.decision === 'good' && <ThumbsUp className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />}
                  {f.decision === 'bad' && <ThumbsDown className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />}
                  {f.decision === 'correction' && <Sparkles className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-medium capitalize">{f.decision}</span>
                      <span className="text-[10.5px] text-muted-foreground">
                        {formatDistanceToNow(new Date(f.created_at), { addSuffix: true })}
                      </span>
                      {f.applied_to_prompt && <Pill size="sm" tone="success">applied</Pill>}
                    </div>
                    {f.notes && <div className="text-[11.5px] text-muted-foreground">{f.notes}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Recent decisions */}
        <section className="pb-10">
          <SectionHeader
            title="Recent draft decisions"
            subtitle="What you did with Zara's last drafts. High edit-distance means Zara should learn your phrasing."
          />
          {decisions.length === 0 ? (
            <EmptyCard>No draft decisions yet.</EmptyCard>
          ) : (
            <div className="rounded-lg border border-border/60 bg-card divide-y divide-border/60">
              {decisions.map((d: any) => {
                const tone = d.decision === 'approved' ? 'success'
                  : d.decision === 'edited' ? 'warning' : 'danger';
                return (
                  <div key={d.id} className="px-3 py-2 flex items-center gap-2 text-[12px]">
                    <Pill size="sm" tone={tone as any}>{d.decision}</Pill>
                    <span className="text-muted-foreground text-[11px]">via {d.decided_via.replace('_', ' ')}</span>
                    {d.edit_distance != null && d.edit_distance > 0 && (
                      <span className="text-[11px] text-muted-foreground">· {d.edit_distance} char edits</span>
                    )}
                    {d.reject_reason && (
                      <span className="text-[11px] text-muted-foreground truncate flex-1">· {d.reject_reason}</span>
                    )}
                    <span className="ml-auto text-[10.5px] text-muted-foreground tabular-nums">
                      {formatDistanceToNow(new Date(d.decided_at), { addSuffix: true })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-2.5">
      <h2 className="text-[14px] font-semibold tracking-tight">{title}</h2>
      {subtitle && <p className="text-[11.5px] text-muted-foreground mt-0.5">{subtitle}</p>}
    </div>
  );
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card p-3">
      <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 flex items-center gap-1">
        {icon}{label}
      </div>
      <div className="text-[20px] font-semibold tabular-nums leading-none mb-1">{value}</div>
      {sub && <div className="text-[10.5px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function EmptyCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border/60 bg-card/40 px-4 py-6 text-center text-[12px] text-muted-foreground">
      {children}
    </div>
  );
}
