import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface GoogleCalendarEvent {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  start: string;
  end: string;
  allDay: boolean;
  htmlLink: string | null;
}

export function useGoogleCalendarEvents(timeMin: string, timeMax: string) {
  const { session } = useAuth();

  return useQuery({
    queryKey: ['google-calendar-events', timeMin, timeMax],
    queryFn: async () => {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const url = `https://${projectId}.supabase.co/functions/v1/google-calendar?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`;

      const headers: Record<string, string> = {
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        'Content-Type': 'application/json',
      };

      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }

      const response = await fetch(url, { headers });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to fetch events');
      }

      const result = await response.json();
      return {
        events: (result.events || []) as GoogleCalendarEvent[],
        authenticated: result.authenticated || false,
      };
    },
    staleTime: 8_000,
    refetchInterval: 10_000,
    retry: 1,
  });
}

export function useGoogleCalendarConnection() {
  const { session } = useAuth();

  return useQuery({
    queryKey: ['google-calendar-connection'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('google-calendar-auth', {
        body: { action: 'status' },
      });

      if (error) {
        const message = String(error?.message || '').toLowerCase();
        if (message.includes('unauthorized')) {
          return { connected: false, calendarEmail: null };
        }
        throw error;
      }

      return data as { connected: boolean; calendarEmail: string | null };
    },
    enabled: !!session,
    staleTime: 20_000,
    refetchInterval: 15_000,
  });
}
