import * as React from 'react';
import { InlineEditField } from '@/components/crm/leads/InlineEditField';
import { CopyButton } from './CopyButton';
import { useUpdateCrmContact } from '@/hooks/useCrmLeadDetail';

export function SectionHeader({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[11.5px] font-semibold text-muted-foreground uppercase tracking-[0.14em]">{children}</h3>;
}

export function InsightCard({
  value,
  label,
  sublabel,
  accent,
}: {
  value: React.ReactNode;
  label: string;
  sublabel?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-card px-2.5 py-3 text-center space-y-1.5">
      <p className="text-[22px] font-bold text-foreground leading-none tabular-nums tracking-tight">{value}</p>
      <p className="text-[10.5px] text-muted-foreground leading-tight uppercase tracking-[0.1em] font-semibold">{label}</p>
      {sublabel && <p className="text-[10px] font-semibold leading-tight tracking-wider" style={{ color: accent }}>{sublabel}</p>}
    </div>
  );
}

export function DetailRow({
  label, value, href, field, contactId, type, options, displayFormatter, copyable,
}: {
  label: string;
  value: string | null | undefined;
  href?: string;
  field: string;
  contactId: string;
  type?: 'text' | 'email' | 'select';
  options?: readonly string[];
  displayFormatter?: (value: string) => string;
  /** Show a small copy-to-clipboard button when value is set. Defaults to true for email/phone-like fields. */
  copyable?: boolean;
}) {
  const updateContact = useUpdateCrmContact();
  const autoCopyable =
    copyable ?? (type === 'email' || /phone|email/i.test(field));
  return (
    <div className="flex items-center justify-between gap-2 py-2 border-b border-border/40 group">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <div className="flex-1 min-w-0 flex items-center justify-end gap-1">
        <InlineEditField
          value={value}
          onSave={(v) => updateContact.mutate({ id: contactId, updates: { [field]: v || null } })}
          href={href}
          type={type}
          options={options}
          displayFormatter={displayFormatter}
          className="text-[13px] text-right truncate max-w-full"
        />
        {autoCopyable && value && <CopyButton value={value} label={label} />}
      </div>
    </div>
  );
}

export function WidgetSection({
  title, count, onAdd, children, collapsible = false, defaultOpen = true,
}: {
  title: string;
  count?: number;
  onAdd?: () => void;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const storageKey = collapsible ? `lead-widget-open:${title}` : null;
  const [open, setOpen] = React.useState<boolean>(() => {
    if (!storageKey) return true;
    try {
      const v = window.localStorage.getItem(storageKey);
      if (v === '0') return false;
      if (v === '1') return true;
    } catch { /* ignore */ }
    return defaultOpen;
  });

  const toggle = () => {
    if (!collapsible) return;
    setOpen((prev) => {
      const next = !prev;
      if (storageKey) {
        try { window.localStorage.setItem(storageKey, next ? '1' : '0'); } catch { /* ignore */ }
      }
      return next;
    });
  };

  const HeaderTag = collapsible ? 'button' : 'div';
  const headerProps = collapsible
    ? {
        type: 'button' as const,
        onClick: toggle,
        'aria-expanded': open,
        className:
          'w-full flex items-center justify-between mb-3 pb-2 border-b border-border/50 text-left group',
      }
    : { className: 'flex items-center justify-between mb-3 pb-2 border-b border-border/50' };

  return (
    <div>
      <HeaderTag {...(headerProps as any)}>
        <div className="flex items-center gap-2">
          {collapsible && (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              className={`text-muted-foreground/70 group-hover:text-foreground transition-transform ${open ? 'rotate-90' : ''}`}
              aria-hidden
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          )}
          <SectionHeader>{title}</SectionHeader>
          {count != null && count > 0 && (
            <span className="text-[11px] bg-muted text-foreground/80 rounded-full px-2 py-0.5 font-semibold tabular-nums">{count}</span>
          )}
        </div>
        {onAdd && (
          <span
            role={collapsible ? 'button' : undefined}
            onClick={onAdd ? (e) => { e.stopPropagation(); onAdd(); } : undefined}
            className="text-muted-foreground hover:text-foreground transition-colors p-0.5 cursor-pointer"
            aria-label={`Add ${title.toLowerCase()}`}
          >
            <span className="sr-only">Add</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          </span>
        )}
      </HeaderTag>
      {(!collapsible || open) && children}
    </div>
  );
}

export function EmptyWidget({
  icon: Icon,
  message,
}: {
  icon: React.ComponentType<{ className?: string }>;
  message: string;
}) {
  return (
    <div className="flex items-center gap-2.5 py-5 justify-center">
      <Icon className="w-4 h-4 text-muted-foreground/60" />
      <span className="text-[13px] text-muted-foreground">{message}</span>
    </div>
  );
}
