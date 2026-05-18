import { useRef, useState } from 'react';
import { Mic, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/** Press-and-hold to record a voice note — Zara transcribes and drafts a reply. */
export function VoicePressButton({ contactId, channel = 'sms' }: { contactId: string; channel?: 'sms' | 'email' | 'whatsapp' }) {
  const [recording, setRecording] = useState(false);
  const [sending, setSending] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const haptic = () => { try { (navigator as any).vibrate?.(15); } catch { /* ignore */ } };

  const stop = async () => {
    if (!recorderRef.current || recorderRef.current.state === 'inactive') return;
    recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setRecording(false);
  };

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        if (blob.size < 800) { toast.message('Voice clip too short'); return; }
        setSending(true);
        try {
          const buf = await blob.arrayBuffer();
          // base64 encode
          let bin = ''; const u8 = new Uint8Array(buf);
          for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
          const b64 = btoa(bin);
          const { data, error } = await supabase.functions.invoke('zara-voice-route', {
            body: { contactId, audio_base64: b64, mime: 'audio/webm', channel },
          });
          if (error) throw error;
          toast.success('Zara drafted from your voice', { description: data?.transcript ? '"' + String(data.transcript).slice(0, 80) + '"' : undefined });
        } catch (e: any) {
          toast.error('Voice route failed: ' + (e?.message ?? 'unknown'));
        } finally {
          setSending(false);
        }
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
      haptic();
    } catch (e: any) {
      toast.error('Mic blocked: ' + (e?.message ?? 'allow microphone'));
    }
  };

  return (
    <button
      type="button"
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={() => recording && stop()}
      disabled={sending}
      title="Hold to dictate — Zara drafts a reply"
      className={cn(
        'h-11 w-11 rounded-full flex items-center justify-center border transition-all select-none',
        recording
          ? 'bg-red-500 text-white border-red-600 scale-110 shadow-[0_0_0_6px_hsl(0_84%_60%/0.2)]'
          : 'bg-card text-foreground border-border hover:border-primary/60 hover:text-primary',
        sending && 'opacity-60 cursor-wait',
      )}
    >
      {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
    </button>
  );
}
