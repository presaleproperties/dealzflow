// Mic permission help dialog — shown when push-to-talk can't access the mic.
// Detects the user's browser/OS and renders the exact steps to unblock it,
// plus a "Try again" affordance that re-prompts when appropriate.
import { useMemo } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  MicOff, ShieldAlert, Lock, MonitorSmartphone, Loader2, ExternalLink, RefreshCw,
} from 'lucide-react';
import type { MicError, MicErrorKind } from '@/hooks/usePushToTalk';

type Browser = 'chrome' | 'edge' | 'safari' | 'firefox' | 'arc' | 'brave' | 'other';
type OS = 'ios' | 'android' | 'mac' | 'windows' | 'linux' | 'other';

function detect(): { browser: Browser; os: OS } {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  const isMac = /Macintosh/.test(ua) && !isIOS;
  const isWindows = /Windows/.test(ua);

  let browser: Browser = 'other';
  if (/Edg\//.test(ua)) browser = 'edge';
  else if (/Firefox\//.test(ua)) browser = 'firefox';
  else if (/Chrome\//.test(ua) && !/Edg\//.test(ua) && !/OPR\//.test(ua)) browser = 'chrome';
  else if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) browser = 'safari';

  const os: OS = isIOS ? 'ios' : isAndroid ? 'android' : isMac ? 'mac' : isWindows ? 'windows' : 'linux';
  return { browser, os };
}

function titleFor(kind: MicErrorKind): string {
  switch (kind) {
    case 'blocked':     return 'Microphone is blocked for this site';
    case 'denied':      return 'Microphone permission needed';
    case 'no-device':   return 'No microphone found';
    case 'in-use':      return 'Microphone is in use';
    case 'insecure':    return 'Voice input requires HTTPS';
    case 'unsupported': return 'Voice input not supported here';
    default:            return 'Couldn\'t access the microphone';
  }
}

function iconFor(kind: MicErrorKind) {
  if (kind === 'blocked') return ShieldAlert;
  if (kind === 'insecure') return Lock;
  if (kind === 'unsupported' || kind === 'no-device') return MonitorSmartphone;
  if (kind === 'in-use') return Loader2;
  return MicOff;
}

function buildSteps(kind: MicErrorKind, browser: Browser, os: OS): string[] {
  if (kind === 'insecure') {
    return [
      'Open this app over an https:// URL (not http://).',
      'If you\'re self-hosting, install a valid TLS certificate.',
      'Reload the page and try voice input again.',
    ];
  }

  if (kind === 'unsupported') {
    return [
      'Use a modern browser — Chrome, Edge, Safari 14+, or Firefox.',
      'On iOS / iPadOS, voice input only works inside Safari (or a PWA installed via Safari).',
      'Update your browser to the latest version.',
    ];
  }

  if (kind === 'no-device') {
    return [
      'Make sure a microphone is connected and switched on.',
      'On laptops, check that the mic isn\'t muted by a hardware switch or function key.',
      'Pick a working input in your OS sound settings, then reload this page.',
    ];
  }

  if (kind === 'in-use') {
    return [
      'Close any other app, browser tab, or video call that may be holding the mic (Zoom, Meet, Teams, etc.).',
      'On macOS, quit apps from the menu bar — closing the window isn\'t always enough.',
      'Reload the page and press the mic again.',
    ];
  }

  // denied (one-off dismissal) — just re-prompt
  if (kind === 'denied') {
    return [
      'When the browser prompt appears, choose Allow.',
      'If you don\'t see a prompt, click the mic / padlock icon in the address bar and reset permissions.',
      'Then press the mic button again and hold to record.',
    ];
  }

  // blocked — site-specific permission turned off. Browser-specific recovery:
  if (kind === 'blocked') {
    if (os === 'ios') {
      return [
        'iOS Settings → Safari → Microphone → set this site to Ask or Allow.',
        'If using the installed app (PWA), iOS Settings → [App name] → enable Microphone.',
        'Return here and tap the mic again.',
      ];
    }
    if (os === 'android') {
      return [
        'Tap the padlock icon next to the URL → Permissions → enable Microphone.',
        'If hidden, open Chrome ⋮ menu → Settings → Site settings → Microphone → allow this site.',
        'Reload the page and try again.',
      ];
    }
    if (browser === 'chrome' || browser === 'edge' || browser === 'arc' || browser === 'brave') {
      const label = browser === 'edge' ? 'Edge' : browser === 'arc' ? 'Arc' : browser === 'brave' ? 'Brave' : 'Chrome';
      return [
        'Click the padlock (or tune) icon in the address bar.',
        'Open Site settings → set Microphone to Allow.',
        `Or open ${label} Settings → Privacy & security → Site Settings → Microphone, find this site, and allow it.`,
        'Reload the page, then press the mic button again.',
      ];
    }
    if (browser === 'safari') {
      return [
        'Safari menu → Settings → Websites → Microphone.',
        'Find this site in the list and change it from Deny to Allow.',
        'Reload the page and try the mic again.',
      ];
    }
    if (browser === 'firefox') {
      return [
        'Click the padlock icon in the address bar.',
        'Under Permissions, remove the Blocked microphone setting (click the × next to it).',
        'Reload the page — Firefox will prompt again. Choose Allow.',
      ];
    }
    return [
      'Open your browser\'s site settings for this page.',
      'Change the Microphone permission from Block to Allow.',
      'Reload the page and try again.',
    ];
  }

  return [
    'Reload the page and press the mic button to retry.',
    'If it keeps failing, check your browser\'s site settings for microphone access.',
  ];
}

export function MicPermissionDialog({
  error,
  onClose,
  onRetry,
}: {
  error: MicError | null;
  onClose: () => void;
  onRetry: () => void;
}) {
  const { browser, os } = useMemo(detect, []);
  const open = !!error;
  const kind: MicErrorKind = error?.kind ?? 'unknown';
  const Icon = iconFor(kind);
  const steps = useMemo(() => buildSteps(kind, browser, os), [kind, browser, os]);

  // "Try again" only makes sense if a re-prompt has a real chance of working.
  const canRetry = kind === 'denied' || kind === 'in-use' || kind === 'unknown';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2.5 mb-1">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
              kind === 'blocked' || kind === 'insecure'
                ? 'bg-destructive/10 text-destructive'
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
            }`}>
              <Icon className={`w-4.5 h-4.5 ${kind === 'in-use' ? 'animate-spin' : ''}`} />
            </div>
            <DialogTitle className="text-[15px] font-semibold tracking-tight">
              {titleFor(kind)}
            </DialogTitle>
          </div>
          {error?.message && (
            <DialogDescription className="text-[12.5px] leading-relaxed">
              {error.message}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-semibold">
            Fix it in {browser === 'other' ? 'your browser' : browser[0].toUpperCase() + browser.slice(1)}
            {os !== 'other' && ` · ${os === 'ios' ? 'iOS' : os === 'mac' ? 'macOS' : os[0].toUpperCase() + os.slice(1)}`}
          </div>
          <ol className="space-y-2">
            {steps.map((step, i) => (
              <li key={i} className="flex gap-2.5 text-[12.5px] leading-relaxed">
                <span className="shrink-0 w-5 h-5 rounded-full bg-muted text-muted-foreground font-medium text-[11px] inline-flex items-center justify-center tabular-nums">
                  {i + 1}
                </span>
                <span className="flex-1 text-foreground/90">{step}</span>
              </li>
            ))}
          </ol>

          {error?.raw && error.raw !== error.message && (
            <details className="text-[11px] text-muted-foreground">
              <summary className="cursor-pointer hover:text-foreground transition-colors">
                Technical details
              </summary>
              <pre className="mt-1.5 p-2 rounded bg-muted/50 font-mono text-[10.5px] whitespace-pre-wrap break-words border border-border/40">
                {error.raw}
              </pre>
            </details>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {kind === 'blocked' && (
            <a
              href="https://support.google.com/chrome/answer/2693767"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors mr-auto"
            >
              Browser help <ExternalLink className="w-3 h-3" />
            </a>
          )}
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
          {canRetry && (
            <Button size="sm" onClick={onRetry} className="bg-primary text-primary-foreground hover:bg-primary/90">
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Try again
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
