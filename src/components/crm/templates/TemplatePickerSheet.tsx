// Tier 3 — TemplatePickerSheet
//
// A drop-in sheet that any compose surface (lead detail, campaign builder,
// quick-reply) can mount. Renders the 4 collapsible sections from
// getTemplatesForPicker. Each row: name + subject/body preview + "Use" button.
//
// Pure presentational — owner controls open state and handles `onPick`.
// Tier 4 will wire this into the unified composer.

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Mail, MessageSquare, Sparkles } from 'lucide-react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Pill } from '@/components/crm/shared/Pill';
import { cn } from '@/lib/utils';
import {
  getTemplatesForPicker,
  type PickerKind,
  type PickerSections,
  type PickerTemplate,
} from '@/lib/templatePicker';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leadId: string | null;
  userId: string | null;
  /** Restrict to one channel; omit to show both. */
  channel?: PickerKind;
  onPick: (t: PickerTemplate) => void;
}

type SectionKey = keyof PickerSections;

const SECTION_META: Record<SectionKey, { label: string; subtitle: string }> = {
  recent:   { label: 'Recently used',          subtitle: 'Last 30 days' },
  stage:    { label: 'For this pipeline stage', subtitle: 'Matched to lead status' },
  team:     { label: 'Team templates',          subtitle: 'Shared with everyone' },
  personal: { label: 'My templates',            subtitle: 'Only visible to you' },
};

export function TemplatePickerSheet({
  open, onOpenChange, leadId, userId, channel, onPick,
}: Props) {
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    recent: true,
    stage: true,
    team: false,
    personal: false,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['template-picker', leadId, userId, channel ?? 'both'],
    enabled: open,
    queryFn: () => getTemplatesForPicker(leadId, userId),
  });

  // Auto-expand stage if it has matches
  useEffect(() => {
    if (data?.stage?.length) {
      setOpenSections((s) => ({ ...s, stage: true }));
    }
  }, [data]);

  const filtered = (list: PickerTemplate[]) =>
    channel ? list.filter((t) => t.kind === channel) : list;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-3 border-b border-border/60">
          <SheetTitle className="text-base font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4" /> Pick a template
          </SheetTitle>
          <SheetDescription className="text-xs">
            Inserts the template into your current message. Doesn't send.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-2">
          {isLoading && (
            <div className="space-y-2 p-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-md" />
              ))}
            </div>
          )}
          {!isLoading && data && (
            (['recent', 'stage', 'team', 'personal'] as SectionKey[]).map((key) => {
              const list = filtered(data[key]);
              return (
                <Section
                  key={key}
                  label={SECTION_META[key].label}
                  subtitle={SECTION_META[key].subtitle}
                  count={list.length}
                  open={openSections[key]}
                  onToggle={() => setOpenSections((s) => ({ ...s, [key]: !s[key] }))}
                >
                  {list.length === 0 ? (
                    <div className="text-[11.5px] text-muted-foreground italic px-2 py-1.5">
                      {key === 'recent' && 'No recent templates.'}
                      {key === 'stage' && 'No templates matched to this stage.'}
                      {key === 'team' && 'No team templates.'}
                      {key === 'personal' && 'No personal templates.'}
                    </div>
                  ) : (
                    <ul className="space-y-1">
                      {list.map((t) => (
                        <TemplateRow key={`${t.kind}:${t.id}`} t={t} onPick={onPick} />
                      ))}
                    </ul>
                  )}
                </Section>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({
  label, subtitle, count, open, onToggle, children,
}: {
  label: string;
  subtitle: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-2 py-2 rounded-md hover:bg-muted/50 transition-colors"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <span className="text-[12.5px] font-semibold flex-1 text-left">{label}</span>
        <span className="text-[10.5px] text-muted-foreground">{subtitle}</span>
        <Pill tone="neutral" size="sm">{count}</Pill>
      </button>
      {open && <div className="pl-2 pr-1 pb-2">{children}</div>}
    </div>
  );
}

function TemplateRow({ t, onPick }: { t: PickerTemplate; onPick: (t: PickerTemplate) => void }) {
  const preview = t.kind === 'email'
    ? (t.subject ?? '').slice(0, 80) || stripHtml(t.body).slice(0, 80)
    : t.body.slice(0, 80);

  return (
    <li className="group flex items-start gap-2 rounded-md border border-border/60 bg-card px-2.5 py-2 hover:border-border transition-colors">
      <span className="mt-0.5 shrink-0 text-muted-foreground">
        {t.kind === 'email'
          ? <Mail className="h-3.5 w-3.5" />
          : <MessageSquare className="h-3.5 w-3.5" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-medium truncate">{t.name}</div>
        <div className="text-[11px] text-muted-foreground line-clamp-1">{preview || '—'}</div>
      </div>
      <Button
        size="sm"
        variant="outline"
        className={cn('h-7 text-[11.5px] px-2.5 shrink-0')}
        onClick={() => onPick(t)}
      >
        Use
      </Button>
    </li>
  );
}

function stripHtml(html: string): string {
  if (typeof window === 'undefined') return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent || div.innerText || '').replace(/\s+/g, ' ').trim();
}
