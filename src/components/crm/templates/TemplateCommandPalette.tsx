import { useEffect, useMemo, useRef, useState } from 'react';
import { Mail, MessageSquare, Sparkles, Loader2, Star, Send, Pencil } from 'lucide-react';
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput,
  CommandItem, CommandList, CommandSeparator,
} from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { UnifiedTemplate } from '@/hooks/useUnifiedTemplates';

interface AiMatch {
  id: string;
  reason?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  templates: UnifiedTemplate[];
  onPreview: (t: UnifiedTemplate) => void;
  onSend: (t: UnifiedTemplate) => void;
  onEdit?: (t: UnifiedTemplate) => void;
}

export function TemplateCommandPalette({
  open, onOpenChange, templates, onPreview, onSend, onEdit,
}: Props) {
  const [query, setQuery] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMatches, setAiMatches] = useState<AiMatch[] | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const aiAbort = useRef<AbortController | null>(null);

  // Reset AI matches whenever the query changes (so palette stays snappy).
  useEffect(() => { setAiMatches(null); setAiError(null); }, [query]);
  useEffect(() => {
    if (!open) { setQuery(''); setAiMatches(null); setAiError(null); }
  }, [open]);

  const byId = useMemo(() => {
    const m = new Map<string, UnifiedTemplate>();
    templates.forEach((t) => m.set(t.id, t));
    return m;
  }, [templates]);

  const aiResults = useMemo(() => {
    if (!aiMatches) return [];
    return aiMatches
      .map((m) => ({ template: byId.get(m.id), reason: m.reason }))
      .filter((r): r is { template: UnifiedTemplate; reason?: string } => !!r.template);
  }, [aiMatches, byId]);

  const askAI = async () => {
    if (!query.trim() || query.trim().length < 4) {
      toast.info('Describe what you want — e.g. "follow-up after a showing".');
      return;
    }
    aiAbort.current?.abort();
    aiAbort.current = new AbortController();
    setAiBusy(true);
    setAiError(null);
    try {
      const candidates = templates.slice(0, 80).map((t) => ({
        id: t.id,
        kind: t.kind,
        name: t.name,
        subject: t.subject ?? null,
        snippet: t.bodyText.slice(0, 160),
      }));
      const { data, error } = await supabase.functions.invoke('template-ai-assist', {
        body: { mode: 'search', prompt: query, candidates },
      });
      if (error) throw error;
      const matches: AiMatch[] = Array.isArray((data as any)?.matches) ? (data as any).matches : [];
      if (matches.length === 0) {
        setAiError('AI could not find a strong match. Try rephrasing or pick from the list above.');
      }
      setAiMatches(matches);
    } catch (e: any) {
      setAiError(e?.message ?? 'AI search failed');
      toast.error('AI search failed');
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Search templates by name, subject, body…"
      />
      <div className="px-3 py-2 border-b border-border/60 flex items-center justify-between gap-2">
        <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
          Tip: ⌘K opens this palette anywhere on the Templates page
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 text-[11.5px]"
          onClick={askAI}
          disabled={aiBusy || !query.trim()}
        >
          {aiBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          Ask AI
        </Button>
      </div>
      <CommandList className="max-h-[60vh]">
        <CommandEmpty>No matches. Type a phrase and hit Ask AI.</CommandEmpty>

        {aiResults.length > 0 && (
          <>
            <CommandGroup heading="AI suggestions">
              {aiResults.map(({ template, reason }) => (
                <CommandItem
                  key={`ai-${template.id}`}
                  value={`__ai__${template.name}`}
                  onSelect={() => { onPreview(template); onOpenChange(false); }}
                  className="flex items-start gap-2 py-2"
                >
                  <Sparkles className="w-3.5 h-3.5 mt-0.5 text-primary" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate">{template.name}</div>
                    {reason && (
                      <div className="text-[11px] text-muted-foreground truncate">{reason}</div>
                    )}
                  </div>
                  <TemplateRowActions t={template} onSend={onSend} onEdit={onEdit} />
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {aiError && (
          <div className="px-3 py-2 text-[11.5px] text-muted-foreground">{aiError}</div>
        )}

        <CommandGroup heading="All templates">
          {templates.map((t) => (
            <CommandItem
              key={t.id}
              value={`${t.name} ${t.subject ?? ''} ${t.bodyText.slice(0, 200)}`}
              onSelect={() => { onPreview(t); onOpenChange(false); }}
              className="flex items-start gap-2 py-2"
            >
              {t.kind === 'email'
                ? <Mail className="w-3.5 h-3.5 mt-0.5 text-muted-foreground" />
                : <MessageSquare className="w-3.5 h-3.5 mt-0.5 text-muted-foreground" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-medium truncate">{t.name}</span>
                  {t.isFavorite && <Star className="w-3 h-3 text-amber-500" fill="currentColor" />}
                </div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {t.subject || t.bodyText.slice(0, 90)}
                </div>
              </div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 shrink-0">
                {t.source}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

function TemplateRowActions({
  t, onSend, onEdit,
}: { t: UnifiedTemplate; onSend: (t: UnifiedTemplate) => void; onEdit?: (t: UnifiedTemplate) => void }) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      {onEdit && t.source !== 'presale' && !t.isLocked && (
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(t); }}
          className="text-muted-foreground hover:text-foreground p-1 rounded"
          aria-label="Edit"
        >
          <Pencil className="w-3 h-3" />
        </button>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onSend(t); }}
        className="text-muted-foreground hover:text-primary p-1 rounded"
        aria-label="Send"
      >
        <Send className="w-3 h-3" />
      </button>
    </div>
  );
}
