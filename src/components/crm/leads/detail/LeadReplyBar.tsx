import { MessageSquare, Mail, Phone, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  hasPhone: boolean;
  hasEmail: boolean;
  onSms: () => void;
  onEmail: () => void;
  onWhatsApp: () => void;
  onCall: () => void;
}

/**
 * Sticky reply bar pinned to the bottom of Lead Detail.
 * The #1 daily action — composing a reply — is now one tap from anywhere
 * inside a lead, instead of buried under tabs.
 */
export function LeadReplyBar({
  hasPhone, hasEmail, onSms, onEmail, onWhatsApp, onCall,
}: Props) {
  return (
    <div
      className="sticky bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur-md"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="px-4 py-2.5 flex items-center gap-2">
        <span className="text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground/70 font-semibold mr-1 hidden md:inline">
          Reply
        </span>

        <ReplyButton
          icon={MessageSquare}
          label="SMS"
          disabled={!hasPhone}
          onClick={onSms}
          tone="primary"
        />
        <ReplyButton
          icon={Mail}
          label="Email"
          disabled={!hasEmail}
          onClick={onEmail}
        />
        <ReplyButton
          icon={MessageCircle}
          label="WhatsApp"
          disabled={!hasPhone}
          onClick={onWhatsApp}
        />
        <ReplyButton
          icon={Phone}
          label="Call"
          disabled={!hasPhone}
          onClick={onCall}
        />

        {!hasPhone && !hasEmail && (
          <span className="ml-auto text-[11px] text-muted-foreground/70">
            Add a phone or email to this lead to enable replies
          </span>
        )}
      </div>
    </div>
  );
}

function ReplyButton({
  icon: Icon, label, onClick, disabled, tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'primary' | 'default';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[12px] font-medium border transition-all',
        tone === 'primary'
          ? 'border-primary/30 text-primary bg-primary/5 hover:bg-primary/10'
          : 'border-border text-foreground/80 hover:border-primary/30 hover:text-foreground',
        disabled && 'opacity-40 cursor-not-allowed hover:border-border hover:text-foreground/80',
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}
