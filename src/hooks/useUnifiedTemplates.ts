// Unified template list — merges email + SMS (and Presale bridge email
// templates, read-only) into a single browsable model with filters/search.
import { useMemo } from 'react';
import {
  useEmailTemplates,
  type EmailTemplate,
} from '@/hooks/useEmailTemplates';
import { useSmsTemplates, type SmsTemplate } from '@/hooks/useSms';
import { useBridgeTemplates, type BridgeTemplate } from '@/hooks/useBridgeEmail';
import {
  useTemplateFavorites,
  useTemplateFolderItems,
  useTemplateTagItems,
  type TemplateKind,
} from '@/hooks/useTemplateOrg';

export type UnifiedSource = 'mine' | 'team' | 'presale';

export interface UnifiedTemplate {
  uid: string;             // stable cross-channel id (`email:<id>` / `sms:<id>` / `presale:<id>`)
  kind: TemplateKind;      // 'email' | 'sms'
  source: UnifiedSource;   // mine / team / presale (presale = bridge, read-only)
  id: string;              // raw row id
  name: string;
  subject: string | null;  // email only
  bodyHtml: string;        // for email — rich; for SMS — plain text in <p>
  bodyText: string;        // plain text snippet for cards
  category: string | null;
  isFavorite: boolean;     // resolved against user favorites
  isFeatured: boolean;
  isLocked: boolean;
  ownerScope: string | null;
  ownerAgentSlug: string | null;
  createdByAgentSlug: string | null;
  timesUsed: number;
  lastUsedAt: string | null;
  updatedAt: string;
  raw: EmailTemplate | SmsTemplate | BridgeTemplate;
}

export interface UnifiedFilters {
  channel: 'all' | 'email' | 'sms';
  search: string;
  source: 'all' | UnifiedSource;
  folderId: string | null;
  tagIds: string[];
  favoritedOnly: boolean;
  featuredOnly: boolean;
  myAgentSlug?: string | null;
}

function snippetFromHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function classifyEmailSource(t: EmailTemplate, mySlug?: string | null): UnifiedSource {
  if (t.owner_scope?.startsWith('agent:') && t.owner_agent_slug && mySlug && t.owner_agent_slug === mySlug) {
    return 'mine';
  }
  return 'team';
}

export function useUnifiedTemplates(filters: UnifiedFilters) {
  const emailQ = useEmailTemplates();
  const smsQ = useSmsTemplates();
  const bridgeQ = { data: [] as BridgeTemplate[] };
  const favsQ = useTemplateFavorites();
  const folderItemsQ = useTemplateFolderItems();
  const tagItemsQ = useTemplateTagItems();

  const all = useMemo<UnifiedTemplate[]>(() => {
    const out: UnifiedTemplate[] = [];
    const favSet = new Set(
      (favsQ.data ?? []).map((f) => `${f.template_kind}:${f.template_id}`),
    );

    for (const t of emailQ.data ?? []) {
      const source = classifyEmailSource(t, filters.myAgentSlug);
      out.push({
        uid: `email:${t.id}`,
        kind: 'email',
        source,
        id: t.id,
        name: t.name,
        subject: t.subject ?? null,
        bodyHtml: t.html_content,
        bodyText: snippetFromHtml(t.html_content),
        category: t.category,
        isFavorite: favSet.has(`email:${t.id}`) || !!t.is_favorite,
        isFeatured: !!(t as any).is_featured,
        isLocked: !!(t as any).is_locked,
        ownerScope: t.owner_scope ?? null,
        ownerAgentSlug: t.owner_agent_slug ?? null,
        createdByAgentSlug: t.created_by_agent_slug ?? null,
        timesUsed: t.times_used ?? 0,
        lastUsedAt: t.last_used_at,
        updatedAt: t.updated_at,
        raw: t,
      });
    }

    for (const t of smsQ.data ?? []) {
      const sms = t as SmsTemplate & {
        is_featured?: boolean;
        is_locked?: boolean;
        owner_scope?: string | null;
        owner_agent_slug?: string | null;
        created_by_agent_slug?: string | null;
      };
      out.push({
        uid: `sms:${sms.id}`,
        kind: 'sms',
        source: 'team',
        id: sms.id,
        name: sms.name,
        subject: null,
        bodyHtml: `<p>${(sms.body || '').replace(/[<&>]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' } as any)[c]).replace(/\n/g, '<br/>')}</p>`,
        bodyText: sms.body || '',
        category: sms.category,
        isFavorite: favSet.has(`sms:${sms.id}`),
        isFeatured: !!sms.is_featured,
        isLocked: !!sms.is_locked,
        ownerScope: sms.owner_scope ?? null,
        ownerAgentSlug: sms.owner_agent_slug ?? null,
        createdByAgentSlug: sms.created_by_agent_slug ?? null,
        timesUsed: sms.times_used ?? 0,
        lastUsedAt: sms.last_used_at,
        updatedAt: sms.updated_at,
        raw: sms,
      });
    }

    // Presale bridge templates intentionally excluded — they are outdated
    // and managed remotely. Agents create their own in the library.

    return out;
  }, [emailQ.data, smsQ.data, bridgeQ.data, favsQ.data, filters.myAgentSlug]);

  const folderMap = useMemo(() => {
    const m = new Map<string, Set<string>>(); // folderId -> Set('kind:id')
    for (const fi of folderItemsQ.data ?? []) {
      const k = `${fi.template_kind}:${fi.template_id}`;
      if (!m.has(fi.folder_id)) m.set(fi.folder_id, new Set());
      m.get(fi.folder_id)!.add(k);
    }
    return m;
  }, [folderItemsQ.data]);

  const tagMap = useMemo(() => {
    const m = new Map<string, Set<string>>(); // tagId -> Set('kind:id')
    for (const ti of tagItemsQ.data ?? []) {
      const k = `${ti.template_kind}:${ti.template_id}`;
      if (!m.has(ti.tag_id)) m.set(ti.tag_id, new Set());
      m.get(ti.tag_id)!.add(k);
    }
    return m;
  }, [tagItemsQ.data]);

  const tagsByTemplate = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const ti of tagItemsQ.data ?? []) {
      const k = `${ti.template_kind}:${ti.template_id}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(ti.tag_id);
    }
    return m;
  }, [tagItemsQ.data]);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    let list = all;
    if (filters.channel !== 'all') list = list.filter((u) => u.kind === filters.channel);
    if (filters.source !== 'all') list = list.filter((u) => u.source === filters.source);
    if (filters.favoritedOnly) list = list.filter((u) => u.isFavorite);
    if (filters.featuredOnly) list = list.filter((u) => u.isFeatured);
    if (filters.folderId) {
      const allowed = folderMap.get(filters.folderId) ?? new Set<string>();
      list = list.filter((u) => allowed.has(u.uid));
    }
    if (filters.tagIds.length) {
      list = list.filter((u) => {
        const tags = tagsByTemplate.get(u.uid) ?? [];
        return filters.tagIds.every((t) => tags.includes(t));
      });
    }
    if (q) {
      const tokens = q.split(/\s+/).filter(Boolean);
      list = list.filter((u) => {
        const hay = `${u.name} ${u.subject ?? ''} ${u.bodyText} ${u.category ?? ''}`.toLowerCase();
        return tokens.every((t) => hay.includes(t));
      });
    }
    // Sort: favorites first, then featured, then most recently updated.
    return [...list].sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
      if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    });
  }, [all, filters, folderMap, tagsByTemplate]);

  return {
    all,
    items: filtered,
    isLoading:
      emailQ.isLoading || smsQ.isLoading || bridgeQ.isLoading || favsQ.isLoading,
    folderMap,
    tagMap,
    tagsByTemplate,
  };
}
