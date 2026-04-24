import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Trash2, UserCheck, Tag, ArrowRightLeft, X, Mail } from 'lucide-react';
import { useBulkUpdateContacts, useBulkDeleteContacts, useBulkAddTagsToContacts, LEAD_STATUSES, AGENTS } from '@/hooks/useCrmContacts';
import { useCrmTags, useCreateCrmTag } from '@/hooks/useCrmTags';
import { InlineLibraryPicker } from './InlineLibraryPicker';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface BulkActionsBarProps {
  selectedIds: string[];
  onClearSelection: () => void;
}

export function BulkActionsBar({ selectedIds, onClearSelection }: BulkActionsBarProps) {
  const navigate = useNavigate();
  const bulkUpdate = useBulkUpdateContacts();
  const bulkDelete = useBulkDeleteContacts();
  const bulkAddTags = useBulkAddTagsToContacts();
  const { data: tagLib = [] } = useCrmTags();
  const createTag = useCreateCrmTag();
  const [showDelete, setShowDelete] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [pendingTags, setPendingTags] = useState<string[]>([]);

  const count = selectedIds.length;
  if (count === 0) return null;

  const handleSendEmail = () => {
    // Hand off the filtered/selected lead IDs to the Email Center compose tab.
    // ComposeTab reads ?contactIds=... and treats them as a fixed campaign recipient list.
    const ids = selectedIds.join(',');
    navigate(`/crm/email?tab=compose&contactIds=${encodeURIComponent(ids)}`);
  };

  const handleAssign = (agent: string) => {
    bulkUpdate.mutate({ ids: selectedIds, updates: { assigned_to: agent } });
    onClearSelection();
  };

  const handleStatus = (status: string) => {
    bulkUpdate.mutate({ ids: selectedIds, updates: { status, status_changed_at: new Date().toISOString() } });
    onClearSelection();
  };

  const handleDelete = () => {
    bulkDelete.mutate(selectedIds);
    onClearSelection();
    setShowDelete(false);
  };

  return (
    <>
      <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-xl px-4 py-2.5">
        <span className="text-sm font-medium text-foreground mr-1">{count} selected</span>
        <Button variant="ghost" size="sm" onClick={onClearSelection} className="h-7 px-2">
          <X className="w-3.5 h-3.5" />
        </Button>

        <div className="h-4 w-px bg-border mx-1" />

        <Button
          variant="ghost"
          size="sm"
          onClick={handleSendEmail}
          className="h-8 text-xs gap-1 hover:bg-primary/10 hover:text-primary"
        >
          <Mail className="w-3.5 h-3.5" />
          Send Email
        </Button>

        <Select onValueChange={handleAssign}>
          <SelectTrigger className="h-8 w-auto gap-1 text-xs border-0 bg-transparent hover:bg-muted">
            <UserCheck className="w-3.5 h-3.5" />
            <span>Assign</span>
          </SelectTrigger>
          <SelectContent>
            {AGENTS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select onValueChange={handleStatus}>
          <SelectTrigger className="h-8 w-auto gap-1 text-xs border-0 bg-transparent hover:bg-muted">
            <ArrowRightLeft className="w-3.5 h-3.5" />
            <span>Status</span>
          </SelectTrigger>
          <SelectContent>
            {LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>

        <Button variant="ghost" size="sm" className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setShowDelete(true)}>
          <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
        </Button>
      </div>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {count} contact{count > 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
