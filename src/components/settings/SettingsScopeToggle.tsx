import { useNavigate, useSearchParams } from 'react-router-dom';
import { Briefcase, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCrmAccess } from '@/contexts/CrmAccessContext';

export type SettingsScope = 'production' | 'crm';

interface SettingsScopeToggleProps {
  scope: SettingsScope;
  className?: string;
}

/**
 * Pill toggle to switch between Production (main app) settings and CRM settings.
 * Driven by ?view= query param so deep links work and child pages can read scope.
 * Only shows the CRM option to authorised CRM members.
 */
export function SettingsScopeToggle({ scope, className }: SettingsScopeToggleProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isMember: isCrmMember } = useCrmAccess();

  function setScope(next: SettingsScope) {
    if (next === scope) return;
    const params = new URLSearchParams(searchParams);
    if (next === 'crm') {
      params.set('view', 'crm');
    } else {
      params.delete('view');
    }
    const qs = params.toString();
    navigate(`/settings${qs ? `?${qs}` : ''}`, { replace: false });
  }

  // If the user has no CRM access, no need to show a toggle at all.
  if (!isCrmMember) return null;

  return (
    <div className={cn('inline-flex items-center', className)}>
      <div
        className="inline-flex items-center gap-1 p-1 rounded-full border bg-card/60 backdrop-blur-sm"
        style={{ borderColor: 'hsl(var(--border))' }}
        role="tablist"
        aria-label="Settings scope"
      >
        <button
          type="button"
          role="tab"
          aria-selected={scope === 'production'}
          onClick={() => setScope('production')}
          className={cn(
            'flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[12.5px] font-semibold tracking-tight transition-all duration-200',
            scope === 'production'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Briefcase className="w-[13px] h-[13px]" strokeWidth={2.2} />
          Production
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={scope === 'crm'}
          onClick={() => setScope('crm')}
          className={cn(
            'flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[12.5px] font-semibold tracking-tight transition-all duration-200',
            scope === 'crm'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Users className="w-[13px] h-[13px]" strokeWidth={2.2} />
          CRM
        </button>
      </div>
    </div>
  );
}
