import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * Returns whether the *current* user has a connected Gmail token.
 * Used to surface fallback-sender warnings in compose / reply UIs:
 * when false, outbound mail goes through the Resend fallback
 * (`noreply@dealzflow.ca`) instead of the agent's own Gmail.
 *
 * RLS on `gmail_tokens` already scopes rows to the caller, so a
 * simple `select id` is enough.
 */
export function useGmailConnected() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['gmail-connected', user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gmail_tokens')
        .select('id')
        .limit(1)
        .maybeSingle();
      if (error) return false;
      return Boolean(data);
    },
  });
}
