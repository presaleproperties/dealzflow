import { Sparkles, RefreshCw } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { LinkifiedText } from '@/lib/formatNoteContent';
import { cn } from '@/lib/utils';
import type { CrmNote } from '@/hooks/useCrmNotes';

interface Props {
  note: CrmNote;
  contactId: string;
  isStale?: boolean;
}

export function AiSummaryCard({ note, contactId, isStale }: Props) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const ts = note.event_at || note.updated_at || note.created_at;
  const when = ts ? format(parseISO(ts), 'MMM d, yyyy · h:mm a') : '';
  // Strip leading "📋 LEAD SUMMARY\n\n" header if present
  const body = note.content.replace(/^📋\s*LEAD SUMMARY\s*\n+/i, '').trim();

  const regenerate = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke('generate-lead-summary', {
        body: { contact_id: contactId },
      });
      if (error) throw error;
      toast.success('Summary regenerated');
      qc.invalidateQueries({ queryKey: ['crm-notes', contactId] });
      qc.invalidateQueries({ queryKey: ['crm-contact', contactId] });
    } catch (e: any) {
      toast.error(e?.message || 'Failed to regenerate');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="group relative flex gap-3">
      <div className="relative z-10 flex items-center justify-center w-7 h-7 rounded-full flex-shrink-0 border bg-background"
        style={{ borderColor: 'hsl(280 80% 60% / 0.45)', background: 'hsl(280 80% 60% / 0.10)' }}>
        <Sparkles className="w-3.5 h-3.5" strokeWidth={2} style={{ color: 'hsl(280 80% 60%)' }} />
      </div>
      <div className={cn(
        'flex-1 min-w-0 rounded-lg border px-3.5 py-3 transition-all',
        'border-foreground/15 bg-gradient-to-br from-purple-500/[0.04] to-transparent',
      )}>
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-foreground/80 uppercase tracking-wider text-[11px]">
              AI Lead Summary
            </span>
            {isStale && (
              <span className="text-[10px] uppercase tracking-wider font-semibold text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded">
                Updating soon
              </span>
            )}
            <span className="opacity-30">·</span>
            <span className="text-muted-foreground shrink-0">{when}</span>
          </div>
          <button
            onClick={regenerate}
            disabled={busy}
            className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
            aria-label="Regenerate summary"
          >
            <RefreshCw className={cn('w-3 h-3', busy && 'animate-spin')} />
            {busy ? 'Generating…' : 'Regenerate'}
          </button>
        </div>
        <p className="text-[14px] text-foreground/90 whitespace-pre-wrap leading-relaxed">
          {body.split(/(\*\*[^*]+\*\*)/g).map((seg, i) => {
            const m = seg.match(/^\*\*([^*]+)\*\*$/);
            if (m) {
              return (
                <strong key={i} className="font-semibold text-foreground">
                  {m[1]}
                </strong>
              );
            }
            return (
              <LinkifiedText
                key={i}
                text={seg}
                context={{ contactId, noteId: note.id, source: 'ai_summary' }}
              />
            );
          })}
        </p>
      </div>
    </div>
  );
}

interface GenerateButtonProps {
  contactId: string;
  hasExisting: boolean;
}

export function GenerateAiSummaryButton({ contactId, hasExisting }: GenerateButtonProps) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  if (hasExisting) return null;

  const generate = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke('generate-lead-summary', {
        body: { contact_id: contactId },
      });
      if (error) throw error;
      toast.success('AI summary generated');
      qc.invalidateQueries({ queryKey: ['crm-notes', contactId] });
      qc.invalidateQueries({ queryKey: ['crm-contact', contactId] });
    } catch (e: any) {
      toast.error(e?.message || 'Failed to generate summary');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={generate}
      disabled={busy}
      className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-foreground/20 bg-gradient-to-br from-purple-500/[0.04] to-transparent text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors disabled:opacity-50"
    >
      <Sparkles className={cn('w-3.5 h-3.5', busy && 'animate-pulse')} />
      {busy ? 'Generating AI summary…' : 'Generate AI Lead Summary'}
    </button>
  );
}
