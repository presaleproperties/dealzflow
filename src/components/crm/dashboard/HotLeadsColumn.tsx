import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Flame, Phone, MessageCircle, Mail, StickyNote, CalendarDays, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useCrmContacts, LEAD_STATUSES } from '@/hooks/useCrmContacts';
import { useUpdateCrmContact } from '@/hooks/useCrmLeadDetail';
import { formatContactName } from '@/lib/format';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import type { CrmContact } from '@/hooks/useCrmContacts';

const STATUS_COLORS: Record<string, string> = {
  'Showing Booked': 'hsl(210 62% 46%)',
  'Offer Made': 'hsl(38 92% 50%)',
  'Hot / Engaged': 'hsl(0 84% 60%)',
  'Nurturing': 'hsl(39 67% 55%)',
  'Contacted': 'hsl(142 71% 45%)',
};

function touchDays(contact: CrmContact) {
  if (!contact.last_touch_at) return 999;
  return Math.floor((Date.now() - new Date(contact.last_touch_at).getTime()) / 86400000);
}

function urgencyColor(days: number) {
  if (days <= 3) return 'hsl(142 71% 45%)';
  if (days <= 7) return 'hsl(38 92% 50%)';
  return 'hsl(0 60% 55%)';
}

export function HotLeadsColumn() {
  const navigate = useNavigate();
  const { data: contacts = [], isLoading } = useCrmContacts();
  const updateContact = useUpdateCrmContact();
  const [noteId, setNoteId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [stageId, setStageId] = useState<string | null>(null);

  const hotLeads = useMemo(() => {
    return contacts
      .filter(c => {
        if (['Showing Booked', 'Offer Made', 'Hot / Engaged'].includes(c.status ?? '')) return true;
        if ((c.tags ?? []).some(t => t.toLowerCase().includes('hot'))) return true;
        if (c.status === 'Contacted' && touchDays(c) > 3) return true;
        return false;
      })
      .sort((a, b) => touchDays(b) - touchDays(a))
      .slice(0, 20);
  }, [contacts]);

  const handleSaveNote = async (contact: CrmContact) => {
    if (!noteText.trim()) return;
    const existing = contact.notes || '';
    const timestamp = new Date().toISOString().split('T')[0];
    const updated = `[${timestamp}] ${noteText.trim()}\n${existing}`;
    await updateContact.mutateAsync({ id: contact.id, updates: { notes: updated } });
    toast.success('Note saved');
    setNoteId(null);
    setNoteText('');
  };

  const handleMoveStage = async (contact: CrmContact, newStatus: string) => {
    await updateContact.mutateAsync({ id: contact.id, updates: { status: newStatus } });
    toast.success(`Moved ${contact.first_name} to ${newStatus}`);
    setStageId(null);
  };

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm flex flex-col">
      <div className="flex items-center gap-2 p-3 sm:p-4 border-b border-border">
        <Flame className="w-4 h-4 text-[hsl(0_84%_60%)]" />
        <h3 className="text-sm font-semibold text-foreground">Hot Leads — Take Action</h3>
        <Badge variant="secondary" className="text-[10px] ml-auto">{hotLeads.length}</Badge>
      </div>
      <div className="flex-1 overflow-y-auto max-h-[600px] p-2 space-y-2">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)
        ) : hotLeads.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No hot leads right now 🎉</p>
        ) : (
          hotLeads.map(c => {
            const days = touchDays(c);
            const color = urgencyColor(days);
            return (
              <div
                key={c.id}
                className="rounded-lg border border-border/50 p-3 hover:bg-muted/30 transition-colors"
                style={{ borderLeftWidth: 3, borderLeftColor: color }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <button
                      onClick={() => navigate(`/crm/leads/${c.id}`)}
                      className="text-[15px] font-semibold text-foreground hover:text-primary truncate block"
                    >
                      {formatContactName(c.first_name, c.last_name)}
                    </button>
                    <div className="flex items-center gap-2 mt-0.5">
                      {c.status && (
                        <Badge
                          variant="outline"
                          className="border-0 text-[10px] font-semibold"
                          style={{ background: `${STATUS_COLORS[c.status] ?? 'hsl(220 10% 50%)'}20`, color: STATUS_COLORS[c.status] ?? 'hsl(220 10% 50%)' }}
                        >
                          {c.status}
                        </Badge>
                      )}
                      <span className="text-[11px]" style={{ color }}>
                        {c.last_touch_at ? formatDistanceToNow(new Date(c.last_touch_at), { addSuffix: true }) : 'No activity'}
                      </span>
                    </div>
                    {c.project && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{c.project}</p>}
                  </div>
                </div>

                {/* Quick Note inline */}
                {noteId === c.id && (
                  <div className="mt-2 flex gap-1">
                    <Input
                      value={noteText}
                      onChange={e => setNoteText(e.target.value)}
                      placeholder="Quick note..."
                      className="h-8 text-xs"
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveNote(c); }}
                      autoFocus
                    />
                    <Button size="sm" className="h-8 text-xs px-2" onClick={() => handleSaveNote(c)}>Save</Button>
                  </div>
                )}

                {/* Stage selector */}
                {stageId === c.id && (
                  <div className="mt-2">
                    <Select onValueChange={v => handleMoveStage(c, v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Move to..." /></SelectTrigger>
                      <SelectContent>
                        {LEAD_STATUSES.map(s => (
                          <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex items-center gap-1 mt-2">
                  <TooltipProvider delayDuration={200}>
                    {c.phone && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <a href={`tel:${c.phone}`} className="p-1.5 rounded-md hover:bg-muted/60 transition-colors">
                            <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                          </a>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">Call</TooltipContent>
                      </Tooltip>
                    )}
                    {c.phone && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <a href={`https://wa.me/${c.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener" className="p-1.5 rounded-md hover:bg-muted/60 transition-colors">
                            <MessageCircle className="w-3.5 h-3.5 text-muted-foreground" />
                          </a>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">WhatsApp</TooltipContent>
                      </Tooltip>
                    )}
                    {c.email && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button onClick={() => navigate('/crm/email')} className="p-1.5 rounded-md hover:bg-muted/60 transition-colors">
                            <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">Email</TooltipContent>
                      </Tooltip>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button onClick={() => { setNoteId(noteId === c.id ? null : c.id); setNoteText(''); }} className="p-1.5 rounded-md hover:bg-muted/60 transition-colors">
                          <StickyNote className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">Quick Note</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button onClick={() => navigate('/crm/calendar')} className="p-1.5 rounded-md hover:bg-muted/60 transition-colors">
                          <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">Book Showing</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button onClick={() => setStageId(stageId === c.id ? null : c.id)} className="p-1.5 rounded-md hover:bg-muted/60 transition-colors">
                          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">Move Stage</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            );
          })
        )}
      </div>
      {hotLeads.length > 0 && (
        <div className="p-3 border-t border-border">
          <button onClick={() => navigate('/crm/pipeline')} className="text-xs text-primary hover:underline">
            View all hot leads →
          </button>
        </div>
      )}
    </div>
  );
}
