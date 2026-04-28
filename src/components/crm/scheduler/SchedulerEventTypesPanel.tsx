import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Plus, Copy, Trash2, ExternalLink, Pencil } from 'lucide-react';
import { useSchedulerEventTypes, useUpdateEventType, useDeleteEventType, useCreateEventType, type SchedulerEventType } from '@/hooks/useScheduler';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { SchedulerEventTypeEditor } from './SchedulerEventTypeEditor';

const LOCATION_LABELS: Record<string, string> = {
  phone: 'Phone',
  video: 'Video',
  in_person: 'In Person',
  custom: 'Custom',
};

export function SchedulerEventTypesPanel({ agentSlug }: { agentSlug: string | null }) {
  const { data: eventTypes = [], isLoading } = useSchedulerEventTypes();
  const updateMut = useUpdateEventType();
  const deleteMut = useDeleteEventType();
  const createMut = useCreateEventType();
  const [editing, setEditing] = useState<SchedulerEventType | null>(null);
  const [creating, setCreating] = useState(false);

  const handleCopy = (slug: string) => {
    if (!agentSlug) {
      toast.error('Set your slug in Profile first');
      return;
    }
    const url = `${window.location.origin}/book/${agentSlug}/${slug}`;
    navigator.clipboard.writeText(url);
    toast.success('Link copied');
  };

  if (isLoading) return <div className="text-muted-foreground text-sm">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-muted-foreground">
          {eventTypes.length} event {eventTypes.length === 1 ? 'type' : 'types'}
        </p>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="w-3.5 h-3.5 mr-1.5" /> New event type
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {eventTypes.map((et) => (
          <Card key={et.id} className="p-4 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: et.color || '#D7A542' }} />
                  <h3 className="font-semibold text-[14.5px] text-foreground truncate">{et.title}</h3>
                </div>
                <p className="text-[12px] text-muted-foreground mt-1 line-clamp-2">
                  {et.description || 'No description'}
                </p>
              </div>
              <Switch
                checked={et.is_active}
                onCheckedChange={(v) => updateMut.mutate({ id: et.id, patch: { is_active: v } })}
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline" className="text-[10.5px] font-normal">{et.duration_min}m</Badge>
              <Badge variant="outline" className="text-[10.5px] font-normal">{LOCATION_LABELS[et.location_type] || et.location_type}</Badge>
              {et.creates_showing && <Badge variant="outline" className="text-[10.5px] font-normal">Showing</Badge>}
              {et.requires_payment && <Badge variant="outline" className="text-[10.5px] font-normal">${(et.price_cents/100).toFixed(0)}</Badge>}
            </div>

            <div className="flex items-center gap-1.5 pt-2 border-t border-border">
              <Button variant="ghost" size="sm" className="h-7 px-2 text-[11.5px]"
                onClick={() => handleCopy(et.slug)}>
                <Copy className="w-3 h-3 mr-1" /> Copy link
              </Button>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-[11.5px]"
                onClick={() => agentSlug && window.open(`/book/${agentSlug}/${et.slug}`, '_blank')}>
                <ExternalLink className="w-3 h-3" />
              </Button>
              <div className="flex-1" />
              <Button variant="ghost" size="sm" className="h-7 px-2"
                onClick={() => setEditing(et)}>
                <Pencil className="w-3 h-3" />
              </Button>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive"
                onClick={() => {
                  if (confirm(`Delete "${et.title}"? Existing bookings will not be affected.`)) {
                    deleteMut.mutate(et.id, { onSuccess: () => toast.success('Deleted') });
                  }
                }}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {(editing || creating) && (
        <SchedulerEventTypeEditor
          eventType={editing}
          onClose={() => { setEditing(null); setCreating(false); }}
          onCreate={async (payload) => {
            await createMut.mutateAsync(payload);
            toast.success('Event type created');
            setCreating(false);
          }}
          onUpdate={async (id, patch) => {
            await updateMut.mutateAsync({ id, patch });
            toast.success('Saved');
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
