import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import type { Message } from '@/hooks/useConversations';

type Channel = 'whatsapp' | 'sms' | 'email' | 'facebook' | 'instagram' | 'tiktok';

// Platform-specific incoming bubble colors per spec
const incomingColors: Record<Channel, string> = {
  whatsapp:  '#D9F7BE',
  facebook:  '#D6E4FF',
  instagram: '#FFD6E7',
  tiktok:    '#E8E8E8',
  email:     '#FFE7C2',
  sms:       '#E9E9EB',
};

const statusIcons: Record<string, string> = {
  queued:    '○',
  sent:      '✓',
  delivered: '✓✓',
  read:      '✓✓',
  failed:    '✗',
};

interface Props {
  message: Message;
  channel: Channel;
  showTime?: boolean;
}

export function MessageBubble({ message, channel, showTime = true }: Props) {
  const isOutbound = message.direction === 'outbound';
  const isZara = message.sender === 'zara';
  const isLead = message.sender === 'lead';

  let bubbleStyle: React.CSSProperties = {};
  let textClass = '';

  if (isLead) {
    bubbleStyle = { background: incomingColors[channel], color: '#1a1a1a' };
  } else if (isZara) {
    bubbleStyle = { background: '#FFF9EC', color: '#1a1a1a', border: '1px solid #F5A62340' };
  } else {
    // Uzair
    bubbleStyle = { background: '#F5A623', color: '#fff' };
    textClass = 'text-white';
  }

  return (
    <div className={cn('flex mb-2', isOutbound ? 'justify-end' : 'justify-start')}>
      <div className="max-w-[72%] flex flex-col gap-0.5">
        {/* Sender label */}
        {isZara && (
          <span className="text-[9px] font-semibold text-primary/70 px-1 self-end">⚡ Zara</span>
        )}

        <div
          className={cn(
            'px-3 py-2 text-[13px] leading-snug whitespace-pre-wrap break-words',
            isLead ? 'rounded-[18px_18px_18px_4px]' : 'rounded-[18px_18px_4px_18px]',
            textClass,
          )}
          style={bubbleStyle}
        >
          {message.body}
        </div>

        {/* Timestamp + delivery status */}
        {showTime && (
          <div className={cn('flex items-center gap-1 px-1', isOutbound ? 'justify-end' : 'justify-start')}>
            <span className="text-[10px] text-muted-foreground/50">
              {format(new Date(message.created_at), 'h:mm a')}
            </span>
            {isOutbound && (
              <span
                className={cn(
                  'text-[10px] font-medium',
                  message.status === 'read' ? 'text-blue-500' : 'text-muted-foreground/50',
                  message.status === 'failed' ? 'text-destructive' : '',
                )}
              >
                {statusIcons[message.status] || '✓'}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
