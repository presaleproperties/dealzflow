/**
 * Inline AI assist for the chat composer.
 *
 * Calls the existing `template-ai-assist` edge fn with the agent's draft
 * body. Modes mirror the Templates Redesign v1 rules so merge tokens are
 * preserved across rewrites.
 */
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type ComposerAIMode =
  | 'improve'
  | 'shorten'
  | 'lengthen'
  | 'tone:friendly'
  | 'tone:professional'
  | 'tone:concise'
  | 'translate:en'
  | 'translate:pa'
  | 'translate:hi'
  | 'translate:zh';

export interface AIAssistArgs {
  mode: ComposerAIMode;
  body: string;
  /** 'sms' keeps it under 160 chars when possible. */
  channel?: 'sms' | 'whatsapp' | 'email';
}

export interface AIAssistResult {
  original: string;
  suggestion: string;
  mode: ComposerAIMode;
}

export function useComposerAI() {
  return useMutation({
    mutationFn: async ({ mode, body, channel }: AIAssistArgs): Promise<AIAssistResult> => {
      const trimmed = (body ?? '').trim();
      if (!trimmed) throw new Error('Write something first');

      const [op, arg] = mode.includes(':') ? mode.split(':') : [mode, undefined];

      const payload: Record<string, unknown> = {
        mode: op,                 // improve | shorten | lengthen | tone | translate
        html: trimmed,            // plain text is fine; SYSTEM_RULES_PLAIN respects it
        format: 'plain',          // SMS / WhatsApp = plain text out
        channel: channel ?? 'sms',
      };
      if (op === 'tone') payload.tone = arg;
      if (op === 'translate') payload.targetLanguage = arg;

      const { data, error } = await supabase.functions.invoke('template-ai-assist', { body: payload });
      if (error) throw error;
      const suggestion = (data && (data.text || data.body || data.html)) ?? trimmed;
      return { original: trimmed, suggestion: String(suggestion).trim(), mode };
    },
    onError: (e: any) => {
      const msg = e?.message ?? 'AI assist failed';
      if (/credits|402/i.test(msg)) {
        toast.error('Out of AI credits — add some in Settings → Workspace.');
      } else if (/rate|429/i.test(msg)) {
        toast.error('AI is busy — try again in a moment.');
      } else {
        toast.error(msg);
      }
    },
  });
}
