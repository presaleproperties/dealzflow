import { useState } from 'react';
import { Mail, MessageCircle, CalendarDays, ListTodo, ArrowRightLeft, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUpdateCrmContact } from '@/hooks/useCrmLeadDetail';
import { LEAD_STATUSES, AGENTS } from '@/hooks/useCrmContacts';
import type { CrmContact } from '@/hooks/useCrmContacts';
import { BookShowingDialog } from './BookShowingDialog';
import { CreateTaskDialog } from './CreateTaskDialog';
import { ComposeEmailDialog } from './ComposeEmailDialog';

export function LeadQuickActions({ contact }: { contact: CrmContact }) {
  const updateContact = useUpdateCrmContact();
  const [showShowing, setShowShowing] = useState(false);
  const [showTask, setShowTask] = useState(false);
  const [showEmail, setShowEmail] = useState(false);

  const handleStatusChange = (status: string) => {
    updateContact.mutate({ id: contact.id, updates: { status, status_changed_at: new Date().toISOString() }, oldValues: { status: contact.status } });
  };

  const handleAgentChange = (agent: string) => {
    updateContact.mutate({ id: contact.id, updates: { assigned_to: agent }, oldValues: { assigned_to: contact.assigned_to } });
  };

  const openWhatsApp = () => {
    if (contact.phone) {
      const num = contact.phone.replace(/\D/g, '');
      window.open(`https://wa.me/${num}`, '_blank');
    }
  };

  return (
    <>
      <div className="bg-card rounded-xl border border-border p-5 shadow-sm space-y-3">
        <h3 className="text-sm font-semibold text-foreground mb-1">Quick Actions</h3>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5 justify-start" onClick={() => setShowEmail(true)}>
            <Mail className="w-3.5 h-3.5 text-primary" /> Send Email
          </Button>
          <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5 justify-start" onClick={openWhatsApp} disabled={!contact.phone}>
            <MessageCircle className="w-3.5 h-3.5" style={{ color: 'hsl(142 71% 45%)' }} /> WhatsApp
          </Button>
          <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5 justify-start" onClick={() => setShowShowing(true)}>
            <CalendarDays className="w-3.5 h-3.5" style={{ color: 'hsl(270 60% 55%)' }} /> Book Showing
          </Button>
          <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5 justify-start" onClick={() => setShowTask(true)}>
            <ListTodo className="w-3.5 h-3.5" style={{ color: 'hsl(38 92% 50%)' }} /> Create Task
          </Button>
        </div>

        <div className="space-y-2 pt-1">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <Select value={contact.status ?? 'New Lead'} onValueChange={handleStatusChange}>
              <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <UserCheck className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <Select value={contact.assigned_to ?? ''} onValueChange={handleAgentChange}>
              <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Assign agent" /></SelectTrigger>
              <SelectContent>
                {AGENTS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <BookShowingDialog contactId={contact.id} project={contact.project} open={showShowing} onOpenChange={setShowShowing} />
      <CreateTaskDialog contactId={contact.id} assignedTo={contact.assigned_to} open={showTask} onOpenChange={setShowTask} />
      <ComposeEmailDialog contact={contact} open={showEmail} onOpenChange={setShowEmail} />
    </>
  );
}
