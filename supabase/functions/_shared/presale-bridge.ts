// Shared typed client for the Presale Properties bridge.
// All bridge endpoints live on a separate Supabase project and are
// authenticated with both the Presale anon key (Supabase gateway auth)
// and a shared `x-bridge-secret` header (app-level auth).

const BRIDGE_URL = Deno.env.get("PRESALE_BRIDGE_URL");
const BRIDGE_SECRET = Deno.env.get("PRESALE_BRIDGE_SECRET");
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
  slug: string;
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
  getAgent: (slug: string) =>
    call<BridgeAgent>("bridge-get-agent", { query: { slug } }),
  getLeadBehavior: (params: { email?: string; phone?: string }) =>
    call<BridgeBehavior>("bridge-get-lead-behavior", {
      query: { email: params.email, phone: params.phone },
    }),
  renderEmail: (params: {
    projectSlug: string;
    agentSlug: string;
    templateStyle: string;
    leadName?: string;
  }) =>
    call<BridgeRenderedEmail>("bridge-render-email", {
      method: "POST",
      body: params,
    }),
};

export type PresaleBridge = typeof presaleBridge;
