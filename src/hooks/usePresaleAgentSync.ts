import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePresaleAgentStore } from "@/stores/usePresaleAgent";

/**
 * Mount once near the auth root. Fetches the Presale agent profile
 * after the user logs in, and clears it on sign-out.
 */
export function usePresaleAgentSync() {
  const { user, loading } = useAuth();
  const fetchAgent = usePresaleAgentStore((s) => s.fetch);
  const clear = usePresaleAgentStore((s) => s.clear);

  useEffect(() => {
    if (loading) return;
    if (user) {
      fetchAgent();
    } else {
      clear();
    }
  }, [user?.id, loading, fetchAgent, clear]);
}
