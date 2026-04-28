import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2 } from 'lucide-react';
import { useAvailability, useReplaceAvailability, type AvailabilityWindow } from '@/hooks/useScheduler';
import { toast } from 'sonner';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Window { day_of_week: number; start_time: string; end_time: string; is_active: boolean; }

export function SchedulerAvailabilityPanel() {
  const { data: windows = [], isLoading } = useAvailability();
  const replaceMut = useReplaceAvailability();
  const [local, setLocal] = useState<Window[]>([]);

  useEffect(() => {
    if (!isLoading) {
      setLocal(windows.map(w => ({
        day_of_week: w.day_of_week,
        start_time: w.start_time.slice(0, 5),
        end_time: w.end_time.slice(0, 5),
        is_active: w.is_active,
      })));
    }
  }, [isLoading, windows]);

  const dayWindows = (d: number) => local.filter(w => w.day_of_week === d);
  const dayEnabled = (d: number) => dayWindows(d).some(w => w.is_active);

  const toggleDay = (d: number) => {
    if (dayEnabled(d)) {
      setLocal(local.filter(w => w.day_of_week !== d));
    } else {
      setLocal([...local, { day_of_week: d, start_time: '09:00', end_time: '17:00', is_active: true }]);
    }
  };

  const updateWindow = (idx: number, patch: Partial<Window>) => {
    const copy = [...local];
    copy[idx] = { ...copy[idx], ...patch };
    setLocal(copy);
  };

  const removeWindow = (idx: number) => setLocal(local.filter((_, i) => i !== idx));

  const addWindow = (d: number) => {
    setLocal([...local, { day_of_week: d, start_time: '09:00', end_time: '17:00', is_active: true }]);
  };

  const save = async () => {
    // Convert HH:MM to HH:MM:SS for time columns
    const payload = local.map(w => ({
      day_of_week: w.day_of_week,
      start_time: w.start_time.length === 5 ? w.start_time + ':00' : w.start_time,
      end_time: w.end_time.length === 5 ? w.end_time + ':00' : w.end_time,
      is_active: w.is_active,
    }));
    await replaceMut.mutateAsync(payload);
    toast.success('Availability saved');
  };

  if (isLoading) return <div className="text-muted-foreground text-sm">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="text-[13px] text-muted-foreground">
        Weekly hours when invitees can book you. All times in your timezone.
      </div>

      <Card className="p-4 space-y-3">
        {DAYS.map((day, d) => {
          const enabled = dayEnabled(d);
          const items = local
            .map((w, idx) => ({ ...w, idx }))
            .filter(w => w.day_of_week === d);
          return (
            <div key={d} className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4 py-3 border-b border-border last:border-0">
              <div className="flex items-center gap-2.5 sm:w-[120px] sm:pt-1.5 shrink-0">
                <Switch checked={enabled} onCheckedChange={() => toggleDay(d)} />
                <span className="text-[13px] font-medium text-foreground">{day}</span>
                {!enabled && <span className="text-[11.5px] text-muted-foreground italic sm:hidden">Unavailable</span>}
              </div>
              <div className="flex-1 min-w-0 space-y-1.5">
                {items.length === 0 ? (
                  <span className="hidden sm:inline text-[12px] text-muted-foreground italic">Unavailable</span>
                ) : items.map((w) => (
                  <div key={w.idx} className="flex items-center gap-2 flex-wrap">
                    <Input type="time" value={w.start_time} onChange={(e) => updateWindow(w.idx, { start_time: e.target.value })} className="w-[120px] h-9 text-[13px]" />
                    <span className="text-[12px] text-muted-foreground">–</span>
                    <Input type="time" value={w.end_time} onChange={(e) => updateWindow(w.idx, { end_time: e.target.value })} className="w-[120px] h-9 text-[13px]" />
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => removeWindow(w.idx)}>
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
                {enabled && (
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-[11.5px] text-muted-foreground" onClick={() => addWindow(d)}>
                    <Plus className="w-3 h-3 mr-1" /> Add window
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={replaceMut.isPending}>
          {replaceMut.isPending ? 'Saving…' : 'Save availability'}
        </Button>
      </div>
    </div>
  );
}
