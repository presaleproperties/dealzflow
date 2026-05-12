/**
 * DeleteLeadsConfirmDialog
 * ------------------------
 * Three-stage confirmation for soft-deleting CRM contacts:
 *   1. Server-computed scope preview (crm_count_delete_scope) — shows how many
 *      notes / tasks / emails / texts / calls / showings / automations /
 *      behavior events would be hidden alongside the leads.
 *   2. Type-your-name gate — caller must case-insensitive-match their own
 *      crm_team display_name before the destructive action enables.
 *   3. Final click triggers crm_soft_delete_contacts_with_undo, which writes a
 *      single audit row containing the full undo_payload, then toasts
 *      "Deleted N contacts. Restore from Trash within 30 days."
 *
 * Reuses the existing AlertDialog primitive + sonner-style toast already wired
 * via useSoftDeleteContacts.
 */
import { useEffect, useMemo, useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useDeleteScope, useSoftDeleteContacts } from '@/hooks/useLeadDataSafety';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  contactIds: string[];
  /** Called after the soft-delete succeeds (e.g. to clear the parent selection). */
  onDeleted?: (count: number) => void;
}

export function DeleteLeadsConfirmDialog({ open, onOpenChange, contactIds, onDeleted }: Props) {
  const [typed, setTyped] = useState('');
  const scopeQ = useDeleteScope(open ? contactIds : null, open);
  const softDelete = useSoftDeleteContacts();

  // Reset the typed name every time the dialog opens or the selection changes.
  useEffect(() => {
    if (open) setTyped('');
  }, [open, contactIds.length]);

  const expectedName = scopeQ.data?.display_name ?? '';
  const nameMatches = useMemo(
    () => !!expectedName && typed.trim().toLowerCase() === expectedName.trim().toLowerCase(),
    [typed, expectedName],
  );

  const count = contactIds.length;
  const scope = scopeQ.data;

  // Selections of 10 or fewer use a lightweight confirm (preview only) to keep
  // routine cleanup fast. Above that we require the typed-name gate as a
  // safety brake on irreversible bulk damage.
  const TYPE_GATE_THRESHOLD = 10;
  const requireTypedName = count > TYPE_GATE_THRESHOLD;
  const canConfirm = requireTypedName ? nameMatches : true;

  const handleConfirm = async () => {
    if (!canConfirm || softDelete.isPending) return;
    const deleted = await softDelete.mutateAsync(contactIds);
    onOpenChange(false);
    onDeleted?.(typeof deleted === 'number' ? deleted : count);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete {count} lead{count === 1 ? '' : 's'}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Leads move to Trash and stay recoverable for 30 days. After that they're
            permanently purged. Related history listed below will be hidden alongside them.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Scope preview — shown for every selection size */}
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-xs">
          {scopeQ.isLoading || !scope ? (
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3 w-3/5" />
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
              <ScopeRow label="Leads" value={scope.contacts} strong />
              <ScopeRow label="Related items" value={scope.total_related} strong />
              <ScopeRow label="Notes" value={scope.notes} />
              <ScopeRow label="Tasks" value={scope.tasks} />
              <ScopeRow label="Emails" value={scope.emails} />
              <ScopeRow label="Texts" value={scope.texts} />
              <ScopeRow label="Calls" value={scope.calls} />
              <ScopeRow label="Showings" value={scope.showings} />
              <ScopeRow label="Automations" value={scope.automations} />
              <ScopeRow label="Behavior events" value={scope.behavior} />
            </ul>
          )}
        </div>

        {/* Type-to-confirm gate — only for selections > 10 */}
        {requireTypedName && (
          <div className="space-y-1.5">
            <Label htmlFor="delete-confirm-name" className="text-xs text-muted-foreground">
              Type your name to confirm:{' '}
              <span className="font-medium text-foreground">{expectedName || '…'}</span>
            </Label>
            <Input
              id="delete-confirm-name"
              autoComplete="off"
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={expectedName || 'Loading…'}
              disabled={!expectedName || softDelete.isPending}
              className="h-9"
            />
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={softDelete.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
            disabled={!canConfirm || softDelete.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
          >
            {softDelete.isPending ? 'Deleting…' : `Delete ${count} lead${count === 1 ? '' : 's'}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ScopeRow({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <li className="flex items-center justify-between">
      <span>{label}</span>
      <span className={strong ? 'font-semibold text-foreground' : 'text-foreground/80'}>
        {value.toLocaleString()}
      </span>
    </li>
  );
}
