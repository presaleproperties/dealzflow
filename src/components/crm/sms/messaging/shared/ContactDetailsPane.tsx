import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CrmContact } from '@/hooks/useCrmContacts';
import type { MessagingChannel } from '@/hooks/useSms';
import { initialsFor, nameFor } from './types';

interface Props {
  contact: CrmContact;
  messageCount: number;
  channel: MessagingChannel;
  onOpenLead: (id: string) => void;
}

export function ContactDetailsPane({ contact, messageCount, channel, onOpenLead }: Props) {
  const isWa = channel === 'whatsapp';
  return (
    <div className="border-l border-border bg-muted/10 flex flex-col min-h-0">
      <ScrollArea className="flex-1">
        <div className="p-5">
          <div className="flex flex-col items-center text-center mb-5">
            <Avatar className="h-16 w-16 mb-3">
              <AvatarFallback
                className={cn(
                  'text-base font-semibold',
                  isWa
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                    : 'bg-primary/15 text-primary',
                )}
              >
                {initialsFor(contact, contact.phone || '')}
              </AvatarFallback>
            </Avatar>
            <div className="text-[15px] font-semibold">{nameFor(contact, contact.phone || '')}</div>
            <div className="text-[11px] text-muted-foreground font-mono mt-0.5">{contact.phone}</div>
            {contact.email && (
              <div className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-full">{contact.email}</div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 mb-5">
            <div className="rounded-xl bg-background border border-border p-2.5 text-center">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Messages</div>
              <div className="text-base font-semibold mt-0.5">{messageCount}</div>
            </div>
            <div className="rounded-xl bg-background border border-border p-2.5 text-center">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Status</div>
              <div className="text-[11px] font-semibold mt-1 truncate">{contact.status || '—'}</div>
            </div>
          </div>

          <div className="space-y-3">
            <DetailRow label="Source" value={contact.source} />
            <DetailRow label="Type" value={contact.lead_type} />
            <DetailRow label="Assigned to" value={contact.assigned_to} />
            <DetailRow label="City" value={(contact as any).city} />
            {contact.tags && contact.tags.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Tags</div>
                <div className="flex flex-wrap gap-1">
                  {contact.tags.map((t: string) => (
                    <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Button className="w-full mt-5 gap-1.5" variant="outline" size="sm" onClick={() => onOpenLead(contact.id)}>
            Open lead <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </ScrollArea>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between items-center text-[12px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground truncate max-w-[60%] text-right">{value}</span>
    </div>
  );
}
