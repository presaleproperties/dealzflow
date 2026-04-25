import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface WhatsAppTemplate {
  id: string;
  name: string;
  body_text: string;
  category: string | null;
  status: string | null;
  language: string | null;
  created_at: string;
  updated_at: string;
}

export function useWhatsAppTemplates() {
  return useQuery({
    queryKey: ['whatsapp-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_whatsapp_templates')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      return (data || []) as WhatsAppTemplate[];
    },
  });
}
