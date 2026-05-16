/**
 * In-app dialer — DISABLED.
 *
 * Twilio has been removed from this project. This module preserves the
 * public API (`useDialer`, `startInAppCall`, hooks) as no-ops so existing
 * consumers compile, but no calls can be placed. Any attempt to dial shows
 * a toast directing the user to use their phone instead.
 */
import { toast } from 'sonner';

type CallStatus = 'idle';

interface DialerContact {
  id: string;
  name: string;
  phone?: string | null;
  avatar_url?: string | null;
}

const DISABLED_MSG = 'In-app calling is disabled. Use your phone to call this lead.';

function notifyDisabled() {
  try { toast.info(DISABLED_MSG); } catch { /* noop */ }
}

export async function startInAppCall(_args?: Record<string, unknown>): Promise<void> {
  notifyDisabled();
  const fallback = _args && typeof _args.fallbackTelHref === 'string' ? _args.fallbackTelHref : null;
  if (fallback && typeof window !== 'undefined') {
    try { window.location.href = fallback; } catch { /* noop */ }
  }
}

export function useDialer() {
  return {
    device: null,
    deviceReady: false,
    deviceError: 'disabled' as const,
    status: 'idle' as CallStatus,
    direction: null,
    contact: null as DialerContact | null,
    number: null as string | null,
    callSid: null as string | null,
    durationSec: 0,
    muted: false,
    errorMessage: null as string | null,
    widgetOpen: false,
    keypadOpen: false,
    incoming: null,
    isDisabled: true as const,
    startCall: async (_args?: unknown) => { notifyDisabled(); },
    hangup: () => {},
    answer: () => {},
    reject: () => {},
    toggleMute: () => {},
    sendDigit: (_d: string) => {},
    dropVoicemail: async (_id?: string) => { notifyDisabled(); },
    setWidgetOpen: (_v: boolean) => {},
    setKeypadOpen: (_v: boolean) => {},
    reset: () => {},
    ensureDevice: async () => false,
  };
}

export const useDialerStatus = () => 'idle' as CallStatus;
export const useDialerDuration = () => 0;
export const useDialerContact = () => null as DialerContact | null;
export const useDialerNumber = () => null as string | null;
export const useDialerWidgetOpen = () => false;
export const useDialerIsActive = () => false;
export function useDialerTicker() { /* noop */ }
