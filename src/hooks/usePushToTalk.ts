import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type PushToTalkState = 'idle' | 'recording' | 'transcribing';

export function usePushToTalk(opts: { onTranscript: (text: string) => void; language?: string }) {
  const [state, setState] = useState<PushToTalkState>('idle');
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
      console.error(e);
      toast.error(e?.name === 'NotAllowedError' ? 'Microphone permission denied' : 'Could not start recording');
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

  return { state, start, stop, cancel };
}
