import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronRight, Flame, Phone, Mail, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useCrmContacts } from '@/hooks/useCrmContacts';
import { useCrmLeadSegments } from '@/hooks/useCrmLeadSegments';
import { contactMatchesSegment } from '@/lib/segmentMatching';
import { formatContactName } from '@/lib/format';
import { formatDistanceToNow } from 'date-fns';
import type { CrmContact } from '@/hooks/useCrmContacts';
import { AddLeadDialog } from '@/components/crm/leads/AddLeadDialog';

const SEGMENT_DOT: Record<string, string> = {
  'New Leads':      'hsl(var(--primary))',
  'Presale':        'hsl(210 62% 46%)',
  'Pre-Sale 🔥':    'hsl(0 84% 60%)',
  'Re-Sale 🔥':     'hsl(25 90% 55%)',
  'Commercial':     'hsl(220 50% 50%)',
  'Showing Booked': 'hsl(142 71% 45%)',
  'Offer Made':     'hsl(270 60% 55%)',
  'Nurturing':      'hsl(38 92% 50%)',
  'Closed':         'hsl(142 71% 30%)',
  'Lost / Cold':    'hsl(220 10% 50%)',
};

export function MobilePipelineView() {
  const navigate = useNavigate();
  const { data: contacts = [], isLoading: cl } = useCrmContacts();
  const { data: segments = [], isLoading: sl } = useCrmLeadSegments();
  const [search, setSearch] = useState('');
  const [activeSegId, setActiveSegId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const pipelineSegments = useMemo(
    () => segments.filter(s => s.filter_config && Object.keys(s.filter_config).length > 0),
    [segments],
  );

  // Default to first segment
  const activeSeg = useMemo(() => {
    if (!pipelineSegments.length) return null;
    return pipelineSegments.find(s => s.id === activeSegId) ?? pipelineSegments[0];
  }, [pipelineSegments, activeSegId]);

  // Bucket counts + filtered contacts (first match wins, like Kanban)
  const { counts, byStage } = useMemo(() => {
    const map: Record<string, CrmContact[]> = {};
    pipelineSegments.forEach(s => { map[s.id] = []; });
    const q = search.trim().toLowerCase();
    contacts.forEach(c => {
      if (q) {
        const name = formatContactName(c.first_name, c.last_name).toLowerCase();
        if (!name.includes(q) && !(c.email?.toLowerCase().includes(q)) && !(c.phone || '').includes(q)) return;
      }
      for (const seg of pipelineSegments) {
        if (contactMatchesSegment(c, seg.filter_config)) { map[seg.id].push(c); break; }
      }
    });
    const cts: Record<string, number> = {};
    pipelineSegments.forEach(s => { cts[s.id] = map[s.id].length; });
    return { counts: cts, byStage: map };
  }, [contacts, pipelineSegments, search]);

  if (sl || cl) {
    return (
      <div className="space-y-3 p-3">
        <Skeleton className="h-10 w-full" />
        <div className="flex gap-2 overflow-x-auto">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-24 rounded-full shrink-0" />)}
        </div>
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
      </div>
    );
  }

  if (!pipelineSegments.length) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
        No pipeline stages configured
      </div>
    );
  }

  const list = activeSeg ? byStage[activeSeg.id] || [] : [];

  return (
    <div className="flex flex-col h-full -mx-3 -my-3 sm:-mx-4 sm:-my-4 crm-mobile-page">
      {/* Search */}
      <div className="px-3 pt-3 pb-2 flex-shrink-0 bg-background sticky top-0 z-20 border-b border-border">
        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search leads…"
            className="pl-9 h-10 text-sm"
          />
        </div>

        {/* Stage chip selector — horizontal scroll */}
        <div className="overflow-x-auto scrollbar-hide -mx-3 px-3">
          <div className="flex gap-1.5 pb-1 min-w-max">
            {pipelineSegments.map(seg => {
              const isActive = activeSeg?.id === seg.id;
              const dot = SEGMENT_DOT[seg.name] ?? 'hsl(220 10% 50%)';
              const ct = counts[seg.id] ?? 0;
              return (
                <button
                  key={seg.id}
                  onClick={() => setActiveSegId(seg.id)}
                  className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-[12px] font-semibold whitespace-nowrap transition-all border ${
                    isActive ? 'text-white shadow-sm' : 'bg-transparent border-border text-muted-foreground'
                  }`}
                  style={isActive ? { background: dot, borderColor: dot } : undefined}
                >
                  {seg.emoji && <span>{seg.emoji}</span>}
                  <span>{seg.name}</span>
                  <span className={`text-[10px] tabular-nums ${isActive ? 'opacity-80' : 'text-muted-foreground/70'}`}>
                    {ct}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {list.length === 0 ? (
          <div className="text-center py-16 text-sm text-muted-foreground">No leads in this stage</div>
        ) : (
          <div className="divide-y divide-border/40">
            {list.map(c => <PipelineRow key={c.id} contact={c} onClick={() => navigate(`/crm/leads/${c.id}`)} />)}
          </div>
        )}
      </div>

      {/* FAB — Add lead */}
      <button
        onClick={() => setAddOpen(true)}
        aria-label="Add lead"
        className="lg:hidden fixed right-4 z-40 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 active:scale-95 transition-all flex items-center justify-center"
        style={{ bottom: 'calc(72px + env(safe-area-inset-bottom, 0px))' }}
      >
        <Plus className="w-6 h-6" strokeWidth={2.2} />
      </button>

      <AddLeadDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}

function avatarBg(id: string): string {
  const palette = [
    'hsl(38 88% 55%)', 'hsl(355 78% 60%)', 'hsl(155 60% 45%)',
    'hsl(220 75% 60%)', 'hsl(265 65% 60%)', 'hsl(195 75% 50%)',
  ];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

function PipelineRow({ contact, onClick }: { contact: CrmContact; onClick: () => void }) {
  const score = contact.lead_score ?? 0;
  const isHot = score >= 70;
  const rel = contact.last_touch_at ? formatDistanceToNow(new Date(contact.last_touch_at), { addSuffix: true }) : 'No activity';
  const name = formatContactName(contact.first_name, contact.last_name) || 'Unnamed';
  const initials = ((contact.first_name?.[0] ?? '') + (contact.last_name?.[0] ?? '')).toUpperCase() || name.slice(0, 2).toUpperCase();

  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center gap-3 px-4 py-3 active:bg-muted/40 transition-colors"
    >
      <div
        className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-white text-[14px] font-semibold"
        style={{ background: avatarBg(contact.id) }}
      >
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          {isHot && <Flame className="w-3.5 h-3.5 text-orange-500 shrink-0" fill="currentColor" />}
          <h3 className="text-[14.5px] font-semibold text-foreground truncate">{name}</h3>
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-[12px] text-muted-foreground">
          {contact.phone && <Phone className="w-3 h-3 shrink-0" />}
          {contact.email && <Mail className="w-3 h-3 shrink-0" />}
          <span className="truncate">{rel}</span>
        </div>
      </div>
      <div className="text-right shrink-0">
        {score > 0 && (
          <div className="text-[11px] font-bold text-foreground tabular-nums">{score}</div>
        )}
        <ChevronRight className="w-4 h-4 text-muted-foreground/60 ml-auto" />
      </div>
    </button>
  );
}
