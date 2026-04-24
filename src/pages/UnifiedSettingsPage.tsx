import SettingsPage from './SettingsPage';

/**
 * Settings page entry. Production settings only.
 *
 * CRM settings live at their own route (/crm/settings) inside CrmLayout
 * to avoid double-wrapping layouts (which caused overlapping headers and
 * a broken sticky scroll container).
 */
export default function UnifiedSettingsPage() {
  return <SettingsPage />;
}
