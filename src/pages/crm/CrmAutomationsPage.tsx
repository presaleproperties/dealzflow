import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Zap, Plus, Search, Sparkles, Activity, Users, Play, Pause, Trash2, Copy, ScrollText, PlayCircle, RefreshCw, Clock, Tag, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import {
  useCrmAutomations, useToggleAutomation, useDeleteAutomation, AUTOMATION_TEMPLATES,
  useRunAutomationNow,
} from '@/hooks/useCrmAutomations';
import { AutomationBuilder } from '@/components/crm/automations/AutomationBuilder';
import { AutomationEnrolledTab } from '@/components/crm/automations/AutomationEnrolledTab';
import { AutomationRunsTab } from '@/components/crm/automations/AutomationRunsTab';
import { Pill } from '@/components/crm/shared/Pill';
import { formatDistanceToNow } from 'date-fns';
import type { CrmAutomation, CrmAutomationStep } from '@/hooks/useCrmAutomations';

type FilterMode = 'all' | 'active' | 'inactive';
type ActiveSelection =
  | { mode: 'view'; id: string }
  | { mode: 'new' }
  | { mode: 'template'; tpl: typeof AUTOMATION_TEMPLATES[number] }
  | null;

const TRIGGER_ICONS: Record<string, React.ElementType> = {
  new_lead: Zap, status_change: RefreshCw, no_response: Clock, tag_added: Tag, manual: UserPlus,
};

export default function CrmAutomationsPage() {
  const { data: automations, isLoading } = useCrmAutomations();
  const toggleMut = useToggleAutomation();
  const deleteMut = useDeleteAutomation();
  const runNow = useRunAutomationNow();

  const automationIds = (automations ?? []).map(a => a.id);
  const { data: allSteps } = useQuery({
    queryKey: ['crm-automation-steps-all', automationIds],
    queryFn: async () => {
      if (automationIds.length === 0) return [];
      const { data, error } = await supabase
        .from('crm_automation_steps').select('*').in('automation_id', automationIds).order('step_order');
      if (error) throw error;
      return (data ?? []) as CrmAutomationStep[];
    },
    enabled: automationIds.length > 0,
    staleTime: 30_000,
  });

  const stepsMap = (allSteps ?? []).reduce<Record<string, CrmAutomationStep[]>>((acc, s) => {
    (acc[s.automation_id] = acc[s.automation_id] ?? []).push(s);
    return acc;
  }, {});

  // Live in-flight counts per automation
  const { data: activeCounts } = useQuery({
    queryKey: ['crm-automation-active-counts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_automation_enrollments')
        .select('automation_id')
        .eq('status', 'active');
      if (error) throw error;
      const m: Record<string, number> = {};
      (data ?? []).forEach((r: any) => { m[r.automation_id] = (m[r.automation_id] ?? 0) + 1; });
      return m;
    },
    refetchInterval: 30_000,
  });

  const [active, setActive] = useState<ActiveSelection>(null);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'flow' | 'enrolled' | 'runs' | 'settings'>('flow');

  const filtered = useMemo(() => (automations ?? []).filter(a => {
    if (filter === 'active' && !a.is_active) return false;
    if (filter === 'inactive' && a.is_active) return false;
    if (search && !a.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [automations, filter, search]);

  const selectedAutomation = active?.mode === 'view'
    ? (automations ?? []).find(a => a.id === active.id) ?? null
    : null;

  const totalActive = (automations ?? []).filter(a => a.is_active).length;
  const totalInFlight = Object.values(activeCounts ?? {}).reduce((s, n) => s + n, 0);
  const totalRuns = (automations ?? []).reduce((sum, a) => sum + (a.runs_count ?? 0), 0);

  // Auto-select first automation on load if nothing chosen
  if (!active && (automations ?? []).length > 0) {
    queueMicrotask(() => setActive({ mode: 'view', id: (automations ?? [])[0].id }));
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-var(--bottom-nav-pad,0px)-140px)] min-h-[600px]">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 px-1">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Zap className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Automations</h1>
            <p className="text-xs text-muted-foreground">
              {totalActive} active · {totalInFlight} in flight · {totalRuns} total runs
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-9 text-xs gap-1.5" onClick={() => runNow.mutate(undefined)} disabled={runNow.isPending}>
            <PlayCircle className="h-3.5 w-3.5" /> Run engine
          </Button>
          <Button size="sm" className="h-9 gap-1.5 bg-primary hover:bg-primary/90 text-xs" onClick={() => { setActive({ mode: 'new' }); setTab('flow'); }}>
            <Plus className="h-4 w-4" /> New Automation
          </Button>
        </div>
      </div>

      {/* Split workspace */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4 min-h-0">
        {/* List rail */}
        <div className="rounded-xl border border-border/50 bg-card/30 flex flex-col min-h-0 overflow-hidden">
          <div className="p-3 border-b border-border/40 space-y-2.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search automations…" className="h-8 pl-8 text-xs" />
            </div>
            <div className="flex gap-1 p-0.5 rounded-lg bg-muted/30">
              {(['all', 'active', 'inactive'] as FilterMode[]).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`flex-1 px-2 py-1 text-[11px] font-medium rounded-md capitalize transition-colors ${
                    filter === f ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}>{f}</button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="p-3 space-y-2">{[1,2,3,4].map(i => <div key={i} className="skeleton h-16 rounded-lg" />)}</div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-xs text-muted-foreground">No automations.</p>
                <Button size="sm" variant="link" className="text-xs h-6" onClick={() => setActive({ mode: 'new' })}>Build one</Button>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {filtered.map(a => {
                  const TI = TRIGGER_ICONS[a.trigger_type] ?? Zap;
                  const isSel = active?.mode === 'view' && active.id === a.id;
                  const inFlight = activeCounts?.[a.id] ?? 0;
                  return (
                    <button key={a.id} onClick={() => { setActive({ mode: 'view', id: a.id }); setTab('flow'); }}
                      className={`w-full text-left rounded-lg border transition-all p-2.5 ${
                        isSel ? 'border-primary/50 bg-primary/5' : 'border-transparent hover:border-border/50 hover:bg-muted/20'
                      }`}>
                      <div className="flex items-start gap-2.5">
                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${a.is_active ? 'bg-emerald-500/15' : 'bg-muted/40'}`}>
                          <TI className={`h-4 w-4 ${a.is_active ? 'text-emerald-500' : 'text-muted-foreground'}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs font-semibold truncate">{a.name}</p>
                            {a.is_active
                              ? <Pill tone="success">live</Pill>
                              : <Pill tone="muted">draft</Pill>}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                            {(stepsMap[a.id] ?? []).length} steps
                            {inFlight > 0 && ` · ${inFlight} in flight`}
                            {a.last_run_at && ` · ran ${formatDistanceToNow(new Date(a.last_run_at), { addSuffix: true })}`}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Templates strip */}
          {(automations?.length ?? 0) < 6 && (
            <div className="border-t border-border/40 p-2.5 max-h-[260px] overflow-y-auto">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2 flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-primary" /> Quick start
              </p>
              <div className="space-y-1">
                {AUTOMATION_TEMPLATES.slice(0, 4).map(t => (
                  <button key={t.id} onClick={() => { setActive({ mode: 'template', tpl: t }); setTab('flow'); }}
                    className="w-full text-left p-2 rounded-md hover:bg-muted/30 transition-colors">
                    <p className="text-[11px] font-medium">{t.name}</p>
                    <p className="text-[10px] text-muted-foreground line-clamp-1">{t.description}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Preview pane */}
        <div className="rounded-xl border border-border/50 bg-card/30 flex flex-col min-h-0 overflow-hidden">
          {!active ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-10">
              <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
                <Zap className="h-7 w-7 text-primary" />
              </div>
              <h3 className="text-base font-semibold">Select an automation</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                Pick one on the left to view its flow, enrolled leads, run history, and settings — or build a brand new one.
              </p>
              <Button size="sm" className="mt-4 h-9 gap-1.5" onClick={() => setActive({ mode: 'new' })}>
                <Plus className="h-4 w-4" /> Build from scratch
              </Button>
            </div>
          ) : selectedAutomation ? (
            <>
              {/* Header bar */}
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/40">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold truncate">{selectedAutomation.name}</h2>
                    {selectedAutomation.is_active ? <Pill tone="success">live</Pill> : <Pill tone="muted">draft</Pill>}
                  </div>
                  {selectedAutomation.description && (
                    <p className="text-[11px] text-muted-foreground truncate">{selectedAutomation.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground">{selectedAutomation.is_active ? 'Active' : 'Draft'}</span>
                    <Switch checked={selectedAutomation.is_active ?? false}
                      onCheckedChange={v => toggleMut.mutate({ id: selectedAutomation.id, is_active: v })}
                      className="scale-90" />
                  </div>
                  <Button size="icon" variant="ghost" className="h-8 w-8" title="Duplicate"
                    onClick={() => {
                      const tpl = {
                        id: 'duplicate', name: `${selectedAutomation.name} (Copy)`,
                        description: selectedAutomation.description ?? '',
                        trigger_type: selectedAutomation.trigger_type,
                        trigger_config: selectedAutomation.trigger_config ?? {},
                        steps: (stepsMap[selectedAutomation.id] ?? []).map(s => ({
                          action_type: s.action_type, action_config: (s.action_config as Record<string, unknown>) ?? {},
                        })),
                        icon: 'Zap',
                      };
                      setActive({ mode: 'template', tpl: tpl as any });
                      setTab('flow');
                    }}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" title="Delete"
                    onClick={() => {
                      if (confirm(`Delete "${selectedAutomation.name}"? This also removes all enrollments and run logs.`)) {
                        deleteMut.mutate(selectedAutomation.id, { onSuccess: () => setActive(null) });
                      }
                    }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Tabs */}
              <Tabs value={tab} onValueChange={v => setTab(v as typeof tab)} className="flex-1 flex flex-col min-h-0">
                <TabsList className="mx-4 mt-2 self-start">
                  <TabsTrigger value="flow" className="text-xs gap-1.5"><Sparkles className="h-3 w-3" /> Flow</TabsTrigger>
                  <TabsTrigger value="enrolled" className="text-xs gap-1.5"><Users className="h-3 w-3" /> Enrolled {(activeCounts?.[selectedAutomation.id] ?? 0) > 0 && <Pill tone="primary">{activeCounts?.[selectedAutomation.id]}</Pill>}</TabsTrigger>
                  <TabsTrigger value="runs" className="text-xs gap-1.5"><ScrollText className="h-3 w-3" /> Runs</TabsTrigger>
                  <TabsTrigger value="settings" className="text-xs gap-1.5"><Activity className="h-3 w-3" /> Settings</TabsTrigger>
                </TabsList>
                <TabsContent value="flow" className="flex-1 min-h-0 overflow-y-auto p-4 m-0">
                  <AutomationBuilder
                    key={selectedAutomation.id}
                    editing={selectedAutomation}
                    templatePrefill={null}
                    embedded
                    onClose={() => { /* embedded — saves stay in place */ }}
                  />
                </TabsContent>
                <TabsContent value="enrolled" className="flex-1 min-h-0 overflow-y-auto m-0">
                  <AutomationEnrolledTab automationId={selectedAutomation.id} />
                </TabsContent>
                <TabsContent value="runs" className="flex-1 min-h-0 overflow-y-auto m-0">
                  <AutomationRunsTab automationId={selectedAutomation.id} />
                </TabsContent>
                <TabsContent value="settings" className="flex-1 min-h-0 overflow-y-auto p-5 m-0 space-y-4">
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p><span className="text-foreground font-medium">Trigger:</span> {selectedAutomation.trigger_type}</p>
                    <p><span className="text-foreground font-medium">Created:</span> {selectedAutomation.created_at ? new Date(selectedAutomation.created_at).toLocaleString() : '—'}</p>
                    <p><span className="text-foreground font-medium">Total enrolled:</span> {selectedAutomation.total_enrolled ?? 0}</p>
                    <p><span className="text-foreground font-medium">Total runs:</span> {selectedAutomation.runs_count ?? 0}</p>
                  </div>
                  <div className="border-t border-destructive/20 pt-4">
                    <p className="text-xs font-semibold text-destructive mb-2">Danger zone</p>
                    <Button variant="outline" size="sm" className="text-destructive border-destructive/50 hover:bg-destructive/10 gap-1.5"
                      onClick={() => {
                        if (confirm(`Delete "${selectedAutomation.name}"? This is permanent.`)) {
                          deleteMut.mutate(selectedAutomation.id, { onSuccess: () => setActive(null) });
                        }
                      }}>
                      <Trash2 className="h-3.5 w-3.5" /> Delete automation
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            </>
          ) : (
            // New / Template builder
            <div className="flex-1 min-h-0 overflow-y-auto p-4">
              <AutomationBuilder
                editing={null}
                templatePrefill={active.mode === 'template' ? {
                  ...active.tpl,
                  steps: active.tpl.steps.map(s => ({ ...s, action_config: { ...s.action_config } })),
                } : null}
                embedded
                onClose={() => setActive(null)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
