import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';

const PRESERVE_SCROLL_ROUTES = ['/crm/leads'];

export function ScrollToTop() {
  const { pathname, search, hash } = useLocation();

  useLayoutEffect(() => {
    if (hash) return;
    if (PRESERVE_SCROLL_ROUTES.includes(pathname)) return;

    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }

    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    document.scrollingElement?.scrollTo({ top: 0, left: 0, behavior: 'auto' });

    requestAnimationFrame(() => {
      document.querySelectorAll<HTMLElement>('[data-route-scroll-root="true"]').forEach((el) => {
        el.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      });
    });
  }, [pathname, search, hash]);

  return null;
}