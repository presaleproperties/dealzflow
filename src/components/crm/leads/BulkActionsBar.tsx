import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Trash2, UserCheck, Tag, ArrowRightLeft, X, Mail, MessageSquare, Zap } from 'lucide-react';
import {
  useBulkUpdateContacts,
  useBulkDeleteContacts,
  useBulkAddTagsToContacts,
  useCrmContacts,
  LEAD_STATUSES,
} from '@/hooks/useCrmContacts';
import { useTeamAgents } from '@/hooks/useTeamAgents';
import { AgentAvatar } from '@/components/crm/AgentAvatar';
import { useCrmTags, useCreateCrmTag } from '@/hooks/useCrmTags';
import { InlineLibraryPicker } from './InlineLibraryPicker';
import { SendTextDialog } from './SendTextDialog';
import { ComposeEmailDialog } from '@/components/crm/leads/ComposeEmailDialog';
import { EnrollInAutomationDialog } from '@/components/crm/automations/EnrollInAutomationDialog';
import { formatContactName } from '@/lib/format';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface BulkActionsBarProps {
  selectedIds: string[];
  onClearSelection: () => void;
}

export function BulkActionsBar({ selectedIds, onClearSelection }: BulkActionsBarProps) {
  const bulkUpdate = useBulkUpdateContacts();
  const bulkDelete = useBulkDeleteContacts();
  const bulkAddTags = useBulkAddTagsToContacts();
  const { data: tagLib = [] } = useCrmTags();
  const { data: agents = [] } = useTeamAgents();
  const { data: allContacts = [] } = useCrmContacts();
  const createTag = useCreateCrmTag();
  const [showDelete, setShowDelete] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [pendingTags, setPendingTags] = useState<string[]>([]);
  const [showBulkText, setShowBulkText] = useState(false);
  const [showBulkEmail, setShowBulkEmail] = useState(false);
  const [showEnroll, setShowEnroll] = useState(false);

  const count = selectedIds.length;

  // Resolve full contact rows for the selected IDs so the composer gets real
  // CrmContact objects (with email/name) up-front. Selection order is
  // preserved so the recipient chip rail reads naturally.
  const selectedContacts = useMemo(() => {
    const map = new Map(allContacts.map((c) => [c.id, c]));
    return selectedIds
      .map((id) => map.get(id))
      .filter((c): c is NonNullable<typeof c> => !!c);
  }, [selectedIds, allContacts]);

  if (count === 0) return null;

  const handleSendEmail = () => {
    setShowBulkEmail(true);
  };

  const handleAssign = (agent: string) => {
    bulkUpdate.mutate({ ids: selectedIds, updates: { assigned_to: agent } });
    // Keep selection so the user can chain more updates on the same set.
  };

  const handleStatus = (status: string) => {
    bulkUpdate.mutate({ ids: selectedIds, updates: { status, status_changed_at: new Date().toISOString() } });
    // Keep selection so the user can chain more updates on the same set.
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

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowBulkText(true)}
          className="h-8 text-xs gap-1 hover:bg-primary/10 hover:text-primary"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Send Text
        </Button>

        <Select onValueChange={handleAssign}>
          <SelectTrigger className="h-8 w-auto gap-1 text-xs border-0 bg-transparent hover:bg-muted">
            <UserCheck className="w-3.5 h-3.5" />
            <span>Assign</span>
          </SelectTrigger>
          <SelectContent>
            {agents.map((a) => (
              <SelectItem key={a.id} value={a.name}>
                <span className="inline-flex items-center gap-2 whitespace-nowrap leading-none">
                  <AgentAvatar name={a.name} headshotUrl={a.headshot_url} focalY={a.focal_y} size={20} />
                  {a.name}
                </span>
              </SelectItem>
            ))}
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

        <Popover
          open={tagsOpen}
          onOpenChange={(o) => {
            setTagsOpen(o);
            if (!o && pendingTags.length > 0) {
              bulkAddTags.mutate({ ids: selectedIds, tags: pendingTags });
              setPendingTags([]);
              // Keep selection so the user can chain more updates on the same set.
            } else if (!o) {
              setPendingTags([]);
            }
          }}
        >
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 text-xs gap-1 hover:bg-muted">
              <Tag className="w-3.5 h-3.5" />
              <span>Add Tag</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-3" align="start">
            <div className="text-xs font-medium text-muted-foreground mb-2">
              Tag {count} contact{count > 1 ? 's' : ''} (close to apply)
            </div>
            <InlineLibraryPicker
              selected={pendingTags}
              library={tagLib.map((t) => ({ label: t.name, count: t.usage_count ?? 0 }))}
              onChange={setPendingTags}
              onCreate={(name) => createTag.mutate(name)}
              placeholder="Search or add tag…"
              emptyText="Pick or create tags to apply"
            />
          </PopoverContent>
        </Popover>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowEnroll(true)}
          className="h-8 text-xs gap-1 hover:bg-primary/10 hover:text-primary"
        >
          <Zap className="w-3.5 h-3.5" />
          Enroll in Automation
        </Button>

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

      {/* Mass text — opens the canonical SendTextDialog with the first
          selected lead as primary and the rest as extras. >1 recipient routes
          through `bulk-send-sms` (personalized server-side) automatically. */}
      {showBulkText && selectedContacts.length > 0 && (
        <SendTextDialog
          contact={selectedContacts[0]}
          extraContacts={selectedContacts.slice(1)}
          open={showBulkText}
          onOpenChange={setShowBulkText}
          onSent={() => { /* keep selection so user can chain follow-ups */ }}
        />
      )}

      {/* Mass email — opens the canonical composer with the selected leads
          pre-loaded as recipients. >1 recipient routes through the
          mass-send confirmation flow automatically. */}
      {showBulkEmail && selectedContacts.length > 0 && (
        <ComposeEmailDialog
          contact={selectedContacts[0]}
          extraContacts={selectedContacts.slice(1)}
          open={showBulkEmail}
          onOpenChange={setShowBulkEmail}
          onSent={() => { /* keep selection so user can chain follow-ups */ }}
        />
      )}

      <EnrollInAutomationDialog
        open={showEnroll}
        onOpenChange={(o) => { setShowEnroll(o); if (!o) onClearSelection(); }}
        contactIds={selectedIds}
        contactNames={selectedContacts.map((c) => formatContactName(c.first_name, c.last_name))}
      />
    </>

  );
}
