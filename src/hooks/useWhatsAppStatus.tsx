import { useQuery } from '@tanstack/react-query';

export interface WhatsAppConnectionStatus {
  connected: boolean;
  phoneNumber: string | null;
  error: string | null;
}

export function useWhatsAppStatus() {
  const query = useQuery({
    queryKey: ['whatsapp-connection-status'],
    queryFn: async (): Promise<WhatsAppConnectionStatus> => {
      try {
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const url = `https://${projectId}.supabase.co/functions/v1/whatsapp-status`;
        const res = await fetch(url, {
          method: 'GET',
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Content-Type': 'application/json',
          },
        });
        if (!res.ok) return { connected: false, phoneNumber: null, error: 'Failed to check status' };
        return await res.json();
      } catch {
        return { connected: false, phoneNumber: null, error: 'Network error' };
      }
    },
    staleTime: 60_000,
    retry: 1,
  });

  return {
    waStatus: query.data ?? { connected: false, phoneNumber: null, error: null },
    isLoading: query.isLoading,
  };
}
