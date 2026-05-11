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

      const { data, error } = await supabase.functions.invoke('template-ai-assist', {
        body: {
          op,                       // improve | shorten | lengthen | tone | translate
          arg,                      // friendly | professional | concise | en | pa | hi | zh
          body: trimmed,
          channel: channel ?? 'sms',
          // NOTE: server is responsible for preserving merge tokens
          preserve_tokens: true,
        },
      });
      if (error) throw error;
      const suggestion =
        (data && (data.body || data.result || data.text)) ?? trimmed;
      return { original: trimmed, suggestion: String(suggestion), mode };
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
