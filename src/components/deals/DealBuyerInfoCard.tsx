import { motion } from 'framer-motion';
import { Mail, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Participant } from './ParticipantCard';
import { startInAppCall } from '@/hooks/useDialer';

const spring = { type: 'spring' as const, stiffness: 120, damping: 20 };

interface DealBuyerInfoCardProps {
  participants: Participant[];
  clientName?: string | null;
}

export function DealBuyerInfoCard({ participants, clientName }: DealBuyerInfoCardProps) {
  // For listings (SELLERS_AGENT deals), prioritize SELLER; for buyer deals, prioritize BUYER
  const isListing = participants.some((p) => p.participantRole === 'SELLERS_AGENT');
  const buyer = isListing
    ? (participants.find((p) => p.participantRole === 'SELLER') || participants.find((p) => p.participantRole === 'BUYER'))
    : (participants.find((p) => p.participantRole === 'BUYER') || participants.find((p) => p.participantRole === 'SELLER'));

  const name = buyer
    ? [buyer.firstName, buyer.lastName].filter(Boolean).join(' ') || buyer.company
    : clientName;

  const role = isListing ? 'Seller' : (buyer?.participantRole === 'SELLER' ? 'Seller' : 'Buyer');

  if (!name) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring, delay: 0.08 }}
      className="rounded-2xl border border-border/50 bg-card/80 p-4 lg:p-5"
    >
      <div className="min-w-0">
        <p className="font-bold text-base lg:text-lg text-foreground truncate">{name}</p>
        <p className="text-xs text-muted-foreground mb-3">{role}</p>

        {buyer?.emailAddress && (
          <a
            href={`mailto:${buyer.emailAddress}`}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors mb-1.5"
          >
            <Mail className="h-4 w-4 shrink-0" />
            <span className="truncate">{buyer.emailAddress}</span>
          </a>
        )}

        {buyer?.phoneNumber && (
          <button
            type="button"
            onClick={() => startInAppCall({ phone: buyer.phoneNumber, contactName: name ?? undefined })}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors mb-3 w-full text-left"
          >
            <Phone className="h-4 w-4 shrink-0" />
            <span>{buyer.phoneNumber}</span>
          </button>
        )}

        {buyer && (
          <div className="flex items-center gap-2 pt-3 border-t border-border/30">
            <span className={cn(
              "text-xs px-2 py-0.5 rounded font-medium",
              buyer.external ? "bg-amber-500/10 text-amber-600" : "bg-primary/10 text-primary"
            )}>
              {buyer.external ? 'External' : 'Internal'}
            </span>
            {buyer.paidByReal && (
              <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-medium">
                Paid by Real
              </span>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
