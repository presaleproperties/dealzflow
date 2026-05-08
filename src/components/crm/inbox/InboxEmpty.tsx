import { Inbox, MessageSquare, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Kind = 'email' | 'chats';

const COPY: Record<Kind, { icon: typeof Inbox; title: string; sub: string }> = {
  email: {
    icon: Inbox,
    title: 'Inbox zero',
    sub: 'Nothing waiting. Sync to pull the latest, or compose something new.',
  },
  chats: {
    icon: MessageSquare,
    title: 'No conversations yet',
    sub: 'When leads reply by text or email, their threads will land here.',
  },
};

export function InboxEmpty({
  kind, onAction, actionLabel = 'Sync now', className,
}: {
  kind: Kind;
  onAction?: () => void;
  actionLabel?: string;
  className?: string;
}) {
  const { icon: Icon, title, sub } = COPY[kind];
  return (
    <div className={cn('flex flex-col items-center justify-center text-center px-8 py-16 gap-4', className)}>
      <div className="relative">
        <div className="absolute inset-0 blur-2xl bg-primary/15 rounded-full" aria-hidden />
        <div className="relative h-14 w-14 rounded-2xl border border-border/70 bg-card flex items-center justify-center shadow-sm">
          <Icon className="h-6 w-6 text-primary" strokeWidth={1.5} />
        </div>
      </div>
      <div className="space-y-1">
        <h3 className="text-[15px] font-semibold tracking-tight text-foreground">{title}</h3>
        <p className="text-[12.5px] text-muted-foreground max-w-[34ch] leading-relaxed">{sub}</p>
      </div>
      {onAction && (
        <Button onClick={onAction} variant="outline" size="sm" className="h-8 gap-1.5 text-[12px] mt-1">
          <RefreshCcw className="h-3.5 w-3.5" />
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
