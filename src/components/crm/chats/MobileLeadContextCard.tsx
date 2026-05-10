/**
 * MobileLeadContextCard — compact, collapsible card surfaced above the first
 * message on mobile chat threads. Shows pipeline pill, last-activity timestamp,
 * tags, and a "View lead" affordance so the agent has full context without
 * leaving the thread.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { CrmContact } from '@/hooks/useCrmContacts';
import { Pill } from '@/components/crm/shared/Pill';

interface Props {
  contact: CrmContact;
  lastActivityAt?: string | null;
}

export function MobileLeadContextCard({ contact, lastActivityAt }: Props) {
  const [open, setOpen] = useState(false);
  const tags = (contact as any).tags as string[] | null | undefined;
  const pipeline = (contact as any).status as string | null | undefined;
  const leadType = (contact as any).lead_type as string | null | undefined;

  return (
    <div className="mx-auto w-full max-w-[820px]">
      <div className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left active:bg-muted/40 transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {pipeline && <Pill tone="primary" size="sm">{pipeline}</Pill>}
            {leadType && <span className="text-[11px] text-muted-foreground uppercase tracking-wide">{leadType}</span>}
            {!pipeline && !leadType && <span className="text-[12px] text-muted-foreground">Lead context</span>}
            {lastActivityAt && (
              <span className="text-[11px] text-muted-foreground/80 truncate">
                · {formatDistanceToNow(new Date(lastActivityAt), { addSuffix: true })}
              </span>
            )}
          </div>
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
        </button>
        {open && (
          <div className="px-3 pb-3 pt-1 space-y-2 animate-in fade-in-0 slide-in-from-top-1 duration-150">
            {tags && tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {tags.slice(0, 8).map((t) => (
                  <Pill key={t} tone="muted" size="sm">{t}</Pill>
                ))}
                {tags.length > 8 && <span className="text-[11px] text-muted-foreground self-center">+{tags.length - 8}</span>}
              </div>
            )}
            <Link
              to={`/crm/leads/${contact.id}`}
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-primary hover:opacity-80"
            >
              View full lead <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
