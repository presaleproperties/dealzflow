import { useState } from 'react';
import { Mail, CalendarDays, ListTodo, ArrowRightLeft, UserCheck, MessageSquare, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUpdateCrmContact } from '@/hooks/useCrmLeadDetail';
import { useUnifiedPipelines, useActivePipelineFor, useSetContactPipeline } from '@/hooks/useUnifiedPipelines';
import { useTeamAgents } from '@/hooks/useTeamAgents';
import { AgentAvatar } from '@/components/crm/AgentAvatar';
import type { CrmContact } from '@/hooks/useCrmContacts';
import { BookShowingDialog } from './BookShowingDialog';
import { CreateTaskDialog } from './CreateTaskDialog';
import { ComposeEmailDialog } from './ComposeEmailDialog';
import { SendTextDialog } from './SendTextDialog';
import { SendBookingLinkDialog } from './SendBookingLinkDialog';

export function LeadQuickActions({ contact }: { contact: CrmContact }) {
  const updateContact = useUpdateCrmContact();
  const { data: agents = [] } = useTeamAgents();
  const { pipelines } = useUnifiedPipelines();
  const activePipeline = useActivePipelineFor(contact);
  const setPipeline = useSetContactPipeline();
  const [showShowing, setShowShowing] = useState(false);
  const [showTask, setShowTask] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [showSms, setShowSms] = useState(false);
  const [showBooking, setShowBooking] = useState(false);

  const handlePipelineChange = (segId: string) => {
    const seg = pipelines.find(p => p.id === segId);
    if (seg) setPipeline.mutate({ contact, segment: seg });
  };

  const handleAgentChange = (agent: string) => {
    updateContact.mutate({ id: contact.id, updates: { assigned_to: agent }, oldValues: { assigned_to: contact.assigned_to } });
  };


  return (
    <>
      <div className="bg-card rounded-xl border border-border p-5 shadow-sm space-y-3">
        <h3 className="text-sm font-semibold text-foreground mb-1">Quick Actions</h3>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5 justify-start" onClick={() => setShowEmail(true)}>
            <Mail className="w-3.5 h-3.5 text-primary" /> Send Email
          </Button>
          <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5 justify-start" onClick={() => setShowShowing(true)}>
            <CalendarDays className="w-3.5 h-3.5" style={{ color: 'hsl(270 60% 55%)' }} /> Book Showing
          </Button>
          <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5 justify-start" onClick={() => setShowTask(true)}>
            <ListTodo className="w-3.5 h-3.5" style={{ color: 'hsl(38 92% 50%)' }} /> Create Task
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 text-xs gap-1.5 justify-start"
            onClick={() => setShowSms(true)}
            disabled={!contact.phone}
            title={contact.phone ? 'Send SMS' : 'No phone number on file'}
          >
            <MessageSquare className="w-3.5 h-3.5" style={{ color: 'hsl(160 60% 40%)' }} /> Send SMS
          </Button>
          <Button
            variant="outline" size="sm"
            className="h-9 text-xs gap-1.5 justify-start col-span-2"
            onClick={() => setShowBooking(true)}
          >
            <Link2 className="w-3.5 h-3.5 text-primary" /> Send Booking Link
          </Button>
        </div>

        <div className="space-y-2 pt-1">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <Select value={activePipeline?.id ?? ''} onValueChange={handlePipelineChange}>
              <SelectTrigger className="h-8 text-xs flex-1">
                <SelectValue placeholder={contact.status ?? 'New Lead'} />
              </SelectTrigger>
              <SelectContent>
                {pipelines.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                      {p.emoji && <span>{p.emoji}</span>}
                      {p.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <UserCheck className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <Select value={contact.assigned_to ?? ''} onValueChange={handleAgentChange}>
              <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Assign agent" /></SelectTrigger>
              <SelectContent>
                {agents.map((a) => <SelectItem key={a.id} value={a.name}><span className="inline-flex items-center gap-2 whitespace-nowrap leading-none"><AgentAvatar name={a.name} headshotUrl={a.headshot_url} focalY={a.focal_y} size={20} />{a.name}</span></SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <BookShowingDialog contactId={contact.id} project={contact.project} open={showShowing} onOpenChange={setShowShowing} />
      <CreateTaskDialog contactId={contact.id} assignedTo={contact.assigned_to} open={showTask} onOpenChange={setShowTask} />
      <ComposeEmailDialog contact={contact} open={showEmail} onOpenChange={setShowEmail} />
      <SendTextDialog contact={contact} open={showSms} onOpenChange={setShowSms} initialChannel="sms" />
      <SendBookingLinkDialog contact={contact} open={showBooking} onOpenChange={setShowBooking} />
    </>
  );
}
