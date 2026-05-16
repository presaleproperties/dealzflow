// Tier 3 — Template picker source-of-truth.
//
// getTemplatesForPicker(leadId, userId) returns a 4-bucket structure for
// rendering inside the composer. Same template never appears twice — the
// highest section wins (recent > stage > team > personal).
//
// Sections:
//   a) recent   — top 3 templates this user sent in the last 30 days
//   b) stage    — templates whose category/tags match the lead's pipeline_status
//   c) team     — owner_scope LIKE 'team:%', alphabetical
//   d) personal — owner_scope LIKE 'agent:%' AND created_by_agent_slug = my slug
//
// Channel-aware: email + sms templates are merged with a `kind` field so the
// composer can filter to whatever channel it's currently composing.

import { supabase } from '@/integrations/supabase/client';

export type PickerKind = 'email' | 'sms';

export interface PickerTemplate {
  id: string;
  kind: PickerKind;
  name: string;
  subject: string | null;       // sms templates have null subject
  body: string;                 // body_html for email, body for sms
  owner_scope: string;
  owner_agent_slug: string | null;
  created_by_agent_slug?: string | null;
  category?: string | null;
}

export interface PickerSections {
  recent: PickerTemplate[];
  stage: PickerTemplate[];
  team: PickerTemplate[];
  personal: PickerTemplate[];
}

const RECENT_DAYS = 30;
const RECENT_LIMIT = 3;

/** Normalize a string to a comparable key for matching (status/category/tag). */
const norm = (s?: string | null) => (s ?? '').toLowerCase().replace(/[\s_-]+/g, '');

async function fetchAllTemplates(): Promise<PickerTemplate[]> {
  const [emailRes, smsRes] = await Promise.all([
    supabase
      .from('crm_email_templates')
      .select('id, name, subject, body_html, owner_scope, owner_agent_slug, created_by_agent_slug, category')
      .eq('is_active', true),
    supabase
      .from('crm_sms_templates')
      .select('id, name, body, owner_scope, owner_agent_slug, created_by_agent_slug, category')
      .eq('is_active', true),
  ]);

  const emails: PickerTemplate[] = ((emailRes.data ?? []) as any[]).map((t) => ({
    id: t.id,
    kind: 'email',
    name: t.name,
    subject: t.subject ?? null,
    body: t.body_html ?? '',
    owner_scope: t.owner_scope,
    owner_agent_slug: t.owner_agent_slug ?? null,
    created_by_agent_slug: t.created_by_agent_slug ?? null,
    category: t.category ?? null,
  }));

  const sms: PickerTemplate[] = ((smsRes.data ?? []) as any[]).map((t) => ({
    id: t.id,
    kind: 'sms',
    name: t.name,
    subject: null,
    body: t.body ?? '',
    owner_scope: t.owner_scope,
    owner_agent_slug: t.owner_agent_slug ?? null,
    created_by_agent_slug: t.created_by_agent_slug ?? null,
    category: t.category ?? null,
  }));

  return [...emails, ...sms];
}

async function fetchLeadStage(leadId: string | null): Promise<string | null> {
  if (!leadId) return null;
  const { data } = await supabase
    .from('crm_contacts')
    .select('status, pipeline_status, lead_type')
    .eq('id', leadId)
    .maybeSingle();
  if (!data) return null;
  // Prefer pipeline_status, fallback to status
  return (data as any).pipeline_status || (data as any).status || (data as any).lead_type || null;
}

async function fetchMyAgentSlug(): Promise<string | null> {
  try {
    const { data } = await supabase.rpc('crm_my_presale_slug');
    return (data as string | null) ?? null;
  } catch {
    return null;
  }
}

async function fetchRecentTemplateIds(userId: string | null): Promise<{
  emailIds: string[];
  smsIds: string[];
}> {
  if (!userId) return { emailIds: [], smsIds: [] };
  const since = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // SMS — has user_id directly
  const smsP = supabase
    .from('crm_sms_log')
    .select('template_id, sent_at')
    .eq('user_id', userId)
    .eq('direction', 'outbound')
    .not('template_id', 'is', null)
    .gte('sent_at', since)
    .order('sent_at', { ascending: false })
    .limit(50);

  // Email — crm_email_send_log has template_id but no user_id; use crm_email_log
  // indirectly via the same tracking_id. Simpler: scan crm_email_send_log by
  // template_stats joined to recency. For now we accept "recent for the team"
  // for email since there's no per-user attribution column on send_log.
  const emailP = supabase
    .from('crm_email_send_log')
    .select('template_id, sent_at')
    .not('template_id', 'is', null)
    .gte('sent_at', since)
    .order('sent_at', { ascending: false })
    .limit(100);

  const [smsRes, emailRes] = await Promise.all([smsP, emailP]);

  const seen = new Set<string>();
  const smsIds: string[] = [];
  for (const r of ((smsRes.data ?? []) as any[])) {
    if (!r.template_id || seen.has(`s:${r.template_id}`)) continue;
    seen.add(`s:${r.template_id}`);
    smsIds.push(r.template_id);
    if (smsIds.length >= RECENT_LIMIT) break;
  }
  const emailIds: string[] = [];
  for (const r of ((emailRes.data ?? []) as any[])) {
    if (!r.template_id || seen.has(`e:${r.template_id}`)) continue;
    seen.add(`e:${r.template_id}`);
    emailIds.push(r.template_id);
    if (emailIds.length >= RECENT_LIMIT) break;
  }

  return { emailIds, smsIds };
}

export async function getTemplatesForPicker(
  leadId: string | null,
  userId: string | null,
): Promise<PickerSections> {
  const [all, stage, mySlug, recent] = await Promise.all([
    fetchAllTemplates(),
    fetchLeadStage(leadId),
    fetchMyAgentSlug(),
    fetchRecentTemplateIds(userId),
  ]);

  const byId = new Map<string, PickerTemplate>();
  for (const t of all) byId.set(`${t.kind}:${t.id}`, t);

  const used = new Set<string>();
  const pick = (key: string) => {
    if (used.has(key)) return null;
    const t = byId.get(key);
    if (!t) return null;
    used.add(key);
    return t;
  };

  // a) Recent — top 3 per channel, combined into one section (max 6, capped at 3 from each).
  const recentList: PickerTemplate[] = [];
  for (const id of recent.emailIds) {
    const t = pick(`email:${id}`);
    if (t) recentList.push(t);
  }
  for (const id of recent.smsIds) {
    const t = pick(`sms:${id}`);
    if (t) recentList.push(t);
  }
  // Trim to top 3 overall to honor the spec literally.
  const recentTop = recentList.slice(0, RECENT_LIMIT);
  // Anything past RECENT_LIMIT goes back into the pool so it can land in
  // another bucket later.
  for (const extra of recentList.slice(RECENT_LIMIT)) {
    used.delete(`${extra.kind}:${extra.id}`);
  }

  // b) Stage — match category to lead's pipeline stage.
  const stageKey = norm(stage);
  const stageList: PickerTemplate[] = [];
  if (stageKey) {
    for (const [key, t] of byId) {
      if (used.has(key)) continue;
      if (norm(t.category) === stageKey) {
        used.add(key);
        stageList.push(t);
      }
    }
  }

  // c) Team — owner_scope LIKE 'team:%', alphabetical
  const teamList: PickerTemplate[] = [];
  for (const [key, t] of byId) {
    if (used.has(key)) continue;
    if (t.owner_scope.startsWith('team:')) {
      used.add(key);
      teamList.push(t);
    }
  }
  teamList.sort((a, b) => a.name.localeCompare(b.name));

  // d) Personal — owner_scope LIKE 'agent:%' AND created_by_agent_slug = me
  const personalList: PickerTemplate[] = [];
  for (const [key, t] of byId) {
    if (used.has(key)) continue;
    if (
      t.owner_scope.startsWith('agent:') &&
      mySlug &&
      (t.owner_agent_slug === mySlug || t.created_by_agent_slug === mySlug)
    ) {
      used.add(key);
      personalList.push(t);
    }
  }
  personalList.sort((a, b) => a.name.localeCompare(b.name));

  return {
    recent: recentTop,
    stage: stageList,
    team: teamList,
    personal: personalList,
  };
}
