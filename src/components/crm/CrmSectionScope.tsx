import { useEffect } from 'react';

/**
 * Marks the document with data-section="crm" while a CRM page is mounted,
 * enabling scoped theme overrides in index.css (navy surfaces, teal accent).
 */
export function CrmSectionScope() {
  useEffect(() => {
    document.body.setAttribute('data-section', 'crm');
    return () => {
      document.body.removeAttribute('data-section');
    };
  }, []);
  return null;
}
