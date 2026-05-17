import { Pin, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useZaraPin } from '@/hooks/useZaraPin';
import { formatContactName } from '@/lib/format';
import { Pill } from '@/components/crm/shared/Pill';

export function PinnedLeadChip() {
  const { pinnedLead, clear } = useZaraPin();
  if (!pinnedLead) return null;
  const name = formatContactName(pinnedLead.first_name, pinnedLead.last_name);
  return (
    <div className="mx-5 mt-3 flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/5 px-3 py-2 text-[12.5px]">
      <Pin className="w-3.5 h-3.5 text-primary shrink-0" />
      <span className="text-muted-foreground">Pinned lead</span>
      <Link
        to={`/crm/leads/${pinnedLead.id}`}
        className="font-semibold text-foreground hover:text-primary transition-colors truncate"
      >
        {name}
      </Link>
      {pinnedLead.status && <Pill size="sm" tone="muted">{pinnedLead.status}</Pill>}
      {(pinnedLead.engagement_score ?? 0) >= 60 && <Pill size="sm" tone="success">Hot</Pill>}
      <span className="ml-auto text-[10.5px] text-muted-foreground hidden sm:block">
        Zara auto-loads this lead's context with every message
      </span>
      <button
        onClick={clear}
        className="p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
        title="Unpin"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
