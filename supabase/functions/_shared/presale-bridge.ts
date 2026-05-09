// Shared typed client for the Presale Properties bridge.
// All bridge endpoints live on a separate Supabase project and are
// authenticated with both the Presale anon key (Supabase gateway auth)
// and a shared `x-bridge-secret` header (app-level auth).

const BRIDGE_URL = Deno.env.get("PRESALE_BRIDGE_URL");
const BRIDGE_SECRET = Deno.env.get("BRIDGE_SECRET") ?? Deno.env.get("PRESALE_BRIDGE_SECRET");
const ANON_KEY = Deno.env.get("PRESALE_ANON_KEY");

export type BridgeEndpoint =
  | "bridge-search-projects"
  | "bridge-get-project"
  | "bridge-list-neighborhoods"
  | "bridge-list-developers"
  | "bridge-list-agents"
  | "bridge-get-agent"
  | "bridge-get-lead-behavior"
  | "bridge-render-email";

export class PresaleBridgeError extends Error {
  status: number;
  endpoint: string;
  body: unknown;
  constructor(endpoint: string, status: number, body: unknown, message: string) {
    super(message);
    this.name = "PresaleBridgeError";
    this.endpoint = endpoint;
    this.status = status;
    this.body = body;
  }
}

function assertEnv() {
  const missing: string[] = [];
  if (!BRIDGE_URL) missing.push("PRESALE_BRIDGE_URL");
  if (!BRIDGE_SECRET) missing.push("PRESALE_BRIDGE_SECRET");
  if (!ANON_KEY) missing.push("PRESALE_ANON_KEY");
  if (missing.length) {
    throw new Error(`Presale bridge missing env: ${missing.join(", ")}`);
  }
}

async function call<T = unknown>(
  endpoint: BridgeEndpoint,
  opts: { method?: "GET" | "POST"; query?: Record<string, string | undefined>; body?: unknown } = {},
): Promise<T> {
  assertEnv();
  const method = opts.method ?? "GET";
  const url = new URL(`${BRIDGE_URL}/${endpoint}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
    }
  }

  const headers: Record<string, string> = {
    "x-bridge-secret": BRIDGE_SECRET!,
    "Authorization": `Bearer ${ANON_KEY}`,
    "apikey": ANON_KEY!,
  };
  let body: string | undefined;
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  let res: Response;
  try {
    res = await fetch(url.toString(), { method, headers, body });
  } catch (e) {
    throw new PresaleBridgeError(endpoint, 0, null, `Network error calling ${endpoint}: ${(e as Error).message}`);
  }

  const text = await res.text();
  let parsed: unknown = text;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* keep text */ }

  if (!res.ok) {
    throw new PresaleBridgeError(
      endpoint,
      res.status,
      parsed,
      `Bridge ${endpoint} failed (${res.status}): ${typeof parsed === "string" ? parsed : JSON.stringify(parsed)}`,
    );
  }
  return parsed as T;
}

// ----- Typed methods -----

export interface BridgeProjectSummary {
  slug: string;
  name?: string;
  city?: string;
  developer?: string;
  [k: string]: unknown;
}
export interface BridgeAgent {
  id?: string;
  slug: string;
  full_name?: string;
  name?: string;
  email?: string;
  [k: string]: unknown;
}
export interface BridgeBehavior {
  identifier: string;
  views?: unknown[];
  sessions?: unknown[];
  forms?: unknown[];
  [k: string]: unknown;
}
export interface BridgeRenderedEmail {
  subject?: string;
  html: string;
  text?: string;
  [k: string]: unknown;
}

export const presaleBridge = {
  searchProjects: (q: string) =>
    call<{ projects: BridgeProjectSummary[] } | BridgeProjectSummary[]>(
      "bridge-search-projects",
      { query: { q } },
    ),
  getProject: (slug: string) =>
    call<BridgeProjectSummary>("bridge-get-project", { query: { slug } }),
  listNeighborhoods: () =>
    call<{ neighborhoods: unknown[] } | unknown[]>("bridge-list-neighborhoods"),
  listDevelopers: () =>
    call<{ developers: unknown[] } | unknown[]>("bridge-list-developers"),
  listAgents: () =>
    call<{ agents: BridgeAgent[] } | BridgeAgent[]>("bridge-list-agents"),
  getAgent: async (identifier: string) => {
    const value = identifier.trim();
    if (!value) throw new Error("Presale agent identifier is required");
    if (value.includes("@")) return call<BridgeAgent>("bridge-get-agent", { query: { email: value } });
    const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
    if (uuidLike) return call<BridgeAgent>("bridge-get-agent", { query: { id: value } });

    const agentsRaw = await call<{ agents: BridgeAgent[] } | BridgeAgent[]>("bridge-list-agents");
    const agents = Array.isArray(agentsRaw) ? agentsRaw : agentsRaw.agents ?? [];
    const wanted = value.toLowerCase();
    const match = agents.find((a) => {
      const nameSlug = (a.name ?? a.full_name ?? "").toLowerCase().replace(/\s+/g, "-");
      const emailLocal = (a.email ?? "").split("@")[0]?.toLowerCase();
      return a.slug?.toLowerCase() === wanted || nameSlug === wanted || emailLocal === wanted;
    });
    const resolved = match?.id ?? match?.email ?? match?.slug;
    if (!resolved) throw new PresaleBridgeError("bridge-get-agent", 404, { error: "Agent not found" }, "Bridge bridge-get-agent failed (404): Agent not found");
    return presaleBridge.getAgent(resolved);
  },
  getLeadBehavior: (params: { email?: string; phone?: string }) =>
    call<BridgeBehavior>("bridge-get-lead-behavior", {
      query: { email: params.email, phone: params.phone },
    }),
  renderEmail: async (params: {
    projectSlug: string;
    agentSlug: string;
    templateStyle: string;
    leadName?: string;
  }) => {
    const agentsRaw = await call<{ agents: BridgeAgent[] } | BridgeAgent[]>("bridge-list-agents");
    const agents = Array.isArray(agentsRaw) ? agentsRaw : agentsRaw.agents ?? [];
    const wanted = params.agentSlug.trim().toLowerCase();
    const agent = agents.find((a) => {
      const nameSlug = (a.name ?? (a as any).full_name ?? "").toLowerCase().replace(/\s+/g, "-");
      const emailLocal = (a.email ?? "").split("@")[0]?.toLowerCase();
      return a.slug?.toLowerCase() === wanted || nameSlug === wanted || emailLocal === wanted;
    });
    return call<BridgeRenderedEmail>("bridge-render-email", {
      method: "POST",
      body: {
        ...params,
        project_slug: params.projectSlug,
        agent_slug: params.agentSlug,
        agent_email: agent?.email,
        template_style: params.templateStyle,
        lead_name: params.leadName,
      },
    });
  },
};

export type PresaleBridge = typeof presaleBridge;
