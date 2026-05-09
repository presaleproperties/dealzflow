import { useState } from 'react';
import { Zap, ChevronDown } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { noteTime } from './types';
import type { CrmNote } from '@/hooks/useCrmNotes';

/**
 * System-style notes (lead score updates, task created/completed, automation
 * runs, "system auto-updated" trigger writes) tend to flood the activity feed
 * and push real conversations off-screen.
 *
 * This cluster compresses any *consecutive run* of system notes into a single
 * one-line row showing only the most recent entry, with a "+N more" toggle to
 * expand the rest in-place.
 */

export function isSystemishNote(n: CrmNote): boolean {
  if (n.note_type === 'system') return true;
  const c = (n.content || '').toLowerCase();
  return (
    /lead score (was )?updated|score (changed|recalculated)/.test(c) ||
    /task (created|updated|completed|reopened|due|assigned)/.test(c) ||
    /system auto[- ]updated|automation (ran|fired|triggered)/.test(c) ||
    /pipeline (changed|updated)|status changed to/.test(c) ||
    /assigned to .* by system|stage moved/.test(c)
  );
}

interface Props {
  notes: CrmNote[]; // newest first
}

export function SystemActivityCluster({ notes }: Props) {
  const [expanded, setExpanded] = useState(false);
  if (notes.length === 0) return null;

  const latest = notes[0];
  const ts = noteTime(latest);
  const time = format(parseISO(ts), 'MMM d · h:mm a');
  const extra = notes.length - 1;

  // Single system entry → render compact row, no toggle.
  if (notes.length === 1) {
    return <SystemRow note={latest} time={time} />;
  }

  return (
    <div className="group relative flex gap-3">
      <div
        className="relative z-10 flex items-center justify-center w-7 h-7 rounded-full flex-shrink-0 border bg-background"
        style={{ borderColor: 'hsl(220 10% 55% / 0.35)', background: 'hsl(220 10% 55% / 0.08)' }}
      >
        <Zap className="w-3 h-3" strokeWidth={2} style={{ color: 'hsl(220 10% 55%)' }} />
      </div>

      <div className="flex-1 min-w-0">
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          className={cn(
            'w-full text-left rounded-md border border-dashed border-border/50 bg-muted/20',
            'px-3 py-1.5 hover:bg-muted/40 transition-colors',
            'flex items-center gap-2 text-[12px]',
          )}
        >
          <span className="font-semibold uppercase tracking-[0.08em] text-[10px] text-muted-foreground">
            System
          </span>
          <span className="text-muted-foreground/40">·</span>
          <span className="truncate text-foreground/80 flex-1 min-w-0">
            {oneLine(latest.content)}
          </span>
          <span className="text-[10.5px] tabular-nums text-muted-foreground/70 shrink-0">
            {time}
          </span>
          <span className="text-[10.5px] font-semibold text-muted-foreground/80 shrink-0 ml-1 px-1.5 py-0.5 rounded-full bg-muted/60">
            +{extra}
          </span>
          <ChevronDown
            className={cn(
              'w-3.5 h-3.5 text-muted-foreground/70 shrink-0 transition-transform',
              expanded && 'rotate-180',
            )}
          />
        </button>

        {expanded && (
          <ul className="mt-1.5 ml-1 space-y-0.5 border-l border-border/50 pl-3">
            {notes.slice(1).map(n => {
              const t = format(parseISO(noteTime(n)), 'MMM d · h:mm a');
              return (
                <li
                  key={n.id}
                  className="flex items-center gap-2 text-[11.5px] text-muted-foreground py-0.5"
                >
                  <span className="truncate flex-1 min-w-0">{oneLine(n.content)}</span>
                  <span className="tabular-nums shrink-0 text-muted-foreground/70">{t}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function SystemRow({ note, time }: { note: CrmNote; time: string }) {
  return (
    <div className="group relative flex gap-3">
      <div
        className="relative z-10 flex items-center justify-center w-7 h-7 rounded-full flex-shrink-0 border bg-background"
        style={{ borderColor: 'hsl(220 10% 55% / 0.35)', background: 'hsl(220 10% 55% / 0.08)' }}
      >
        <Zap className="w-3 h-3" strokeWidth={2} style={{ color: 'hsl(220 10% 55%)' }} />
      </div>
      <div className="flex-1 min-w-0 rounded-md border border-dashed border-border/50 bg-muted/20 px-3 py-1.5 flex items-center gap-2 text-[12px]">
        <span className="font-semibold uppercase tracking-[0.08em] text-[10px] text-muted-foreground">
          System
        </span>
        <span className="text-muted-foreground/40">·</span>
        <span className="truncate text-foreground/80 flex-1 min-w-0">{oneLine(note.content)}</span>
        <span className="text-[10.5px] tabular-nums text-muted-foreground/70 shrink-0">{time}</span>
      </div>
    </div>
  );
}

function oneLine(s: string): string {
  return (s || '').replace(/\s+/g, ' ').trim().slice(0, 160);
}
