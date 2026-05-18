// CRUD for crm_zara_trigger_map — admin manages trigger→template mapping,
// A/B subject variants, and preferred send-time windows per timezone.
import { useEffect, useMemo, useState } from 'react';
import { ZaraShell } from '@/components/admin/zara/ZaraShell';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

type Row = {
  trigger_kind: string;
  preferred_template_slug: string | null;
  fallback_template_slug: string | null;
  ab_subjects: string[];
  preferred_hour_start: number | null;
  preferred_hour_end: number | null;
  preferred_tz: string;
  description: string | null;
  is_active: boolean;
  updated_at?: string;
};

const EMPTY: Row = {
  trigger_kind: '',
  preferred_template_slug: '',
  fallback_template_slug: '',
  ab_subjects: [],
  preferred_hour_start: 9,
  preferred_hour_end: 18,
  preferred_tz: 'America/Vancouver',
  description: '',
  is_active: true,
};

export default function ZaraTriggerMapPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Row | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('crm_zara_trigger_map')
      .select('*')
      .order('trigger_kind', { ascending: true });
    if (error) toast.error(error.message);
    setRows((data ?? []) as Row[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function save(row: Row, isNew: boolean) {
    const payload = {
      ...row,
      preferred_template_slug: row.preferred_template_slug?.trim() || null,
      fallback_template_slug: row.fallback_template_slug?.trim() || null,
      description: row.description?.trim() || null,
      ab_subjects: (row.ab_subjects ?? []).filter((s) => s && s.trim().length > 0),
    };
    if (!payload.trigger_kind.trim()) {
      toast.error('Trigger kind is required');
      return;
    }
    const { error } = await supabase
      .from('crm_zara_trigger_map')
      .upsert(payload, { onConflict: 'trigger_kind' });
    if (error) { toast.error(error.message); return; }
    toast.success(isNew ? 'Trigger created' : 'Trigger updated');
    setEditing(null);
    setCreating(false);
    load();
  }

  async function remove(kind: string) {
    const { error } = await supabase
      .from('crm_zara_trigger_map')
      .delete()
      .eq('trigger_kind', kind);
    if (error) { toast.error(error.message); return; }
    toast.success('Trigger removed');
    setConfirmDelete(null);
    load();
  }

  return (
    <ZaraShell
      title="Trigger Map"
      subtitle="Map automation triggers to email templates, A/B subjects, and preferred send windows."
      actions={
        <Button size="sm" onClick={() => { setEditing({ ...EMPTY }); setCreating(true); }}>
          <Plus className="h-4 w-4 mr-1" /> New trigger
        </Button>
      }
    >
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No triggers yet — add one to control which template Zara picks for each automation.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {rows.map((r) => (
            <Card key={r.trigger_kind} className="hover:bg-muted/30 transition-colors">
              <CardHeader className="pb-2 flex flex-row items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-base font-semibold flex items-center gap-2 flex-wrap">
                    <code className="text-sm bg-muted px-2 py-0.5 rounded">{r.trigger_kind}</code>
                    {!r.is_active && (
                      <span className="text-[11px] uppercase tracking-wider text-muted-foreground border border-border px-1.5 py-0.5 rounded">
                        inactive
                      </span>
                    )}
                  </CardTitle>
                  {r.description && (
                    <p className="text-xs text-muted-foreground mt-1.5">{r.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => { setEditing({ ...r }); setCreating(false); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(r.trigger_kind)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm pt-0">
                <Field label="Preferred template" value={r.preferred_template_slug ?? '—'} mono />
                <Field label="Fallback template" value={r.fallback_template_slug ?? '—'} mono />
                <Field
                  label="Send window"
                  value={
                    r.preferred_hour_start != null && r.preferred_hour_end != null
                      ? `${pad(r.preferred_hour_start)}:00–${pad(r.preferred_hour_end)}:00 ${r.preferred_tz}`
                      : 'any time'
                  }
                />
                <Field
                  label="A/B subjects"
                  value={r.ab_subjects.length > 0 ? `${r.ab_subjects.length} variant${r.ab_subjects.length === 1 ? '' : 's'}` : '—'}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <EditDialog
        row={editing}
        isNew={creating}
        onClose={() => { setEditing(null); setCreating(false); }}
        onSave={save}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove trigger?</AlertDialogTitle>
            <AlertDialogDescription>
              <code>{confirmDelete}</code> will no longer resolve a template via the registry —
              Zara will fall back to the trigger string as the template key.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDelete && remove(confirmDelete)}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ZaraShell>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-0.5">{label}</div>
      <div className={mono ? 'font-mono text-xs truncate' : 'text-sm truncate'}>{value}</div>
    </div>
  );
}

function pad(n: number) { return String(n).padStart(2, '0'); }

function EditDialog({
  row, isNew, onClose, onSave,
}: {
  row: Row | null;
  isNew: boolean;
  onClose: () => void;
  onSave: (r: Row, isNew: boolean) => void;
}) {
  const [draft, setDraft] = useState<Row | null>(row);
  const [abText, setAbText] = useState('');

  useEffect(() => {
    setDraft(row);
    setAbText((row?.ab_subjects ?? []).join('\n'));
  }, [row]);

  if (!draft) return null;
  const d = draft;
  const set = (patch: Partial<Row>) => setDraft({ ...d, ...patch });

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? 'New trigger' : `Edit ${row?.trigger_kind}`}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="kind">Trigger kind</Label>
            <Input
              id="kind"
              value={d.trigger_kind}
              disabled={!isNew}
              placeholder="e.g. project-showcase"
              onChange={(e) => set({ trigger_kind: e.target.value })}
            />
            {!isNew && (
              <p className="text-[11px] text-muted-foreground">
                Primary key — create a new entry to rename.
              </p>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="pref">Preferred template slug</Label>
              <Input
                id="pref"
                value={d.preferred_template_slug ?? ''}
                onChange={(e) => set({ preferred_template_slug: e.target.value })}
                placeholder="project-showcase-zara"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="fb">Fallback template slug</Label>
              <Input
                id="fb"
                value={d.fallback_template_slug ?? ''}
                onChange={(e) => set({ fallback_template_slug: e.target.value })}
                placeholder="(optional)"
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="hs">Window start (hour)</Label>
              <Input
                id="hs" type="number" min={0} max={23}
                value={d.preferred_hour_start ?? ''}
                onChange={(e) => set({ preferred_hour_start: e.target.value === '' ? null : Number(e.target.value) })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="he">Window end (hour)</Label>
              <Input
                id="he" type="number" min={0} max={23}
                value={d.preferred_hour_end ?? ''}
                onChange={(e) => set({ preferred_hour_end: e.target.value === '' ? null : Number(e.target.value) })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tz">Timezone</Label>
              <Input
                id="tz"
                value={d.preferred_tz}
                onChange={(e) => set({ preferred_tz: e.target.value })}
                placeholder="America/Vancouver"
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="ab">A/B subject variants (one per line)</Label>
            <Textarea
              id="ab"
              rows={3}
              value={abText}
              onChange={(e) => {
                setAbText(e.target.value);
                set({ ab_subjects: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) });
              }}
              placeholder={'Curated projects for you\nQuick picks I pulled this morning'}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="desc">Description</Label>
            <Textarea
              id="desc"
              rows={2}
              value={d.description ?? ''}
              onChange={(e) => set({ description: e.target.value })}
              placeholder="What this trigger fires on"
            />
          </div>

          <div className="flex items-center justify-between border-t border-border pt-3">
            <div>
              <Label htmlFor="active" className="text-sm">Active</Label>
              <p className="text-[11px] text-muted-foreground">When off, Zara ignores this mapping.</p>
            </div>
            <Switch id="active" checked={d.is_active} onCheckedChange={(v) => set({ is_active: v })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(d, isNew)}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
