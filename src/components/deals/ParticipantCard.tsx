import { Mail, Phone, Briefcase } from 'lucide-react';
import { cn } from '@/lib/utils';
import { startInAppCall } from '@/hooks/useDialer';

interface Participant {
  id: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  emailAddress?: string;
  phoneNumber?: string;
  participantRole: string;
  participantStatus?: string;
  payment?: { percent?: number; amount?: { amount?: number } };
  hidden?: boolean;
  external?: boolean;
  paidByReal?: boolean;
}

function roleLabel(role: string): string {
  const map: Record<string, string> = {
    BUYER: 'Buyer',
    SELLER: 'Seller',
    BUYERS_AGENT: "Buyer's Agent",
    SELLERS_AGENT: "Seller's Agent",
    BUYERS_LAWYER: "Buyer's Lawyer",
    SELLERS_LAWYER: "Seller's Lawyer",
    OTHER_AGENT: 'Other Agent',
    REAL: 'Real Brokerage',
    REAL_ADMIN: 'Real Admin',
  };
  return map[role] || role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function ParticipantCard({ participant: p }: { participant: Participant }) {
  const name = [p.firstName, p.lastName].filter(Boolean).join(' ') || p.company || 'Unknown';
  const pct = p.payment?.percent ? `${(p.payment.percent * 100).toFixed(0)}%` : null;

  return (
    <div className="rounded-xl border border-border/40 bg-muted/20 p-3.5 lg:p-4 hover:bg-muted/40 active:bg-muted/50 transition-colors touch-manipulation">
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate">{name}</p>
          <p className="text-xs text-muted-foreground">{roleLabel(p.participantRole)}</p>
        </div>
        {pct && (
          <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md shrink-0">
            {pct}
          </span>
        )}
      </div>
      {p.company && p.company !== name && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
          <Briefcase className="h-3 w-3 shrink-0" />
          <span className="truncate">{p.company}</span>
        </div>
      )}
      {p.emailAddress && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
          <Mail className="h-3 w-3 shrink-0" />
          <a href={`mailto:${p.emailAddress}`} className="truncate hover:text-primary active:text-primary transition-colors touch-manipulation">
            {p.emailAddress}
          </a>
        </div>
      )}
      {p.phoneNumber && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Phone className="h-3 w-3 shrink-0" />
          <a href={`tel:${p.phoneNumber}`} className="hover:text-primary active:text-primary transition-colors touch-manipulation">
            {p.phoneNumber}
          </a>
        </div>
      )}
      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/30">
        <span className={cn(
          "text-[10px] px-1.5 py-0.5 rounded font-medium",
          p.external ? "bg-amber-500/10 text-amber-600" : "bg-primary/10 text-primary"
        )}>
          {p.external ? 'External' : 'Internal'}
        </span>
        {p.paidByReal && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-medium">
            Paid by Real
          </span>
        )}
      </div>
    </div>
  );
}

export type { Participant };
