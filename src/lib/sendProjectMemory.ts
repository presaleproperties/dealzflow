// Per-agent + per-contact memory for the Send Project composer.
// All persisted in localStorage — never written to the database.

const AGENT_PREFS_KEY = (agentKey: string) => `sendproject:prefs:${agentKey}`;
const CONTACT_DRAFT_KEY = (contactId: string) => `sendproject:draft:${contactId}`;

export interface AgentPrefs {
  lastTemplateSlug?: string;
  lastAttachments?: { brochure: boolean; floor_plans: boolean; pricing: boolean };
}

export interface ContactDraft {
  projectSlug?: string;
  templateSlug?: string;
  subject?: string;
  personalNote?: string;
  attachments?: { brochure: boolean; floor_plans: boolean; pricing: boolean };
  savedAt: number;
}

const safeRead = <T>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};
const safeWrite = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / disabled */
  }
};

export const loadAgentPrefs = (agentKey: string): AgentPrefs =>
  safeRead<AgentPrefs>(AGENT_PREFS_KEY(agentKey)) ?? {};

export const saveAgentPrefs = (agentKey: string, patch: Partial<AgentPrefs>) => {
  const prev = loadAgentPrefs(agentKey);
  safeWrite(AGENT_PREFS_KEY(agentKey), { ...prev, ...patch });
};

export const loadContactDraft = (contactId: string): ContactDraft | null => {
  const draft = safeRead<ContactDraft>(CONTACT_DRAFT_KEY(contactId));
  if (!draft) return null;
  // Drop drafts older than 7 days — agents won't remember them anyway.
  if (Date.now() - draft.savedAt > 7 * 24 * 60 * 60 * 1000) {
    try { localStorage.removeItem(CONTACT_DRAFT_KEY(contactId)); } catch { /* */ }
    return null;
  }
  return draft;
};

export const saveContactDraft = (contactId: string, draft: Omit<ContactDraft, 'savedAt'>) => {
  safeWrite(CONTACT_DRAFT_KEY(contactId), { ...draft, savedAt: Date.now() });
};

export const clearContactDraft = (contactId: string) => {
  try { localStorage.removeItem(CONTACT_DRAFT_KEY(contactId)); } catch { /* */ }
};
