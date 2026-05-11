/**
 * LeadContextRail — desktop right-rail surfaced beside an open chat thread.
 *
 * Mounts only on lg+ (≥1024px) inside `CrmChatsShell` whenever a thread is
 * open. Surfaces the same data the agent would otherwise tab over to
 * /crm/leads/:id for: pipeline + status, engagement score, tags, contact
 * details, and one-tap actions (call, book, view full lead). Collapsible
 * via localStorage so power users can hide it on smaller laptops.
 *
 * Tablet (md..lg) and mobile (<md) keep using `MobileLeadContextCard`,
 * which is already rendered inline above the first message bubble.
 */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Phone, Mail, MessageSquare, Calendar, ExternalLink, Tag,
  ChevronRight, ChevronLeft, MapPin, User as UserIcon, Sparkles,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Pill } from '@/components/crm/shared/Pill';
import { Button } from '@/components/ui/button';
import { useDialer } from '@/hooks/useDialer';
import { formatContactName, formatPhone } from '@/lib/format';
import { parseLeadNote } from '@/lib/formatLeadNote';

const STORAGE_KEY = 'crm-chat-rail-collapsed';

interface ContextLead {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  email_secondary?: string | null;
  phone: string | null;
  phone_secondary?: string | null;
  city?: string | null;
  status?: string | null;
  lead_type?: string | null;
  tags?: string[] | null;
  engagement_score?: number | null;
  last_touch_at?: string | null;
  notes?: string | null;
  assigned_to?: string | null;
}

export function LeadContextRail() {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  const dialer = useDialer();

  const { data: lead, isLoading } = useQuery({
    queryKey: ['crm-chat-rail', conversationId],
    enabled: !!conversationId && conversationId !== 'new',
    queryFn: async (): Promise<ContextLead | null> => {
      if (!conversationId) return null;
      const { data, error } = await supabase
        .from('crm_conversations')
        .select(`contact_id,
                 crm_contacts!inner (
                   id, first_name, last_name, email, email_secondary,
                   phone, phone_secondary, city, status, lead_type, tags,
                   engagement_score, last_touch_at, notes, assigned_to
                 )`)
        .eq('id', conversationId)
        .maybeSingle();
      if (error || !data) return null;
      const c: any = Array.isArray((data as any).crm_contacts)
        ? (data as any).crm_contacts[0]
        : (data as any).crm_contacts;
      return c ?? null;
    },
  });

  // Empty rail (no thread open) — just a thin collapsed shell.
  if (!conversationId || conversationId === 'new') {
    return null;
  }

  if (collapsed) {
    return (
      <aside
        aria-label="Lead context"
        className="hidden lg:flex w-9 shrink-0 border-l border-border/60 bg-background flex-col items-center pt-3"
      >
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60"
          aria-label="Expand lead context"
          title="Show lead context"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </aside>
    );
  }

  const name = lead
    ? (formatContactName(lead.first_name, lead.last_name) || lead.email || lead.phone || 'Unknown')
    : '…';
  const initials = lead
    ? `${(lead.first_name?.[0] ?? '').toUpperCase()}${(lead.last_name?.[0] ?? '').toUpperCase()}` || (lead.email?.[0] ?? '?').toUpperCase()
    : '?';
  const score = lead?.engagement_score ?? null;
  const scoreTier: 'hot' | 'warm' | 'cool' = score == null
    ? 'cool'
    : score >= 70 ? 'hot' : score >= 35 ? 'warm' : 'cool';
  const scoreColor = scoreTier === 'hot'
    ? 'text-amber-600 dark:text-amber-400'
    : scoreTier === 'warm'
      ? 'text-foreground'
      : 'text-muted-foreground';

  return (
    <aside
      aria-label="Lead context"
      className="hidden lg:flex w-[300px] xl:w-[340px] shrink-0 border-l border-border/60 bg-background flex-col min-h-0"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border/60">
        <div className="flex items-center gap-2 min-w-0">
          <UserIcon className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Lead context
          </span>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60"
          aria-label="Collapse lead context"
          title="Hide"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {isLoading || !lead ? (
        <div className="flex-1 p-4 space-y-3">
          <div className="h-14 rounded-xl bg-muted/40 animate-pulse" />
          <div className="h-20 rounded-xl bg-muted/40 animate-pulse" />
          <div className="h-32 rounded-xl bg-muted/40 animate-pulse" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {/* Identity card */}
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[15px] font-bold shrink-0 ring-1 ring-primary/20">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <Link
                  to={`/crm/leads/${lead.id}`}
                  className="text-[15px] font-semibold text-foreground hover:text-primary transition-colors block leading-tight truncate"
                >
                  {name}
                </Link>
                {lead.lead_type && (
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground/80 mt-0.5 font-medium">
                    {lead.lead_type}
                  </p>
                )}
              </div>
            </div>

            {/* Quick actions */}
            <div className="grid grid-cols-3 gap-1.5 mt-3">
              <RailAction
                icon={Phone}
                label="Call"
                disabled={!lead.phone || (dialer.status !== 'idle' && dialer.status !== 'ended')}
                onClick={() => {
                  if (!lead.phone) return;
                  dialer.startCall({
                    contact: { id: lead.id, name, phone: lead.phone },
                    number: lead.phone,
                  });
                }}
              />
              <RailAction
                icon={Calendar}
                label="Book"
                onClick={() => window.location.assign(`/crm/leads/${lead.id}#book`)}
              />
              <RailAction
                icon={ExternalLink}
                label="Open"
                onClick={() => window.location.assign(`/crm/leads/${lead.id}`)}
              />
            </div>
          </div>

          {/* Pipeline + score */}
          <Section title="Pipeline">
            <div className="flex items-center gap-2 flex-wrap">
              {lead.status ? <Pill tone="primary" size="sm">{lead.status}</Pill> : <span className="text-[12px] text-muted-foreground">No pipeline</span>}
              {score != null && (
                <span className={`inline-flex items-center gap-1 text-[11px] font-bold tabular-nums ${scoreColor}`}>
                  <Sparkles className="w-3 h-3" /> {Math.round(score)}
                </span>
              )}
            </div>
            {lead.last_touch_at && (
              <p className="text-[11px] text-muted-foreground mt-2">
                Last touch · {formatDistanceToNow(new Date(lead.last_touch_at), { addSuffix: true })}
              </p>
            )}
          </Section>

          {/* Contact details */}
          <Section title="Contact">
            {lead.email && <DetailRow icon={Mail} value={lead.email} href={`mailto:${lead.email}`} />}
            {lead.email_secondary && <DetailRow icon={Mail} value={lead.email_secondary} href={`mailto:${lead.email_secondary}`} muted />}
            {lead.phone && <DetailRow icon={Phone} value={formatPhone(lead.phone) || lead.phone} />}
            {lead.phone_secondary && <DetailRow icon={Phone} value={formatPhone(lead.phone_secondary) || lead.phone_secondary} muted />}
            {lead.city && <DetailRow icon={MapPin} value={lead.city} />}
            {!lead.email && !lead.phone && !lead.city && (
              <p className="text-[12px] text-muted-foreground italic">No contact details on file.</p>
            )}
          </Section>

          {/* Tags */}
          {lead.tags && lead.tags.length > 0 && (
            <Section title="Tags">
              <div className="flex flex-wrap gap-1">
                {lead.tags.slice(0, 12).map((t) => (
                  <Pill key={t} tone="muted" size="sm">{t}</Pill>
                ))}
                {lead.tags.length > 12 && (
                  <span className="text-[11px] text-muted-foreground self-center">+{lead.tags.length - 12}</span>
                )}
              </div>
            </Section>
          )}

          {/* Notes preview */}
          {lead.notes && (
            <Section title="Notes">
              <FormattedNote raw={lead.notes} />
              <Link
                to={`/crm/leads/${lead.id}`}
                className="inline-flex items-center gap-1 mt-2 text-[11px] font-semibold text-primary hover:opacity-80"
              >
                See all <ExternalLink className="w-3 h-3" />
              </Link>
            </Section>
          )}

          <div className="px-4 pb-4 pt-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full h-9 text-[12px]"
              onClick={() => window.location.assign(`/crm/leads/${lead.id}`)}
            >
              <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
              Open full lead
            </Button>
          </div>
        </div>
      )}
    </aside>
  );
}

function RailAction({
  icon: Icon, label, onClick, disabled,
}: { icon: any; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center justify-center gap-1 h-14 rounded-xl border border-border/60 bg-card hover:bg-muted/60 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <Icon className="w-4 h-4 text-foreground" />
      <span className="text-[10.5px] font-semibold text-foreground/80">{label}</span>
    </button>
  );
}

function FormattedNote({ raw }: { raw: string }) {
  const parsed = parseLeadNote(raw);

  if (!parsed.isStructured) {
    return (
      <p className="text-[12.5px] text-foreground/85 leading-relaxed line-clamp-6 whitespace-pre-wrap">
        {parsed.intro || raw}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {parsed.intro && (
        <p className="text-[12px] text-muted-foreground leading-relaxed line-clamp-2">
          {parsed.intro}
        </p>
      )}
      <dl className="grid grid-cols-[88px_1fr] gap-x-2 gap-y-1.5 text-[12px]">
        {parsed.fields.slice(0, 8).map((f, i) => (
          <div key={`${f.label}-${i}`} className="contents">
            <dt className="text-muted-foreground/80 truncate">{f.label}</dt>
            <dd className="text-foreground/90 break-words leading-snug">{f.value}</dd>
          </div>
        ))}
      </dl>
      {parsed.fields.length > 8 && (
        <p className="text-[11px] text-muted-foreground/70">
          +{parsed.fields.length - 8} more fields
        </p>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3 border-t border-border/40">
      <h3 className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/80 mb-2">
        {title}
      </h3>
      {children}
    </div>
  );
}

function DetailRow({
  icon: Icon, value, href, muted,
}: { icon: any; value: string; href?: string; muted?: boolean }) {
  const content = (
    <span className={`flex items-center gap-2 text-[12.5px] truncate ${muted ? 'text-muted-foreground' : 'text-foreground/90'}`}>
      <Icon className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{value}</span>
    </span>
  );
  return (
    <div className="py-1">
      {href ? (
        <a href={href} className="block hover:text-primary transition-colors" onClick={(e) => e.stopPropagation()}>
          {content}
        </a>
      ) : content}
    </div>
  );
}
