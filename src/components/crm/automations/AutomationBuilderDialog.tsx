import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Mail, MessageCircle, Clock, UserPlus, RefreshCw, Tag, CheckSquare, Bell,
  Plus, Trash2, ArrowDown, Zap, GripVertical, X, ChevronRight, Sparkles,
  Save, Play, Pause,
} from 'lucide-react';
import { TRIGGER_TYPES, ACTION_TYPES, useCreateAutomation, useUpdateAutomation, useCrmAutomationSteps } from '@/hooks/useCrmAutomations';
import { useCrmEmailTemplates } from '@/hooks/useCrmEmail';
import { LEAD_STATUSES, LEAD_SOURCES, AGENTS } from '@/hooks/useCrmContacts';
import type { CrmAutomation } from '@/hooks/useCrmAutomations';

const ACTION_ICONS: Record<string, React.ElementType> = {
  send_email: Mail, send_whatsapp: MessageCircle, wait: Clock,
  assign_agent: UserPlus, update_status: RefreshCw, add_tag: Tag, create_task: CheckSquare,
  send_notification: Bell,
};

const TRIGGER_ICONS: Record<string, React.ElementType> = {
  new_lead: Zap, status_change: RefreshCw, no_response: Clock, tag_added: Tag, manual: UserPlus,
};

const ACTION_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  send_email: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-500' },
  send_whatsapp: { bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-500' },
  wait: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-500' },
  assign_agent: { bg: 'bg-violet-500/10', border: 'border-violet-500/30', text: 'text-violet-500' },
  update_status: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', text: 'text-cyan-500' },
  add_tag: { bg: 'bg-pink-500/10', border: 'border-pink-500/30', text: 'text-pink-500' },
  create_task: { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-500' },
  send_notification: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-500' },
};

type StepDraft = { action_type: string; action_config: Record<string, unknown> };

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: CrmAutomation | null;
  templatePrefill?: { name: string; description?: string; trigger_type: string; trigger_config: Record<string, unknown> | {}; steps: { action_type: string; action_config: Record<string, unknown> }[] } | null;
}

export function AutomationBuilderDialog({ open, onOpenChange, editing, templatePrefill }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerType, setTriggerType] = useState('new_lead');
  const [triggerConfig, setTriggerConfig] = useState<Record<string, unknown>>({});
  const [actions, setActions] = useState<StepDraft[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [showAddAction, setShowAddAction] = useState(false);
  const [selectedNode, setSelectedNode] = useState<'trigger' | number | null>('trigger');

  const { data: existingSteps } = useCrmAutomationSteps(editing?.id ?? null);
  const { data: templates } = useCrmEmailTemplates();
  const createMut = useCreateAutomation();
  const updateMut = useUpdateAutomation();

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setDescription(editing.description ?? '');
      setTriggerType(editing.trigger_type);
      setTriggerConfig((editing.trigger_config as Record<string, unknown>) ?? {});
      setIsActive(editing.is_active ?? true);
      setSelectedNode('trigger');
      setShowAddAction(false);
    } else if (templatePrefill) {
      setName(templatePrefill.name);
      setDescription(templatePrefill.description ?? '');
      setTriggerType(templatePrefill.trigger_type);
      setTriggerConfig({ ...(templatePrefill.trigger_config || {}) });
      setActions(templatePrefill.steps?.map(s => ({ ...s })) ?? []);
      setIsActive(false);
      setSelectedNode('trigger');
      setShowAddAction(false);
    } else {
      setName(''); setDescription(''); setTriggerType('new_lead'); setTriggerConfig({});
      setActions([]); setIsActive(false); setSelectedNode('trigger'); setShowAddAction(false);
    }
  }, [open, editing, templatePrefill]);

  useEffect(() => {
    if (existingSteps && existingSteps.length > 0 && editing) {
      setActions(existingSteps.map(s => ({
        action_type: s.action_type,
        action_config: (s.action_config as Record<string, unknown>) ?? {},
      })));
    }
  }, [existingSteps, editing]);

  const addAction = (type: string) => {
    setActions(prev => [...prev, { action_type: type, action_config: {} }]);
    setSelectedNode(actions.length);
    setShowAddAction(false);
  };

  const removeAction = (idx: number) => {
    setActions(prev => prev.filter((_, i) => i !== idx));
    setSelectedNode('trigger');
  };

  const updateActionConfig = (idx: number, key: string, val: unknown) => {
    setActions(prev => prev.map((a, i) => i === idx ? { ...a, action_config: { ...a.action_config, [key]: val } } : a));
  };

  const handleSave = () => {
    const stepsPayload = actions.map((a, i) => ({
      step_order: i + 1, action_type: a.action_type, action_config: a.action_config,
    }));

    if (editing) {
      updateMut.mutate({
        id: editing.id,
        automation: { name, description, trigger_type: triggerType, trigger_config: triggerConfig, is_active: isActive },
        steps: stepsPayload,
      }, { onSuccess: () => onOpenChange(false) });
    } else {
      createMut.mutate({
        automation: { name, description, trigger_type: triggerType, trigger_config: triggerConfig, is_active: isActive },
        steps: stepsPayload,
      }, { onSuccess: () => onOpenChange(false) });
    }
  };

  const isSaving = createMut.isPending || updateMut.isPending;

  const renderTriggerConfig = () => {
    switch (triggerType) {
      case 'new_lead':
        return (
          <div className="space-y-3">
            <Label className="text-xs font-medium">Filter by source</Label>
            <Select value={(triggerConfig.source as string) ?? ''} onValueChange={v => setTriggerConfig(p => ({ ...p, source: v || undefined }))}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Any source" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any source</SelectItem>
                {LEAD_SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        );
      case 'status_change':
        return (
          <div className="space-y-3">
            <Label className="text-xs font-medium">When status changes to</Label>
            <Select value={(triggerConfig.status as string) ?? ''} onValueChange={v => setTriggerConfig(p => ({ ...p, status: v }))}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select status" /></SelectTrigger>
              <SelectContent>
                {LEAD_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        );
      case 'no_response':
        return (
          <div className="space-y-3">
            <Label className="text-xs font-medium">Days without activity</Label>
            <Input type="number" min={1} className="h-9" value={(triggerConfig.days as number) ?? 14}
              onChange={e => setTriggerConfig(p => ({ ...p, days: Number(e.target.value) }))} />
          </div>
        );
      case 'tag_added':
        return (
          <div className="space-y-3">
            <Label className="text-xs font-medium">Tag name</Label>
            <Input className="h-9" value={(triggerConfig.tag as string) ?? ''}
              onChange={e => setTriggerConfig(p => ({ ...p, tag: e.target.value }))} placeholder="e.g. VIP" />
          </div>
        );
      default:
        return null;
    }
  };

  const renderActionPanel = (action: StepDraft, idx: number) => {
    const label = ACTION_TYPES.find(a => a.value === action.action_type)?.label ?? action.action_type;
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">{label}</h4>
          <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive"
            onClick={() => removeAction(idx)}>
            <Trash2 className="h-3 w-3 mr-1" /> Remove
          </Button>
        </div>

        {action.action_type === 'send_email' && (
          <div className="space-y-3">
            <Label className="text-xs font-medium">Email Template</Label>
            <Select value={(action.action_config.template_id as string) ?? ''}
              onValueChange={v => updateActionConfig(idx, 'template_id', v)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Choose a template..." /></SelectTrigger>
              <SelectContent>
                {templates?.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">The selected template will be sent to the lead's email address</p>
          </div>
        )}
        {action.action_type === 'send_whatsapp' && (
          <div className="space-y-3">
            <Label className="text-xs font-medium">Message</Label>
            <Textarea placeholder="Hi {name}, thanks for your interest in..." rows={3}
              value={(action.action_config.message as string) ?? ''}
              onChange={e => updateActionConfig(idx, 'message', e.target.value)} />
            <div className="flex flex-wrap gap-1">
              {['{name}', '{project}', '{agent}'].map(tag => (
                <button key={tag} onClick={() => updateActionConfig(idx, 'message', ((action.action_config.message as string) ?? '') + ' ' + tag)}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}
        {action.action_type === 'wait' && (
          <div className="space-y-3">
            <Label className="text-xs font-medium">Wait Duration</Label>
            <div className="flex gap-2">
              <Input type="number" min={1} className="w-20 h-9"
                value={(action.action_config.amount as number) ?? 1}
                onChange={e => updateActionConfig(idx, 'amount', Number(e.target.value))} />
              <Select value={(action.action_config.unit as string) ?? 'hours'}
                onValueChange={v => updateActionConfig(idx, 'unit', v)}>
                <SelectTrigger className="h-9 flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="minutes">Minutes</SelectItem>
                  <SelectItem value="hours">Hours</SelectItem>
                  <SelectItem value="days">Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        {action.action_type === 'assign_agent' && (
          <div className="space-y-3">
            <Label className="text-xs font-medium">Assign To</Label>
            <Select value={(action.action_config.agent as string) ?? ''}
              onValueChange={v => updateActionConfig(idx, 'agent', v)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select team member" /></SelectTrigger>
              <SelectContent>
                {AGENTS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {action.action_type === 'update_status' && (
          <div className="space-y-3">
            <Label className="text-xs font-medium">Change Status To</Label>
            <Select value={(action.action_config.status as string) ?? ''}
              onValueChange={v => updateActionConfig(idx, 'status', v)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select new status" /></SelectTrigger>
              <SelectContent>
                {LEAD_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {action.action_type === 'add_tag' && (
          <div className="space-y-3">
            <Label className="text-xs font-medium">Tag Name</Label>
            <Input className="h-9" placeholder="e.g. Hot Lead"
              value={(action.action_config.tag as string) ?? ''}
              onChange={e => updateActionConfig(idx, 'tag', e.target.value)} />
          </div>
        )}
        {action.action_type === 'create_task' && (
          <div className="space-y-3">
            <Label className="text-xs font-medium">Task Title</Label>
            <Input className="h-9" placeholder="Follow up with lead"
              value={(action.action_config.title as string) ?? ''}
              onChange={e => updateActionConfig(idx, 'title', e.target.value)} />
            <Label className="text-xs font-medium">Due In</Label>
            <div className="flex items-center gap-2">
              <Input type="number" min={1} className="w-16 h-9"
                value={(action.action_config.due_days as number) ?? 3}
                onChange={e => updateActionConfig(idx, 'due_days', Number(e.target.value))} />
              <span className="text-xs text-muted-foreground">days after trigger</span>
            </div>
          </div>
        )}
        {action.action_type === 'send_notification' && (
          <div className="space-y-3">
            <Label className="text-xs font-medium">Notification Message</Label>
            <Input className="h-9" placeholder="New lead assigned to you"
              value={(action.action_config.message as string) ?? ''}
              onChange={e => updateActionConfig(idx, 'message', e.target.value)} />
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[85dvh] p-0 gap-0 overflow-hidden" aria-describedby={undefined}>
        <DialogTitle className="sr-only">{editing ? 'Edit Automation' : 'Create Automation'}</DialogTitle>
        {/* Top bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-3 sm:px-4 pr-10 sm:pr-12 py-2 sm:py-3 border-b border-border/50 bg-card/80 shrink-0 gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
            </div>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Automation name..."
              className="border-0 bg-transparent text-sm sm:text-base font-semibold h-8 px-0 focus-visible:ring-0 min-w-0 flex-1"
            />
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <div className="flex items-center gap-1.5 sm:gap-2 mr-1 sm:mr-2">
              <span className="text-[11px] sm:text-xs text-muted-foreground">{isActive ? 'Active' : 'Draft'}</span>
              <Switch checked={isActive} onCheckedChange={setIsActive} className="scale-[0.8] sm:scale-90" />
            </div>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="h-8 text-xs">
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!name.trim() || isSaving}
              className="h-8 gap-1 sm:gap-1.5 bg-primary hover:bg-primary/90 text-xs">
              <Save className="h-3.5 w-3.5" />
              {editing ? 'Save' : 'Create'}
            </Button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row flex-1 min-h-0">
          {/* Flow canvas (left) */}
          <div className="flex-1 bg-muted/10 overflow-y-auto">
            <div className="p-6 flex flex-col items-center min-h-full">
              {/* START node */}
              <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-3">When this happens...</div>

              {/* Trigger node */}
              <div
                onClick={() => setSelectedNode('trigger')}
                className={`w-[280px] rounded-xl border-2 cursor-pointer transition-all ${
                  selectedNode === 'trigger'
                    ? 'border-emerald-500 bg-emerald-500/5 shadow-lg shadow-emerald-500/10'
                    : 'border-border/50 bg-card/80 hover:border-emerald-500/40'
                }`}
              >
                <div className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                      {(() => { const TI = TRIGGER_ICONS[triggerType] ?? Zap; return <TI className="h-5 w-5 text-emerald-500" />; })()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] text-emerald-500 font-medium uppercase tracking-wider">Trigger</div>
                      <p className="text-sm font-semibold truncate">
                        {TRIGGER_TYPES.find(t => t.value === triggerType)?.label}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                </div>
              </div>

              {/* Connector line */}
              <div className="w-px h-8 bg-border relative">
                <ArrowDown className="h-3 w-3 text-muted-foreground absolute -bottom-1.5 -left-[5px]" />
              </div>

              {/* Action nodes */}
              {actions.map((action, idx) => {
                const Icon = ACTION_ICONS[action.action_type] ?? Zap;
                const label = ACTION_TYPES.find(a => a.value === action.action_type)?.label ?? action.action_type;
                const colors = ACTION_COLORS[action.action_type] ?? { bg: 'bg-primary/10', border: 'border-primary/20', text: 'text-primary' };

                return (
                  <div key={idx} className="flex flex-col items-center">
                    <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-3">Then...</div>
                    <div
                      onClick={() => setSelectedNode(idx)}
                      className={`w-[280px] rounded-xl border-2 cursor-pointer transition-all ${
                        selectedNode === idx
                          ? `${colors.border} ${colors.bg} shadow-lg`
                          : 'border-border/50 bg-card/80 hover:border-primary/30'
                      }`}
                    >
                      <div className="p-4">
                        <div className="flex items-center gap-3">
                          <div className={`h-10 w-10 rounded-xl ${colors.bg} flex items-center justify-center`}>
                            <Icon className={`h-5 w-5 ${colors.text}`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className={`text-[10px] ${colors.text} font-medium uppercase tracking-wider`}>
                              Step {idx + 1}
                            </div>
                            <p className="text-sm font-semibold truncate">{label}</p>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        </div>
                      </div>
                    </div>

                    {/* Connector */}
                    {idx < actions.length - 1 && (
                      <div className="w-px h-8 bg-border relative">
                        <ArrowDown className="h-3 w-3 text-muted-foreground absolute -bottom-1.5 -left-[5px]" />
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Add action button */}
              <div className="w-px h-6 bg-border" />
              {showAddAction ? (
                <div className="w-[280px] rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 p-3">
                  <p className="text-xs font-medium text-foreground mb-2">Add an action</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {ACTION_TYPES.map(at => {
                      const AtIcon = ACTION_ICONS[at.value] ?? Zap;
                      const colors = ACTION_COLORS[at.value] ?? { bg: 'bg-primary/10', text: 'text-primary' };
                      return (
                        <button
                          key={at.value}
                          onClick={() => addAction(at.value)}
                          className="flex items-center gap-2 p-2 rounded-lg hover:bg-card/80 transition-colors text-left"
                        >
                          <div className={`h-7 w-7 rounded-md ${colors.bg} flex items-center justify-center shrink-0`}>
                            <AtIcon className={`h-3.5 w-3.5 ${colors.text}`} />
                          </div>
                          <span className="text-xs font-medium truncate">{at.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setShowAddAction(false)} className="w-full mt-2 h-7 text-xs">
                    Cancel
                  </Button>
                </div>
              ) : (
                <button
                  onClick={() => setShowAddAction(true)}
                  className="h-10 w-10 rounded-full border-2 border-dashed border-border hover:border-primary/50 flex items-center justify-center hover:bg-primary/5 transition-all group"
                >
                  <Plus className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </button>
              )}

              <div className="h-8" />
            </div>
          </div>

          {/* Config panel (right) */}
          <div className="w-full sm:w-[320px] border-t sm:border-t-0 sm:border-l border-border/50 bg-card/50 flex flex-col shrink-0 min-h-[200px] sm:min-h-0">
            <div className="px-4 py-3 border-b border-border/30">
              <h3 className="text-sm font-semibold">
                {selectedNode === 'trigger' ? 'Trigger Settings' : typeof selectedNode === 'number' ? 'Action Settings' : 'Settings'}
              </h3>
            </div>
            <ScrollArea className="flex-1 p-4">
              {selectedNode === 'trigger' && (
                <div className="space-y-4">
                  <div className="space-y-3">
                    <Label className="text-xs font-medium">Description</Label>
                    <Input className="h-9" value={description} onChange={e => setDescription(e.target.value)}
                      placeholder="What does this automation do?" />
                  </div>

                  <div className="space-y-3">
                    <Label className="text-xs font-medium">Trigger Type</Label>
                    <div className="space-y-1.5">
                      {TRIGGER_TYPES.map(t => {
                        const TIcon = TRIGGER_ICONS[t.value] ?? Zap;
                        return (
                          <div
                            key={t.value}
                            onClick={() => setTriggerType(t.value)}
                            className={`flex items-center gap-2.5 p-2.5 rounded-lg cursor-pointer transition-all ${
                              triggerType === t.value
                                ? 'bg-emerald-500/10 border border-emerald-500/30'
                                : 'hover:bg-muted/50 border border-transparent'
                            }`}
                          >
                            <TIcon className={`h-4 w-4 shrink-0 ${triggerType === t.value ? 'text-emerald-500' : 'text-muted-foreground'}`} />
                            <div>
                              <p className="text-xs font-medium">{t.label}</p>
                              <p className="text-[10px] text-muted-foreground">{t.description}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {renderTriggerConfig()}
                </div>
              )}

              {typeof selectedNode === 'number' && actions[selectedNode] && (
                renderActionPanel(actions[selectedNode], selectedNode)
              )}

              {selectedNode === null && (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">Click a node on the canvas to configure it</p>
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
