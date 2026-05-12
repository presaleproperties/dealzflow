import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, RotateCcw, Trash2 } from 'lucide-react';
import { useCrmAccess } from '@/contexts/CrmAccessContext';
import { useTrashedLeads, useRestoreContacts, useHardDeleteContacts } from '@/hooks/useLeadDataSafety';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { formatContactName } from '@/lib/format';
import { formatDistanceToNow } from 'date-fns';

export default function CrmTrashPage() {
  const { isOwnerOrAdmin, isLoading } = useCrmAccess();
  const { data: rows = [], isLoading: rowsLoading } = useTrashedLeads();
  const restore = useRestoreContacts();
  const hardDelete = useHardDeleteContacts();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmHard, setConfirmHard] = useState(false);

  if (isLoading) return null;
  if (!isOwnerOrAdmin) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        Only admins and owners can view Trash.
      </div>
    );
  }

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const allChecked = rows.length > 0 && rows.every(r => selected.has(r.id));
  const ids = Array.from(selected);

  return (
    <div className="flex flex-col h-full">
      <header className="px-5 py-3 border-b border-border bg-background flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <Link to="/crm/leads" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" /> Leads
          </Link>
          <div className="h-5 w-px bg-border" />
          <h1 className="text-[15px] font-semibold tracking-tight">Trash</h1>
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground border border-border rounded px-1.5 py-0.5">
            {rows.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={!ids.length || restore.isPending}
            onClick={() => restore.mutate(ids, { onSuccess: () => setSelected(new Set()) })}>
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Restore
          </Button>
          <Button size="sm" variant="destructive" disabled={!ids.length || hardDelete.isPending}
            onClick={() => setConfirmHard(true)}>
            <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete forever
          </Button>
        </div>
      </header>

      <div className="px-5 py-2 text-xs text-muted-foreground border-b border-border bg-muted/30">
        Leads stay in Trash for 30 days, then are permanently removed.
      </div>

      <div className="flex-1 overflow-auto">
        {rowsLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">Trash is empty.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-10 px-3 py-2">
                  <Checkbox
                    checked={allChecked}
                    onCheckedChange={(v) => setSelected(v ? new Set(rows.map(r => r.id)) : new Set())}
                  />
                </th>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Email</th>
                <th className="px-3 py-2 text-left">Phone</th>
                <th className="px-3 py-2 text-left">Assigned</th>
                <th className="px-3 py-2 text-left">Deleted</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} />
                  </td>
                  <td className="px-3 py-2 font-medium">{formatContactName(r.first_name, r.last_name)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.email ?? '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.phone ?? '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.assigned_to ?? '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {formatDistanceToNow(new Date(r.deleted_at), { addSuffix: true })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <AlertDialog open={confirmHard} onOpenChange={setConfirmHard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {ids.length} lead{ids.length === 1 ? '' : 's'} forever?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. All notes, emails, calls, and audit history for these leads will remain in the audit log only.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                hardDelete.mutate(ids, {
                  onSuccess: () => { setSelected(new Set()); setConfirmHard(false); },
                });
              }}
            >
              Delete forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
