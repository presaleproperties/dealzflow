import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Pencil, Trash2, AlertCircle, Check, X, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import {
  useCrmLeadSegments,
  useCreateLeadSegment,
  useUpdateLeadSegment,
  useDeleteLeadSegment,
  useReorderCrmLeadSegments,
  type LeadSegment,
} from '@/hooks/useCrmLeadSegments';
import { LEAD_STATUSES, LEAD_TYPES, LEAD_SOURCES } from '@/hooks/useCrmContacts';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

type Props = {
  open: boolean;
  onClose: () => void;
  segmentCounts: Record<string, number>;
};

const COLOR_PRESETS = [
  '#6B7280', '#EF4444', '#F97316', '#F59E0B', '#10B981',
  '#06B6D4', '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6',
];

type Draft = {
  name: string;
  emoji: string;
  color: string;
  status: string[];
  lead_type: string[];
  source: string[];
};

const emptyDraft: Draft = { name: '', emoji: '', color: '#6B7280', status: [], lead_type: [], source: [] };

function segmentToDraft(s: LeadSegment): Draft {
  const fc = s.filter_config || {};
  return {
    name: s.name,
    emoji: s.emoji ?? '',
    color: s.color || '#6B7280',
    status: Array.isArray((fc as any).status) ? (fc as any).status : [],
    lead_type: Array.isArray((fc as any).lead_type) ? (fc as any).lead_type : [],
    source: Array.isArray((fc as any).source) ? (fc as any).source : [],
  };
}

function draftToFilterConfig(d: Draft): Record<string, unknown> {
  const fc: Record<string, unknown> = {};
  if (d.status.length) fc.status = d.status;
  if (d.lead_type.length) fc.lead_type = d.lead_type;
  if (d.source.length) fc.source = d.source;
  return fc;
}

function ChipPicker({
  label, options, value, onChange,
}: { label: string; options: readonly string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {options.map(opt => {
          const active = value.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(active ? value.filter(v => v !== opt) : [...value, opt])}
              className={cn(
                'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] border transition-all',
                active
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-transparent border-border/60 text-muted-foreground hover:text-foreground hover:border-border',
              )}
            >
              {active && <Check className="w-3 h-3" />}
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PipelineEditor({
  draft, setDraft, onSave, onCancel, saving, isNew,
}: { draft: Draft; setDraft: (d: Draft) => void; onSave: () => void; onCancel: () => void; saving: boolean; isNew: boolean }) {
  return (
    <div className="space-y-4 border border-border/40 rounded-lg p-4 bg-muted/20">
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <div className="space-y-1.5">
          <Label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Name</Label>
          <Input
            value={draft.name}
            onChange={e => setDraft({ ...draft, name: e.target.value })}
            placeholder="e.g. Hot Leads"
            className="h-9"
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Emoji</Label>
          <Input
            value={draft.emoji}
            onChange={e => setDraft({ ...draft, emoji: e.target.value.slice(0, 4) })}
            placeholder="🔥"
            className="h-9 w-16 text-center"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Color</Label>
        <div className="flex flex-wrap gap-1.5">
          {COLOR_PRESETS.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setDraft({ ...draft, color: c })}
              className={cn(
                'w-7 h-7 rounded-full border-2 transition-all',
                draft.color === c ? 'border-foreground scale-110' : 'border-transparent hover:scale-105',
              )}
              style={{ background: c }}
              aria-label={`Color ${c}`}
            />
          ))}
        </div>
      </div>

      <ChipPicker label="Status" options={LEAD_STATUSES} value={draft.status} onChange={v => setDraft({ ...draft, status: v })} />
      <ChipPicker label="Lead Type" options={LEAD_TYPES} value={draft.lead_type} onChange={v => setDraft({ ...draft, lead_type: v })} />
      <ChipPicker label="Source" options={LEAD_SOURCES} value={draft.source} onChange={v => setDraft({ ...draft, source: v })} />

      <p className="text-[11px] text-muted-foreground">
        Leads matching <strong>any</strong> of the selected values in <strong>each</strong> filter group will be counted in this pipeline.
      </p>

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button size="sm" onClick={onSave} disabled={saving || !draft.name.trim()}>
          {saving ? 'Saving…' : isNew ? 'Create' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

export function ManagePipelinesDialog({ open, onClose, segmentCounts }: Props) {
  const { data: segments = [] } = useCrmLeadSegments();
  const createMut = useCreateLeadSegment();
  const updateMut = useUpdateLeadSegment();
  const deleteMut = useDeleteLeadSegment();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const sortedSegments = useMemo(
    () => [...segments].sort((a, b) => a.sort_order - b.sort_order),
    [segments],
  );

  const startCreate = () => {
    setEditingId(null);
    setDraft(emptyDraft);
    setCreating(true);
  };

  const startEdit = (s: LeadSegment) => {
    setCreating(false);
    setEditingId(s.id);
    setDraft(segmentToDraft(s));
  };

  const cancelEditor = () => {
    setEditingId(null);
    setCreating(false);
    setDraft(emptyDraft);
  };

  const saveCreate = async () => {
    try {
      await createMut.mutateAsync({
        name: draft.name,
        emoji: draft.emoji.trim() || null,
        color: draft.color,
        filter_config: draftToFilterConfig(draft),
      });
      toast.success(`Pipeline "${draft.name}" created`);
      cancelEditor();
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to create pipeline');
    }
  };

  const saveEdit = async () => {
    if (!editingId) return;
    try {
      await updateMut.mutateAsync({
        id: editingId,
        patch: {
          name: draft.name,
          emoji: draft.emoji.trim() || null,
          color: draft.color,
          filter_config: draftToFilterConfig(draft),
        },
      });
      toast.success('Pipeline updated');
      cancelEditor();
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to update pipeline');
    }
  };

  const askDelete = (s: LeadSegment) => {
    const count = segmentCounts[s.id] ?? 0;
    if (count > 0) {
      toast.error(
        `"${s.name}" has ${count.toLocaleString()} lead${count === 1 ? '' : 's'}. Move them to another pipeline first.`,
        { duration: 5000 },
      );
      return;
    }
    setConfirmDeleteId(s.id);
  };

  const confirmDelete = async () => {
    if (!confirmDeleteId) return;
    try {
      await deleteMut.mutateAsync(confirmDeleteId);
      toast.success('Pipeline deleted');
      setConfirmDeleteId(null);
      if (editingId === confirmDeleteId) cancelEditor();
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to delete');
    }
  };

  const segmentToDelete = sortedSegments.find(s => s.id === confirmDeleteId);

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); cancelEditor(); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Manage Pipelines</DialogTitle>
            <DialogDescription>
              Add, edit, or remove the pipeline pills shown on the leads list and Kanban board. Pipelines with leads in them must be emptied before they can be deleted.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-2 py-2">
              {sortedSegments.map(s => {
                const count = segmentCounts[s.id] ?? 0;
                const canDelete = count === 0;
                const isEditing = editingId === s.id;

                if (isEditing) {
                  return (
                    <PipelineEditor
                      key={s.id}
                      draft={draft}
                      setDraft={setDraft}
                      onSave={saveEdit}
                      onCancel={cancelEditor}
                      saving={updateMut.isPending}
                      isNew={false}
                    />
                  );
                }

                const isAllLeads = !s.filter_config || Object.keys(s.filter_config).length === 0;

                return (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border/40 hover:border-border transition-colors group"
                  >
                    <div
                      className="w-2 h-8 rounded-full shrink-0"
                      style={{ background: s.color }}
                    />
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {s.emoji && <span className="text-base">{s.emoji}</span>}
                      <span className="font-medium text-sm truncate">{s.name}</span>
                      <Badge variant="secondary" className="text-[10px] tabular-nums">
                        {count.toLocaleString()}
                      </Badge>
                      {isAllLeads && (
                        <Badge variant="outline" className="text-[9px] uppercase tracking-wide">System</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => startEdit(s)}
                        title="Edit pipeline"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className={cn(
                          'h-7 w-7',
                          canDelete && !isAllLeads ? 'text-destructive hover:text-destructive' : 'opacity-50',
                        )}
                        onClick={() => !isAllLeads && askDelete(s)}
                        disabled={isAllLeads}
                        title={
                          isAllLeads
                            ? 'System pipeline — cannot delete'
                            : canDelete
                              ? 'Delete pipeline'
                              : `Move ${count} lead${count === 1 ? '' : 's'} first`
                        }
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}

              {creating && (
                <PipelineEditor
                  draft={draft}
                  setDraft={setDraft}
                  onSave={saveCreate}
                  onCancel={cancelEditor}
                  saving={createMut.isPending}
                  isNew
                />
              )}
            </div>
          </ScrollArea>

          <DialogFooter className="border-t border-border/40 pt-4 sm:justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={startCreate}
              disabled={creating || editingId !== null}
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              New Pipeline
            </Button>
            <Button variant="default" size="sm" onClick={() => { onClose(); cancelEditor(); }}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDeleteId} onOpenChange={(o) => { if (!o) setConfirmDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-destructive" />
              Delete pipeline?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>{segmentToDelete?.name}</strong> from your pipeline list. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
