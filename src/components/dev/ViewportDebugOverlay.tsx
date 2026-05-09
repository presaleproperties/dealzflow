/**
 * Temporary on-device debug overlay for the iOS keyboard / drawer math.
 *
 * Activate by either:
 *   - appending `?debug=vv` to the URL once (persists via localStorage), or
 *   - running `localStorage.setItem('debug-vv', '1')` in the console.
 * Disable with `localStorage.removeItem('debug-vv')` or `?debug=vv-off`.
 *
 * Shows live values for visualViewport.offsetTop/height, safe-area insets,
 * --keyboard-inset-bottom, --composer-safe-bottom, and the computed drawer
 * top — so you can eyeball the math on a real device while opening the
 * keyboard inside the SMS / Email composer.
 */
import { useEffect, useState } from 'react';

const FLAG = 'debug-vv';

function readEnv(name: string) {
  const probe = document.createElement('div');
  probe.style.position = 'fixed';
  probe.style.left = '-9999px';
  probe.style.height = `env(${name}, 0px)`;
  document.body.appendChild(probe);
  const px = probe.getBoundingClientRect().height;
  probe.remove();
  return px;
}

export function ViewportDebugOverlay() {
  const [enabled, setEnabled] = useState(false);
  const [snap, setSnap] = useState({
    vvHeight: 0,
    vvOffsetTop: 0,
    innerHeight: 0,
    safeTop: 0,
    safeBottom: 0,
    keyboardBottom: 0,
    composerSafeBottom: '',
    keyboardOpen: false,
  });

  // One-shot URL/localStorage gate so this never ships visible by default.
  useEffect(() => {
    const url = new URL(window.location.href);
    const param = url.searchParams.get('debug');
    if (param === 'vv') {
      localStorage.setItem(FLAG, '1');
      url.searchParams.delete('debug');
      window.history.replaceState({}, '', url.toString());
    } else if (param === 'vv-off') {
      localStorage.removeItem(FLAG);
      url.searchParams.delete('debug');
      window.history.replaceState({}, '', url.toString());
    }
    setEnabled(localStorage.getItem(FLAG) === '1');
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    const update = () => {
      const vv = window.visualViewport;
      const root = document.documentElement;
      setSnap({
        vvHeight: Math.round(vv?.height ?? window.innerHeight),
        vvOffsetTop: Math.round(vv?.offsetTop ?? 0),
        innerHeight: window.innerHeight,
        safeTop: Math.round(readEnv('safe-area-inset-top')),
        safeBottom: Math.round(readEnv('safe-area-inset-bottom')),
        keyboardBottom: Math.round(
          parseFloat(getComputedStyle(root).getPropertyValue('--keyboard-inset-bottom')) || 0,
        ),
        composerSafeBottom:
          getComputedStyle(root).getPropertyValue('--composer-safe-bottom').trim() || '—',
        keyboardOpen: root.getAttribute('data-keyboard-open') === 'true',
      });
    };
    const onChange = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    update();
    window.visualViewport?.addEventListener('resize', onChange);
    window.visualViewport?.addEventListener('scroll', onChange);
    window.addEventListener('resize', onChange);
    const interval = window.setInterval(update, 500);
    return () => {
      cancelAnimationFrame(raf);
      window.visualViewport?.removeEventListener('resize', onChange);
      window.visualViewport?.removeEventListener('scroll', onChange);
      window.removeEventListener('resize', onChange);
      window.clearInterval(interval);
    };
  }, [enabled]);

  if (!enabled) return null;

  // Mirror the computed drawer top so we can see what ResponsiveDialog
  // would set: max(safeTop, 8) + visualViewport.offsetTop.
  const computedDrawerTop = Math.max(snap.safeTop, 8) + snap.vvOffsetTop;

  return (
    <div
      style={{
        position: 'fixed',
        top: `calc(env(safe-area-inset-top, 0px) + 4px + ${snap.vvOffsetTop}px)`,
        right: 6,
        zIndex: 2147483647,
        pointerEvents: 'auto',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 10,
        lineHeight: 1.35,
        padding: '6px 8px',
        borderRadius: 6,
        background: 'rgba(20,24,31,0.92)',
        color: '#D7A542',
        border: '1px solid rgba(215,165,66,0.4)',
        maxWidth: 200,
        boxShadow: '0 4px 18px rgba(0,0,0,0.4)',
      }}
      onClick={() => {
        if (confirm('Disable viewport debug overlay?')) {
          localStorage.removeItem(FLAG);
          setEnabled(false);
        }
      }}
    >
      <div style={{ color: '#fff', fontWeight: 600, marginBottom: 2 }}>
        VV debug {snap.keyboardOpen ? '⌨︎ open' : 'idle'}
      </div>
      <div>vv.offsetTop: {snap.vvOffsetTop}</div>
      <div>vv.height: {snap.vvHeight}</div>
      <div>innerHeight: {snap.innerHeight}</div>
      <div>safe-top: {snap.safeTop}</div>
      <div>safe-bottom: {snap.safeBottom}</div>
      <div>kbd-inset-b: {snap.keyboardBottom}</div>
      <div style={{ wordBreak: 'break-all' }}>
        composer-safe-b: {snap.composerSafeBottom}
      </div>
      <div style={{ color: '#fff', marginTop: 2 }}>
        drawer top ≈ {computedDrawerTop}px
      </div>
      <div style={{ opacity: 0.6, marginTop: 2 }}>tap to hide</div>
    </div>
  );
}
