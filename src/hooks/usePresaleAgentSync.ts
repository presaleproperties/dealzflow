import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePresaleAgentStore } from "@/stores/usePresaleAgent";

/**
 * Mount once near the auth root. Fetches the Presale agent profile
 * after the user logs in, and clears it on sign-out OR when the
 * logged-in email no longer matches the cached agent (account switch).
 */
export function usePresaleAgentSync() {
  const { user, loading } = useAuth();
  const fetchAgent = usePresaleAgentStore((s) => s.fetch);
  const clear = usePresaleAgentStore((s) => s.clear);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      clear();
      return;
    }
    // Detect account-switch: cached identity belongs to a different email.
    const cachedEmail = usePresaleAgentStore.getState().matchedEmail;
    const currentEmail = user.email?.toLowerCase() ?? null;
    if (cachedEmail && currentEmail && cachedEmail !== currentEmail) {
      clear();
      fetchAgent({ force: true });
    } else {
      fetchAgent();
    }
  }, [user?.id, user?.email, loading, fetchAgent, clear]);
}
