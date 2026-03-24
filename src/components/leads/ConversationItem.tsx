import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import type { Conversation } from '@/hooks/useConversations';
import { ChannelBadge } from './ChannelBadge';

interface Props {
  conversation: Conversation;
  isSelected: boolean;
  onSelect: (id: string) => void;
  lastMessagePreview?: string;
}

const statusColors: Record<string, string> = {
  new:           'hsl(217 91% 60%)',
  contacted:     'hsl(43 96% 56%)',
  engaged:       'hsl(158 64% 52%)',
  qualified:     'hsl(262 83% 63%)',
  booked:        'hsl(142 72% 45%)',
  escalated:     'hsl(0 84% 60%)',
  unresponsive:  'hsl(0 0% 60%)',
  disqualified:  'hsl(0 0% 45%)',
  closed:        'hsl(0 0% 50%)',
};

const statusLabels: Record<string, string> = {
  new: 'New', contacted: 'Contacted', engaged: 'Engaged',
  qualified: 'Qualified', booked: 'Booked', escalated: 'Escalated',
  unresponsive: 'No Reply', disqualified: 'DQ', closed: 'Closed',
};

export function ConversationItem({ conversation, isSelected, onSelect, lastMessagePreview }: Props) {
  const isHot = conversation.heat >= 70;
  const timeAgo = conversation.last_message_at
    ? formatDistanceToNow(new Date(conversation.last_message_at), { addSuffix: false })
    : formatDistanceToNow(new Date(conversation.created_at), { addSuffix: false });

  const initials = conversation.lead_name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();

  return (
    <button
      onClick={() => onSelect(conversation.id)}
      className={cn(
        'w-full text-left px-3 py-2.5 flex items-start gap-2.5 transition-all duration-150 border-b border-border/40',
        isSelected
          ? 'bg-primary/8'
          : 'hover:bg-muted/40',
      )}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0 mt-0.5">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-semibold"
          style={{ background: 'hsl(var(--muted))', color: 'hsl(var(--foreground))' }}
        >
          {initials || '?'}
        </div>
        {/* Channel badge overlaid bottom-right */}
        <ChannelBadge
          channel={conversation.channel}
          size="xs"
          className="absolute -bottom-0.5 -right-0.5 ring-1 ring-background"
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[13px] font-semibold truncate text-foreground leading-tight">
              {conversation.lead_name}
            </span>
            {conversation.assigned_to === 'zara' && (
              <span className="text-[9px] font-bold text-primary/80 bg-primary/10 px-1 py-0.5 rounded">⚡ Z</span>
            )}
            {isHot && <span className="text-[11px]">🔥</span>}
          </div>
          <span className="text-[10px] text-muted-foreground/60 flex-shrink-0 whitespace-nowrap">{timeAgo}</span>
        </div>

        <div className="flex items-center justify-between gap-1.5 mt-0.5">
          <p className="text-[11px] text-muted-foreground/70 truncate leading-snug">
            {lastMessagePreview || conversation.lead_phone || conversation.lead_email || 'No messages yet'}
          </p>
          <span
            className="flex-shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
            style={{
              background: (statusColors[conversation.status] || 'hsl(0 0% 60%)') + '20',
              color: statusColors[conversation.status] || 'hsl(0 0% 60%)',
            }}
          >
            {statusLabels[conversation.status] || conversation.status}
          </span>
        </div>
      </div>
    </button>
  );
}
