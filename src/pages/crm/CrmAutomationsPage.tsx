import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Zap, Plus, Search, LayoutGrid, List, Sparkles, TrendingUp, Users, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCrmAutomations, useToggleAutomation, useDeleteAutomation, useCreateAutomation, AUTOMATION_TEMPLATES } from '@/hooks/useCrmAutomations';
import { AutomationBuilderDialog } from '@/components/crm/automations/AutomationBuilderDialog';
import { AutomationLogSheet } from '@/components/crm/automations/AutomationLogSheet';
import { TemplatePickerDialog } from '@/components/crm/automations/TemplatePickerDialog';
import { AutomationCard } from '@/components/crm/automations/AutomationCard';
import type { CrmAutomation, CrmAutomationStep } from '@/hooks/useCrmAutomations';

type FilterMode = 'all' | 'active' | 'inactive';

export default function CrmAutomationsPage() {
  const { data: automations, isLoading } = useCrmAutomations();
  const toggleMut = useToggleAutomation();
  const deleteMut = useDeleteAutomation();

  // Fetch all steps for all automations to show flow previews
  const automationIds = (automations ?? []).map(a => a.id);
  const { data: allSteps } = useQuery({
    queryKey: ['crm-automation-steps-all', automationIds],
    queryFn: async () => {
      if (automationIds.length === 0) return [];
      const { data, error } = await supabase
        .from('crm_automation_steps')
        .select('*')
        .in('automation_id', automationIds)
        .order('step_order');
      if (error) throw error;
      return (data ?? []) as CrmAutomationStep[];
    },
    enabled: automationIds.length > 0,
    staleTime: 30_000,
  });

  const stepsMap = (allSteps ?? []).reduce<Record<string, CrmAutomationStep[]>>((acc, s) => {
    if (!acc[s.automation_id]) acc[s.automation_id] = [];
    acc[s.automation_id].push(s);
    return acc;
  }, {});

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CrmAutomation | null>(null);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [logSheetOpen, setLogSheetOpen] = useState(false);
  const [logAutomation, setLogAutomation] = useState<{ id: string; name: string } | null>(null);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [search, setSearch] = useState('');
  const [templatePrefill, setTemplatePrefill] = useState<typeof AUTOMATION_TEMPLATES[number] | null>(null);

  const openCreate = () => { setEditing(null); setTemplatePrefill(null); setDialogOpen(true); };
  const openEdit = (a: CrmAutomation) => { setEditing(a); setTemplatePrefill(null); setDialogOpen(true); };

  const handleTemplatePick = (tpl: typeof AUTOMATION_TEMPLATES[number]) => {
    setEditing(null);
    setTemplatePrefill(tpl);
    setDialogOpen(true);
  };

  const handleDuplicate = (a: CrmAutomation) => {
    setEditing(null);
    setTemplatePrefill(null);
    const prefill = {
      id: 'duplicate', name: `${a.name} (Copy)`, description: a.description ?? '',
      trigger_type: a.trigger_type, trigger_config: a.trigger_config ?? {},
      steps: (stepsMap[a.id] ?? []).map(s => ({ action_type: s.action_type, action_config: (s.action_config as Record<string, unknown>) ?? {} })),
      icon: 'Zap',
    };
    setTemplatePrefill(prefill as any);
    setDialogOpen(true);
  };

  const handleViewLog = (a: CrmAutomation) => {
    setLogAutomation({ id: a.id, name: a.name });
    setLogSheetOpen(true);
  };

  const filtered = (automations ?? []).filter(a => {
    if (filter === 'active' && !a.is_active) return false;
    if (filter === 'inactive' && a.is_active) return false;
    if (search && !a.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalActive = (automations ?? []).filter(a => a.is_active).length;
  const totalRuns = (automations ?? []).reduce((sum, a) => sum + (a.runs_count ?? 0), 0);
  const totalEnrolled = (automations ?? []).reduce((sum, a) => sum + (a.total_enrolled ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Zap className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Automations</h1>
              <p className="text-xs text-muted-foreground">Build flows to nurture leads, assign agents, and trigger follow-ups automatically</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setTemplatePickerOpen(true)} className="gap-1.5 h-9">
            <Sparkles className="h-3.5 w-3.5" /> Templates
          </Button>
          <Button onClick={openCreate} className="gap-1.5 h-9 bg-primary hover:bg-primary/90" size="sm">
            <Plus className="h-4 w-4" /> New Automation
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      {(automations?.length ?? 0) > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Active Automations', value: totalActive, icon: Activity, color: 'text-emerald-500' },
            { label: 'Total Runs', value: totalRuns, icon: Zap, color: 'text-primary' },
            { label: 'Leads Enrolled', value: totalEnrolled, icon: Users, color: 'text-blue-500' },
          ].map(stat => (
            <div key={stat.label} className="flex items-center gap-3 p-3 rounded-xl border border-border/40 bg-card/50">
              <stat.icon className={`h-5 w-5 ${stat.color} shrink-0`} />
              <div>
                <p className="text-lg font-bold">{stat.value}</p>
                <p className="text-[11px] text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex gap-1 p-1 rounded-lg bg-muted/30 w-fit">
          {(['all', 'active', 'inactive'] as FilterMode[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${
                filter === f ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {f} {f !== 'all' && automations ? `(${automations.filter(a => f === 'active' ? a.is_active : !a.is_active).length})` : ''}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search automations..."
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-48 rounded-xl bg-muted/20 animate-pulse" />)}
        </div>
      ) : !automations?.length ? (
        <div className="text-center py-20 border border-dashed border-border/50 rounded-2xl bg-muted/5">
          <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-5">
            <Zap className="h-10 w-10 text-primary" />
          </div>
          <h3 className="text-xl font-bold text-foreground">Build your first automation</h3>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            Create powerful workflows to automatically nurture leads, send messages, assign agents, and more — just like ManyChat
          </p>
          <div className="flex items-center justify-center gap-3 mt-6">
            <Button onClick={() => setTemplatePickerOpen(true)} variant="outline" className="gap-1.5 h-10">
              <Sparkles className="h-4 w-4" /> Start from Template
            </Button>
            <Button onClick={openCreate} className="gap-1.5 h-10 bg-primary hover:bg-primary/90">
              <Plus className="h-4 w-4" /> Build from Scratch
            </Button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">No matching automations</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map(a => (
            <AutomationCard
              key={a.id}
              automation={a}
              steps={stepsMap[a.id] ?? []}
              onEdit={() => openEdit(a)}
              onDuplicate={() => handleDuplicate(a)}
              onViewLog={() => handleViewLog(a)}
              onToggle={v => toggleMut.mutate({ id: a.id, is_active: v })}
              onDelete={() => deleteMut.mutate(a.id)}
            />
          ))}
        </div>
      )}

      <AutomationBuilderDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing}
        templatePrefill={templatePrefill ? { ...templatePrefill, steps: templatePrefill.steps.map(s => ({ ...s, action_config: { ...s.action_config } })) } : null} />
      <TemplatePickerDialog open={templatePickerOpen} onOpenChange={setTemplatePickerOpen} onSelect={handleTemplatePick} />
      <AutomationLogSheet
        automationId={logAutomation?.id ?? null}
        automationName={logAutomation?.name ?? ''}
        open={logSheetOpen}
        onOpenChange={setLogSheetOpen}
      />
    </div>
  );
}
