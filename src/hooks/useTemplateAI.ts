import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type AIMode =
  | 'improve'
  | 'shorten'
  | 'lengthen'
  | 'tone'
  | 'translate'
  | 'generate'
  | 'subject_lines';

export type ToneVariant = 'friendly' | 'professional' | 'direct' | 'warm' | 'luxury';

export interface AssistArgs {
  mode: AIMode;
  html?: string;
  subject?: string;
  prompt?: string;
  tone?: ToneVariant;
  targetLanguage?: 'en' | 'zh' | 'ko' | 'pa';
  agentName?: string;
}

export interface AssistResult {
  html?: string;
  subjects?: string[];
}

export function useTemplateAssist() {
  return useMutation<AssistResult, Error, AssistArgs>({
    mutationFn: async (args) => {
      const { data, error } = await supabase.functions.invoke('template-ai-assist', {
        body: args,
      });
      if (error) {
        // Edge fn returns JSON {error} which supabase-js merges into error.context
        const ctxMsg = (error as any)?.context?.error;
        throw new Error(ctxMsg || error.message || 'AI request failed');
      }
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as AssistResult;
    },
    onError: (err) => toast.error(err.message),
  });
}
