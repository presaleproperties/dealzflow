/**
 * NewMessagesPill — floating "↓ N new" affordance shown when a user is
 * scrolled away from the bottom of a chat thread and new inbound messages
 * arrive. Tapping it scrolls to the latest message.
 *
 * Watches the provided scroll element + a counter (`messagesCount`) so the
 * parent stays the source of truth for message arrivals.
 */
import { useEffect, useRef, useState } from 'react';
import { ArrowDown } from 'lucide-react';

interface Props {
  scrollRef: React.RefObject<HTMLDivElement>;
  messagesCount: number;
  /** Pixel slack from bottom that still counts as "at bottom". Default 120. */
  bottomSlack?: number;
}

export function NewMessagesPill({ scrollRef, messagesCount, bottomSlack = 120 }: Props) {
  const [unread, setUnread] = useState(0);
  const [atBottom, setAtBottom] = useState(true);
  const lastSeen = useRef(messagesCount);

  // Watch scroll position
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      const at = dist <= bottomSlack;
      setAtBottom(at);
      if (at) { setUnread(0); lastSeen.current = messagesCount; }
    };
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [scrollRef, bottomSlack, messagesCount]);

  // When new messages land, bump unread if user is scrolled up
  useEffect(() => {
    if (messagesCount > lastSeen.current) {
      if (atBottom) {
        lastSeen.current = messagesCount;
        setUnread(0);
      } else {
        setUnread((u) => u + (messagesCount - lastSeen.current));
        lastSeen.current = messagesCount;
      }
    } else {
      lastSeen.current = messagesCount;
    }
  }, [messagesCount, atBottom]);

  if (atBottom || unread === 0) return null;

  return (
    <button
      type="button"
      onClick={() => {
        const el = scrollRef.current;
        if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      }}
      className="absolute left-1/2 -translate-x-1/2 bottom-[calc(env(safe-area-inset-bottom,0px)+88px)] z-30 inline-flex items-center gap-1.5 px-3 h-8 rounded-full bg-primary text-primary-foreground text-[12px] font-semibold shadow-lg shadow-primary/30 backdrop-blur-md animate-in fade-in-0 slide-in-from-bottom-2 duration-200 active:scale-95 transition-transform"
      aria-label={`Jump to ${unread} new message${unread === 1 ? '' : 's'}`}
    >
      <ArrowDown className="w-3.5 h-3.5" />
      {unread} new
    </button>
  );
}
