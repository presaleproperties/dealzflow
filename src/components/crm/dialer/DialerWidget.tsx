/**
 * Floating dialer widget — mounted once at the app root via <App />.
 *
 * Renders nothing when the call is idle. When a call is active or incoming,
 * shows a draggable bottom-right card with avatar, status, timer, and the
 * mute / keypad / hangup controls.
 */
import { Phone, PhoneOff, PhoneIncoming, Mic, MicOff, Grid3x3, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useDialer, useDialerTicker } from '@/hooks/useDialer';
import { useEffect } from 'react';

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const KEYPAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

export function DialerWidget() {
  useDialerTicker();
  const dialer = useDialer();
  const { status, direction, contact, number, durationSec, muted, widgetOpen, keypadOpen, errorMessage } = dialer;

  useEffect(() => {
    if (!widgetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && status === 'idle') dialer.setWidgetOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [widgetOpen, status, dialer]);

  if (!widgetOpen || status === 'idle') return null;

  const isIncoming = direction === 'inbound' && status === 'ringing';
  const isActive = status === 'in-progress';
  const isConnecting = status === 'connecting' || (status === 'ringing' && direction === 'outbound');
  const isEnded = status === 'ended';
  const isError = status === 'error';

  const display = contact?.name || number || 'Unknown';
  const subtitle = contact?.phone && contact?.name ? contact.phone : null;

  return (
    <div
      className={cn(
        'fixed z-[100] bottom-4 right-4 w-[320px] rounded-2xl border bg-card shadow-2xl',
        'border-border/80 backdrop-blur-sm animate-in slide-in-from-bottom-4 fade-in duration-200',
      )}
      style={{ boxShadow: '0 20px 60px -10px rgba(0,0,0,0.4)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/60">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              'inline-block h-2 w-2 rounded-full',
              isActive && 'bg-emerald-500 animate-pulse',
              isConnecting && 'bg-amber-500 animate-pulse',
              isIncoming && 'bg-sky-500 animate-pulse',
              isEnded && 'bg-muted-foreground',
              isError && 'bg-destructive',
            )}
          />
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {isIncoming ? 'Incoming Call' : isConnecting ? 'Connecting' : isActive ? 'On Call' : isEnded ? 'Call Ended' : 'Error'}
          </span>
        </div>
        {(isEnded || isError || isIncoming) && (
          <button
            onClick={() => dialer.setWidgetOpen(false)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="px-5 py-5 text-center space-y-1">
        <div
          className="mx-auto h-14 w-14 rounded-full bg-muted flex items-center justify-center text-lg font-semibold text-foreground mb-2"
          aria-hidden="true"
        >
          {display.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
        </div>
        <div className="font-semibold text-foreground truncate" style={{ color: 'hsl(var(--text-strong))' }}>
          {display}
        </div>
        {subtitle && <div className="text-xs text-muted-foreground tabular-nums">{subtitle}</div>}
        <div className="text-xs text-muted-foreground tabular-nums pt-1 min-h-[1.25rem]">
          {isActive && fmt(durationSec)}
          {isConnecting && (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              {direction === 'outbound' ? 'Calling…' : 'Ringing…'}
            </span>
          )}
          {isEnded && <>Duration {fmt(durationSec)}</>}
          {isError && <span className="text-destructive">{errorMessage ?? 'Something went wrong'}</span>}
        </div>
      </div>

      {/* Keypad */}
      {keypadOpen && isActive && (
        <div className="dialer-keypad px-5 pb-3 grid grid-cols-3 gap-2">
          {KEYPAD.map((k) => (
            <button
              key={k}
              onClick={() => dialer.sendDigit(k)}
              aria-label={`Dial ${k}`}
              className="h-10 rounded-md border bg-background hover:bg-muted active:scale-95 transition-all text-base font-medium tabular-nums"
            >
              {k}
            </button>
          ))}
        </div>
      )}

      {/* Controls */}
      <div className="px-5 pb-5 pt-1">
        {isIncoming ? (
          <div className="grid grid-cols-2 gap-2">
            <Button
              size="lg"
              variant="destructive"
              className="rounded-full h-11"
              onClick={() => dialer.rejectIncoming()}
            >
              <PhoneOff className="h-4 w-4 mr-1.5" /> Decline
            </Button>
            <Button
              size="lg"
              className="rounded-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => dialer.acceptIncoming()}
            >
              <PhoneIncoming className="h-4 w-4 mr-1.5" /> Accept
            </Button>
          </div>
        ) : isActive || isConnecting ? (
          <div className="flex items-center justify-around">
            <button
              onClick={() => dialer.toggleMute()}
              disabled={!isActive}
              className={cn(
                'h-11 w-11 rounded-full border flex items-center justify-center transition-all',
                muted ? 'bg-muted text-foreground border-foreground/20' : 'bg-background hover:bg-muted',
                !isActive && 'opacity-40 cursor-not-allowed',
              )}
              aria-label={muted ? 'Unmute' : 'Mute'}
            >
              {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
            <button
              onClick={() => dialer.setKeypadOpen(!keypadOpen)}
              disabled={!isActive}
              className={cn(
                'h-11 w-11 rounded-full border flex items-center justify-center transition-all',
                keypadOpen ? 'bg-muted text-foreground border-foreground/20' : 'bg-background hover:bg-muted',
                !isActive && 'opacity-40 cursor-not-allowed',
              )}
              aria-label="Keypad"
            >
              <Grid3x3 className="h-4 w-4" />
            </button>
            <button
              onClick={() => dialer.hangup()}
              className="h-11 w-11 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:bg-destructive/90 active:scale-95 transition-all"
              aria-label="Hang up"
            >
              <PhoneOff className="h-5 w-5" />
            </button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => dialer.setWidgetOpen(false)}
          >
            Close
          </Button>
        )}
      </div>
    </div>
  );
}

/** Reusable Call button — drop anywhere a contact's phone is in scope. */
export function CallButton({
  contactId,
  contactName,
  phone,
  className,
  size = 'sm',
  variant = 'outline',
  label = 'Call',
}: {
  contactId: string;
  contactName: string;
  phone: string | null | undefined;
  className?: string;
  size?: 'sm' | 'default' | 'lg';
  variant?: 'outline' | 'default' | 'ghost';
  label?: string;
}) {
  const dialer = useDialer();
  const disabled = !phone || (dialer.status !== 'idle' && dialer.status !== 'ended');

  return (
    <Button
      size={size}
      variant={variant}
      disabled={disabled}
      title={phone ? `Call ${phone}` : 'No phone number on file'}
      className={cn('h-9 text-xs gap-1.5 justify-start', className)}
      onClick={() => {
        if (!phone) return;
        dialer.startCall({ contact: { id: contactId, name: contactName, phone }, number: phone });
      }}
    >
      <Phone className="w-3.5 h-3.5" style={{ color: 'hsl(142 65% 42%)' }} />
      {label}
    </Button>
  );
}
