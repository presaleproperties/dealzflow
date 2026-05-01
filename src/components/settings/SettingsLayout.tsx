import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Settings layout primitives — shared by /settings and /crm/settings.
 *
 * Goals:
 *  • Less wall-of-cards: cap content width at 720px with consistent gutters.
 *  • Easier orientation: optional sticky in-page section index for long tabs.
 *  • Less density: collapsible sub-sections that default closed.
 *
 * These are presentational only. Business logic stays in each page.
 */

// ── Outer content shell ─────────────────────────────────────────────
export function SettingsContent({
  children,
  className,
  /** Optional list of section anchors → renders a sticky right-rail TOC on lg+ */
  sections,
}: {
  children: ReactNode;
  className?: string;
  sections?: { id: string; label: string }[];
}) {
  const hasToc = !!sections && sections.length >= 3;

  return (
    <div className={cn('flex gap-8', className)}>
      <div
        id="settings-content-pane"
        className={cn(
          'flex-1 min-w-0 space-y-6 pb-12',
          // Cap content width — easier scan, less wall-of-cards.
          'max-w-[720px]',
        )}
      >
        {children}
      </div>
      {hasToc && (
        <aside className="hidden xl:block w-44 shrink-0 sticky top-4 self-start">
          <SettingsToc sections={sections!} />
        </aside>
      )}
    </div>
  );
}

// ── Sticky in-page index ────────────────────────────────────────────
function SettingsToc({ sections }: { sections: { id: string; label: string }[] }) {
  const [activeId, setActiveId] = useState<string | null>(sections[0]?.id ?? null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const targets = sections
      .map(s => document.getElementById(s.id))
      .filter((el): el is HTMLElement => !!el);
    if (!targets.length) return;

    observerRef.current?.disconnect();
    const obs = new IntersectionObserver(
      entries => {
        // Pick the topmost intersecting section.
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: '-20% 0px -70% 0px', threshold: [0, 1] },
    );
    targets.forEach(t => obs.observe(t));
    observerRef.current = obs;
    return () => obs.disconnect();
  }, [sections]);

  return (
    <nav aria-label="On this page">
      <div className="px-2 mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/80">
        On this page
      </div>
      <ul className="space-y-0.5 border-l border-border/60">
        {sections.map(s => {
          const active = s.id === activeId;
          return (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(s.id)?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start',
                  });
                }}
                className={cn(
                  '-ml-px block border-l-2 pl-3 py-1.5 text-[12.5px] transition-colors',
                  active
                    ? 'border-primary text-primary font-semibold'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {s.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// ── Collapsible sub-section ─────────────────────────────────────────
export function SettingsSection({
  id,
  title,
  description,
  defaultOpen = true,
  children,
  className,
}: {
  id?: string;
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useMemo(
    () => `settings-section-${id ?? title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    [id, title],
  );

  return (
    <section id={id} className={cn('scroll-mt-6', className)}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-controls={contentId}
        className="group w-full flex items-start justify-between gap-3 py-2 text-left"
      >
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
            {title}
          </h3>
          {description && (
            <p className="text-[12.5px] text-muted-foreground mt-0.5 leading-snug">
              {description}
            </p>
          )}
        </div>
        <ChevronDown
          className={cn(
            'h-4 w-4 mt-1 shrink-0 text-muted-foreground transition-transform duration-200',
            !open && '-rotate-90',
          )}
          strokeWidth={2}
        />
      </button>
      {open && (
        <div id={contentId} className="pt-2">
          {children}
        </div>
      )}
    </section>
  );
}
