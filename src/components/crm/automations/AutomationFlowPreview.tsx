import { Mail, MessageCircle, Clock, UserPlus, RefreshCw, Tag, CheckSquare, Bell, Zap } from 'lucide-react';
import { ACTION_TYPES, TRIGGER_TYPES } from '@/hooks/useCrmAutomations';

const ACTION_ICONS: Record<string, React.ElementType> = {
  send_email: Mail, send_whatsapp: MessageCircle, wait: Clock,
  assign_agent: UserPlus, update_status: RefreshCw, add_tag: Tag,
  create_task: CheckSquare, send_notification: Bell,
};

const TRIGGER_ICONS: Record<string, React.ElementType> = {
  new_lead: Zap, status_change: RefreshCw, no_response: Clock, tag_added: Tag, manual: UserPlus,
};

interface Props {
  triggerType: string;
  steps: { action_type: string; action_config?: Record<string, unknown> }[];
  compact?: boolean;
}

export function AutomationFlowPreview({ triggerType, steps, compact = false }: Props) {
  const TriggerIcon = TRIGGER_ICONS[triggerType] ?? Zap;
  const triggerLabel = TRIGGER_TYPES.find(t => t.value === triggerType)?.label ?? triggerType;

  if (compact) {
    return (
      <div className="flex items-center gap-1.5 overflow-hidden">
        <div className="flex items-center gap-1 shrink-0">
          <div className="h-6 w-6 rounded-md bg-emerald-500/15 flex items-center justify-center">
            <TriggerIcon className="h-3 w-3 text-emerald-500" />
          </div>
        </div>
        {steps.slice(0, 4).map((step, i) => {
          const StepIcon = ACTION_ICONS[step.action_type] ?? Zap;
          return (
            <div key={i} className="flex items-center gap-1 shrink-0">
              <div className="w-3 h-px bg-border" />
              <div className="h-6 w-6 rounded-md bg-primary/10 flex items-center justify-center">
                <StepIcon className="h-3 w-3 text-primary" />
              </div>
            </div>
          );
        })}
        {steps.length > 4 && (
          <span className="text-[10px] text-muted-foreground ml-1 shrink-0">+{steps.length - 4}</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-start gap-0 overflow-x-auto pb-2 scrollbar-none">
      {/* Trigger node */}
      <div className="flex flex-col items-center shrink-0">
        <div className="h-10 w-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
          <TriggerIcon className="h-5 w-5 text-emerald-500" />
        </div>
        <span className="text-[10px] text-muted-foreground mt-1 max-w-[72px] text-center truncate">{triggerLabel}</span>
      </div>

      {steps.map((step, i) => {
        const StepIcon = ACTION_ICONS[step.action_type] ?? Zap;
        const label = ACTION_TYPES.find(a => a.value === step.action_type)?.label ?? step.action_type;
        const isWait = step.action_type === 'wait';
        return (
          <div key={i} className="flex items-start shrink-0">
            <div className="flex items-center h-10">
              <div className="w-6 h-px bg-border" />
              <div className="w-0 h-0 border-t-[4px] border-b-[4px] border-l-[5px] border-t-transparent border-b-transparent border-l-border" />
            </div>
            <div className="flex flex-col items-center">
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center border ${
                isWait
                  ? 'bg-amber-500/10 border-amber-500/30'
                  : 'bg-primary/10 border-primary/20'
              }`}>
                <StepIcon className={`h-5 w-5 ${isWait ? 'text-amber-500' : 'text-primary'}`} />
              </div>
              <span className="text-[10px] text-muted-foreground mt-1 max-w-[72px] text-center truncate">{label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
