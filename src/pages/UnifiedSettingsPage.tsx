import { useSearchParams } from 'react-router-dom';
import { useCrmAccess } from '@/contexts/CrmAccessContext';
import { SettingsScopeToggle, type SettingsScope } from '@/components/settings/SettingsScopeToggle';
import SettingsPage from './SettingsPage';
import CrmSettingsPage from './crm/CrmSettingsPage';
import { CrmLayout } from '@/components/crm/CrmLayout';

/**
 * Unified Settings page.
 *
 * One URL (/settings) with a Production ↔ CRM toggle pill at the top.
 * Selection is driven by ?view=crm so deep links keep working and the
 * child pages can be reused as-is (no duplicated logic).
 */
export default function UnifiedSettingsPage() {
  const [searchParams] = useSearchParams();
  const { isMember: isCrmMember } = useCrmAccess();

  const requestedScope = searchParams.get('view') === 'crm' ? 'crm' : 'production';
  // Fall back to production if the user lost CRM access.
  const scope: SettingsScope = requestedScope === 'crm' && isCrmMember ? 'crm' : 'production';

  return (
    <div className="relative">
      {/* Floating scope toggle — only renders for CRM members */}
      <div
        className="hidden lg:flex sticky top-[60px] z-30 px-4 sm:px-5 md:px-6 pt-3 pb-1 justify-end pointer-events-none"
        aria-hidden={false}
      >
        <div className="pointer-events-auto">
          <SettingsScopeToggle scope={scope} />
        </div>
      </div>

      {/* Mobile/tablet — show toggle inline above the page content */}
      <div className="lg:hidden px-4 pt-3">
        <SettingsScopeToggle scope={scope} />
      </div>

      {scope === 'crm' ? (
        <CrmLayout requireRole={['owner', 'admin']}>
          <CrmSettingsPage />
        </CrmLayout>
      ) : (
        <SettingsPage />
      )}
    </div>
  );
}
