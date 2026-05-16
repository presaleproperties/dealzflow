/**
 * Tier 7 — CrmSideRail.
 *
 * Left collapsible icon strip under all /crm/* routes (desktop only).
 * Default state: collapsed (52px icon strip). Hover or click expands to
 * 200px with labels. Click outside or navigate to collapse again.
 *
 * Houses the demoted secondary surfaces:
 *   Templates · Automations · Integrations · Team · Settings · SMS Queue
 *
 * Behavior pages are no longer in nav — they now render as a section
 * inside /crm/leads/:id (Lead Detail).
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  FileText, Zap, Plug, Users, Settings as Cog, Inbox as InboxIcon,
} from 'lucide-react';
import { useCrmAccess } from '@/contexts/CrmAccessContext';
import { cn } from '@/lib/utils';

interface Item {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  ownerAdminOnly?: boolean;
}

// Team & SMS Queue currently live inside /crm/settings — deep-link via hash.
const ITEMS: Item[] = [
  { label: 'Templates',    path: '/crm/templates',          icon: FileText },
  { label: 'Automations',  path: '/crm/automations',        icon: Zap, ownerAdminOnly: true },
  { label: 'Integrations', path: '/crm/integrations',       icon: Plug, ownerAdminOnly: true },
  { label: 'Team',         path: '/crm/settings#team',      icon: Users, ownerAdminOnly: true },
  { label: 'Settings',     path: '/crm/settings',           icon: Cog, ownerAdminOnly: true },
  { label: 'SMS Queue',    path: '/crm/settings#sms-queue', icon: InboxIcon, ownerAdminOnly: true },
];

const GOLD = 'hsl(var(--primary))';

function isActive(pathname: string, path: string): boolean {
  const base = path.split('#')[0];
  return pathname === base || pathname.startsWith(base + '/');
}

export function CrmSideRail() {
  const { pathname } = useLocation();
  const { isOwnerOrAdmin } = useCrmAccess();
  const [expanded, setExpanded] = useState(false);
  const [pinned, setPinned] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  // Collapse when route changes (unless pinned)
  useEffect(() => { if (!pinned) setExpanded(false); }, [pathname, pinned]);

  // Click-outside collapse
  useEffect(() => {
    if (!expanded) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        setExpanded(false);
        setPinned(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [expanded]);

  const visible = ITEMS.filter(i => !i.ownerAdminOnly || isOwnerOrAdmin);
  if (visible.length === 0) return null;

  return (
    <div
      ref={ref}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => { if (!pinned) setExpanded(false); }}
      className={cn(
        'hidden lg:flex flex-col fixed left-0 z-40 transition-[width] duration-200 ease-out backdrop-blur-xl bg-background/90',
        expanded ? 'w-[200px]' : 'w-[52px]',
      )}
      style={{
        top: 'calc(54px + 46px)',
        bottom: 'var(--bottom-nav-pad, 0px)',
        borderRight: '1px solid hsl(var(--border) / 0.6)',
      }}
    >
      <button
        type="button"
        onClick={() => { const next = !pinned; setPinned(next); setExpanded(next); }}
        className="h-8 mx-1.5 mt-2 mb-1 rounded-md text-[10px] uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors flex items-center justify-center"
        aria-label={pinned ? 'Unpin sidebar' : 'Pin sidebar'}
      >
        {expanded ? (pinned ? 'Unpin' : 'Pin') : '…'}
      </button>

      <nav className="flex-1 overflow-y-auto py-1">
        {visible.map(item => {
          const Icon = item.icon;
          const active = isActive(pathname, item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex items-center gap-3 mx-1.5 my-0.5 px-2.5 h-9 rounded-md text-[13px] transition-colors',
                active
                  ? 'bg-muted text-foreground font-semibold'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
              )}
              style={active ? { borderLeft: `2px solid ${GOLD}` } : undefined}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {expanded && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
