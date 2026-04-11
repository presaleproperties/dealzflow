import { useState } from 'react';
import { MoreVertical, Pencil, Copy, ScrollText, Trash2, Zap, RefreshCw, Clock, Tag, UserPlus, Users, TrendingUp, Play, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AutomationFlowPreview } from './AutomationFlowPreview';
import { TRIGGER_TYPES } from '@/hooks/useCrmAutomations';
import { formatDistanceToNow, format } from 'date-fns';
import type { CrmAutomation, CrmAutomationStep } from '@/hooks/useCrmAutomations';

const TRIGGER_ICONS: Record<string, React.ElementType> = {
  new_lead: Zap, status_change: RefreshCw, no_response: Clock, tag_added: Tag, manual: UserPlus,
};

interface Props {
  automation: CrmAutomation;
  steps: CrmAutomationStep[];
  onEdit: () => void;
  onDuplicate: () => void;
  onViewLog: () => void;
  onToggle: (active: boolean) => void;
  onDelete: () => void;
}

export function AutomationCard({ automation: a, steps, onEdit, onDuplicate, onViewLog, onToggle, onDelete }: Props) {
  const triggerLabel = TRIGGER_TYPES.find(t => t.value === a.trigger_type)?.label ?? a.trigger_type;
  const TriggerIcon = TRIGGER_ICONS[a.trigger_type] ?? Zap;
  const runs = a.runs_count ?? 0;
  const enrolled = a.total_enrolled ?? 0;
  const converted = a.total_converted ?? 0;
  const conversionRate = enrolled > 0 ? Math.round((converted / enrolled) * 100) : 0;

  return (
    <div className="group rounded-xl border border-border/50 bg-card/60 hover:bg-card/90 transition-all hover:shadow-md hover:shadow-primary/5 overflow-hidden">
      {/* Header */}
      <div className="p-4 pb-3 cursor-pointer" onClick={onEdit}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
              a.is_active ? 'bg-emerald-500/15' : 'bg-muted/50'
            }`}>
              <TriggerIcon className={`h-5 w-5 ${a.is_active ? 'text-emerald-500' : 'text-muted-foreground'}`} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm truncate">{a.name}</h3>
                {a.is_active ? (
                  <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 text-[10px] gap-1 shrink-0">
                    <Play className="h-2.5 w-2.5 fill-current" /> Live
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px] gap-1 shrink-0">
                    <Pause className="h-2.5 w-2.5" /> Draft
                  </Badge>
                )}
              </div>
              {a.description && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{a.description}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
            <Switch
              checked={a.is_active ?? false}
              onCheckedChange={onToggle}
              className="scale-90"
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onDuplicate}>
                  <Copy className="h-3.5 w-3.5 mr-2" /> Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onViewLog}>
                  <ScrollText className="h-3.5 w-3.5 mr-2" /> Activity Log
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive" onClick={onDelete}>
                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Flow preview */}
      <div className="px-4 pb-3" onClick={onEdit}>
        <div className="p-3 rounded-lg bg-muted/20 border border-border/30 cursor-pointer">
          <AutomationFlowPreview
            triggerType={a.trigger_type}
            steps={steps.map(s => ({ action_type: s.action_type, action_config: (s.action_config as Record<string, unknown>) ?? {} }))}
          />
        </div>
      </div>

      {/* Stats footer */}
      <div className="px-4 py-2.5 border-t border-border/30 bg-muted/10 flex items-center gap-4 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Users className="h-3 w-3" />
          <span>{enrolled} enrolled</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Zap className="h-3 w-3" />
          <span>{runs} runs</span>
        </div>
        {conversionRate > 0 && (
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-3 w-3" />
            <span>{conversionRate}% converted</span>
          </div>
        )}
        <div className="ml-auto">
          {a.last_run_at ? (
            <span>Last run {formatDistanceToNow(new Date(a.last_run_at), { addSuffix: true })}</span>
          ) : a.created_at ? (
            <span>Created {format(new Date(a.created_at), 'MMM d')}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
