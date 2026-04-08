import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Mail, MessageCircle, Clock, UserPlus, RefreshCw, Tag, CheckSquare, Bell,
  Plus, Trash2, ArrowDown, Zap, GripVertical,
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

type StepDraft = { action_type: string; action_config: Record<string, unknown> };

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: CrmAutomation | null;
  templatePrefill?: { name: string; description?: string; trigger_type: string; trigger_config: Record<string, unknown> | {}; steps: { action_type: string; action_config: Record<string, unknown> }[] } | null;
}

export function AutomationBuilderDialog({ open, onOpenChange, editing, templatePrefill }: Props) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerType, setTriggerType] = useState('new_lead');
  const [triggerConfig, setTriggerConfig] = useState<Record<string, unknown>>({});
  const [actions, setActions] = useState<StepDraft[]>([]);
  const [isActive, setIsActive] = useState(false);

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
      setStep(0);
    } else if (templatePrefill) {
      setName(templatePrefill.name);
      setDescription(templatePrefill.description ?? '');
      setTriggerType(templatePrefill.trigger_type);
      setTriggerConfig({ ...(templatePrefill.trigger_config || {}) });
      setActions(templatePrefill.steps?.map(s => ({ ...s })) ?? []);
      setIsActive(false);
      setStep(0);
    } else {
      setName(''); setDescription(''); setTriggerType('new_lead'); setTriggerConfig({});
      setActions([]); setIsActive(false); setStep(0);
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
  };

  const removeAction = (idx: number) => {
    setActions(prev => prev.filter((_, i) => i !== idx));
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
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Filter by source (optional)</Label>
            <Select value={(triggerConfig.source as string) ?? ''} onValueChange={v => setTriggerConfig(p => ({ ...p, source: v || undefined }))}>
              <SelectTrigger><SelectValue placeholder="Any source" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any source</SelectItem>
                {LEAD_SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        );
      case 'status_change':
        return (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Changes to status</Label>
            <Select value={(triggerConfig.status as string) ?? ''} onValueChange={v => setTriggerConfig(p => ({ ...p, status: v }))}>
              <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
              <SelectContent>
                {LEAD_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        );
      case 'no_response':
        return (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Days without activity</Label>
            <Input type="number" min={1} value={(triggerConfig.days as number) ?? 14}
              onChange={e => setTriggerConfig(p => ({ ...p, days: Number(e.target.value) }))} />
          </div>
        );
      case 'tag_added':
        return (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Tag name</Label>
            <Input value={(triggerConfig.tag as string) ?? ''}
              onChange={e => setTriggerConfig(p => ({ ...p, tag: e.target.value }))} placeholder="e.g. VIP" />
          </div>
        );
      default:
        return null;
    }
  };

  const renderActionConfig = (action: StepDraft, idx: number) => {
    const Icon = ACTION_ICONS[action.action_type] ?? Zap;
    const label = ACTION_TYPES.find(a => a.value === action.action_type)?.label ?? action.action_type;

    return (
      <div key={idx} className="relative group">
        {idx > 0 && (
          <div className="flex justify-center py-1">
            <ArrowDown className="h-4 w-4 text-muted-foreground/50" />
          </div>
        )}
        <div className="flex items-start gap-3 p-3 rounded-xl border border-border/50 bg-card/50">
          <div className="flex items-center gap-1 mt-0.5">
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40" />
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Icon className="h-4 w-4 text-primary" />
            </div>
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{label}</span>
              <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100"
                onClick={() => removeAction(idx)}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
            {action.action_type === 'send_email' && (
              <Select value={(action.action_config.template_id as string) ?? ''}
                onValueChange={v => updateActionConfig(idx, 'template_id', v)}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select template" /></SelectTrigger>
                <SelectContent>
                  {templates?.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {action.action_type === 'send_whatsapp' && (
              <Textarea placeholder="Message text (use {name} for lead name)" rows={2}
                value={(action.action_config.message as string) ?? ''}
                onChange={e => updateActionConfig(idx, 'message', e.target.value)} />
            )}
            {action.action_type === 'wait' && (
              <div className="flex gap-2">
                <Input type="number" min={1} className="w-20 h-9"
                  value={(action.action_config.amount as number) ?? 1}
                  onChange={e => updateActionConfig(idx, 'amount', Number(e.target.value))} />
                <Select value={(action.action_config.unit as string) ?? 'hours'}
                  onValueChange={v => updateActionConfig(idx, 'unit', v)}>
                  <SelectTrigger className="h-9 w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hours">Hours</SelectItem>
                    <SelectItem value="days">Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {action.action_type === 'assign_agent' && (
              <Select value={(action.action_config.agent as string) ?? ''}
                onValueChange={v => updateActionConfig(idx, 'agent', v)}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select agent" /></SelectTrigger>
                <SelectContent>
                  {AGENTS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {action.action_type === 'update_status' && (
              <Select value={(action.action_config.status as string) ?? ''}
                onValueChange={v => updateActionConfig(idx, 'status', v)}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select status" /></SelectTrigger>
                <SelectContent>
                  {LEAD_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {action.action_type === 'add_tag' && (
              <Input placeholder="Tag name" className="h-9"
                value={(action.action_config.tag as string) ?? ''}
                onChange={e => updateActionConfig(idx, 'tag', e.target.value)} />
            )}
            {action.action_type === 'create_task' && (
              <div className="space-y-2">
                <Input placeholder="Task title" className="h-9"
                  value={(action.action_config.title as string) ?? ''}
                  onChange={e => updateActionConfig(idx, 'title', e.target.value)} />
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">Due in</Label>
                  <Input type="number" min={1} className="w-16 h-8"
                    value={(action.action_config.due_days as number) ?? 3}
                    onChange={e => updateActionConfig(idx, 'due_days', Number(e.target.value))} />
                  <span className="text-xs text-muted-foreground">days</span>
                </div>
              </div>
            )}
            {action.action_type === 'send_notification' && (
              <Input placeholder="Notification message (optional)" className="h-9"
                value={(action.action_config.message as string) ?? ''}
                onChange={e => updateActionConfig(idx, 'message', e.target.value)} />
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Automation' : 'Create Automation'}</DialogTitle>
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex gap-1">
          {['Trigger', 'Actions', 'Review'].map((label, i) => (
            <button key={label} onClick={() => setStep(i)}
              className={`flex-1 text-center text-xs font-medium py-2 rounded-lg transition-colors ${
                step === i ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:bg-muted'
              }`}>
              {i + 1}. {label}
            </button>
          ))}
        </div>

        {step === 0 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Automation Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. New Facebook Lead Nurture" />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. When a new lead comes in, assign to Uzair" />
            </div>
            <div className="space-y-2">
              <Label>Trigger Type</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {TRIGGER_TYPES.map(t => (
                  <div
                    key={t.value}
                    onClick={() => setTriggerType(t.value)}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      triggerType === t.value
                        ? 'border-primary bg-primary/5'
                        : 'border-border/50 hover:border-primary/30'
                    }`}
                  >
                    <p className="text-sm font-medium">{t.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
                  </div>
                ))}
              </div>
            </div>
            {renderTriggerConfig()}
            <div className="flex justify-end">
              <Button onClick={() => setStep(1)} disabled={!name.trim()}>Next: Actions →</Button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-1">
              {actions.map((a, i) => renderActionConfig(a, i))}
            </div>

            {actions.length > 0 && (
              <div className="flex justify-center py-1">
                <ArrowDown className="h-4 w-4 text-muted-foreground/50" />
              </div>
            )}

            <div>
              <p className="text-xs text-muted-foreground mb-2">Add an action:</p>
              <div className="flex flex-wrap gap-1.5">
                {ACTION_TYPES.map(at => {
                  const Icon = ACTION_ICONS[at.value] ?? Zap;
                  return (
                    <Button key={at.value} variant="outline" size="sm" className="gap-1.5 text-xs"
                      onClick={() => addAction(at.value)}>
                      <Icon className="h-3.5 w-3.5" />
                      {at.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(0)}>← Back</Button>
              <Button onClick={() => setStep(2)} disabled={actions.length === 0}>Next: Review →</Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{name}</h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{isActive ? 'Active' : 'Inactive'}</span>
                  <Switch checked={isActive} onCheckedChange={setIsActive} />
                </div>
              </div>
              {description && <p className="text-xs text-muted-foreground">{description}</p>}
              <div>
                <span className="text-xs text-muted-foreground">Trigger: </span>
                <Badge variant="secondary" className="text-xs">
                  {TRIGGER_TYPES.find(t => t.value === triggerType)?.label}
                </Badge>
                {triggerConfig.source && <span className="text-xs text-muted-foreground ml-1">(source: {triggerConfig.source as string})</span>}
                {triggerConfig.status && <span className="text-xs text-muted-foreground ml-1">(to: {triggerConfig.status as string})</span>}
                {triggerConfig.days && <span className="text-xs text-muted-foreground ml-1">({triggerConfig.days as number} days)</span>}
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">{actions.length} action(s):</span>
                {actions.map((a, i) => {
                  const Icon = ACTION_ICONS[a.action_type] ?? Zap;
                  const label = ACTION_TYPES.find(at => at.value === a.action_type)?.label;
                  return (
                    <div key={i} className="flex items-center gap-2 text-sm pl-2">
                      <span className="text-muted-foreground">{i + 1}.</span>
                      <Icon className="h-3.5 w-3.5 text-primary" />
                      <span>{label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(1)}>← Back</Button>
              <Button onClick={handleSave} disabled={isSaving || !name.trim()}>
                {isSaving ? 'Saving…' : editing ? 'Update Automation' : 'Create Automation'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
