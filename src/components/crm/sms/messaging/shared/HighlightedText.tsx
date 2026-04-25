import { cn } from '@/lib/utils';

export function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const safe = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${safe})`, 'gi'));
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === query.toLowerCase()
          ? <mark key={i} className={cn('bg-yellow-300/60 dark:bg-yellow-500/40 rounded px-0.5')}>{p}</mark>
          : <span key={i}>{p}</span>,
      )}
    </>
  );
}
