import { Navigate, useSearchParams } from 'react-router-dom';
import SettingsPage from './SettingsPage';

/**
 * Settings page entry. Production settings only.
 *
 * Legacy `/settings?view=crm` deep links are redirected to the canonical
 * `/crm/settings` route so the CRM layout mounts cleanly (no double chrome).
 */
export default function UnifiedSettingsPage() {
  const [searchParams] = useSearchParams();
  if (searchParams.get('view') === 'crm') {
    return <Navigate to="/crm/settings" replace />;
  }
  return <SettingsPage />;
}
