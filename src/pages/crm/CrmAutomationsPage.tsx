import { useState } from 'react';
import { Zap, Plus, MoreVertical, Trash2, Pencil, Copy, ScrollText, Clock, RefreshCw, Tag, UserPlus, Mail, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useCrmAutomations, useToggleAutomation, useDeleteAutomation, useCreateAutomation, TRIGGER_TYPES, AUTOMATION_TEMPLATES } from '@/hooks/useCrmAutomations';
import { AutomationBuilderDialog } from '@/components/crm/automations/AutomationBuilderDialog';
import { AutomationLogSheet } from '@/components/crm/automations/AutomationLogSheet';
import { TemplatePickerDialog } from '@/components/crm/automations/TemplatePickerDialog';
import { format, formatDistanceToNow } from 'date-fns';
import type { CrmAutomation } from '@/hooks/useCrmAutomations';

const TRIGGER_ICONS: Record<string, React.ElementType> = {
  new_lead: Zap, status_change: RefreshCw, no_response: Clock, tag_added: Tag, manual: UserPlus,
};

type FilterMode = 'all' | 'active' | 'inactive';

export default function CrmAutomationsPage() {
  const { data: automations, isLoading } = useCrmAutomations();
  const toggleMut = useToggleAutomation();
  const deleteMut = useDeleteAutomation();
  const createMut = useCreateAutomation();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CrmAutomation | null>(null);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [logSheetOpen, setLogSheetOpen] = useState(false);
  const [logAutomation, setLogAutomation] = useState<{ id: string; name: string } | null>(null);
  const [filter, setFilter] = useState<FilterMode>('all');

  // Pre-fill state for template-based creation
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
    // Create a copy with modified name
    const prefill = {
      id: 'duplicate',
      name: `${a.name} (Copy)`,
      description: a.description ?? '',
      trigger_type: a.trigger_type,
      trigger_config: a.trigger_config ?? {},
      steps: [],
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
    if (filter === 'active') return a.is_active;
    if (filter === 'inactive') return !a.is_active;
    return true;
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <h1 className="text-lg sm:text-xl font-bold tracking-tight">Automations</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">Set up rules to automatically manage leads, assign agents, and trigger follow-ups</p>
        </div>
        <Button onClick={openCreate} className="gap-1.5 min-h-[44px] sm:min-h-0 bg-[hsl(39_67%_55%)] hover:bg-[hsl(39_67%_48%)] text-white" size="sm">
          <Plus className="h-4 w-4" /> Create Automation
        </Button>
      </div>

      {/* Filter tabs */}
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

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-xl bg-muted/30 animate-pulse" />)}
        </div>
      ) : !automations?.length ? (
        /* Enhanced empty state */
        <div className="text-center py-16 border border-dashed border-border/50 rounded-2xl bg-muted/10">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Zap className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">Automate your workflow</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
            Start with a template or build your own automation to save time on repetitive tasks
          </p>
          <div className="flex items-center justify-center gap-3 mt-5">
            <Button onClick={() => setTemplatePickerOpen(true)} className="gap-1.5 bg-[hsl(39_67%_55%)] hover:bg-[hsl(39_67%_48%)] text-white">
              Browse Templates
            </Button>
            <Button variant="outline" onClick={openCreate} className="gap-1.5">
              Create from Scratch
            </Button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No {filter} automations</p>
      ) : (
        <div className="space-y-2 sm:space-y-3">
          {filtered.map(a => {
            const triggerLabel = TRIGGER_TYPES.find(t => t.value === a.trigger_type)?.label ?? a.trigger_type;
            const TriggerIcon = TRIGGER_ICONS[a.trigger_type] ?? Zap;
            const runs = a.runs_count ?? 0;

            return (
              <div key={a.id}
                className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-[10px] lg:rounded-xl border border-border/50 bg-card/50 hover:bg-card/80 active:bg-muted/40 transition-colors group cursor-pointer"
                onClick={() => openEdit(a)}>
                <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <TriggerIcon className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm truncate">{a.name}</span>
                    <Badge variant="secondary" className="text-[10px] shrink-0 hidden sm:inline-flex">{triggerLabel}</Badge>
                  </div>
                  {a.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate hidden sm:block">{a.description}</p>
                  )}
                  <div className="flex items-center gap-2 sm:gap-3 mt-1 text-[11px] sm:text-xs text-muted-foreground flex-wrap">
                    <span>Ran {runs} time{runs !== 1 ? 's' : ''}</span>
                    {a.last_run_at && <span>• Last: {formatDistanceToNow(new Date(a.last_run_at), { addSuffix: true })}</span>}
                    {!a.last_run_at && a.created_at && <span className="hidden sm:inline">• Created {format(new Date(a.created_at), 'MMM d, yyyy')}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2" onClick={e => e.stopPropagation()}>
                  <Switch
                    checked={a.is_active ?? false}
                    onCheckedChange={v => toggleMut.mutate({ id: a.id, is_active: v })}
                    className="min-h-[24px]"
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 sm:opacity-0 sm:group-hover:opacity-100">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEdit(a)}>
                        <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDuplicate(a)}>
                        <Copy className="h-3.5 w-3.5 mr-2" /> Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleViewLog(a)}>
                        <ScrollText className="h-3.5 w-3.5 mr-2" /> View Log
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive" onClick={() => deleteMut.mutate(a.id)}>
                        <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}

          {/* Browse templates link at bottom */}
          <button
            onClick={() => setTemplatePickerOpen(true)}
            className="w-full p-3 rounded-xl border border-dashed border-border/50 text-sm text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
          >
            + Browse pre-built templates
          </button>
        </div>
      )}

      <AutomationBuilderDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} templatePrefill={templatePrefill ? { ...templatePrefill, steps: templatePrefill.steps.map(s => ({ ...s, action_config: { ...s.action_config } })) } : null} />
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
