import { useState } from 'react';
import { Sparkles, Wand2, Scissors, Maximize2, Languages, Mic, Type, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTemplateAssist, type AIMode, type ToneVariant } from '@/hooks/useTemplateAI';
import { AIDiffDialog } from './AIDiffDialog';
import { toast } from 'sonner';

interface Props {
  html: string;
  subject?: string;
  agentName?: string;
  /** Called with the new HTML after the user accepts the diff. */
  onApplyHtml: (html: string) => void;
  /** Called with one of the AI-generated subject lines. */
  onApplySubject?: (subject: string) => void;
}

export function AIAssistMenu({ html, subject, agentName, onApplyHtml, onApplySubject }: Props) {
  const assist = useTemplateAssist();
  const [pending, setPending] = useState<{ html: string; label: string } | null>(null);
  const [subjectChoices, setSubjectChoices] = useState<string[] | null>(null);

  const run = async (
    mode: AIMode,
    label: string,
    extra: { tone?: ToneVariant; targetLanguage?: 'en' | 'zh' | 'ko' | 'pa'; prompt?: string } = {},
  ) => {
    if (mode !== 'generate' && mode !== 'subject_lines' && !html.trim()) {
      toast.error('Add some content first, then ask AI to refine it.');
      return;
    }
    const t = toast.loading(`${label}…`);
    try {
      const result = await assist.mutateAsync({ mode, html, subject, agentName, ...extra });
      toast.dismiss(t);
      if (mode === 'subject_lines') {
        if (result.subjects?.length) setSubjectChoices(result.subjects);
        else toast.error('No subjects returned — try again.');
        return;
      }
      if (result.html) {
        setPending({ html: result.html, label });
      } else {
        toast.error('AI returned no content.');
      }
    } catch (err) {
      toast.dismiss(t);
    }
  };

  const accept = () => {
    if (pending) {
      onApplyHtml(pending.html);
      toast.success('Applied');
    }
    setPending(null);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
            disabled={assist.isPending}
          >
            {assist.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            AI Assist
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Rewrite
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={() => run('improve', 'Improving copy')}>
            <Wand2 className="h-3.5 w-3.5 mr-2" /> Improve writing
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => run('shorten', 'Shortening')}>
            <Scissors className="h-3.5 w-3.5 mr-2" /> Make it shorter
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => run('lengthen', 'Expanding')}>
            <Maximize2 className="h-3.5 w-3.5 mr-2" /> Make it longer
          </DropdownMenuItem>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Mic className="h-3.5 w-3.5 mr-2" /> Change tone
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {(['friendly', 'professional', 'direct', 'warm', 'luxury'] as ToneVariant[]).map((t) => (
                <DropdownMenuItem key={t} onClick={() => run('tone', `Switching to ${t}`, { tone: t })}>
                  <span className="capitalize">{t}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Languages className="h-3.5 w-3.5 mr-2" /> Translate
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onClick={() => run('translate', 'Translating to English', { targetLanguage: 'en' })}>
                English
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => run('translate', 'Translating to 中文', { targetLanguage: 'zh' })}>
                中文 (Mandarin)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => run('translate', 'Translating to 한국어', { targetLanguage: 'ko' })}>
                한국어 (Korean)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => run('translate', 'Translating to Punjabi', { targetLanguage: 'pa' })}>
                ਪੰਜਾਬੀ (Punjabi)
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Generate
          </DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() => {
              const prompt = window.prompt(
                'Describe the email you want — e.g. "VIP launch invite for Eden Phase 2 in Surrey, urgency around limited units."',
              );
              if (prompt?.trim()) run('generate', 'Drafting from prompt', { prompt });
            }}
          >
            <Sparkles className="h-3.5 w-3.5 mr-2" /> Draft from prompt…
          </DropdownMenuItem>
          {onApplySubject && (
            <DropdownMenuItem onClick={() => run('subject_lines', 'Generating subject lines')}>
              <Type className="h-3.5 w-3.5 mr-2" /> Suggest subject lines
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AIDiffDialog
        open={!!pending}
        onOpenChange={(v) => !v && setPending(null)}
        oldHtml={html}
        newHtml={pending?.html ?? ''}
        label={pending?.label ?? ''}
        onAccept={accept}
      />

      {/* Subject choices */}
      {subjectChoices && (
        <SubjectChoicesDialog
          choices={subjectChoices}
          onClose={() => setSubjectChoices(null)}
          onPick={(s) => {
            onApplySubject?.(s);
            setSubjectChoices(null);
            toast.success('Subject updated');
          }}
        />
      )}
    </>
  );
}

function SubjectChoicesDialog({
  choices, onClose, onPick,
}: {
  choices: string[];
  onClose: () => void;
  onPick: (s: string) => void;
}) {
  // Reuse Dialog primitive without re-importing — render inline.
  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-popover border border-border rounded-xl shadow-xl p-4 space-y-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Pick a subject line</h3>
        </div>
        <div className="space-y-1.5">
          {choices.map((s, i) => (
            <button
              key={i}
              onClick={() => onPick(s)}
              className="w-full text-left text-sm px-3 py-2 rounded-md border border-border/60 hover:border-primary hover:bg-primary/5 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="sm" className="w-full mt-2" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
