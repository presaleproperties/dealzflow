import { InlineEditField } from '@/components/crm/leads/InlineEditField';
import { CopyButton } from './CopyButton';
import { useUpdateCrmContact } from '@/hooks/useCrmLeadDetail';

export function SectionHeader({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.12em]">{children}</h3>;
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
    <div className="rounded-lg border border-border/70 bg-card px-2.5 py-3 text-center space-y-1">
      <p className="text-xl font-bold text-foreground leading-none tabular-nums">{value}</p>
      <p className="text-[10px] text-muted-foreground leading-tight uppercase tracking-[0.1em] font-medium">{label}</p>
      {sublabel && <p className="text-[10px] font-semibold leading-tight tracking-wider" style={{ color: accent }}>{sublabel}</p>}
    </div>
  );
}

export function DetailRow({
  label, value, href, field, contactId, type, options, displayFormatter,
}: {
  label: string;
  value: string | null | undefined;
  href?: string;
  field: string;
  contactId: string;
  type?: 'text' | 'email' | 'select';
  options?: readonly string[];
  displayFormatter?: (value: string) => string;
}) {
  const updateContact = useUpdateCrmContact();
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-border/40 group">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <div className="flex-1 min-w-0 flex justify-end">
        <InlineEditField
          value={value}
          onSave={(v) => updateContact.mutate({ id: contactId, updates: { [field]: v || null } })}
          href={href}
          type={type}
          options={options}
          displayFormatter={displayFormatter}
          className="text-[13px] text-right truncate max-w-full"
        />
      </div>
    </div>
  );
}

export function WidgetSection({
  title, count, onAdd, children,
}: { title: string; count?: number; onAdd?: () => void; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border/50">
        <div className="flex items-center gap-2">
          <SectionHeader>{title}</SectionHeader>
          {count != null && count > 0 && (
            <span className="text-[11px] bg-muted text-foreground/80 rounded-full px-2 py-0.5 font-semibold tabular-nums">{count}</span>
          )}
        </div>
        {onAdd && (
          <button onClick={onAdd} className="text-muted-foreground hover:text-foreground transition-colors p-0.5" aria-label={`Add ${title.toLowerCase()}`}>
            <span className="sr-only">Add</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          </button>
        )}
      </div>
      {children}
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
