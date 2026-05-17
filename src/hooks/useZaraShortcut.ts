import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

/**
 * Global Cmd/Ctrl+J shortcut → navigate to /crm/zara and focus the input.
 * Mount once at app root.
 */
export function useZaraShortcut() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        if (location.pathname !== '/crm/zara') {
          navigate('/crm/zara');
        }
        // Cockpit listens for this and refocuses
        setTimeout(() => window.dispatchEvent(new Event('zara:focus-input')), 50);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate, location.pathname]);
}
