import { useState, useMemo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { FileText, Search, CheckCircle2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWhatsAppTemplates, type WhatsAppTemplate } from '@/hooks/useWhatsAppTemplates';

interface Props {
  /** Pick a template (substitutes {{1}} etc. with provided variables, default empty) */
  onPick: (body: string, template: WhatsAppTemplate) => void;
  /** Disable approved-only filter (e.g. for drafting) */
  approvedOnly?: boolean;
  /** Visual hint that we're outside the 24h freeform window */
  outsideWindow?: boolean;
}

function fillTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => vars[n] || `{{${n}}}`);
}

export function WhatsAppTemplatePicker({ onPick, approvedOnly = true, outsideWindow }: Props) {
  const { data: templates = [], isLoading } = useWhatsAppTemplates();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<WhatsAppTemplate | null>(null);
  const [vars, setVars] = useState<Record<string, string>>({});

  const visible = useMemo(() => {
    let list = templates;
    if (approvedOnly) list = list.filter((t) => (t.status || '').toLowerCase() === 'approved');
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((t) => t.name.toLowerCase().includes(q) || t.body_text.toLowerCase().includes(q));
    return list;
  }, [templates, approvedOnly, query]);

  const variableSlots = useMemo(() => {
    if (!selected) return [];
    const matches = selected.body_text.match(/\{\{\s*(\d+)\s*\}\}/g) || [];
    return [...new Set(matches.map((m) => m.replace(/[^\d]/g, '')))].sort();
  }, [selected]);

  const previewBody = selected ? fillTemplate(selected.body_text, vars) : '';

  const reset = () => {
    setSelected(null);
    setVars({});
    setQuery('');
  };

  const handleInsert = () => {
    if (!selected) return;
    onPick(previewBody, selected);
    setOpen(false);
    reset();
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className={cn(
            'h-7 w-7 rounded-full shrink-0',
            outsideWindow
              ? 'text-amber-600 dark:text-amber-400 hover:text-amber-700'
              : 'text-muted-foreground hover:text-emerald-600',
          )}
          title={outsideWindow ? 'Outside 24h window — must use approved template' : 'Insert WhatsApp template'}
        >
          <FileText className="w-3.5 h-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0" side="top">
        {!selected ? (
          <>
            <div className="px-3 py-2 border-b border-border">
              <div className="flex items-center gap-2">
                <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search templates"
                  className="h-7 border-0 px-0 focus-visible:ring-0 text-xs"
                  autoFocus
                />
              </div>
              {outsideWindow && (
                <div className="mt-1.5 text-[10px] text-amber-700 dark:text-amber-400 flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" />
                  Last reply was &gt;24h ago — only approved templates can start a new conversation.
                </div>
              )}
            </div>
            <div className="max-h-72 overflow-y-auto p-1.5">
              {isLoading && <div className="text-center text-xs text-muted-foreground py-6">Loading…</div>}
              {!isLoading && visible.length === 0 && (
                <div className="text-center text-xs text-muted-foreground py-6 px-3">
                  {templates.length === 0
                    ? 'No WhatsApp templates yet. Add and submit them in Twilio Content Builder, then sync.'
                    : 'No matching templates.'}
                </div>
              )}
              {visible.map((t) => {
                const approved = (t.status || '').toLowerCase() === 'approved';
                return (
                  <button
                    key={t.id}
                    onClick={() => setSelected(t)}
                    className="w-full text-left px-2 py-2 rounded-md hover:bg-muted text-xs"
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="font-medium text-foreground truncate flex-1">{t.name}</span>
                      {approved ? (
                        <Badge variant="outline" className="h-4 px-1 text-[9px] text-emerald-600 border-emerald-600/40 gap-0.5">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          Approved
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="h-4 px-1 text-[9px] text-muted-foreground">{t.status || 'draft'}</Badge>
                      )}
                      {t.language && (
                        <span className="text-[9px] uppercase text-muted-foreground">{t.language}</span>
                      )}
                    </div>
                    <div className="text-muted-foreground line-clamp-2 leading-snug">{t.body_text}</div>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div className="p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[11px]" onClick={reset}>
                ← Back
              </Button>
              <span className="text-xs font-semibold flex-1 truncate">{selected.name}</span>
            </div>

            {variableSlots.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Variables</div>
                {variableSlots.map((slot) => (
                  <Input
                    key={slot}
                    value={vars[slot] || ''}
                    onChange={(e) => setVars({ ...vars, [slot]: e.target.value })}
                    placeholder={`{{${slot}}}`}
                    className="h-7 text-xs"
                  />
                ))}
              </div>
            )}

            <div className="rounded-md border border-border bg-muted/40 p-2 text-xs whitespace-pre-wrap leading-snug">
              {previewBody || <span className="text-muted-foreground italic">Empty</span>}
            </div>

            <Button
              onClick={handleInsert}
              className="w-full h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
              size="sm"
            >
              Insert into composer
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
