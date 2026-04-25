// Per-device pinned messaging threads — no DB needed (instant, private to this browser).
// Keyed by phone-last-10. Channel kept in key so SMS pins ≠ WhatsApp pins.
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'crm:sms:pinned-threads:v1';
const EVENT = 'crm-sms-pins-changed';

type PinSet = Record<string, true>; // key = `${channel}:${phoneLast10}`

function read(): PinSet {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PinSet) : {};
  } catch {
    return {};
  }
}

function write(next: PinSet) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* ignore quota */
  }
}

const makeKey = (channel: string, phoneKey: string) => `${channel}:${phoneKey}`;

export function useThreadPins() {
  const [pins, setPins] = useState<PinSet>(() => read());

  useEffect(() => {
    const sync = () => setPins(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const isPinned = useCallback(
    (channel: string, phoneKey: string) => !!pins[makeKey(channel, phoneKey)],
    [pins],
  );

  const togglePin = useCallback((channel: string, phoneKey: string) => {
    const next = { ...read() };
    const k = makeKey(channel, phoneKey);
    if (next[k]) delete next[k];
    else next[k] = true;
    write(next);
  }, []);

  const setPinned = useCallback((channel: string, phoneKey: string, value: boolean) => {
    const next = { ...read() };
    const k = makeKey(channel, phoneKey);
    if (value) next[k] = true;
    else delete next[k];
    write(next);
  }, []);

  return { isPinned, togglePin, setPinned };
}
