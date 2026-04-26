import { ArrowLeft } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Full-page skeleton for the chat thread (header + messages + composer).
 * Used while the conversation row + contact join are still loading.
 */
export function ChatThreadSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <div className="-mx-3 sm:-mx-4 -my-3 sm:-my-4 flex flex-col h-[calc(100vh-60px)]">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border flex items-center gap-3 px-3 py-2.5">
        <button
          onClick={onBack}
          className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground active:bg-muted/60 transition-colors"
          aria-label="Back to chats"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <Skeleton className="h-9 w-9 rounded-full shrink-0" />
        <div className="flex-1 min-w-0 space-y-1.5">
          <Skeleton className="h-3.5 w-1/2" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </div>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-4 bg-muted/10">
        <MessageBubbleSkeleton />
      </div>
      {/* Composer */}
      <div className="sticky bottom-0 border-t border-border bg-background/95 backdrop-blur px-3 py-2.5 pb-[calc(env(safe-area-inset-bottom,0px)+10px)] flex items-center gap-2">
        <Skeleton className="flex-1 h-11 rounded-full" />
        <Skeleton className="h-11 w-11 rounded-full" />
      </div>
    </div>
  );
}

/**
 * iMessage-style alternating bubble shimmer used inside the message scroller.
 */
export function MessageBubbleSkeleton() {
  // Mix of inbound/outbound at varying widths to feel like a real thread.
  const rows: Array<{ outbound: boolean; w: string; h: string }> = [
    { outbound: false, w: 'w-[55%]', h: 'h-9' },
    { outbound: true, w: 'w-[40%]', h: 'h-8' },
    { outbound: false, w: 'w-[70%]', h: 'h-12' },
    { outbound: true, w: 'w-[50%]', h: 'h-9' },
    { outbound: false, w: 'w-[35%]', h: 'h-8' },
    { outbound: true, w: 'w-[60%]', h: 'h-10' },
  ];
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={i} className={`flex ${r.outbound ? 'justify-end' : 'justify-start'}`}>
          <Skeleton
            className={`${r.w} ${r.h} ${r.outbound ? 'rounded-2xl rounded-br-md' : 'rounded-2xl rounded-bl-md'}`}
          />
        </div>
      ))}
    </div>
  );
}
