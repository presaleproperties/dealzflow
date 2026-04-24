/**
 * User preference: when clicking a URL inside the lead timeline,
 * should we open the metadata preview popover first ('preview')
 * or navigate directly to the link in a new tab ('open')?
 *
 * Stored per-browser in localStorage and broadcast via a window event
 * so any open LinkPreview reacts instantly to a settings change.
 */
export type TimelineLinkBehavior = 'preview' | 'open';

const STORAGE_KEY = 'crm-timeline-link-behavior';
const EVENT_NAME = 'crm:timeline-link-behavior-changed';
const DEFAULT: TimelineLinkBehavior = 'preview';

export function getTimelineLinkBehavior(): TimelineLinkBehavior {
  if (typeof window === 'undefined') return DEFAULT;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === 'open' || v === 'preview' ? v : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function setTimelineLinkBehavior(value: TimelineLinkBehavior) {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: value }));
  } catch {
    // ignore (private mode etc.)
  }
}

export function subscribeTimelineLinkBehavior(
  cb: (value: TimelineLinkBehavior) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const onCustom = (e: Event) => {
    const detail = (e as CustomEvent<TimelineLinkBehavior>).detail;
    if (detail === 'open' || detail === 'preview') cb(detail);
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) cb(getTimelineLinkBehavior());
  };
  window.addEventListener(EVENT_NAME, onCustom);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT_NAME, onCustom);
    window.removeEventListener('storage', onStorage);
  };
}
