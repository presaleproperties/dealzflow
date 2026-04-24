import { useState } from 'react';
import { Plus, Trash2, Star, Pencil, Check, X, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
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
import {
  useEmailSignatures,
  useUpsertEmailSignature,
  useDeleteEmailSignature,
  useSetDefaultSignature,
  type EmailSignature,
} from '@/hooks/useEmailSignatures';

export default function SignaturesManager() {
  const { data: signatures = [], isLoading } = useEmailSignatures();
  const upsert = useUpsertEmailSignature();
  const del = useDeleteEmailSignature();
  const setDefault = useSetDefaultSignature();

  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftHtml, setDraftHtml] = useState('');
  const [draftDefault, setDraftDefault] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<EmailSignature | null>(null);

  const startNew = () => {
    setEditingId('new');
    setDraftName('');
    setDraftHtml('');
    setDraftDefault(signatures.length === 0);
  };

  const startEdit = (sig: EmailSignature) => {
    setEditingId(sig.id);
    setDraftName(sig.name);
    setDraftHtml(sig.html);
    setDraftDefault(sig.is_default);
  };

  const cancel = () => {
    setEditingId(null);
    setDraftName('');
    setDraftHtml('');
    setDraftDefault(false);
  };

  const save = async () => {
    if (!draftName.trim()) return;
    await upsert.mutateAsync({
      id: editingId === 'new' ? undefined : (editingId ?? undefined),
      name: draftName.trim(),
      html: draftHtml,
      is_default: draftDefault,
    });
    cancel();
  };

  if (isLoading) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <Label className="text-sm">Saved signatures</Label>
          <p className="text-xs text-muted-foreground">
            Create as many signatures as you need (e.g. full branded, short reply). Pick one per email when you compose.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={startNew} disabled={editingId !== null}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> New signature
        </Button>
      </div>

      {/* List */}
      {signatures.length === 0 && editingId !== 'new' && (
        <div className="rounded-lg border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
          No saved signatures yet. Click "New signature" to add one.
        </div>
      )}

      <div className="space-y-2">
        {signatures.map((sig) => {
          const isEditing = editingId === sig.id;
          const isPreview = previewId === sig.id;
          return (
            <div
              key={sig.id}
              className="rounded-lg border border-border/50 bg-card overflow-hidden"
            >
              {!isEditing ? (
                <div className="px-3 py-2.5 flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium truncate flex-1 min-w-0">{sig.name}</span>
                  {sig.is_default && (
                    <Badge variant="secondary" className="text-[10px] gap-1">
                      <Star className="h-2.5 w-2.5 fill-current" /> Default
                    </Badge>
                  )}
                  <div className="flex items-center gap-1">
                    {!sig.is_default && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => setDefault.mutate(sig.id)}
                        title="Set as default"
                      >
                        <Star className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => setPreviewId(isPreview ? null : sig.id)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => startEdit(sig)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                      onClick={() => setConfirmDelete(sig)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ) : (
                <SignatureEditForm
                  draftName={draftName}
                  draftHtml={draftHtml}
                  draftDefault={draftDefault}
                  onNameChange={setDraftName}
                  onHtmlChange={setDraftHtml}
                  onDefaultChange={setDraftDefault}
                  onCancel={cancel}
                  onSave={save}
                  saving={upsert.isPending}
                />
              )}

              {isPreview && !isEditing && sig.html && (
                <div className="border-t border-border/40 bg-white p-4">
                  <div dangerouslySetInnerHTML={{ __html: sig.html }} />
                </div>
              )}
            </div>
          );
        })}

        {editingId === 'new' && (
          <div className="rounded-lg border border-primary/40 bg-card overflow-hidden">
            <SignatureEditForm
              draftName={draftName}
              draftHtml={draftHtml}
              draftDefault={draftDefault}
              onNameChange={setDraftName}
              onHtmlChange={setDraftHtml}
              onDefaultChange={setDraftDefault}
              onCancel={cancel}
              onSave={save}
              saving={upsert.isPending}
            />
          </div>
        )}
      </div>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this signature?</AlertDialogTitle>
            <AlertDialogDescription>
              "{confirmDelete?.name}" will be permanently removed. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDelete) del.mutate(confirmDelete.id);
                setConfirmDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SignatureEditForm({
  draftName,
  draftHtml,
  draftDefault,
  onNameChange,
  onHtmlChange,
  onDefaultChange,
  onCancel,
  onSave,
  saving,
}: {
  draftName: string;
  draftHtml: string;
  draftDefault: boolean;
  onNameChange: (v: string) => void;
  onHtmlChange: (v: string) => void;
  onDefaultChange: (v: boolean) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const [showPreview, setShowPreview] = useState(false);
  return (
    <div className="p-3 space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Name</Label>
        <Input
          value={draftName}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="e.g. Short Reply, Full Branded"
          className="h-9"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">HTML</Label>
        <Textarea
          value={draftHtml}
          onChange={(e) => onHtmlChange(e.target.value)}
          onPaste={(e) => {
            // Prefer the rich HTML payload over plain text so tables/styles survive
            const html = e.clipboardData?.getData('text/html');
            if (html && isRichHtml(html)) {
              e.preventDefault();
              onHtmlChange(html);
              setShowPreview(true);
            }
          }}
          placeholder="<table>...</table>"
          className="min-h-[160px] font-mono text-xs bg-zinc-950 text-green-400 border-border/40"
        />
      </div>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={draftDefault}
            onChange={(e) => onDefaultChange(e.target.checked)}
            className="rounded border-border"
          />
          Use as default for new emails
        </label>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowPreview((v) => !v)}
            disabled={!draftHtml}
          >
            <Eye className="h-3.5 w-3.5 mr-1.5" />
            {showPreview ? 'Hide preview' : 'Preview'}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            <X className="h-3.5 w-3.5 mr-1.5" /> Cancel
          </Button>
          <Button type="button" size="sm" onClick={onSave} disabled={saving || !draftName.trim()}>
            <Check className="h-3.5 w-3.5 mr-1.5" /> Save
          </Button>
        </div>
      </div>
      {showPreview && draftHtml && (
        <div className="rounded-md border border-border/40 bg-white p-4">
          <div dangerouslySetInnerHTML={{ __html: draftHtml }} />
        </div>
      )}
    </div>
  );
}
