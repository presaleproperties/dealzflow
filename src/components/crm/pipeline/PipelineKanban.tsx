import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Search, RefreshCw, Mail, Phone, MapPin, Flame } from 'lucide-react';
import { formatCurrencyCompact } from '@/lib/format';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Pill } from '@/components/crm/shared/Pill';
import { toast } from 'sonner';
import { useDynamicFilterOptions } from '@/hooks/useCrmContacts';
import { useCrmContactsLite } from '@/hooks/useCrmContactsLite';
import { useCrmLeadSegments, type LeadSegment } from '@/hooks/useCrmLeadSegments';
import { formatContactName } from '@/lib/format';
import { useSetContactPipeline } from '@/hooks/useUnifiedPipelines';
import { useIsMobile } from '@/hooks/use-mobile';
import { useMyAgentName } from '@/hooks/useTeamAgents';
import { formatDistanceToNow } from 'date-fns';
import type { CrmContact } from '@/hooks/useCrmContacts';

// Persist agent filter across reloads. Special sentinel "__mine" resolves
// to the current signed-in agent's display_name at render time so the chip
// keeps working when the same browser is used by a different teammate.
const AGENT_FILTER_KEY = 'crm.pipeline.agentFilter.v1';

/* ─── Segment-based colors ─── */
const SEGMENT_COLORS: Record<string, { bg: string; border: string; dot: string }> = {
  'New Leads':      { bg: 'hsl(var(--primary) / 0.06)',  border: 'hsl(var(--primary) / 0.3)',  dot: 'hsl(var(--primary))' },
  'Presale':        { bg: 'hsl(210 62% 46% / 0.06)', border: 'hsl(210 62% 46% / 0.3)', dot: 'hsl(210 62% 46%)' },
  'Pre-Sale 🔥':    { bg: 'hsl(0 84% 60% / 0.06)',   border: 'hsl(0 84% 60% / 0.3)',   dot: 'hsl(0 84% 60%)' },
  'Re-Sale 🔥':     { bg: 'hsl(25 90% 55% / 0.06)',  border: 'hsl(25 90% 55% / 0.3)',  dot: 'hsl(25 90% 55%)' },
  'Commercial':     { bg: 'hsl(220 50% 50% / 0.06)', border: 'hsl(220 50% 50% / 0.3)', dot: 'hsl(220 50% 50%)' },
  'Showing Booked': { bg: 'hsl(142 71% 45% / 0.06)', border: 'hsl(142 71% 45% / 0.3)', dot: 'hsl(142 71% 45%)' },
  'Offer Made':     { bg: 'hsl(270 60% 55% / 0.06)', border: 'hsl(270 60% 55% / 0.3)', dot: 'hsl(270 60% 55%)' },
  'Nurturing':      { bg: 'hsl(38 92% 50% / 0.06)',  border: 'hsl(38 92% 50% / 0.3)',  dot: 'hsl(38 92% 50%)' },
  'Closed':         { bg: 'hsl(142 71% 30% / 0.10)', border: 'hsl(142 71% 30% / 0.3)', dot: 'hsl(142 71% 30%)' },
  'Lost / Cold':    { bg: 'hsl(220 10% 50% / 0.06)', border: 'hsl(220 10% 50% / 0.3)', dot: 'hsl(220 10% 50%)' },
};

const DEFAULT_COLOR = { bg: 'hsl(220 10% 50% / 0.06)', border: 'hsl(220 10% 50% / 0.3)', dot: 'hsl(220 10% 50%)' };

function getSegmentColor(name: string) {
  return SEGMENT_COLORS[name] ?? DEFAULT_COLOR;
}

/* ─── Shared segment matching ─── */
import { contactMatchesSegment } from '@/lib/segmentMatching';

/* ─── Helpers ─── */
function getInitials(name: string | null) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function daysInStage(contact: CrmContact) {
  const ref = contact.stage_changed_at || contact.status_changed_at;
  if (!ref) return null;
  return Math.floor((Date.now() - new Date(ref).getTime()) / (1000 * 60 * 60 * 24));
}

/* ─── Budget formatter ─── */
function formatBudget(min?: number | null, max?: number | null): string | null {
  if (!min && !max) return null;
  if (min && max) return `${formatCurrencyCompact(min)} – ${formatCurrencyCompact(max)}`;
  if (max) return `Up to ${formatCurrencyCompact(max)}`;
  return `${formatCurrencyCompact(min)}+`;
}

/* ─── Lead Card ─── */
function LeadCard({ contact, index, onOpen }: { contact: CrmContact; index: number; onOpen: (id: string) => void }) {
  const days = daysInStage(contact);
  const daysColor = days === null ? undefined : days <= 7 ? 'hsl(142 71% 45%)' : days <= 14 ? 'hsl(38 92% 50%)' : 'hsl(0 60% 55%)';
  const touchColor = !contact.last_touch_at ? undefined : (() => {
    const d = Math.floor((Date.now() - new Date(contact.last_touch_at).getTime()) / 86400000);
    return d <= 7 ? 'hsl(142 71% 45%)' : d <= 30 ? 'hsl(38 92% 50%)' : 'hsl(0 60% 55%)';
  })();

  const budget = formatBudget(contact.budget_min, contact.budget_max);
  const score = contact.lead_score ?? 0;
  const isHot = score >= 70;
  const cAny = contact as any;
  const cityPref = cAny.city_pref || contact.city;
  const isPreApproved = !!cAny.is_pre_approved;

  // Track pointer to distinguish click vs drag
  const downPos = useRef<{ x: number; y: number } | null>(null);

  return (
    <Draggable draggableId={contact.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onPointerDown={(e) => { downPos.current = { x: e.clientX, y: e.clientY }; }}
          onPointerUp={(e) => {
            const start = downPos.current;
            downPos.current = null;
            if (snapshot.isDragging || !start) return;
            const dx = Math.abs(e.clientX - start.x);
            const dy = Math.abs(e.clientY - start.y);
            if (dx < 5 && dy < 5) onOpen(contact.id);
          }}
          className={`group bg-card rounded-lg border border-border px-2.5 py-2 mb-1.5 shadow-sm cursor-pointer transition-all ${snapshot.isDragging ? 'shadow-xl ring-2 ring-primary/30 opacity-90 scale-[1.02] rotate-[0.5deg] cursor-grabbing' : 'hover:shadow-md hover:border-border/80 hover:ring-1 hover:ring-primary/20'}`}
        >
          {/* Header: name + assigned avatar */}
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-[13px] font-semibold text-foreground truncate leading-tight">
                  {formatContactName(contact.first_name, contact.last_name)}
                </p>
                {isHot && (
                  <Flame className="w-3 h-3 flex-shrink-0" style={{ color: 'hsl(0 84% 60%)' }} />
                )}
              </div>
              {contact.lead_type && (
                <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wide font-medium">
                  {contact.lead_type}
                </p>
              )}
            </div>
            {contact.assigned_to && (
              <div
                className="flex items-center justify-center w-6 h-6 rounded-full text-[9px] font-bold flex-shrink-0"
                style={{ background: 'hsl(var(--primary) / 0.12)', color: 'hsl(var(--primary))' }}
                title={contact.assigned_to}
              >
                {getInitials(contact.assigned_to)}
              </div>
            )}
          </div>

          {/* Budget — primary metric */}
          {budget && (
            <div className="flex items-baseline gap-1.5 mb-1.5">
              <span className="text-[14px] font-bold text-foreground tabular-nums leading-none">{budget}</span>
              <span className="text-[9px] text-muted-foreground uppercase tracking-wide">budget</span>
            </div>
          )}

          {/* Tags row: project + city + pre-approved */}
          {(contact.project || cityPref || isPreApproved) && (
            <div className="flex flex-wrap items-center gap-1 mb-1.5">
              {contact.project && (
                <Pill tone="primary" truncate>{contact.project}</Pill>
              )}
              {cityPref && (
                <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                  <MapPin className="w-2.5 h-2.5" />
                  {cityPref}
                </span>
              )}
              {isPreApproved && (
                <Pill tone="success">Pre-approved</Pill>
              )}
            </div>
          )}

          {/* Footer: stage age, activity, contact icons */}
          <div className="flex items-center justify-between pt-1.5 border-t border-border/40">
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span style={daysColor ? { color: daysColor, fontWeight: 600 } : undefined}>
                {days !== null ? `${days}d` : '—'}
              </span>
              <span className="text-border">·</span>
              {contact.last_touch_at ? (
                <span style={{ color: touchColor }}>
                  {formatDistanceToNow(new Date(contact.last_touch_at), { addSuffix: true })}
                </span>
              ) : (
                <span className="italic">No activity</span>
              )}
            </div>
            <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
              {contact.email && <Mail className="w-3 h-3 text-muted-foreground" />}
              {contact.phone && <Phone className="w-3 h-3 text-muted-foreground" />}
            </div>
          </div>
        </div>
      )}
    </Draggable>
  );
}

const CARDS_PER_PAGE = 50;

export function PipelineKanban() {
  const { data: contacts = [], isLoading: contactsLoading, error: contactsError, refetch: refetchContacts } = useCrmContacts();
  const { data: segments = [], isLoading: segmentsLoading, error: segmentsError, refetch: refetchSegments } = useCrmLeadSegments();
  const dynamicOpts = useDynamicFilterOptions(contacts);
  const dynamicAgents = useMemo(() => {
    const agents = new Set<string>();
    contacts.forEach(c => { if (c.assigned_to) agents.add(c.assigned_to); });
    return Array.from(agents).sort();
  }, [contacts]);
  const setContactPipeline = useSetContactPipeline();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const handleOpen = useCallback((id: string) => navigate(`/crm/leads/${id}`, { state: { from: '/crm/pipeline' } }), [navigate]);
  const myName = useMyAgentName();
  const [search, setSearch] = useState('');
  const [filterProject, setFilterProject] = useState('all');
  // Stored values: 'all' | '__mine' | <agent display_name>. Default = mine.
  const [filterAgent, setFilterAgent] = useState<string>(() => {
    try {
      return localStorage.getItem(AGENT_FILTER_KEY) ?? '__mine';
    } catch { return '__mine'; }
  });
  useEffect(() => {
    try { localStorage.setItem(AGENT_FILTER_KEY, filterAgent); } catch {}
  }, [filterAgent]);

  // Resolve __mine → actual agent name once it's loaded. If the user isn't
  // on a team, fall back to "all" so they aren't staring at an empty board.
  const effectiveAgent = useMemo(() => {
    if (filterAgent === '__mine') return myName ?? null;
    if (filterAgent === 'all') return null;
    return filterAgent;
  }, [filterAgent, myName]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({});
  const [showTimeout, setShowTimeout] = useState(false);

  // Pipeline segments = all segments EXCEPT the "All Leads" catch-all
  const pipelineSegments = useMemo(() =>
    segments.filter(s => {
      const fc = s.filter_config;
      return fc && Object.keys(fc).length > 0;
    }),
  [segments]);

  const loadMore = useCallback((segId: string) => {
    setVisibleCounts(prev => ({ ...prev, [segId]: (prev[segId] || CARDS_PER_PAGE) + CARDS_PER_PAGE }));
  }, []);

  const filtered = useMemo(() => {
    let list = contacts;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        `${formatContactName(c.first_name, c.last_name)}`.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.phone?.includes(q)
      );
    }
    if (filterProject !== 'all') list = list.filter(c => (c.projects ?? []).includes(filterProject) || c.project === filterProject);
    if (effectiveAgent) list = list.filter(c => c.assigned_to === effectiveAgent);
    return list;
  }, [contacts, search, filterProject, effectiveAgent]);

  // Place contacts into segment columns (first match wins)
  const columns = useMemo(() => {
    const map: Record<string, CrmContact[]> = {};
    pipelineSegments.forEach(s => { map[s.id] = []; });

    filtered.forEach(c => {
      const canonicalSegmentId = (c as unknown as { pipeline_segment_id?: string | null }).pipeline_segment_id;
      if (canonicalSegmentId && map[canonicalSegmentId]) {
        map[canonicalSegmentId].push(c);
        return;
      }
      for (const seg of pipelineSegments) {
        if (contactMatchesSegment(c, seg.filter_config)) {
          map[seg.id].push(c);
          break; // first match wins
        }
      }
    });

    return map;
  }, [filtered, pipelineSegments]);

  // Track active column via scroll on mobile
  useEffect(() => {
    if (!isMobile || !scrollRef.current) return;
    const el = scrollRef.current;
    const onScroll = () => {
      const colWidth = el.scrollWidth / pipelineSegments.length;
      const idx = Math.round(el.scrollLeft / colWidth);
      setActiveIdx(Math.min(idx, pipelineSegments.length - 1));
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [isMobile, pipelineSegments.length]);

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const targetSegId = result.destination.droppableId;
    const contactId = result.draggableId;
    const contact = contacts.find(c => c.id === contactId);
    const targetSeg = pipelineSegments.find(s => s.id === targetSegId);
    if (!contact || !targetSeg) return;
    if (result.source.droppableId === targetSegId) return;

    const optimisticContact = { ...contact, pipeline_segment_id: targetSeg.id } as CrmContact;

    // Optimistic update so the card visibly stays in the new column
    const prev = queryClient.getQueryData<CrmContact[]>(['crm-contacts']);
    if (prev) {
      queryClient.setQueryData<CrmContact[]>(
        ['crm-contacts'],
        prev.map(c => c.id === contactId ? optimisticContact : c)
      );
    }

    const name = formatContactName(contact.first_name, contact.last_name);
    setContactPipeline.mutate(
      { contact, segment: targetSeg },
      {
        onSuccess: () => toast.success(`Moved ${name} to ${targetSeg.name}`, { duration: 2000 }),
        onError: () => {
          if (prev) queryClient.setQueryData(['crm-contacts'], prev);
          toast.error(`Failed to move ${name}. Reverted.`);
        },
      }
    );
  };

  const isLoading = contactsLoading || segmentsLoading;
  const error = contactsError || segmentsError;

  // Loading timeout
  useEffect(() => {
    if (!isLoading) { setShowTimeout(false); return; }
    const timer = setTimeout(() => setShowTimeout(true), 10000);
    return () => clearTimeout(timer);
  }, [isLoading]);

  const handleRetry = () => {
    setShowTimeout(false);
    refetchContacts();
    refetchSegments();
  };

  if (error && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <p className="text-muted-foreground">Failed to load pipeline</p>
        <Button onClick={handleRetry} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" /> Retry
        </Button>
      </div>
    );
  }

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
            {dynamicOpts.projects.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterAgent} onValueChange={setFilterAgent}>
          <SelectTrigger className="h-10 sm:h-9 w-full sm:w-[180px] text-xs min-h-[44px] sm:min-h-0">
            <SelectValue placeholder="My Leads" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__mine">
              My Leads{myName ? ` (${myName})` : ''}
            </SelectItem>
            <SelectItem value="all">All Agents</SelectItem>
            {dynamicAgents
              .filter(a => a !== myName)
              .map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {segmentsLoading && pipelineSegments.length === 0 ? (
        <div className="flex-1 overflow-x-auto pb-4 w-full">
          <div className="flex gap-2 sm:gap-3 min-w-max h-full">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex flex-col rounded-xl border border-border/50 bg-muted/20" style={{ minWidth: isMobile ? '85vw' : '260px' }}>
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/30">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-5 w-8 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : showTimeout && isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <p className="text-muted-foreground">Taking longer than expected…</p>
          <Button onClick={handleRetry} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" /> Retry
          </Button>
        </div>
      ) : pipelineSegments.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">No pipeline stages configured</div>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div
            ref={scrollRef}
            className="kanban-scroll flex-1 overflow-x-auto pb-4 snap-x snap-mandatory sm:snap-none"
          >
            <div className="flex gap-2 sm:gap-3 min-w-max h-full">
              {pipelineSegments.map(seg => {
                const colors = getSegmentColor(seg.name);
                const segContacts = columns[seg.id] ?? [];
                return (
                  <div
                    key={seg.id}
                    className="flex flex-col rounded-xl border border-border/50 flex-shrink-0 snap-start"
                    style={{
                      background: colors.bg,
                      width: isMobile ? '85vw' : undefined,
                      minWidth: isMobile ? '85vw' : '260px',
                    }}
                  >
                    {/* Column header */}
                    <div
                      className="flex items-center justify-between px-3 py-1.5 sm:py-2 rounded-t-xl border-b"
                      style={{ borderColor: colors.border }}
                    >
                      <span className="text-xs font-semibold text-foreground">
                        {seg.emoji ? `${seg.emoji} ` : ''}{seg.name}
                      </span>
                      <Pill tone="muted" size="sm" className="tabular-nums justify-center min-w-[24px]">
                        {segContacts.length}
                      </Pill>
                    </div>

                    {/* Droppable area */}
                    <Droppable droppableId={seg.id}>
                      {(provided, snapshot) => {
                        const limit = visibleCounts[seg.id] || CARDS_PER_PAGE;
                        const visible = segContacts.slice(0, limit);
                        const remaining = segContacts.length - limit;
                        return (
                          <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className={`flex-1 p-2 min-h-[120px] overflow-y-auto transition-all duration-200 ${snapshot.isDraggingOver ? 'ring-2 ring-primary/30 ring-inset bg-primary/5' : ''}`}
                            style={{ maxHeight: 'calc(100dvh - 280px)' }}
                          >
                            {visible.map((contact, idx) => (
                              <LeadCard key={contact.id} contact={contact} index={idx} onOpen={handleOpen} />
                            ))}
                            {provided.placeholder}
                            {remaining > 0 && (
                              <button
                                onClick={() => loadMore(seg.id)}
                                className="w-full text-center py-2 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                              >
                                Load {Math.min(remaining, CARDS_PER_PAGE)} more ({remaining} remaining)
                              </button>
                            )}
                            {contactsLoading && segContacts.length === 0 && (
                              <div className="space-y-2">
                                {Array.from({ length: 2 }).map((_, j) => (
                                  <div key={j} className="bg-card rounded-lg border border-border p-3 space-y-2">
                                    <Skeleton className="h-4 w-3/4" />
                                    <Skeleton className="h-3 w-1/2" />
                                  </div>
                                ))}
                              </div>
                            )}
                            {!contactsLoading && segContacts.length === 0 && (
                              <p className="text-[11px] text-muted-foreground text-center py-6">No leads</p>
                            )}
                          </div>
                        );
                      }}
                    </Droppable>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mobile dot indicators */}
          {isMobile && (
            <div className="flex justify-center gap-1.5 pt-2 pb-1">
              {pipelineSegments.map((seg, idx) => {
                const colors = getSegmentColor(seg.name);
                return (
                  <button
                    key={seg.id}
                    className="w-2 h-2 rounded-full transition-all duration-200"
                    style={{
                      background: idx === activeIdx ? colors.dot : 'hsl(220 10% 50% / 0.3)',
                      transform: idx === activeIdx ? 'scale(1.3)' : 'scale(1)',
                    }}
                    onClick={() => {
                      scrollRef.current?.children[0]?.children[idx]?.scrollIntoView({
                        behavior: 'smooth',
                        block: 'nearest',
                        inline: 'start',
                      });
                    }}
                    aria-label={seg.name}
                  />
                );
              })}
            </div>
          )}
        </DragDropContext>
      )}
    </div>
  );
}
