/**
 * Agent Hub deep-link helper.
 *
 * AgentHub is the marketing tool inside Presale Properties where agents
 * build & manage email templates, campaigns, and creative assets.
 *
 * The CRM mirrors templates read-only and hands editing off to AgentHub
 * via these URLs. The base can be overridden per-environment by setting
 * `localStorage.setItem('presale.agenthub_url', '...')`.
 */

const DEFAULT_AGENTHUB_BASE = 'https://app.presaleproperties.com/agent';

function getBase(): string {
  if (typeof window !== 'undefined') {
    const override = window.localStorage.getItem('presale.agenthub_url');
    if (override) return override.replace(/\/$/, '');
  }
  return DEFAULT_AGENTHUB_BASE;
}

export function getAgentHubUrl(path: string = '', agentSlug?: string | null): string {
  const base = getBase();
  const clean = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${base}${clean}`);
  if (agentSlug) url.searchParams.set('agent', agentSlug);
  return url.toString();
}

export const AgentHubLinks = {
  home: (slug?: string | null) => getAgentHubUrl('/', slug),
  templates: (slug?: string | null) => getAgentHubUrl('/email-builder', slug),
  newTemplate: (slug?: string | null) => getAgentHubUrl('/email-builder/new', slug),
  editTemplate: (templateSlugOrId: string, slug?: string | null) =>
    getAgentHubUrl(`/email-builder/${encodeURIComponent(templateSlugOrId)}`, slug),
  campaigns: (slug?: string | null) => getAgentHubUrl('/campaigns', slug),
};
