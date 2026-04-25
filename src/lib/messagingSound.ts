/**
 * Lightweight WebAudio-based send/receive sounds for the messaging center.
 * - Tones are synthesised on the fly (no asset round-trips).
 * - Mute state persists in localStorage as `messaging.sound.muted`.
 * - Respects `prefers-reduced-motion: reduce` (treats it as "muted").
 * - Lazily created AudioContext, resumed on first user gesture.
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!ctx) {
      const Ctor = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function isMessagingMuted(): boolean {
  if (typeof window === 'undefined') return true;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return true;
  return localStorage.getItem('messaging.sound.muted') === '1';
}

export function setMessagingMuted(muted: boolean) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('messaging.sound.muted', muted ? '1' : '0');
}

function tone(freq: number, durationMs: number, type: OscillatorType = 'sine', gain = 0.06, startOffsetMs = 0) {
  const ac = getCtx();
  if (!ac) return;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  const t = ac.currentTime + startOffsetMs / 1000;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + durationMs / 1000);
  osc.connect(g).connect(ac.destination);
  osc.start(t);
  osc.stop(t + durationMs / 1000 + 0.05);
}

/** iMessage outgoing "swoosh" — a quick rising chirp. */
export function playIMessageSend() {
  if (isMessagingMuted()) return;
  tone(660, 120, 'sine', 0.05, 0);
  tone(990, 90, 'sine', 0.04, 60);
}

/** iMessage incoming — soft two-note ping. */
export function playIMessageReceive() {
  if (isMessagingMuted()) return;
  tone(880, 110, 'triangle', 0.06, 0);
  tone(660, 140, 'triangle', 0.05, 110);
}

/** WhatsApp send — a single soft pop. */
export function playWhatsAppSend() {
  if (isMessagingMuted()) return;
  tone(520, 90, 'sine', 0.05, 0);
}

/** WhatsApp receive — a quick blip-blip. */
export function playWhatsAppReceive() {
  if (isMessagingMuted()) return;
  tone(740, 80, 'sine', 0.05, 0);
  tone(620, 90, 'sine', 0.045, 80);
}

export function playSendFor(channel: 'sms' | 'whatsapp') {
  if (channel === 'whatsapp') playWhatsAppSend();
  else playIMessageSend();
}

export function playReceiveFor(channel: 'sms' | 'whatsapp') {
  if (channel === 'whatsapp') playWhatsAppReceive();
  else playIMessageReceive();
}
