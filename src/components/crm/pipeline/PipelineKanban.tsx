import { useState, useMemo, useRef, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useCrmContacts, LEAD_STATUSES, useDynamicFilterOptions } from '@/hooks/useCrmContacts';
import { useUpdateCrmContact } from '@/hooks/useCrmLeadDetail';
import { useIsMobile } from '@/hooks/use-mobile';
import { formatDistanceToNow } from 'date-fns';
import type { CrmContact } from '@/hooks/useCrmContacts';

const STAGE_COLORS: Record<string, string> = {
  'New Lead': 'hsl(39 67% 55% / 0.06)',
  'Contacted': 'hsl(210 62% 46% / 0.06)',
  'Nurturing': 'hsl(38 92% 50% / 0.06)',
  'Hot / Engaged': 'hsl(0 84% 60% / 0.08)',
  'Showing Booked': 'hsl(142 71% 45% / 0.06)',
  'Offer Made': 'hsl(270 60% 55% / 0.06)',
  'Closed': 'hsl(142 71% 30% / 0.1)',
  'Lost / Cold': 'hsl(220 10% 50% / 0.06)',
};

const STAGE_BORDER: Record<string, string> = {
  'New Lead': 'hsl(39 67% 55% / 0.3)',
  'Contacted': 'hsl(210 62% 46% / 0.3)',
  'Nurturing': 'hsl(38 92% 50% / 0.3)',
  'Hot / Engaged': 'hsl(0 84% 60% / 0.3)',
  'Showing Booked': 'hsl(142 71% 45% / 0.3)',
  'Offer Made': 'hsl(270 60% 55% / 0.3)',
  'Closed': 'hsl(142 71% 30% / 0.3)',
  'Lost / Cold': 'hsl(220 10% 50% / 0.3)',
};

const STAGE_DOT: Record<string, string> = {
  'New Lead': 'hsl(39 67% 55%)',
  'Contacted': 'hsl(210 62% 46%)',
  'Nurturing': 'hsl(38 92% 50%)',
  'Hot / Engaged': 'hsl(0 84% 60%)',
  'Showing Booked': 'hsl(142 71% 45%)',
  'Offer Made': 'hsl(270 60% 55%)',
  'Closed': 'hsl(142 71% 30%)',
  'Lost / Cold': 'hsl(220 10% 50%)',
};

function getInitials(name: string | null) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function daysInStage(contact: CrmContact) {
  const ref = contact.status_changed_at || contact.updated_at || contact.created_at;
  const diff = Date.now() - new Date(ref).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function LeadCard({ contact, index }: { contact: CrmContact; index: number }) {
  const days = daysInStage(contact);
  const lastTouch = contact.updated_at || contact.created_at;

  return (
    <Draggable draggableId={contact.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`bg-card rounded-lg border border-border p-2.5 sm:p-3 mb-2 shadow-sm cursor-grab transition-shadow ${snapshot.isDragging ? 'shadow-lg ring-2 ring-primary/20' : 'hover:shadow-md'}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground truncate">
                {contact.first_name} {contact.last_name}
              </p>
              {contact.project && (
                <Badge
                  variant="outline"
                  className="border-0 text-[10px] font-semibold mt-1"
                  style={{ background: 'hsl(39 67% 55% / 0.15)', color: 'hsl(39 67% 55%)' }}
                >
                  {contact.project}
                </Badge>
              )}
            </div>
            {contact.assigned_to && (
              <div
                className="flex items-center justify-center w-7 h-7 rounded-full text-[10px] font-bold flex-shrink-0"
                style={{ background: 'hsl(var(--primary) / 0.12)', color: 'hsl(var(--primary))' }}
                title={contact.assigned_to}
              >
                {getInitials(contact.assigned_to)}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between mt-2 text-[11px] text-muted-foreground">
            <span>{days}d in stage</span>
            <span>{formatDistanceToNow(new Date(lastTouch), { addSuffix: true })}</span>
          </div>
        </div>
      )}
    </Draggable>
  );
}

export function PipelineKanban() {
  const { data: contacts = [], isLoading } = useCrmContacts();
  const updateContact = useUpdateCrmContact();
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [filterProject, setFilterProject] = useState('all');
  const [filterAgent, setFilterAgent] = useState('all');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  const filtered = useMemo(() => {
    let list = contacts;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.phone?.includes(q)
      );
    }
    if (filterProject !== 'all') list = list.filter(c => (c.projects ?? []).includes(filterProject) || c.project === filterProject);
    if (filterAgent !== 'all') list = list.filter(c => c.assigned_to === filterAgent);
    return list;
  }, [contacts, search, filterProject, filterAgent]);

  const columns = useMemo(() => {
    const map: Record<string, CrmContact[]> = {};
    LEAD_STATUSES.forEach(s => { map[s] = []; });
    filtered.forEach(c => {
      const status = c.status ?? 'New Lead';
      if (map[status]) map[status].push(c);
      else map['New Lead'].push(c);
    });
    return map;
  }, [filtered]);

  // Track active column via scroll on mobile
  useEffect(() => {
    if (!isMobile || !scrollRef.current) return;
    const el = scrollRef.current;
    const onScroll = () => {
      const colWidth = el.scrollWidth / LEAD_STATUSES.length;
      const idx = Math.round(el.scrollLeft / colWidth);
      setActiveIdx(Math.min(idx, LEAD_STATUSES.length - 1));
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [isMobile]);

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const newStatus = result.destination.droppableId;
    const contactId = result.draggableId;
    const contact = contacts.find(c => c.id === contactId);
    if (!contact || contact.status === newStatus) return;

    updateContact.mutate(
      { id: contactId, updates: { status: newStatus, status_changed_at: new Date().toISOString() } },
      { onSuccess: () => toast.success(`Status updated to ${newStatus}`) }
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
        <div className="relative w-full sm:flex-1 sm:min-w-[200px] sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search leads..."
            className="pl-9 h-10 sm:h-9 text-sm min-h-[44px] sm:min-h-0"
          />
        </div>
        <Select value={filterProject} onValueChange={setFilterProject}>
          <SelectTrigger className="h-10 sm:h-9 w-full sm:w-[170px] text-xs min-h-[44px] sm:min-h-0">
            <SelectValue placeholder="All Projects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {PROJECTS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterAgent} onValueChange={setFilterAgent}>
          <SelectTrigger className="h-10 sm:h-9 w-full sm:w-[170px] text-xs min-h-[44px] sm:min-h-0">
            <SelectValue placeholder="All Agents" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Agents</SelectItem>
            {AGENTS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Loading pipeline…</div>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div
            ref={scrollRef}
            className="flex-1 overflow-x-auto pb-4 snap-x snap-mandatory sm:snap-none"
          >
            <div className="flex gap-2 sm:gap-3 min-w-max h-full">
              {LEAD_STATUSES.map(stage => (
                <div
                  key={stage}
                  className="flex flex-col rounded-xl border border-border/50 flex-shrink-0 snap-start"
                  style={{
                    background: STAGE_COLORS[stage],
                    width: isMobile ? '85vw' : undefined,
                    minWidth: isMobile ? '85vw' : '260px',
                  }}
                >
                  {/* Column header */}
                  <div
                    className="flex items-center justify-between px-3 py-2 sm:py-2.5 rounded-t-xl border-b"
                    style={{ borderColor: STAGE_BORDER[stage] }}
                  >
                    <span className="text-xs font-semibold text-foreground">{stage}</span>
                    <Badge variant="secondary" className="text-[10px] h-5 px-1.5 min-w-[20px] justify-center">
                      {columns[stage].length}
                    </Badge>
                  </div>

                  {/* Droppable area */}
                  <Droppable droppableId={stage}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`flex-1 p-2 min-h-[120px] overflow-y-auto transition-colors ${snapshot.isDraggingOver ? 'bg-primary/5' : ''}`}
                        style={{ maxHeight: 'calc(100vh - 280px)' }}
                      >
                        {columns[stage].map((contact, idx) => (
                          <LeadCard key={contact.id} contact={contact} index={idx} />
                        ))}
                        {provided.placeholder}
                        {columns[stage].length === 0 && (
                          <p className="text-[11px] text-muted-foreground text-center py-6">No leads</p>
                        )}
                      </div>
                    )}
                  </Droppable>
                </div>
              ))}
            </div>
          </div>

          {/* Mobile dot indicators */}
          {isMobile && (
            <div className="flex justify-center gap-1.5 pt-2 pb-1">
              {LEAD_STATUSES.map((stage, idx) => (
                <button
                  key={stage}
                  className="w-2 h-2 rounded-full transition-all duration-200"
                  style={{
                    background: idx === activeIdx ? STAGE_DOT[stage] : 'hsl(220 10% 50% / 0.3)',
                    transform: idx === activeIdx ? 'scale(1.3)' : 'scale(1)',
                  }}
                  onClick={() => {
                    scrollRef.current?.children[0]?.children[idx]?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'nearest',
                      inline: 'start',
                    });
                  }}
                  aria-label={stage}
                />
              ))}
            </div>
          )}
        </DragDropContext>
      )}
    </div>
  );
}
