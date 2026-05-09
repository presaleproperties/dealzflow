import { useState } from 'react';
import { Bookmark, BookmarkPlus, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TimelinePreset } from '@/hooks/useTimelinePresets';

interface Props {
  presets: TimelinePreset[];
  activeId: string | null;
  canSave: boolean;
  onApply: (preset: TimelinePreset) => void;
  onDelete: (id: string) => void;
  onSave: (name: string) => void;
}

export function TimelinePresetsBar({
  presets,
  activeId,
  canSave,
  onApply,
  onDelete,
  onSave,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  const commit = () => {
    const name = draft.trim();
    if (!name) {
      setAdding(false);
      setDraft('');
      return;
    }
    onSave(name);
    setDraft('');
    setAdding(false);
  };

  if (presets.length === 0 && !adding && !canSave) return null;

  return (
    <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
      <Bookmark className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
      {presets.map((p) => {
        const active = p.id === activeId;
        return (
          <span
            key={p.id}
            className={cn(
              'group inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors',
              active
                ? 'border-foreground bg-foreground/[0.06] text-foreground'
                : 'border-border bg-background text-muted-foreground hover:text-foreground',
            )}
          >
            <button
              type="button"
              onClick={() => onApply(p)}
              className="max-w-[140px] truncate font-medium"
              title={p.name}
            >
              {p.name}
            </button>
            <button
              type="button"
              onClick={() => onDelete(p.id)}
              className="opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
              aria-label={`Delete preset ${p.name}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        );
      })}

      {adding ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-background px-1.5 py-0.5">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              else if (e.key === 'Escape') {
                setAdding(false);
                setDraft('');
              }
            }}
            placeholder="Preset name"
            className="h-5 w-28 bg-transparent text-[11px] outline-none placeholder:text-muted-foreground/60"
            maxLength={40}
          />
          <button
            type="button"
            onClick={commit}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Save preset"
          >
            <Check className="h-3 w-3" />
          </button>
        </span>
      ) : canSave ? (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:border-foreground/40 hover:text-foreground"
        >
          <BookmarkPlus className="h-3 w-3" />
          Save view
        </button>
      ) : null}
    </div>
  );
}
