import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type PushToTalkState = 'idle' | 'recording' | 'transcribing';

export type MicErrorKind =
  | 'blocked'      // browser permission set to "deny" — user must change in site settings
  | 'denied'       // user dismissed/denied the in-page prompt this time
  | 'no-device'    // no microphone present on the system
  | 'in-use'       // another app/tab is holding the mic
  | 'insecure'     // page is not on https/localhost
  | 'unsupported'  // browser lacks MediaRecorder / getUserMedia
  | 'unknown';

export type MicError = {
  kind: MicErrorKind;
  message: string;
  raw?: string;
};

async function classifyError(e: any): Promise<MicError> {
  const name: string = e?.name || '';
  const msg: string = e?.message || String(e);

  if (!window.isSecureContext && location.hostname !== 'localhost') {
    return { kind: 'insecure', message: 'Microphone access requires HTTPS.', raw: msg };
  }
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function' || typeof window.MediaRecorder === 'undefined') {
    return { kind: 'unsupported', message: 'This browser does not support voice input.', raw: msg };
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return { kind: 'no-device', message: 'No microphone was found on this device.', raw: msg };
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return { kind: 'in-use', message: 'Your microphone is being used by another app or tab.', raw: msg };
  }
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    // Distinguish "permanently blocked" from "dismissed once".
    try {
      const status = await (navigator.permissions as any)?.query?.({ name: 'microphone' as PermissionName });
      if (status?.state === 'denied') {
        return { kind: 'blocked', message: 'Microphone access is blocked for this site.', raw: msg };
      }
    } catch {
      // Permissions API not supported (Safari pre-16, etc.) — fall through.
    }
    return { kind: 'denied', message: 'Microphone permission was not granted.', raw: msg };
  }
  return { kind: 'unknown', message: msg || 'Could not access the microphone.', raw: msg };
}

export function usePushToTalk(opts: { onTranscript: (text: string) => void; language?: string }) {
  const [state, setState] = useState<PushToTalkState>('idle');
  const [error, setError] = useState<MicError | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef<number>(0);
  const cancelledRef = useRef<boolean>(false);

  const cleanup = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  const start = useCallback(async () => {
    if (state !== 'idle') return;
    cancelledRef.current = false;

    // Pre-flight: catch unsupported / insecure context before prompting.
    if (!window.isSecureContext && location.hostname !== 'localhost') {
      setError({ kind: 'insecure', message: 'Microphone access requires HTTPS.' });
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof window.MediaRecorder === 'undefined') {
      setError({ kind: 'unsupported', message: 'This browser does not support voice input.' });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;

      const mime =
        MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
          : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4'
          : '';
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorderRef.current = rec;
      chunksRef.current = [];

      rec.ondataavailable = (e) => { if (e.data?.size) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        const blobType = rec.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: blobType });
        cleanup();

        if (cancelledRef.current) { setState('idle'); return; }

        const duration = Date.now() - startedAtRef.current;
        if (duration < 350 || blob.size < 1200) {
          toast.message('Hold to talk', { description: 'Press and hold the mic to record.' });
          setState('idle');
          return;
        }

        setState('transcribing');
        try {
          const ext = blobType.includes('mp4') ? 'm4a' : 'webm';
          const fd = new FormData();
          fd.append('audio', new File([blob], `ptt.${ext}`, { type: blobType }));
          fd.append('language', opts.language ?? 'eng');

          const { data: sess } = await supabase.auth.getSession();
          const token = sess.session?.access_token;
          const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/zara-transcribe`;
          const resp = await fetch(url, {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            body: fd,
          });
          const json = await resp.json();
          if (!resp.ok) throw new Error(json.error || 'Transcription failed');
          const text = (json.text || '').trim();
          if (!text) toast.message('Nothing heard', { description: 'Try speaking a bit louder.' });
          else opts.onTranscript(text);
        } catch (e: any) {
          console.error(e);
          toast.error(e.message || 'Transcription failed');
        } finally {
          setState('idle');
        }
      };

      startedAtRef.current = Date.now();
      rec.start();
      setState('recording');
    } catch (e: any) {
      console.error('[push-to-talk] start failed', e);
      const classified = await classifyError(e);
      setError(classified);
      cleanup();
      setState('idle');
    }
  }, [state, cleanup, opts]);

  const stop = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    stop();
  }, [stop]);

  const dismissError = useCallback(() => setError(null), []);

  /** Re-prompt for permission (used by the help modal's "Try again" button). */
  const retry = useCallback(async () => {
    setError(null);
    // small tick so the modal can unmount before the native prompt appears
    await new Promise((r) => setTimeout(r, 50));
    void start();
  }, [start]);

  return { state, error, dismissError, retry, start, stop, cancel };
}
