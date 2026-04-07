import { useState } from 'react';
import { Zap, Plus, MoreVertical, Trash2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useCrmAutomations, useToggleAutomation, useDeleteAutomation, TRIGGER_TYPES } from '@/hooks/useCrmAutomations';
import { AutomationBuilderDialog } from '@/components/crm/automations/AutomationBuilderDialog';
import { format } from 'date-fns';
import type { CrmAutomation } from '@/hooks/useCrmAutomations';

export default function CrmAutomationsPage() {
  const { data: automations, isLoading } = useCrmAutomations();
  const toggleMut = useToggleAutomation();
  const deleteMut = useDeleteAutomation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CrmAutomation | null>(null);

  const openCreate = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (a: CrmAutomation) => { setEditing(a); setDialogOpen(true); };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          <h1 className="text-lg sm:text-xl font-bold tracking-tight">Automations</h1>
        </div>
        <Button onClick={openCreate} className="gap-1.5 min-h-[44px] sm:min-h-0" size="sm">
          <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Create Automation</span><span className="sm:hidden">Create</span>
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-xl bg-muted/30 animate-pulse" />)}
        </div>
      ) : !automations?.length ? (
        <div className="text-center py-16 text-muted-foreground">
          <Zap className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>No automations yet</p>
          <Button variant="outline" className="mt-3 min-h-[44px]" onClick={openCreate}>Create your first automation</Button>
        </div>
      ) : (
        <div className="space-y-2 sm:space-y-3">
          {automations.map(a => {
            const triggerLabel = TRIGGER_TYPES.find(t => t.value === a.trigger_type)?.label ?? a.trigger_type;
            const enrolled = a.total_enrolled ?? 0;
            const converted = a.total_converted ?? 0;
            const rate = enrolled > 0 ? Math.round((converted / enrolled) * 100) : 0;

            return (
              <div key={a.id}
                className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-[10px] lg:rounded-xl border border-border/50 bg-card/50 hover:bg-card/80 active:bg-muted/40 transition-colors group cursor-pointer"
                onClick={() => openEdit(a)}>
                <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Zap className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm truncate">{a.name}</span>
                    <Badge variant="secondary" className="text-[10px] shrink-0 hidden sm:inline-flex">{triggerLabel}</Badge>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 mt-1 text-[11px] sm:text-xs text-muted-foreground flex-wrap">
                    <span>{enrolled} → {converted} ({rate}%)</span>
                    {a.created_at && <span className="hidden sm:inline">Created {format(new Date(a.created_at), 'MMM d, yyyy')}</span>}
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
                      <DropdownMenuItem className="text-destructive" onClick={() => deleteMut.mutate(a.id)}>
                        <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AutomationBuilderDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
    </div>
  );
}
