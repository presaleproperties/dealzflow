import { cn } from '@/lib/utils';
import { CONTACT_TYPES } from '@/hooks/useCrmContacts';

const TYPE_LABELS: Record<string, string> = {
  '': 'All',
  lead: 'Lead',
  realtor: 'Realtor',
  past_client: 'Client',
};

interface ContactTypeFilterProps {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}

export function ContactTypeFilter({ value, onChange, className }: ContactTypeFilterProps) {
  const options = ['', ...CONTACT_TYPES];

  return (
    <div className={cn('flex items-center gap-0.5 rounded-lg border border-border/60 bg-muted/30 p-0.5', className)}>
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={cn(
            'px-3 py-1.5 rounded-md text-xs font-medium transition-colors min-h-[32px]',
            value === opt
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          )}
        >
          {TYPE_LABELS[opt]}
        </button>
      ))}
    </div>
  );
}
