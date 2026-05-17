// Zara Complete Project Catalog — searchable browser over crm_projects with a
// detail side panel and a one-click "Ask Zara about this project" handoff to
// the cockpit at /crm/zara.
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Pill } from '@/components/crm/shared/Pill';
import {
  Search, Sparkles, Building2, MapPin, Calendar, ExternalLink, FileText,
  Image as ImageIcon, DollarSign, Users, ArrowLeft, ChevronRight, Loader2,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

type Project = {
  id: string;
  name: string;
  slug: string | null;
  city: string | null;
  neighborhood: string | null;
  province: string | null;
  developer: string | null;
  property_type: string | null;
  bedrooms_offered: number[] | null;
  price_from: number | null;
  price_to: number | null;
  status: string | null;
  completion_date: string | null;
  website_url: string | null;
  marketing_url: string | null;
  brochure_url: string | null;
  floor_plans_url: string | null;
  pricing_url: string | null;
  notes: string | null;
  is_active: boolean;
  lead_count: number;
  view_count: number;
  last_viewed_at: string | null;
  updated_at: string;
};

const STATUS_TONE: Record<string, 'success' | 'warning' | 'neutral' | 'danger'> = {
  selling: 'success',
  preview: 'warning',
  registration: 'warning',
  sold_out: 'danger',
  coming_soon: 'neutral',
  complete: 'neutral',
};

function money(n: number | null) {
  if (n == null) return null;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${n}`;
}

function priceRange(p: Project) {
  const a = money(p.price_from);
  const b = money(p.price_to);
  if (a && b) return `${a} – ${b}`;
  return a ?? b ?? null;
}

export default function ZaraProjectsPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [city, setCity] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['zara-projects-catalog'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_projects')
        .select(
          'id,name,slug,city,neighborhood,province,developer,property_type,bedrooms_offered,price_from,price_to,status,completion_date,website_url,marketing_url,brochure_url,floor_plans_url,pricing_url,notes,is_active,lead_count,view_count,last_viewed_at,updated_at'
        )
        .order('lead_count', { ascending: false })
        .order('name', { ascending: true })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as Project[];
    },
    staleTime: 60_000,
  });

  const cities = useMemo(() => {
    const s = new Set<string>();
    projects.forEach((p) => p.city && s.add(p.city));
    return Array.from(s).sort();
  }, [projects]);

  const statuses = useMemo(() => {
    const s = new Set<string>();
    projects.forEach((p) => p.status && s.add(p.status));
    return Array.from(s).sort();
  }, [projects]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return projects.filter((p) => {
      if (!p.is_active) return false;
      if (city !== 'all' && p.city !== city) return false;
      if (status !== 'all' && p.status !== status) return false;
      if (!query) return true;
      const hay = [p.name, p.city, p.neighborhood, p.developer, p.property_type, p.notes]
        .filter(Boolean).join(' ').toLowerCase();
      return hay.includes(query);
    });
  }, [projects, q, city, status]);

  const selected = useMemo(
    () => projects.find((p) => p.id === selectedId) ?? null,
    [projects, selectedId]
  );

  const askZara = (p: Project) => {
    const prompt = `Tell me everything you know about ${p.name}${p.city ? ` in ${p.city}` : ''} — pricing, completion, recent leads, and what's selling well.`;
    navigate(`/crm/zara?prompt=${encodeURIComponent(prompt)}`);
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-var(--crm-subnav-h,48px))]">
      {/* Header */}
      <header className="px-5 py-3 border-b border-border/60 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Link to="/crm/zara" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <Building2 className="w-4 h-4 text-primary" />
          <h1 className="text-[15px] font-semibold tracking-tight">Project catalog</h1>
          <Pill size="sm" tone="neutral">{filtered.length}</Pill>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/crm/zara/training" className="text-[12px] text-muted-foreground hover:text-foreground transition-colors">
            Training loop →
          </Link>
        </div>
      </header>

      {/* Filters */}
      <div className="px-5 py-3 border-b border-border/60 flex flex-wrap items-center gap-2 bg-card/30">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, city, developer…"
            className="pl-8 h-8 text-[13px]"
          />
        </div>
        <select
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="h-8 text-[12px] rounded-md border border-border bg-background px-2"
        >
          <option value="all">All cities</option>
          {cities.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-8 text-[12px] rounded-md border border-border bg-background px-2"
        >
          <option value="all">All statuses</option>
          {statuses.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        {(q || city !== 'all' || status !== 'all') && (
          <Button size="sm" variant="ghost" onClick={() => { setQ(''); setCity('all'); setStatus('all'); }}>
            Clear
          </Button>
        )}
      </div>

      <div className="flex-1 min-h-0 flex">
        {/* List */}
        <div className="flex-1 min-w-0 overflow-y-auto px-5 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground text-[13px]">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading projects…
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground text-[13px]">
              No projects match your filters.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filtered.map((p) => {
                const range = priceRange(p);
                const tone: 'success' | 'warning' | 'neutral' | 'danger' =
                  (p.status ? STATUS_TONE[p.status] : undefined) ?? 'neutral';
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedId(p.id)}
                    className={`text-left rounded-xl border bg-card p-3.5 transition-all hover:border-primary/40 hover:shadow-sm ${
                      selectedId === p.id ? 'border-primary/60 ring-2 ring-primary/15' : 'border-border/60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="text-[14px] font-semibold tracking-tight truncate flex-1">{p.name}</h3>
                      {p.status && <Pill size="sm" tone={tone}>{p.status.replace(/_/g, ' ')}</Pill>}
                    </div>
                    <div className="text-[11.5px] text-muted-foreground flex items-center gap-1 mb-2">
                      <MapPin className="w-3 h-3" />
                      {[p.neighborhood, p.city, p.province].filter(Boolean).join(', ') || '—'}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {p.developer && <Pill size="sm" tone="neutral">{p.developer}</Pill>}
                      {p.property_type && <Pill size="sm" tone="neutral">{p.property_type}</Pill>}
                      {p.bedrooms_offered?.length ? (
                        <Pill size="sm" tone="neutral">
                          {p.bedrooms_offered.join('/')}-bed
                        </Pill>
                      ) : null}
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        {range && <><DollarSign className="w-3 h-3" />{range}</>}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="flex items-center gap-0.5"><Users className="w-3 h-3" />{p.lead_count}</span>
                        <ChevronRight className="w-3 h-3" />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <aside className="hidden lg:flex w-[360px] shrink-0 border-l border-border/60 flex-col min-h-0 bg-card/30">
            <header className="px-4 py-3 border-b border-border/60 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-[15px] font-semibold tracking-tight truncate">{selected.name}</h2>
                <div className="text-[11.5px] text-muted-foreground flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3" />
                  {[selected.neighborhood, selected.city, selected.province].filter(Boolean).join(', ') || '—'}
                </div>
              </div>
              <button
                onClick={() => setSelectedId(null)}
                className="text-[18px] leading-none text-muted-foreground hover:text-foreground"
              >×</button>
            </header>

            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-4 text-[12.5px]">
              <Button
                size="sm"
                onClick={() => askZara(selected)}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                Ask Zara about this project
              </Button>

              <section className="grid grid-cols-2 gap-2">
                <Stat label="Leads" value={String(selected.lead_count)} />
                <Stat label="Views" value={String(selected.view_count)} />
                {priceRange(selected) && (
                  <Stat className="col-span-2" label="Price range" value={priceRange(selected)!} />
                )}
                {selected.completion_date && (
                  <Stat
                    className="col-span-2"
                    label="Completion"
                    value={new Date(selected.completion_date).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                    icon={<Calendar className="w-3 h-3" />}
                  />
                )}
              </section>

              <section className="space-y-1.5">
                <FactRow label="Developer" value={selected.developer} />
                <FactRow label="Type" value={selected.property_type} />
                <FactRow
                  label="Bedrooms"
                  value={selected.bedrooms_offered?.length ? selected.bedrooms_offered.join(', ') : null}
                />
                <FactRow label="Status" value={selected.status?.replace(/_/g, ' ')} />
                <FactRow
                  label="Last viewed"
                  value={
                    selected.last_viewed_at
                      ? formatDistanceToNow(new Date(selected.last_viewed_at), { addSuffix: true })
                      : null
                  }
                />
              </section>

              {(selected.website_url || selected.marketing_url || selected.brochure_url || selected.floor_plans_url || selected.pricing_url) && (
                <section>
                  <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Resources</div>
                  <div className="space-y-1">
                    <LinkRow url={selected.website_url} label="Website" icon={<ExternalLink className="w-3 h-3" />} />
                    <LinkRow url={selected.marketing_url} label="Marketing page" icon={<ExternalLink className="w-3 h-3" />} />
                    <LinkRow url={selected.brochure_url} label="Brochure" icon={<FileText className="w-3 h-3" />} />
                    <LinkRow url={selected.floor_plans_url} label="Floor plans" icon={<ImageIcon className="w-3 h-3" />} />
                    <LinkRow url={selected.pricing_url} label="Pricing" icon={<DollarSign className="w-3 h-3" />} />
                  </div>
                </section>
              )}

              {selected.notes && (
                <section>
                  <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Notes</div>
                  <div className="text-[12px] text-foreground/90 whitespace-pre-wrap leading-relaxed">{selected.notes}</div>
                </section>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, icon, className }: { label: string; value: string; icon?: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-border/60 bg-background p-2.5 ${className ?? ''}`}>
      <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-semibold mb-0.5 flex items-center gap-1">
        {icon}{label}
      </div>
      <div className="text-[14px] font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function FactRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-2 py-1 border-b border-border/40 last:border-0">
      <span className="text-[11.5px] text-muted-foreground">{label}</span>
      <span className="text-[12.5px] text-foreground font-medium text-right truncate">{value}</span>
    </div>
  );
}

function LinkRow({ url, label, icon }: { url: string | null; label: string; icon: React.ReactNode }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-muted/60 transition-colors text-[12px]"
    >
      <span className="flex items-center gap-1.5">{icon}{label}</span>
      <ExternalLink className="w-3 h-3 text-muted-foreground" />
    </a>
  );
}
