import { cn } from '@/lib/utils';

type Channel = 'whatsapp' | 'sms' | 'email' | 'facebook' | 'instagram' | 'tiktok';

const channelConfig: Record<Channel, { label: string; bg: string; text: string; icon: string }> = {
  whatsapp:  { label: 'WA',  bg: '#25D366', text: '#fff',     icon: '💬' },
  sms:       { label: 'SMS', bg: '#8E8E93', text: '#fff',     icon: '✉️' },
  email:     { label: 'EM',  bg: '#FF9F0A', text: '#fff',     icon: '📧' },
  facebook:  { label: 'FB',  bg: '#1877F2', text: '#fff',     icon: '📘' },
  instagram: { label: 'IG',  bg: '#E1306C', text: '#fff',     icon: '📸' },
  tiktok:    { label: 'TT',  bg: '#000000', text: '#fff',     icon: '🎵' },
};

export function ChannelBadge({ channel, size = 'sm', className }: { channel: Channel; size?: 'xs' | 'sm' | 'md'; className?: string }) {
  const config = channelConfig[channel];
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full font-semibold leading-none',
        size === 'xs' && 'h-4 w-4 text-[8px]',
        size === 'sm' && 'h-5 w-5 text-[9px]',
        size === 'md' && 'h-6 w-6 text-[10px]',
        className,
      )}
      style={{ background: config.bg, color: config.text }}
      title={channel}
    >
      {config.label}
    </span>
  );
}

export function ChannelDot({ channel }: { channel: Channel }) {
  const config = channelConfig[channel];
  return (
    <span
      className="inline-block h-2 w-2 rounded-full flex-shrink-0"
      style={{ background: config.bg }}
      title={channel}
    />
  );
}
