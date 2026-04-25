import { Phone, Mail, MessageSquare, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatContactName } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { CrmContact } from '@/hooks/useCrmContacts';
import { LEAD_STATUSES, useUpdateCrmContact } from '@/hooks/useCrmContacts';

interface Props {
  contact: CrmContact;
  onCall: () => void;
  onText: () => void;
  onEmail: () => void;
  onTask: () => void;
  onShowing: () => void;
}

/**
 * Slim, persistent identity bar at the top of the activity column.
 * Stays visible while the timeline scrolls so you always know who you're
 * working with — and can call/text/email/change-stage in one click.
 */
export function StickyLeadHeader({ contact, onCall, onText, onEmail, onTask, onShowing }: Props) {
  const updateContact = useUpdateCrmContact();
  const name = formatContactName(contact.first_name, contact.last_name) || 'Unnamed lead';
  const initials = getInitials(name);

  const onStageChange = (v: string) => {
    updateContact.mutate({
      id: contact.id,
      updates: { status: v, status_changed_at: new Date().toISOString() },
      oldValues: { status: (contact as any).status },
    });
  };

  return (
    <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-md border-b border-border/60 px-5 py-2.5 flex items-center gap-3">
      {/* Avatar */}
      <div className="h-8 w-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-[11px] font-semibold text-primary shrink-0">
        {initials}
      </div>

      {/* Name + meta */}
      <div className="min-w-0 flex-1 hidden sm:block">
        <p className="text-[13.5px] font-semibold text-foreground truncate leading-tight">
          {name}
        </p>
        <p className="text-[11px] text-muted-foreground truncate leading-tight">
          {contact.email || contact.phone || '—'}
        </p>
      </div>

      {/* Stage selector */}
      <Select value={(contact as any).status ?? 'New Lead'} onValueChange={onStageChange}>
        <SelectTrigger className="h-8 text-[12px] font-semibold w-auto min-w-[120px] gap-1.5 border-border/60">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LEAD_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
        </SelectContent>
      </Select>

      {/* CTAs */}
      <div className="flex items-center gap-1.5">
        <CTA icon={Phone}         onClick={onCall}  disabled={!contact.phone} tone="emerald" label="Call" />
        <CTA icon={MessageSquare} onClick={onText}  disabled={!contact.phone} tone="sky"     label="Text" />
        <CTA icon={Mail}          onClick={onEmail} disabled={!contact.email} tone="blue"    label="Email" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={onTask}>Add task</DropdownMenuItem>
            <DropdownMenuItem onClick={onShowing}>Book showing</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

type Tone = 'emerald' | 'sky' | 'blue';
const TONE_CLASSES: Record<Tone, string> = {
  emerald: 'text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700 disabled:text-muted-foreground/40',
  sky:     'text-sky-500 hover:bg-sky-500/10 hover:text-sky-600 disabled:text-muted-foreground/40',
  blue:    'text-blue-700 hover:bg-blue-700/10 hover:text-blue-700 disabled:text-muted-foreground/40',
};

function CTA({ icon: Icon, onClick, disabled, tone, label }: {
  icon: typeof Phone; onClick: () => void; disabled?: boolean; tone: Tone; label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        'h-8 w-8 rounded-md inline-flex items-center justify-center transition-colors disabled:cursor-not-allowed',
        TONE_CLASSES[tone],
      )}
    >
      <Icon className="w-4 h-4" strokeWidth={2.2} />
    </button>
  );
}

function getInitials(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
