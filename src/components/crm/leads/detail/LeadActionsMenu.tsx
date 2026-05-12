import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MoreHorizontal, Download, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useCrmAccess } from '@/contexts/CrmAccessContext';
import { useExportLead, useSoftDeleteContacts } from '@/hooks/useLeadDataSafety';

interface Props {
  contactId: string;
  contactName: string;
}

/**
 * Overflow menu in the Lead detail top bar:
 *   • Export full history (any user with view access)
 *   • Move to Trash (admin/owner only)
 */
export function LeadActionsMenu({ contactId, contactName }: Props) {
  const navigate = useNavigate();
  const { isOwnerOrAdmin } = useCrmAccess();
  const exportLead = useExportLead();
  const softDelete = useSoftDeleteContacts();
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" className="h-9 w-9 p-0" aria-label="More actions">
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={() => exportLead.mutate(contactId)} disabled={exportLead.isPending}>
            <Download className="w-3.5 h-3.5 mr-2" /> Export full history
          </DropdownMenuItem>
          {isOwnerOrAdmin && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setConfirmOpen(true)}>
                <Trash2 className="w-3.5 h-3.5 mr-2" /> Move to Trash
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move {contactName} to Trash?</AlertDialogTitle>
            <AlertDialogDescription>
              The lead will be hidden from agents but restorable for 30 days from /crm/trash.
              After 30 days it will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                softDelete.mutate([contactId], {
                  onSuccess: () => { setConfirmOpen(false); navigate('/crm/leads'); },
                });
              }}
            >
              Move to Trash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
