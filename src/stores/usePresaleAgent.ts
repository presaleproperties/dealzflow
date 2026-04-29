import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { supabase } from "@/integrations/supabase/client";

export interface PresaleAgent {
  slug: string;
  name?: string;
  email?: string;
  phone?: string;
  headshotUrl?: string;
  signatureHtml?: string;
  calendlyUrl?: string;
  licenseNumber?: string;
  brokerage?: string;
  websiteUrl?: string;
  title?: string;
  instagramUrl?: string;
  raw?: unknown;
}

type FetchStatus = "idle" | "loading" | "ready" | "error" | "unmatched";

interface PresaleAgentState {
  agent: PresaleAgent | null;
  status: FetchStatus;
  error: string | null;
  lastFetchedAt: number | null;
  matchedEmail: string | null;
  fetch: (opts?: { force?: boolean }) => Promise<void>;
  clear: () => void;
}

const STALE_MS = 1000 * 60 * 30; // 30 minutes

export const usePresaleAgentStore = create<PresaleAgentState>()(
  persist(
    (set, get) => ({
      agent: null,
      status: "idle",
      error: null,
      lastFetchedAt: null,
      matchedEmail: null,

      fetch: async (opts) => {
        const force = opts?.force ?? false;
        const { lastFetchedAt, status } = get();
        if (
          !force &&
          status === "ready" &&
          lastFetchedAt &&
          Date.now() - lastFetchedAt < STALE_MS
        ) {
          return;
        }

        set({ status: "loading", error: null });
        try {
          const { data, error } = await supabase.functions.invoke(
            "presale-agent-me",
            { body: {} },
          );
          if (error) throw new Error(error.message);
          if (data?.error) throw new Error(data.error);

          if (!data?.agent) {
            set({
              agent: null,
              status: "unmatched",
              error: data?.message ?? "No matching Presale agent",
              lastFetchedAt: Date.now(),
            });
            return;
          }

          const { data: userData } = await supabase.auth.getUser();
          set({
            agent: data.agent as PresaleAgent,
            status: "ready",
            error: null,
            lastFetchedAt: Date.now(),
            matchedEmail: userData?.user?.email?.toLowerCase() ?? null,
          });
        } catch (e) {
          set({
            status: "error",
            error: (e as Error).message,
            lastFetchedAt: Date.now(),
          });
        }
      },

      clear: () =>
        set({
          agent: null,
          status: "idle",
          error: null,
          lastFetchedAt: null,
          matchedEmail: null,
        }),
    }),
    {
      name: "presale-agent",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        agent: s.agent,
        status: s.status,
        lastFetchedAt: s.lastFetchedAt,
        matchedEmail: s.matchedEmail,
      }),
    },
  ),
);

// Convenience hook — returns the agent + helpers
export function usePresaleAgent() {
  const agent = usePresaleAgentStore((s) => s.agent);
  const status = usePresaleAgentStore((s) => s.status);
  const error = usePresaleAgentStore((s) => s.error);
  const lastFetchedAt = usePresaleAgentStore((s) => s.lastFetchedAt);
  const refresh = usePresaleAgentStore((s) => s.fetch);
  const clear = usePresaleAgentStore((s) => s.clear);
  return { agent, status, error, lastFetchedAt, refresh, clear };
}
