import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Phone, Mail, StickyNote, CalendarDays, ChevronDown, Settings2, Tag, Building2, Radio } from 'lucide-react';
import { Pill } from '@/components/crm/shared/Pill';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { useCrmContacts, LEAD_STATUSES } from '@/hooks/useCrmContacts';
import { useCrmLeadSegments } from '@/hooks/useCrmLeadSegments';
import { useUpdateCrmContact } from '@/hooks/useCrmLeadDetail';
import { contactMatchesSegment } from '@/lib/segmentMatching';
import { formatContactName } from '@/lib/format';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import type { CrmContact } from '@/hooks/useCrmContacts';

const STORAGE_KEY = 'hotleads-selected-segments';

const STATUS_COLORS: Record<string, string> = {
  'Showing Booked': 'hsl(210 62% 46%)',
  'Offer Made': 'hsl(38 92% 50%)',
  'Hot / Engaged': 'hsl(0 84% 60%)',
  'Nurturing': 'hsl(var(--primary))',
  'Contacted': 'hsl(142 71% 45%)',
  'New Lead': 'hsl(var(--primary))',
  'Closed': 'hsl(142 71% 30%)',
  'Lost / Cold': 'hsl(220 10% 50%)',
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

function LeadCard({ c, noteId, setNoteId, noteText, setNoteText, handleSaveNote, stageId, setStageId, handleMoveStage, navigate }: {
  c: CrmContact;
  noteId: string | null;
  setNoteId: (id: string | null) => void;
  noteText: string;
  setNoteText: (t: string) => void;
  handleSaveNote: (c: CrmContact) => void;
  stageId: string | null;
  setStageId: (id: string | null) => void;
  handleMoveStage: (c: CrmContact, s: string) => void;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const days = touchDays(c);
  const color = urgencyColor(days);
  const tags = (c.tags ?? []) as string[];
  return (
    <div
      className="rounded-lg border border-border/60 bg-card/50 p-3 hover:bg-muted/30 transition-colors"
      style={{ borderLeftWidth: 2, borderLeftColor: color }}
    >
      {/* Header: Name + status + last touch */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <button
            onClick={() => navigate(`/crm/leads/${c.id}`)}
            className="text-[14px] font-semibold text-foreground hover:underline truncate block text-left"
          >
            {formatContactName(c.first_name, c.last_name)}
          </button>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {c.status && (
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border border-border/60 rounded px-1.5 py-0.5">
                {c.status}
              </span>
            )}
            <span className="text-[11px] text-muted-foreground">
              {c.last_touch_at ? formatDistanceToNow(new Date(c.last_touch_at), { addSuffix: true }) : 'No activity'}
            </span>
          </div>
        </div>
      </div>

      {/* Metadata row: source / project / tags */}
      {(c.source || c.project || tags.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {c.source && (
            <span className="flex items-center gap-1 min-w-0">
              <Radio className="w-3 h-3 shrink-0 opacity-60" />
              <span className="truncate font-medium text-foreground/80">{c.source}</span>
            </span>
          )}
          {c.project && (
            <span className="flex items-center gap-1 min-w-0">
              <Building2 className="w-3 h-3 shrink-0 opacity-60" />
              <span className="truncate">{c.project}</span>
            </span>
          )}
          {c.lead_type && (
            <span className="text-[10px] font-medium uppercase tracking-wider opacity-70">
              {c.lead_type}
            </span>
          )}
        </div>
      )}

      {tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1 items-center">
          <Tag className="w-3 h-3 text-muted-foreground/60" />
          {tags.slice(0, 4).map(t => (
            <Pill key={t} tone="neutral" size="sm">{t}</Pill>
          ))}
          {tags.length > 4 && <span className="text-[10px] text-muted-foreground/60">+{tags.length - 4}</span>}
        </div>
      )}

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

      <div className="flex items-center gap-0.5 mt-2 -ml-1.5">
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
}

export function HotLeadsColumn() {
  const navigate = useNavigate();
  const { data: contacts = [], isLoading } = useCrmContacts();
  const { data: segments = [] } = useCrmLeadSegments();
  const updateContact = useUpdateCrmContact();
  const [noteId, setNoteId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [stageId, setStageId] = useState<string | null>(null);

  // Segments that have actual filters (exclude "All Leads")
  const filterableSegments = useMemo(() =>
    segments.filter(s => s.filter_config && Object.keys(s.filter_config).length > 0),
    [segments]
  );

  // Selected segment IDs persisted to localStorage
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  // Default to first 2 segments if nothing saved yet
  useEffect(() => {
    if (selectedIds.length === 0 && filterableSegments.length > 0) {
      const defaults = filterableSegments.slice(0, 2).map(s => s.id);
      setSelectedIds(defaults);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
    }
  }, [filterableSegments, selectedIds.length]);

  const activeSegments = useMemo(() =>
    filterableSegments.filter(s => selectedIds.includes(s.id)),
    [filterableSegments, selectedIds]
  );

  // Active tab for toggling between selected segments
  const [activeTab, setActiveTab] = useState<string | null>(null);

  // Set initial active tab
  useEffect(() => {
    if (activeSegments.length > 0 && (!activeTab || !selectedIds.includes(activeTab))) {
      setActiveTab(activeSegments[0].id);
    }
  }, [activeSegments, activeTab, selectedIds]);

  const currentSegment = useMemo(() =>
    activeSegments.find(s => s.id === activeTab) ?? activeSegments[0],
    [activeSegments, activeTab]
  );

  const filteredLeads = useMemo(() => {
    if (!currentSegment) return [];
    return contacts
      .filter(c => contactMatchesSegment(c, currentSegment.filter_config))
      .sort((a, b) => touchDays(b) - touchDays(a))
      .slice(0, 20);
  }, [contacts, currentSegment]);

  const toggleSegment = (id: string) => {
    setSelectedIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

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
      {/* Header with segment tabs + settings */}
      <div className="flex items-center gap-2 p-3 sm:p-4 border-b border-border">
        <Users className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <h3 className="text-sm font-semibold text-foreground whitespace-nowrap">Leads</h3>

        {/* Segment toggle tabs */}
        <div className="flex items-center gap-1 ml-2 overflow-x-auto flex-1 min-w-0">
          {activeSegments.map(seg => (
            <button
              key={seg.id}
              onClick={() => setActiveTab(seg.id)}
              className={`text-[10.5px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap transition-colors leading-none ${
                activeTab === seg.id
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
              }`}
            >
              {seg.emoji ? `${seg.emoji} ` : ''}{seg.name}
            </button>
          ))}
        </div>

        <Pill tone="muted" size="sm" className="flex-shrink-0 tabular-nums">{filteredLeads.length}</Pill>

        {/* Segment picker popover */}
        <Popover>
          <PopoverTrigger asChild>
            <button className="p-1 rounded-md hover:bg-muted/60 transition-colors flex-shrink-0">
              <Settings2 className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56 p-2">
            <p className="text-xs font-semibold text-foreground mb-2">Show pipelines</p>
            {filterableSegments.map(seg => (
              <label key={seg.id} className="flex items-center gap-2 py-1.5 px-1 rounded hover:bg-muted/40 cursor-pointer">
                <Checkbox
                  checked={selectedIds.includes(seg.id)}
                  onCheckedChange={() => toggleSegment(seg.id)}
                />
                <span className="text-xs text-foreground truncate">
                  {seg.emoji ? `${seg.emoji} ` : ''}{seg.name}
                </span>
              </label>
            ))}
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex-1 overflow-y-auto max-h-[600px] p-2 space-y-2">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)
        ) : filteredLeads.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No leads in this pipeline 🎉</p>
        ) : (
          filteredLeads.map(c => (
            <LeadCard
              key={c.id}
              c={c}
              noteId={noteId}
              setNoteId={setNoteId}
              noteText={noteText}
              setNoteText={setNoteText}
              handleSaveNote={handleSaveNote}
              stageId={stageId}
              setStageId={setStageId}
              handleMoveStage={handleMoveStage}
              navigate={navigate}
            />
          ))
        )}
      </div>
      {filteredLeads.length > 0 && (
        <div className="p-3 border-t border-border">
          <button onClick={() => navigate('/crm/pipeline')} className="text-xs text-primary hover:underline">
            View all leads →
          </button>
        </div>
      )}
    </div>
  );
}
