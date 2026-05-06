import { ReactNode, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Cross-fades route content on path change. Pure CSS — no framer-motion
 * cost. Respects prefers-reduced-motion automatically (animation is paused
 * by the .page-transition rule in index.css).
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [key, setKey] = useState(pathname);
  const previous = useRef(pathname);

  useEffect(() => {
    if (previous.current !== pathname) {
      previous.current = pathname;
      setKey(pathname);
    }
  }, [pathname]);

  return (
    <div key={key} className="page-transition">
      {children}
    </div>
  );
}
