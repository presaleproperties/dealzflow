import { useRef } from 'react';
import { Mail, Send, Eye, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { BridgeTemplate } from '@/hooks/useBridgeEmail';
import { inferTemplateTags, type TemplateTag } from '@/lib/templateTags';

const TAG_STYLE: Record<TemplateTag, string> = {
  Presale: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
  Resale: 'bg-sky-500/10 text-sky-700 border-sky-500/20',
  Offer: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
  Newsletter: 'bg-violet-500/10 text-violet-700 border-violet-500/20',
  Welcome: 'bg-rose-500/10 text-rose-700 border-rose-500/20',
  'Follow-up': 'bg-indigo-500/10 text-indigo-700 border-indigo-500/20',
  Other: 'bg-muted text-muted-foreground border-border',
};

function timeAgo(dateStr?: string | null) {
  if (!dateStr) return 'Just now';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (days > 0) return `${days}d ago`;
  if (hrs > 0) return `${hrs}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return 'Just now';
}

interface Props {
  asset: BridgeTemplate;
  onSend: (asset: BridgeTemplate) => void;
  onPreview: (asset: BridgeTemplate) => void;
}

/**
 * Visual mirror of Presale's TemplateCard. Read-only — authoring lives in
 * Presale's Marketing Hub. We only expose Send + Preview here.
 */
export function PresaleTemplateCard({ asset, onSend, onPreview }: Props) {
  const isEmail = true; // bridge currently only ships email templates
  const projectName =
    (asset as unknown as { project?: string | null }).project || asset.category || 'Presale Properties';

  return (
    <div className="group relative rounded-xl border border-border bg-card overflow-hidden hover:border-primary/30 hover:shadow-md transition-all">
      <div
        className="h-44 bg-muted/30 relative cursor-pointer overflow-hidden"
        onClick={() => onPreview(asset)}
      >
        {asset.body_html ? (
          <MiniThumbnail html={asset.body_html} />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Mail className="h-10 w-10 text-muted-foreground/15" />
          </div>
        )}
        <div className="absolute top-2 left-2">
          <Badge
            className={cn(
              'text-[9px] px-1.5 py-0.5 shadow-sm',
              isEmail
                ? 'bg-emerald-500/90 text-white hover:bg-emerald-500/90'
                : 'bg-violet-500/90 text-white hover:bg-violet-500/90',
            )}
          >
            {isEmail ? 'Email' : 'Flyer'}
          </Badge>
        </div>
        <div className="absolute top-2 right-2">
          <Badge className="bg-primary/90 text-primary-foreground text-[9px] px-1.5 py-0.5 shadow-sm">
            PRESALE
          </Badge>
        </div>
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
          <Button size="sm" variant="secondary" className="gap-1.5 shadow-lg">
            <Eye className="h-3.5 w-3.5" /> Preview
          </Button>
        </div>
      </div>

      <div className="p-3.5">
        <p className="text-sm font-semibold truncate mb-0.5">{asset.name}</p>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 mb-2">
          <Clock className="h-3 w-3" />
          {timeAgo(asset.updated_at)}
          <span className="text-muted-foreground/30">·</span>
          <span className="truncate">{projectName}</span>
        </div>
        <p className="text-xs text-muted-foreground truncate mb-2">{asset.subject}</p>

        {/* Inferred filter tags */}
        <div className="flex flex-wrap gap-1 mb-3 min-h-[18px]">
          {inferTemplateTags(asset).map((tag) => (
            <span
              key={tag}
              className={cn(
                'inline-flex items-center text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border',
                TAG_STYLE[tag],
              )}
            >
              {tag}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-1.5 pt-3 border-t border-border">
          <Button size="sm" className="flex-1 h-8 text-xs gap-1.5" onClick={() => onSend(asset)}>
            <Send className="h-3.5 w-3.5" /> Send
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-2.5 text-xs"
            onClick={() => onPreview(asset)}
          >
            Preview
          </Button>
        </div>
      </div>
    </div>
  );
}

function MiniThumbnail({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  return (
    <iframe
      ref={(el) => {
        ref.current = el;
        if (el) {
          const doc = el.contentDocument;
          if (doc) {
            doc.open();
            doc.write(
              `<div style="transform:scale(0.3);transform-origin:top left;width:333%;pointer-events:none;">${html}</div>`,
            );
            doc.close();
          }
        }
      }}
      title="thumbnail"
      className="w-full h-full border-0 bg-white"
      sandbox="allow-same-origin"
    />
  );
}
