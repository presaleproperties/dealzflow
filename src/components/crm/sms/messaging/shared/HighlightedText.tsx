import { cn } from '@/lib/utils';

// Matches http(s)://, www. and bare domains like example.com/path
const URL_RE = /((?:https?:\/\/|www\.)[^\s]+|[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s]*)?)/gi;

function toHref(raw: string) {
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function renderWithLinks(text: string, keyPrefix: string) {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  URL_RE.lastIndex = 0;
  while ((match = URL_RE.exec(text)) !== null) {
    const start = match.index;
    if (start > lastIndex) {
      nodes.push(<span key={`${keyPrefix}-t-${lastIndex}`}>{text.slice(lastIndex, start)}</span>);
    }
    const url = match[0];
    nodes.push(
      <a
        key={`${keyPrefix}-u-${start}`}
        href={toHref(url)}
        target="_blank"
        rel="noreferrer"
        className="underline underline-offset-2 break-all [overflow-wrap:anywhere]"
        onClick={(e) => e.stopPropagation()}
      >
        {url}
      </a>,
    );
    lastIndex = start + url.length;
  }
  if (lastIndex < text.length) {
    nodes.push(<span key={`${keyPrefix}-t-${lastIndex}`}>{text.slice(lastIndex)}</span>);
  }
  return nodes;
}

export function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{renderWithLinks(text, 'r')}</>;
  const safe = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${safe})`, 'gi'));
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === query.toLowerCase()
          ? <mark key={i} className={cn('bg-yellow-300/60 dark:bg-yellow-500/40 rounded px-0.5')}>{p}</mark>
          : <span key={i}>{renderWithLinks(p, `p${i}`)}</span>,
      )}
    </>
  );
}
