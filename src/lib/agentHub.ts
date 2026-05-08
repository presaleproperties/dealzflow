/**
 * Agent Hub SSO handoff.
 *
 * Calls the `open-presale-agent-hub` edge function which mints a one-time
 * Supabase magic link via Presale's bridge, then opens it in a new tab.
 * The agent lands inside Presale's Agent Hub already authenticated.
 */
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type AgentHubTarget =
  | '/dashboard'
  | '/dashboard/email-builder'
  | '/dashboard/decks'
  | '/dashboard/messages'
  | '/dashboard/profile';

export async function openAgentHub(redirectTo: AgentHubTarget = '/dashboard/email-builder') {
  const t = toast.loading('Opening Agent Hub…');
  try {
    const { data, error } = await supabase.functions.invoke('open-presale-agent-hub', {
      body: { redirect_to: redirectTo },
    });
    if (error || !data?.open_url) {
      toast.error((data as any)?.error || error?.message || 'Could not open Agent Hub', { id: t });
      return;
    }
    toast.dismiss(t);
    window.open(data.open_url as string, '_blank', 'noopener,noreferrer');
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Could not open Agent Hub', { id: t });
  }
}
