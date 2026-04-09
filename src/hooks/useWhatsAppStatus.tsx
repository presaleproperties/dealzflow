import { useQuery } from '@tanstack/react-query';

/**
 * Shared hook for WhatsApp/Twilio connection status.
 * Checks if TWILIO_API_KEY and LOVABLE_API_KEY secrets are available
 * by calling the edge function test endpoint.
 * 
 * For now, we check if the Twilio connector is linked by attempting
 * a lightweight edge function call. If secrets exist, we're connected.
 */
export function useWhatsAppStatus() {
  return useQuery({
    queryKey: ['whatsapp-connection-status'],
    queryFn: async () => {
      try {
        // We check connection by calling our edge function which verifies Twilio creds
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const url = `https://${projectId}.supabase.co/functions/v1/whatsapp-status`;
        const res = await fetch(url, {
          method: 'GET',
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Content-Type': 'application/json',
          },
        });
        if (!res.ok) return { connected: false, error: 'Failed to check status' };
        const data = await res.json();
        return {
          connected: data.connected as boolean,
          phoneNumber: data.phoneNumber as string | null,
          error: data.error as string | null,
        };
      } catch {
        return { connected: false, phoneNumber: null, error: 'Network error' };
      }
    },
    staleTime: 60_000,
    retry: 1,
  });
}
