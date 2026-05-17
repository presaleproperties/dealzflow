import { useLocation, useParams } from 'react-router-dom';
import { useMemo } from 'react';

export type ZaraSurface =
  | 'dashboard' | 'leads_list' | 'lead_detail' | 'pipeline' | 'email'
  | 'chats' | 'calendar' | 'templates' | 'queue' | 'projects_list'
  | 'reports' | 'other';

export type ZaraPageContext = {
  surface: ZaraSurface;
  contact_id?: string;
  project_id?: string;
  campaign_id?: string;
  url: string;
  label: string;
};

function isUuid(v: string | undefined): boolean {
  return !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export function deriveSurface(pathname: string): { surface: ZaraSurface; label: string } {
  if (/^\/crm\/leads\/[^/]+/.test(pathname)) return { surface: 'lead_detail', label: 'Lead detail' };
  if (pathname.startsWith('/crm/leads')) return { surface: 'leads_list', label: 'Leads' };
  if (pathname.startsWith('/crm/pipeline')) return { surface: 'pipeline', label: 'Pipeline' };
  if (pathname.startsWith('/crm/chats')) return { surface: 'chats', label: 'Chats' };
  if (pathname.startsWith('/crm/email/analytics') || pathname.startsWith('/crm/reports')) {
    return { surface: 'reports', label: 'Reports' };
  }
  if (pathname.startsWith('/crm/email') || pathname.startsWith('/crm/inbox')) return { surface: 'email', label: 'Email' };
  if (pathname.startsWith('/crm/scheduler') || pathname.startsWith('/crm/calendar') || pathname.startsWith('/crm/showings')) {
    return { surface: 'calendar', label: 'Calendar' };
  }
  if (pathname.startsWith('/crm/templates')) return { surface: 'templates', label: 'Templates' };
  if (pathname.startsWith('/crm/zara/queue')) return { surface: 'queue', label: 'Approval queue' };
  if (pathname.startsWith('/crm/zara/projects')) return { surface: 'projects_list', label: 'Project catalog' };
  if (pathname.startsWith('/crm/behavior') || pathname.startsWith('/crm/dashboard') || pathname === '/crm') {
    return { surface: 'dashboard', label: 'Dashboard' };
  }
  return { surface: 'other', label: 'CRM' };
}

/**
 * Snapshot of what Uzair is looking at right now.
 * Sent to zara-chat with every message so Zara can resolve pronouns and act in-context.
 */
export function useZaraPageContext(): ZaraPageContext {
  const { pathname, search } = useLocation();
  const params = useParams();

  return useMemo(() => {
    const { surface, label } = deriveSurface(pathname);
    const ctx: ZaraPageContext = {
      surface,
      url: pathname + (search ?? ''),
      label,
    };

    // Lead detail captures :id from /crm/leads/:id
    if (surface === 'lead_detail' && isUuid(params.id as string | undefined)) {
      ctx.contact_id = params.id as string;
    }
    // Project param if present (e.g. /crm/zara/projects/:id)
    if (params.projectId && isUuid(params.projectId as string)) {
      ctx.project_id = params.projectId as string;
    }
    if (params.campaignId && isUuid(params.campaignId as string)) {
      ctx.campaign_id = params.campaignId as string;
    }

    return ctx;
  }, [pathname, search, params.id, params.projectId, params.campaignId]);
}
