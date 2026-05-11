/**
 * In-app Twilio Voice dialer.
 *
 * Single Zustand store + a `useDialer()` hook that owns the Twilio Device
 * lifecycle so any component can:
 *   - `startCall({ contact, number })` to place an outbound call
 *   - read live state (`status`, `durationSec`, `muted`, `incoming`, ...)
 *   - call `hangup()`, `toggleMute()`, `sendDigit('1')`, `dropVoicemail(id)`
 *
 * The Device is initialized lazily after the first `ensureDevice()` call so
 * we don't request a Twilio token until the user actually wants to dial,
 * and we don't crash for users who aren't on the CRM team.
 */
import { create } from 'zustand';
import { useEffect, useMemo } from 'react';
import { Device, Call } from '@twilio/voice-sdk';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type CallStatus =
  | 'idle'
  | 'connecting'  // dialing out, waiting for Twilio to bridge
  | 'ringing'     // outbound: ringing the lead | inbound: ringing us
  | 'in-progress' // bridged, talking
  | 'ended'       // wrap-up state, auto resets shortly after
  | 'error';

interface DialerContact {
  id: string;
  name: string;
  phone?: string | null;
  avatar_url?: string | null;
}

interface DialerState {
  // device
  device: Device | null;
  deviceReady: boolean;
  deviceError: string | null;
  identity: string | null;

  // active call
  currentCall: Call | null;
  status: CallStatus;
  direction: 'inbound' | 'outbound' | null;
  contact: DialerContact | null;
  number: string | null;
  callSid: string | null;
  startedAt: number | null;
  answeredAt: number | null;
  durationSec: number;
  muted: boolean;
  errorMessage: string | null;

  // ui
  widgetOpen: boolean;
  keypadOpen: boolean;
  setWidgetOpen: (v: boolean) => void;
  setKeypadOpen: (v: boolean) => void;
  setDuration: (v: number) => void;
  reset: () => void;
}

const useDialerStore = create<DialerState>((set) => ({
  device: null,
  deviceReady: false,
  deviceError: null,
  identity: null,
  currentCall: null,
  status: 'idle',
  direction: null,
  contact: null,
  number: null,
  callSid: null,
  startedAt: null,
  answeredAt: null,
  durationSec: 0,
  muted: false,
  errorMessage: null,
  widgetOpen: false,
  keypadOpen: false,
  setWidgetOpen: (v) => set({ widgetOpen: v }),
  setKeypadOpen: (v) => set({ keypadOpen: v }),
  setDuration: (v) => set({ durationSec: v }),
  reset: () =>
    set({
      currentCall: null,
      status: 'idle',
      direction: null,
      contact: null,
      number: null,
      callSid: null,
      startedAt: null,
      answeredAt: null,
      durationSec: 0,
      muted: false,
      errorMessage: null,
      widgetOpen: false,
      keypadOpen: false,
    }),
}));

let initPromise: Promise<Device | null> | null = null;

async function fetchToken(): Promise<{ token: string; identity: string } | null> {
  const { data, error } = await supabase.functions.invoke('twilio-voice-token', { body: {} });
  if (error || !data?.token) {
    console.error('[dialer] token fetch failed', error);
    return null;
  }
  return { token: data.token, identity: data.identity };
}

async function ensureDevice(): Promise<Device | null> {
  const existing = useDialerStore.getState().device;
  if (existing) return existing;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const tokenResp = await fetchToken();
      if (!tokenResp) {
        useDialerStore.setState({
          deviceError: 'Could not get a calling token. The dialer is not configured yet.',
        });
        return null;
      }

      const device = new Device(tokenResp.token, {
        logLevel: 1,
        codecPreferences: ['opus', 'pcmu'] as any,
        edge: 'ashburn',
      });

      device.on('registered', () => {
        useDialerStore.setState({ deviceReady: true, deviceError: null });
      });
      device.on('unregistered', () => {
        useDialerStore.setState({ deviceReady: false });
      });
      device.on('error', (e: any) => {
        console.error('[dialer] device error', e);
        useDialerStore.setState({
          deviceError: e?.message ?? 'Device error',
          status: 'error',
        });
      });
      device.on('tokenWillExpire', async () => {
        const refreshed = await fetchToken();
        if (refreshed) device.updateToken(refreshed.token);
      });
      device.on('incoming', (call: Call) => {
        attachCallHandlers(call);
        const from = call.parameters.From || '';
        useDialerStore.setState({
          currentCall: call,
          status: 'ringing',
          direction: 'inbound',
          number: from,
          callSid: call.parameters.CallSid || null,
          startedAt: Date.now(),
          widgetOpen: true,
          contact: null,
        });
        // Try to resolve contact in the background
        resolveContactByPhone(from).then((contact) => {
          if (contact) useDialerStore.setState({ contact });
        });
      });

      await device.register();
      useDialerStore.setState({ device, identity: tokenResp.identity });
      return device;
    } catch (e: any) {
      console.error('[dialer] init failed', e);
      useDialerStore.setState({
        deviceError: e?.message ?? 'Failed to initialize dialer',
      });
      return null;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

function attachCallHandlers(call: Call) {
  call.on('ringing', () => useDialerStore.setState({ status: 'ringing' }));
  call.on('accept', () => {
    useDialerStore.setState({
      status: 'in-progress',
      answeredAt: Date.now(),
      callSid: call.parameters.CallSid || useDialerStore.getState().callSid,
    });
  });
  call.on('mute', (muted: boolean) => useDialerStore.setState({ muted }));
  call.on('disconnect', () => {
    useDialerStore.setState({ status: 'ended' });
    setTimeout(() => useDialerStore.getState().reset(), 1500);
  });
  call.on('cancel', () => {
    useDialerStore.setState({ status: 'ended' });
    setTimeout(() => useDialerStore.getState().reset(), 1200);
  });
  call.on('reject', () => {
    useDialerStore.setState({ status: 'ended' });
    setTimeout(() => useDialerStore.getState().reset(), 800);
  });
  call.on('error', (e: any) => {
    console.error('[dialer] call error', e);
    useDialerStore.setState({
      status: 'error',
      errorMessage: e?.message ?? 'Call error',
    });
  });
}

async function resolveContactByPhone(phone: string): Promise<DialerContact | null> {
  if (!phone) return null;
  const { data } = await supabase.rpc('crm_match_contact_by_phone', { _phone: phone });
  const row = (data as any[])?.[0];
  if (!row?.contact_id) return null;
  const { data: c } = await supabase
    .from('crm_contacts')
    .select('id, first_name, last_name, phone')
    .eq('id', row.contact_id)
    .maybeSingle();
  if (!c) return null;
  return {
    id: c.id,
    name: [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || (c.phone ?? phone),
    phone: c.phone,
  };
}

/**
 * Imperative call helper for places that don't render a hook (event handlers,
 * non-component utilities). Mirrors `useDialer().startCall` but works with
 * the global store directly. The dialer widget mounted at the app root will
 * surface call state when this is invoked.
 */
export async function startInAppCall(args: {
  phone: string | null | undefined;
  contactId?: string | null;
  contactName?: string | null;
}): Promise<void> {
  const { phone, contactId, contactName } = args;
  if (!phone) {
    toast.error('No phone number on file');
    return;
  }
  const status = useDialerStore.getState().status;
  if (status !== 'idle' && status !== 'ended') {
    toast.error('Already on a call');
    return;
  }
  const device = await ensureDevice();
  if (!device) {
    toast.error('Dialer not ready', {
      description: useDialerStore.getState().deviceError ?? 'Try again in a moment.',
    });
    return;
  }
  try {
    useDialerStore.setState({
      status: 'connecting',
      direction: 'outbound',
      contact: contactId
        ? { id: contactId, name: contactName ?? phone, phone }
        : { id: 'adhoc', name: contactName ?? phone, phone },
      number: phone,
      startedAt: Date.now(),
      answeredAt: null,
      durationSec: 0,
      muted: false,
      errorMessage: null,
      widgetOpen: true,
    });
    const call = await device.connect({
      params: {
        To: phone,
        ...(contactId ? { contactId } : {}),
      },
    });
    attachCallHandlers(call);
    useDialerStore.setState({
      currentCall: call,
      callSid: call.parameters.CallSid ?? null,
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error('[dialer] startInAppCall failed', e);
    toast.error('Could not start call', { description: err?.message });
    useDialerStore.setState({ status: 'error', errorMessage: err?.message ?? null });
  }
}

export function useDialer() {
  const state = useDialerStore();

  useEffect(() => {
    return () => {
      // never tear down on unmount — the store is global
    };
  }, []);

  const startCall = async ({
    contact,
    number,
    voicemailDropId,
  }: {
    contact?: DialerContact;
    number: string;
    voicemailDropId?: string;
  }) => {
    if (!number) {
      toast.error('No phone number to call');
      return;
    }
    if (state.status !== 'idle' && state.status !== 'ended') {
      toast.error('Already on a call');
      return;
    }
    const device = await ensureDevice();
    if (!device) {
      toast.error('Dialer not ready', {
        description: useDialerStore.getState().deviceError ?? 'Try again in a moment.',
      });
      return;
    }

    try {
      useDialerStore.setState({
        status: 'connecting',
        direction: 'outbound',
        contact: contact ?? null,
        number,
        startedAt: Date.now(),
        answeredAt: null,
        durationSec: 0,
        muted: false,
        errorMessage: null,
        widgetOpen: true,
      });
      const call = await device.connect({
        params: {
          To: number,
          ...(contact?.id ? { contactId: contact.id } : {}),
          ...(voicemailDropId ? { voicemailDropId } : {}),
        },
      });
      attachCallHandlers(call);
      useDialerStore.setState({
        currentCall: call,
        callSid: call.parameters.CallSid ?? null,
      });
    } catch (e: any) {
      console.error('[dialer] startCall failed', e);
      toast.error('Could not start call', { description: e?.message });
      useDialerStore.setState({ status: 'error', errorMessage: e?.message });
    }
  };

  const acceptIncoming = () => {
    state.currentCall?.accept();
  };
  const rejectIncoming = () => {
    state.currentCall?.reject();
  };
  const hangup = () => {
    state.currentCall?.disconnect();
  };
  const toggleMute = () => {
    if (!state.currentCall) return;
    state.currentCall.mute(!state.muted);
  };
  const sendDigit = (digit: string) => {
    state.currentCall?.sendDigits(digit);
  };

  return useMemo(
    () => ({
      ...state,
      ensureDevice,
      startCall,
      acceptIncoming,
      rejectIncoming,
      hangup,
      toggleMute,
      sendDigit,
    }),
    [state],
  );
}

/**
 * Tick the duration timer once per second while a call is in progress.
 * Lives at the app root via <DialerWidget />.
 */
export function useDialerTicker() {
  const status = useDialerStore((s) => s.status);
  const answeredAt = useDialerStore((s) => s.answeredAt);
  const setDuration = useDialerStore((s) => s.setDuration);
  useEffect(() => {
    if (status !== 'in-progress' || !answeredAt) return;
    const id = setInterval(() => {
      setDuration(Math.floor((Date.now() - answeredAt) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [status, answeredAt, setDuration]);
}
