import { supabase } from "@/integrations/supabase/client";

/** Thin browser-side client for the read-only Presale bridge proxy. */

type ProxyAction =
  | "search-projects"
  | "get-project"
  | "list-neighborhoods"
  | "list-developers"
  | "get-lead-behavior"
  | "render-email";

async function callProxy<T = unknown>(
  action: ProxyAction,
  params: Record<string, string | undefined> = {},
): Promise<T> {
  const { data, error } = await supabase.functions.invoke("bridge-proxy", {
    body: { action, params },
  });
  if (error) throw new Error(error.message);
  if ((data as any)?.error) throw new Error((data as any).error);
  return (data as any).data as T;
}

export interface BridgeRenderedEmail {
  subject?: string;
  html?: string;
  text?: string;
  preheader?: string;
  [k: string]: unknown;
}

export interface BridgeProjectSummary {
  slug: string;
  name?: string;
  city?: string;
  neighborhood?: string;
  developer?: string;
  hero_image_url?: string;
  heroImageUrl?: string;
  thumbnail_url?: string;
  image_url?: string;
  [k: string]: unknown;
}

export interface BridgeProjectFull extends BridgeProjectSummary {
  pitch_deck_url?: string;
  pitchDeckUrl?: string;
  floor_plans?: unknown[];
  floorPlans?: unknown[];
  gallery?: unknown[];
  price_min?: number;
  price_max?: number;
  priceRange?: { min?: number; max?: number };
  description?: string;
  [k: string]: unknown;
}

export interface BridgeBehaviorEvent {
  id?: string;
  type?: string;
  event?: string;
  occurred_at?: string;
  timestamp?: string;
  url?: string;
  page_url?: string;
  property_url?: string;
  property_name?: string;
  project_slug?: string;
  project_name?: string;
  duration_seconds?: number;
  meta?: Record<string, unknown>;
  [k: string]: unknown;
}

export interface BridgeBehavior {
  identifier?: string;
  views?: BridgeBehaviorEvent[];
  sessions?: BridgeBehaviorEvent[];
  forms?: BridgeBehaviorEvent[];
  engagement?: BridgeBehaviorEvent[];
  email_events?: BridgeBehaviorEvent[];
  events?: BridgeBehaviorEvent[];
  [k: string]: unknown;
}

function unwrapArray<T>(value: unknown, key?: string): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (key && Array.isArray(v[key])) return v[key] as T[];
    for (const k of ["projects", "data", "results", "items"]) {
      if (Array.isArray(v[k])) return v[k] as T[];
    }
  }
  return [];
}

export const bridgeClient = {
  async searchProjects(q: string): Promise<BridgeProjectSummary[]> {
    if (!q.trim()) return [];
    const raw = await callProxy<unknown>("search-projects", { q });
    return unwrapArray<BridgeProjectSummary>(raw, "projects");
  },
  getProject(slug: string): Promise<BridgeProjectFull> {
    return callProxy<BridgeProjectFull>("get-project", { slug });
  },
  listNeighborhoods(): Promise<unknown[]> {
    return callProxy<unknown>("list-neighborhoods").then((r) =>
      unwrapArray(r, "neighborhoods"),
    );
  },
  listDevelopers(): Promise<unknown[]> {
    return callProxy<unknown>("list-developers").then((r) =>
      unwrapArray(r, "developers"),
    );
  },
  getLeadBehavior(params: { email?: string; phone?: string }): Promise<BridgeBehavior> {
    return callProxy<BridgeBehavior>("get-lead-behavior", params);
  },
};

export function projectThumbnail(p: BridgeProjectSummary | undefined | null) {
  if (!p) return undefined;
  return (
    p.hero_image_url ??
    p.heroImageUrl ??
    p.thumbnail_url ??
    p.image_url ??
    (p as any).image ??
    (p as any).cover_url
  ) as string | undefined;
}
