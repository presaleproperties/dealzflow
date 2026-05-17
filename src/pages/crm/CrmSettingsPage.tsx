import { useState, useEffect, useMemo, Component, type ReactNode, type ErrorInfo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCrmAccess } from '@/contexts/CrmAccessContext';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useEmailSettings } from '@/hooks/useEmailSettings';
import { toast } from 'sonner';
import {
  AlertTriangle, Shield, Lock, UserPlus, Bell, Mail, Calendar, MessageSquare,
  Database, Link2, User, RefreshCw, Loader2, Phone, CheckCircle2, AlertCircle,
  Sparkles, ArrowRight, Circle, ChevronRight, Briefcase, FileText, Inbox,
  Building2, FolderKanban, Crown, GitBranch, Layers, CreditCard, ExternalLink, Eye,
  Search, MoreHorizontal, Pencil, Key, Trash2, History, Camera, X, Upload,
} from 'lucide-react';
import {
  getTimelineLinkBehavior, setTimelineLinkBehavior, type TimelineLinkBehavior,
} from '@/lib/timelineLinkPref';
import DataImportSection from '@/components/crm/settings/DataImportSection';
import DataManagerSection from '@/components/crm/settings/DataManagerSection';
import { ZaraModeSection } from '@/components/crm/settings/ZaraModeSection';
import EmailSettingsSection from '@/components/crm/settings/EmailSettingsSection';
import ReplySignatureCard from '@/components/crm/settings/ReplySignatureCard';
import ProjectsManagerSection from '@/components/crm/settings/ProjectsManagerSection';
import SourceManagerSection from '@/components/crm/settings/SourceManagerSection';
import { LeadSourcesPanel } from '@/components/crm/integrations/LeadSourcesPanel';
import ProfileSection from '@/components/settings/ProfileSection';
import { InviteAgentCard } from '@/components/settings/InviteAgentCard';
import { WorkspaceMembersCard } from '@/components/settings/WorkspaceMembersCard';
import GmailConnectCard from '@/components/crm/email/GmailConnectCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

/* ─────────────────────────────────────────────────────────────
   Error boundary (one per section so a single broken integration
   doesn't take down the whole settings shell)
   ───────────────────────────────────────────────────────────── */
class SectionErrorBoundary extends Component<
  { children: ReactNode; name: string },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; name: string }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.name}] section error:`, error, info);
  }
  handleRetry = () => this.setState({ hasError: false });
  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">
              {this.props.name} failed to load. Other sections are unaffected.
            </p>
            <Button variant="outline" size="sm" onClick={this.handleRetry} className="h-7 text-xs">
              Retry
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ─────────────────────────────────────────────────────────────
   Tab definitions — grouped by audience
   ───────────────────────────────────────────────────────────── */
type TabId =
  | 'setup'
  | 'profile' | 'email' | 'notifications' | 'timeline'
  | 'team' | 'integrations' | 'projects' | 'import' | 'data'
  | 'leadflow' | 'sources' | 'plan' | 'zara';

interface TabDef {
  id: TabId;
  label: string;
  icon: typeof User;
  group: 'personal' | 'workspace' | 'owner';
  // 'owner'  → role === 'owner' only
  // 'admin'  → role in (owner, admin)
  // 'member' → any active CRM member
  audience: 'owner' | 'admin' | 'member';
  description?: string;
}

const TABS: TabDef[] = [
  // Personal — every CRM member can access these
  { id: 'setup',         label: 'Setup',             icon: Sparkles,      group: 'personal',  audience: 'member', description: 'Get started checklist' },
  { id: 'profile',       label: 'My Profile',        icon: User,          group: 'personal',  audience: 'member', description: 'Headshot, name, title, phone' },
  { id: 'email',         label: 'Email & Signature', icon: Mail,          group: 'personal',  audience: 'member', description: 'Sender, signature, branding' },
  { id: 'notifications', label: 'Notifications',     icon: Bell,          group: 'personal',  audience: 'member', description: 'What you get pinged about' },
  { id: 'timeline',      label: 'Timeline Links',    icon: Link2,         group: 'personal',  audience: 'member', description: 'Link click behavior' },
  // Workspace — owner + admin
  { id: 'team',          label: 'Team',              icon: Shield,        group: 'workspace', audience: 'admin',  description: 'Members, roles, permissions' },
  { id: 'integrations',  label: 'Integrations',      icon: MessageSquare, group: 'personal',  audience: 'member', description: 'Connect your Gmail & Calendar' },
  { id: 'projects',      label: 'Projects',          icon: FolderKanban,  group: 'workspace', audience: 'admin',  description: 'Knowledge base & cities' },
  { id: 'import',        label: 'Data Import',       icon: Database,      group: 'workspace', audience: 'admin',  description: 'CSV uploads' },
  { id: 'data',          label: 'Data Manager',      icon: FileText,      group: 'workspace', audience: 'admin',  description: 'Cleanup & exports' },
  // Owner controls — only the workspace owner sees these
  { id: 'leadflow',      label: 'Lead Flow',         icon: GitBranch,     group: 'owner',     audience: 'owner',  description: 'Sources, ingestion, errors' },
  { id: 'sources',       label: 'Source Library',    icon: Layers,        group: 'owner',     audience: 'owner',  description: 'Rename & merge lead sources' },
  { id: 'plan',          label: 'Plan & Billing',    icon: CreditCard,    group: 'owner',     audience: 'owner',  description: 'Subscription, ownership' },
  { id: 'zara',          label: 'Zara AI',           icon: Sparkles,      group: 'owner',     audience: 'owner',  description: 'Off / Sandbox / Live mode' },
];

/* ─────────────────────────────────────────────────────────────
   Page
   ───────────────────────────────────────────────────────────── */
export default function CrmSettingsPage() {
  const { isOwnerOrAdmin, isMember, role, isLoading: accessLoading } = useCrmAccess();
  const isOwner = role === 'owner';
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Visible tabs depend on role
  const visibleTabs = useMemo(() => {
    return TABS.filter((t) => {
      if (t.audience === 'owner')  return isOwner;
      if (t.audience === 'admin')  return isOwnerOrAdmin;
      return true; // member
    });
  }, [isOwner, isOwnerOrAdmin]);

  const requestedTab = (searchParams.get('tab') as TabId | null) ?? 'setup';
  const activeTab: TabId = visibleTabs.some((t) => t.id === requestedTab)
    ? requestedTab
    : 'setup';

  // Non-CRM members get bounced to /crm (which itself routes to leads)
  useEffect(() => {
    if (!accessLoading && !isMember) navigate('/crm', { replace: true });
  }, [accessLoading, isMember, navigate]);

  // If user landed on a tab they can't see, snap back
  useEffect(() => {
    if (requestedTab !== activeTab) {
      const next = new URLSearchParams(searchParams);
      next.set('tab', activeTab);
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedTab, activeTab]);

  const setTab = (id: TabId) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', id);
    setSearchParams(next);
    document.getElementById('crm-settings-content')?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (accessLoading || !isMember) return null;

  const personalTabs  = visibleTabs.filter((t) => t.group === 'personal');
  const workspaceTabs = visibleTabs.filter((t) => t.group === 'workspace');
  const ownerTabs     = visibleTabs.filter((t) => t.group === 'owner');
  const activeMeta = visibleTabs.find((t) => t.id === activeTab)!;

  // Role pill copy
  const roleMeta = isOwner
    ? { label: 'Owner', tone: 'bg-primary/15 text-primary border-primary/30',  blurb: 'You manage the workspace, lead flow, billing & admins.' }
    : role === 'admin'
    ? { label: 'Admin', tone: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30', blurb: 'You manage team, integrations, and data.' }
    : { label: role === 'viewer' ? 'Viewer' : 'Agent', tone: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30', blurb: 'These are your personal CRM preferences.' };

  return (
    <div className="flex flex-col lg:flex-row gap-0 lg:gap-6 h-full min-h-0 crm-mobile-page">
      {/* Mobile tab strip */}
      <div className="lg:hidden overflow-x-auto border-b border-border bg-background sticky top-0 z-10 -mx-3 -mt-3 px-3 sm:-mx-4 sm:-mt-4 sm:px-4"
           style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="flex gap-1 py-2 min-w-max">
          {visibleTabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors',
                activeTab === id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Desktop sidebar nav — grouped */}
      <nav className="hidden lg:flex flex-col w-56 shrink-0 sticky top-0 self-start pt-1">
        <h1 className="text-lg font-bold text-foreground mb-2 tracking-[-0.01em]">CRM Settings</h1>
        <div className="mb-5">
          <span className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold border tracking-wide uppercase',
            roleMeta.tone,
          )}>
            {isOwner && <Crown className="h-3 w-3" />}
            {roleMeta.label}
          </span>
          <p className="text-[11.5px] text-muted-foreground mt-1.5 leading-snug">{roleMeta.blurb}</p>
        </div>

        <SidebarGroup label="My Settings" tabs={personalTabs} activeTab={activeTab} onSelect={setTab} />
        {workspaceTabs.length > 0 && (
          <SidebarGroup label="Workspace" tabs={workspaceTabs} activeTab={activeTab} onSelect={setTab} className="mt-5" />
        )}
        {ownerTabs.length > 0 && (
          <SidebarGroup
            label="Owner Controls"
            tabs={ownerTabs}
            activeTab={activeTab}
            onSelect={setTab}
            className="mt-5"
            accent
          />
        )}
      </nav>

      {/* Main content pane */}
      <div
        id="crm-settings-content"
        className="flex-1 min-h-0 overflow-y-auto pb-12"
      >
        <div className="max-w-[720px] space-y-5">
          {/* Mobile h1 */}
          <div className="lg:hidden">
            <h1 className="m-page-title">CRM Settings</h1>
          </div>
          <div className="hidden lg:flex items-baseline gap-2.5">
            <activeMeta.icon className="h-4.5 w-4.5 text-primary self-center" />
            <h2 className="text-[20px] font-bold text-foreground tracking-[-0.02em]">{activeMeta.label}</h2>
            {activeMeta.description && (
              <span className="text-[12.5px] text-muted-foreground">· {activeMeta.description}</span>
            )}
          </div>

          {activeTab === 'setup'         && <SectionErrorBoundary name="Setup"><SetupChecklist isAdmin={isOwnerOrAdmin} isOwner={isOwner} onJump={setTab} /></SectionErrorBoundary>}
          {activeTab === 'profile'       && <SectionErrorBoundary name="Profile"><ProfileSection /></SectionErrorBoundary>}
          {activeTab === 'email'         && <SectionErrorBoundary name="Email"><div className="space-y-6"><EmailSettingsSection /><ReplySignatureCard /></div></SectionErrorBoundary>}
          {activeTab === 'notifications' && <SectionErrorBoundary name="Notifications"><NotificationsSection /></SectionErrorBoundary>}
          {activeTab === 'timeline'      && <SectionErrorBoundary name="Timeline"><TimelinePreferencesSection /></SectionErrorBoundary>}
          {activeTab === 'team'          && (
            <SectionErrorBoundary name="Team">
              <TeamManagement />
              <WorkspaceMembersCard />
              <InviteAgentCard />
            </SectionErrorBoundary>
          )}
          {activeTab === 'integrations'  && <SectionErrorBoundary name="Integrations"><IntegrationsSection /></SectionErrorBoundary>}
          {activeTab === 'projects'      && <SectionErrorBoundary name="Projects"><ProjectsManagerSection /></SectionErrorBoundary>}
          {activeTab === 'import'        && <SectionErrorBoundary name="Import"><DataImportSection /></SectionErrorBoundary>}
          {activeTab === 'data'          && <SectionErrorBoundary name="Data Manager"><DataManagerSection /></SectionErrorBoundary>}
          {activeTab === 'leadflow'      && <SectionErrorBoundary name="Lead Flow"><LeadFlowSection /></SectionErrorBoundary>}
          {activeTab === 'sources'       && <SectionErrorBoundary name="Source Library"><SourceManagerSection /></SectionErrorBoundary>}
          {activeTab === 'plan'          && <SectionErrorBoundary name="Plan & Billing"><PlanBillingSection /></SectionErrorBoundary>}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Sidebar group
   ───────────────────────────────────────────────────────────── */
function SidebarGroup({
  label, tabs, activeTab, onSelect, className, accent,
}: {
  label: string;
  tabs: TabDef[];
  activeTab: TabId;
  onSelect: (id: TabId) => void;
  className?: string;
  accent?: boolean;
}) {
  return (
    <div className={className}>
      <div className={cn(
        'px-2.5 mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] flex items-center gap-1.5',
        accent ? 'text-primary' : 'text-muted-foreground/80',
      )}>
        {accent && <Crown className="h-2.5 w-2.5" />}
        {label}
      </div>
      <div className="space-y-0.5">
        {tabs.map(({ id, label: tabLabel, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => onSelect(id)}
              className={cn(
                'flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-[13px] font-medium transition-all text-left',
                active
                  ? 'bg-primary/10 text-primary shadow-[inset_2px_0_0_hsl(var(--primary))]'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{tabLabel}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Setup Checklist — adapts to role
   ───────────────────────────────────────────────────────────── */
function SetupChecklist({
  isAdmin, isOwner, onJump,
}: { isAdmin: boolean; isOwner?: boolean; onJump: (id: TabId) => void }) {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { data: emailSettings } = useEmailSettings();

  // Team coverage (admins only)
  const { data: teamStats } = useQuery({
    queryKey: ['crm-setup-team-stats'],
    enabled: isAdmin,
    queryFn: async () => {
      const { data } = await supabase
        .from('crm_team')
        .select('id, headshot_url, email, is_active');
      const active = (data ?? []).filter((m) => m.is_active);
      return {
        total: active.length,
        withHeadshot: active.filter((m) => !!m.headshot_url).length,
      };
    },
  });

  // Personal checklist
  const personalItems = [
    {
      done: !!profile?.avatar_url,
      title: 'Add your headshot',
      desc: 'Used in the nav bar, email signatures, and lead detail.',
      cta: 'Open profile', tab: 'profile' as TabId,
    },
    {
      done: !!profile?.full_name && !!profile?.title && !!profile?.phone,
      title: 'Complete your profile details',
      desc: 'Full name, title, and phone power your signature & headers.',
      cta: 'Open profile', tab: 'profile' as TabId,
    },
    {
      done: !!emailSettings?.signature_html,
      title: 'Set up your email signature',
      desc: 'Builder, paste HTML, or simple text — your call.',
      cta: 'Open email settings', tab: 'email' as TabId,
    },
    {
      done: !!emailSettings?.sender_name,
      title: 'Confirm your sender name',
      desc: 'How recipients see your name in their inbox.',
      cta: 'Open email settings', tab: 'email' as TabId,
    },
  ];

  const workspaceItems = isAdmin
    ? [
        {
          done: (teamStats?.total ?? 0) > 1,
          title: 'Invite your team',
          desc: `${teamStats?.total ?? 0} member${(teamStats?.total ?? 0) === 1 ? '' : 's'} so far. Add agents and admins.`,
          cta: 'Open team', tab: 'team' as TabId,
        },
        {
          done: (teamStats?.total ?? 0) > 0 && teamStats!.withHeadshot === teamStats!.total,
          title: 'Sync headshots from Presale Properties',
          desc: `${teamStats?.withHeadshot ?? 0}/${teamStats?.total ?? 0} team members have headshots.`,
          cta: 'Open team', tab: 'team' as TabId,
        },
      ]
    : [];

  const allItems = [...personalItems, ...workspaceItems];
  const doneCount = allItems.filter((i) => i.done).length;
  const pct = allItems.length === 0 ? 0 : Math.round((doneCount / allItems.length) * 100);

  return (
    <div className="space-y-5">
      {/* Welcome / progress card */}
      <Card className="rounded-xl overflow-hidden border-primary/20">
        <div className="relative bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-[10.5px] uppercase tracking-[0.16em] font-semibold text-primary">Welcome</span>
              </div>
              <h3 className="text-[22px] font-bold text-foreground tracking-[-0.02em]">
                {profile?.full_name ? `Hey ${profile.full_name.split(' ')[0]}` : 'Get set up'}
              </h3>
              <p className="text-[13px] text-muted-foreground mt-1 max-w-md">
                {pct === 100
                  ? 'Your CRM is fully configured. Nice work.'
                  : 'A few quick steps to get the most out of the CRM.'}
              </p>
            </div>
            <div className="text-right">
              <div className="text-[28px] font-bold text-primary tabular-nums leading-none tracking-tight">{pct}%</div>
              <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground mt-1 font-semibold">
                {doneCount}/{allItems.length} complete
              </div>
            </div>
          </div>
          <div className="mt-4 h-1.5 rounded-full bg-muted/60 overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </Card>

      {/* Personal items */}
      <ChecklistGroup label="My setup" items={personalItems} onJump={onJump} />

      {/* Workspace items (admin only) */}
      {workspaceItems.length > 0 && (
        <ChecklistGroup label="Workspace setup" items={workspaceItems} onJump={onJump} />
      )}

      {/* Help */}
      <Card className="rounded-xl">
        <CardContent className="p-4 sm:p-5 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <Inbox className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <div className="text-[13.5px] font-semibold text-foreground">Need to update personal preferences?</div>
              <div className="text-[12px] text-muted-foreground">
                Theme, goals, and account-level settings live in your main account settings.
              </div>
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <a href="/settings">
              Open account settings <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function ChecklistGroup({
  label, items, onJump,
}: {
  label: string;
  items: { done: boolean; title: string; desc: string; cta: string; tab: TabId }[];
  onJump: (id: TabId) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </div>
      <Card className="rounded-xl divide-y divide-border/60">
        {items.map((item, i) => (
          <button
            key={i}
            onClick={() => onJump(item.tab)}
            className="w-full text-left p-4 flex items-start gap-3 hover:bg-muted/30 transition-colors group first:rounded-t-xl last:rounded-b-xl"
          >
            <div className="shrink-0 mt-0.5">
              {item.done ? (
                <div className="w-5 h-5 rounded-full bg-emerald-500/15 flex items-center justify-center">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                </div>
              ) : (
                <Circle className="w-5 h-5 text-muted-foreground/40" strokeWidth={1.5} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className={cn(
                'text-[13.5px] font-semibold leading-tight',
                item.done ? 'text-muted-foreground line-through decoration-muted-foreground/40' : 'text-foreground',
              )}>
                {item.title}
              </div>
              <div className="text-[12px] text-muted-foreground mt-0.5">{item.desc}</div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-1 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
          </button>
        ))}
      </Card>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Team Management — owner control center
   ───────────────────────────────────────────────────────────── */
type TeamPerms = {
  see_all_leads?: boolean;
  delete_leads?: boolean;
  export_leads?: boolean;
  reassign_leads?: boolean;
  manage_templates?: boolean;
  manage_routing?: boolean;
  manage_team?: boolean;
};

const PERMISSION_LIST: { key: keyof TeamPerms; label: string; desc: string }[] = [
  { key: 'see_all_leads',    label: 'See all leads',     desc: 'View every lead in the workspace, not just assigned ones.' },
  { key: 'reassign_leads',   label: 'Reassign leads',    desc: 'Change which agent a lead belongs to.' },
  { key: 'delete_leads',     label: 'Delete leads',      desc: 'Permanently remove leads from the CRM.' },
  { key: 'export_leads',     label: 'Export leads',      desc: 'Download lead lists as CSV.' },
  { key: 'manage_templates', label: 'Manage templates',  desc: 'Create and edit shared email/SMS templates.' },
  { key: 'manage_routing',   label: 'Manage routing',    desc: 'Configure lead routing rules and assignments.' },
  { key: 'manage_team',      label: 'Manage team',       desc: 'Invite and manage other team members.' },
];

type EditDraft = {
  display_name: string;
  title: string;
  phone: string;
  email: string;
  headshot_url: string;
  headshot_focal_y: number;
};

function relativeTime(iso?: string | null) {
  if (!iso) return null;
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function TeamManagement() {
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<string>('agent');
  const [inviteName, setInviteName] = useState('');
  const [permsEditId, setPermsEditId] = useState<string | null>(null);
  const [permsDraft, setPermsDraft] = useState<TeamPerms>({});
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [auditOpen, setAuditOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['crm-team-members'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_team')
        .select('id,user_id,display_name,email,phone,title,brokerage,headshot_url,headshot_focal_y,role,is_active,permissions,created_at,invited_at,presale_synced_at')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: signinInfo = [] } = useQuery({
    queryKey: ['crm-team-signin-info'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('crm_team_member_signin_info');
      if (error) throw error;
      return data ?? [];
    },
  });
  const signinByUser = useMemo(() => {
    const m = new Map<string, any>();
    for (const r of signinInfo as any[]) m.set(r.user_id, r);
    return m;
  }, [signinInfo]);

  const { data: auditEvents = [] } = useQuery({
    queryKey: ['crm-team-audit'],
    enabled: auditOpen,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('crm_team_recent_audit', { _limit: 60 });
      if (error) throw error;
      return data ?? [];
    },
  });

  const [syncing, setSyncing] = useState(false);
  const syncFromPresale = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('scheduler-prefill-team', { body: {} });
      if (error) throw error;
      const results = (data?.results || []) as Array<{ status: string }>;
      const synced  = results.filter((r) => r.status === 'synced').length;
      const missing = results.filter((r) => r.status === 'no_presale_match').length;
      toast.success(`Synced ${synced} of ${results.length} from Presale${missing ? ` · ${missing} unmatched` : ''}`);
      queryClient.invalidateQueries({ queryKey: ['crm-team-members'] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSyncing(false);
    }
  };

  const adminUpdate = useMutation({
    mutationFn: async (args: { id: string; patch: Partial<EditDraft> & { role?: string; is_active?: boolean } }) => {
      const { error } = await supabase.rpc('crm_team_admin_update_member', {
        _team_id: args.id,
        _display_name: args.patch.display_name ?? null,
        _title: args.patch.title ?? null,
        _phone: args.patch.phone ?? null,
        _email: args.patch.email ?? null,
        _headshot_url: args.patch.headshot_url ?? null,
        _headshot_focal_y: args.patch.headshot_focal_y ?? null,
        _role: args.patch.role ?? null,
        _is_active: args.patch.is_active ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-team-members'] });
      queryClient.invalidateQueries({ queryKey: ['crm-team-audit'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMember = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('crm_team').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-team-members'] });
      toast.success('Member removed');
      setRemoveId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const savePerms = useMutation({
    mutationFn: async ({ id, perms }: { id: string; perms: TeamPerms }) => {
      const { error } = await supabase.rpc('crm_team_update', {
        _team_id: id, _role: null, _permissions: perms as any, _is_active: null, _name_aliases: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-team-members'] });
      toast.success('Permissions updated');
      setPermsEditId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const inviteMember = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('crm_team_invite', {
        _email: inviteEmail.trim(),
        _display_name: inviteName.trim(),
        _role: inviteRole,
        _permissions: {} as any,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-team-members'] });
      toast.success('Team member invited.');
      setInviteOpen(false);
      setInviteEmail('');
      setInviteName('');
      setInviteRole('agent');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resendInvite = useMutation({
    mutationFn: async (m: { email: string; display_name: string | null; role: string }) => {
      const { data, error } = await supabase.functions.invoke('crm-invite-agent', {
        body: {
          email: m.email,
          display_name: m.display_name || m.email,
          role: m.role === 'owner' ? 'admin' : m.role,
          mode: 'temp_password',
          app_origin: 'https://dealzflow.ca',
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? 'Could not reset password');
      return data as { email_sent: boolean; temp_password?: string };
    },
    onSuccess: (data) => {
      toast.success(
        data.email_sent
          ? 'Password reset — new temporary password emailed'
          : `New temp password: ${data.temp_password ?? '(check Cloud → Emails)'}`,
        { duration: 8000 },
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const roleBadgeColor = (role: string) => {
    if (role === 'owner') return 'bg-primary/15 text-primary border-primary/30';
    if (role === 'admin') return 'bg-blue-500/15 text-blue-600 border-blue-500/30';
    if (role === 'agent') return 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30';
    return 'bg-muted text-muted-foreground border-border';
  };

  const initialsOf = (name?: string | null, email?: string | null) =>
    ((name || email || '?')
      .split(/[\s@]/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join('') || '?');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((m: any) => {
      if (roleFilter !== 'all' && m.role !== roleFilter) return false;
      if (statusFilter === 'active' && !m.is_active) return false;
      if (statusFilter === 'inactive' && m.is_active) return false;
      if (statusFilter === 'pending' && m.user_id) return false;
      if (!q) return true;
      return (
        (m.display_name || '').toLowerCase().includes(q) ||
        (m.email || '').toLowerCase().includes(q) ||
        (m.title || '').toLowerCase().includes(q) ||
        (m.phone || '').toLowerCase().includes(q)
      );
    });
  }, [members, search, roleFilter, statusFilter]);

  const openEdit = (m: any) => {
    setEditDraft({
      display_name: m.display_name ?? '',
      title: m.title ?? '',
      phone: m.phone ?? '',
      email: m.email ?? '',
      headshot_url: m.headshot_url ?? '',
      headshot_focal_y: m.headshot_focal_y ?? 30,
    });
    setEditId(m.id);
  };

  const handleHeadshotUpload = async (file: File) => {
    if (!editId || !file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5MB');
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${editId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('crm-team-headshots')
        .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('crm-team-headshots').getPublicUrl(path);
      setEditDraft((d) => (d ? { ...d, headshot_url: pub.publicUrl } : d));
      toast.success('Headshot uploaded');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const saveEdit = async () => {
    if (!editId || !editDraft) return;
    await adminUpdate.mutateAsync({ id: editId, patch: editDraft });
    toast.success('Member updated');
    setEditId(null);
    setEditDraft(null);
  };

  return (
    <Card className="rounded-xl">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 sm:px-6 py-4">
        <div className="flex items-center gap-2 min-w-0">
          <Shield className="h-4 w-4 text-primary shrink-0" />
          <CardTitle className="text-base sm:text-lg">Team Management</CardTitle>
          <span className="text-xs sm:text-sm text-muted-foreground ml-1">
            · {filtered.length} of {members.length}
          </span>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap sm:flex-nowrap">
          <Button size="sm" variant="ghost" onClick={() => setAuditOpen(true)} className="text-xs">
            <History className="h-3.5 w-3.5 mr-1.5" /> Activity
          </Button>
          <Button size="sm" variant="outline" onClick={syncFromPresale} disabled={syncing} className="flex-1 sm:flex-none">
            {syncing
              ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Syncing</>
              : <><RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Sync from Presale</>}
          </Button>
          <Button size="sm" onClick={() => setInviteOpen(true)} className="flex-1 sm:flex-none">
            <UserPlus className="h-3.5 w-3.5 mr-1.5" /> Invite
          </Button>
        </div>
      </CardHeader>

      {/* Filter bar */}
      <div className="px-4 sm:px-6 pb-3 flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search name, email, title…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="h-9 w-full sm:w-[120px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            <SelectItem value="owner">Owner</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="agent">Agent</SelectItem>
            <SelectItem value="viewer">Viewer</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-full sm:w-[140px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="pending">Pending signup</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <CardContent className="px-0 sm:px-2 pb-5">
        {isLoading ? (
          <div className="space-y-1.5 px-3 sm:px-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-[58px] rounded-md bg-muted/40 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-8 text-sm">No team members match.</p>
        ) : (
          <div className="divide-y divide-border/60">
            {filtered.map((m: any) => {
              const isOwner = m.role === 'owner';
              const focalY = m.headshot_focal_y ?? 30;
              const signin = m.user_id ? signinByUser.get(m.user_id) : null;
              const lastSeen = signin?.last_sign_in_at ? relativeTime(signin.last_sign_in_at) : null;
              const isPending = !m.user_id;
              const inviteAge = isPending && m.invited_at ? relativeTime(m.invited_at) : null;

              return (
                <div
                  key={m.id}
                  className="group flex items-center gap-3 px-4 sm:px-6 py-2.5 hover:bg-muted/30 transition-colors"
                >
                  {/* Avatar */}
                  {m.headshot_url ? (
                    <img
                      src={m.headshot_url}
                      alt={m.display_name || ''}
                      className="w-10 h-10 rounded-full object-cover border border-border shrink-0"
                      style={{ objectPosition: `center ${focalY}%` }}
                    />
                  ) : (
                    <Avatar className="w-10 h-10 shrink-0 border border-border">
                      <AvatarFallback className="text-xs font-semibold bg-primary text-primary-foreground">
                        {initialsOf(m.display_name, m.email)}
                      </AvatarFallback>
                    </Avatar>
                  )}

                  {/* Identity */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {isOwner && <Crown className="h-3 w-3 text-primary shrink-0" />}
                      <span className="text-[14px] font-semibold text-foreground truncate tracking-[-0.01em]">
                        {m.display_name || m.email || '—'}
                      </span>
                      {!m.is_active && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1 bg-muted text-muted-foreground border-border">
                          inactive
                        </Badge>
                      )}
                      {isPending && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1 bg-amber-500/10 text-amber-600 border-amber-500/30">
                          pending
                        </Badge>
                      )}
                    </div>
                    <div className="text-[11.5px] text-muted-foreground truncate">
                      {m.title ? <span>{m.title} · </span> : null}
                      <span>{m.email}</span>
                    </div>
                  </div>

                  {/* Role badge (desktop) */}
                  <div className="hidden md:block shrink-0">
                    <Badge variant="outline" className={cn('text-[10.5px] h-5', roleBadgeColor(m.role))}>
                      {m.role}
                    </Badge>
                  </div>

                  {/* Last seen (desktop) */}
                  <div className="hidden lg:block shrink-0 w-[110px] text-right text-[11px] text-muted-foreground">
                    {isPending
                      ? <span className="text-amber-600">Invited {inviteAge ?? 'recently'}</span>
                      : lastSeen
                        ? <span>Active {lastSeen}</span>
                        : <span className="italic">Never signed in</span>}
                  </div>

                  {/* Actions menu */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem onClick={() => openEdit(m)}>
                        <Pencil className="h-3.5 w-3.5 mr-2" /> Edit profile
                      </DropdownMenuItem>
                      {!isOwner && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Role
                          </DropdownMenuLabel>
                          {(['admin', 'agent', 'viewer'] as const).map((r) => (
                            <DropdownMenuItem
                              key={r}
                              disabled={m.role === r}
                              onClick={() => adminUpdate.mutate({ id: m.id, patch: { role: r } })}
                            >
                              <Shield className="h-3.5 w-3.5 mr-2 opacity-60" />
                              Make {r}
                              {m.role === r && <CheckCircle2 className="h-3.5 w-3.5 ml-auto text-primary" />}
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => adminUpdate.mutate({ id: m.id, patch: { is_active: !m.is_active } })}
                          >
                            {m.is_active ? <Eye className="h-3.5 w-3.5 mr-2" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-2" />}
                            {m.is_active ? 'Deactivate' : 'Activate'}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setPermsEditId(m.id);
                              setPermsDraft((m.permissions ?? {}) as TeamPerms);
                            }}
                          >
                            <Lock className="h-3.5 w-3.5 mr-2" /> Permissions…
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            disabled={resendInvite.isPending && resendInvite.variables?.email === m.email}
                            onClick={() => resendInvite.mutate({
                              email: m.email,
                              display_name: m.display_name,
                              role: m.role,
                            })}
                          >
                            <Key className="h-3.5 w-3.5 mr-2" />
                            {resendInvite.isPending && resendInvite.variables?.email === m.email
                              ? 'Sending…'
                              : 'Reset password'}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setRemoveId(m.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" /> Remove from team
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* Edit Member Dialog */}
      <Dialog open={!!editId} onOpenChange={(o) => { if (!o) { setEditId(null); setEditDraft(null); } }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit team member</DialogTitle>
          </DialogHeader>
          {editDraft && (
            <div className="space-y-4 py-2">
              {/* Headshot */}
              <div className="flex items-center gap-4">
                {editDraft.headshot_url ? (
                  <img
                    src={editDraft.headshot_url}
                    alt=""
                    className="w-20 h-20 rounded-full object-cover border-2 border-border ring-1 ring-primary/15"
                    style={{ objectPosition: `center ${editDraft.headshot_focal_y}%` }}
                  />
                ) : (
                  <Avatar className="w-20 h-20 border-2 border-border">
                    <AvatarFallback className="text-base font-semibold bg-primary text-primary-foreground">
                      {initialsOf(editDraft.display_name, editDraft.email)}
                    </AvatarFallback>
                  </Avatar>
                )}
                <div className="flex-1 space-y-2">
                  <Label className="text-xs">Headshot</Label>
                  <div className="flex flex-wrap gap-1.5">
                    <label className="inline-flex">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleHeadshotUpload(f);
                          e.target.value = '';
                        }}
                      />
                      <Button asChild size="sm" variant="outline" disabled={uploading}>
                        <span className="cursor-pointer">
                          {uploading
                            ? <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> Uploading</>
                            : <><Upload className="h-3 w-3 mr-1.5" /> Upload</>}
                        </span>
                      </Button>
                    </label>
                    {editDraft.headshot_url && (
                      <Button
                        size="sm" variant="ghost"
                        onClick={() => setEditDraft((d) => d && ({ ...d, headshot_url: '' }))}
                      >
                        <X className="h-3 w-3 mr-1.5" /> Remove
                      </Button>
                    )}
                  </div>
                  {editDraft.headshot_url && (
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Vertical focus ({editDraft.headshot_focal_y}%)</Label>
                      <input
                        type="range" min={0} max={100} step={5}
                        value={editDraft.headshot_focal_y}
                        onChange={(e) => setEditDraft((d) => d && ({ ...d, headshot_focal_y: Number(e.target.value) }))}
                        className="w-full accent-primary"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Full name</Label>
                  <Input
                    value={editDraft.display_name}
                    onChange={(e) => setEditDraft((d) => d && ({ ...d, display_name: e.target.value }))}
                    placeholder="Jane Doe"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Title</Label>
                  <Input
                    value={editDraft.title}
                    onChange={(e) => setEditDraft((d) => d && ({ ...d, title: e.target.value }))}
                    placeholder="REALTOR®"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Phone</Label>
                  <Input
                    value={editDraft.phone}
                    onChange={(e) => setEditDraft((d) => d && ({ ...d, phone: e.target.value }))}
                    placeholder="(604) 555-1234"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Login email</Label>
                  <Input
                    type="email"
                    value={editDraft.email}
                    onChange={(e) => setEditDraft((d) => d && ({ ...d, email: e.target.value }))}
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Changing the email here only updates the CRM record. To change the actual login, use <strong>Reset password</strong> after.
              </p>
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => { setEditId(null); setEditDraft(null); }}>
              Cancel
            </Button>
            <Button onClick={saveEdit} disabled={adminUpdate.isPending}>
              {adminUpdate.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permissions Dialog */}
      <Dialog open={!!permsEditId} onOpenChange={(o) => !o && setPermsEditId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Permissions</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
            {PERMISSION_LIST.map((p) => (
              <div key={p.key} className="flex items-start justify-between gap-3 py-1">
                <div className="space-y-0.5 flex-1 min-w-0">
                  <div className="text-sm font-medium">{p.label}</div>
                  <div className="text-xs text-muted-foreground">{p.desc}</div>
                </div>
                <Switch
                  checked={!!permsDraft[p.key]}
                  onCheckedChange={(v) => setPermsDraft((d) => ({ ...d, [p.key]: v }))}
                />
              </div>
            ))}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setPermsEditId(null)}>Cancel</Button>
            <Button
              disabled={savePerms.isPending}
              onClick={() => permsEditId && savePerms.mutate({ id: permsEditId, perms: permsDraft })}
            >
              {savePerms.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove confirm */}
      <AlertDialog open={!!removeId} onOpenChange={(o) => !o && setRemoveId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove team member?</AlertDialogTitle>
            <AlertDialogDescription>
              They will lose access to the CRM. Their data and lead history stay intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => removeId && removeMember.mutate(removeId)}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite Team Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                type="email" placeholder="team@example.com"
                value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
                className="min-h-[44px] sm:min-h-0"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Display Name</Label>
              <Input
                placeholder="Jane Doe"
                value={inviteName} onChange={(e) => setInviteName(e.target.value)}
                className="min-h-[44px] sm:min-h-0"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger className="min-h-[44px] sm:min-h-0"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="agent">Agent</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              They'll be auto-linked when they sign up with this email. To send a temp password right away, use the dedicated <strong>Invite an agent</strong> card.
            </p>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setInviteOpen(false)} className="min-h-[44px] sm:min-h-0">Cancel</Button>
            <Button
              disabled={!inviteEmail || inviteMember.isPending}
              onClick={() => inviteMember.mutate()}
              className="min-h-[44px] sm:min-h-0"
            >
              {inviteMember.isPending ? 'Adding…' : 'Add Member'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Activity drawer */}
      <Sheet open={auditOpen} onOpenChange={setAuditOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Team activity</SheetTitle>
            <SheetDescription>Recent role, permission and profile changes.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            {auditEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No activity yet.</p>
            ) : (
              (auditEvents as any[]).map((ev) => {
                const changes = (ev.details?.changes ?? {}) as Record<string, [any, any]>;
                const keys = Object.keys(changes);
                return (
                  <div key={ev.id} className="rounded-md border border-border/60 bg-card p-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-foreground">
                        {ev.admin_name || 'Someone'} → {ev.target_name || 'a member'}
                      </span>
                      <span className="text-muted-foreground text-[10px]">
                        {relativeTime(ev.created_at)}
                      </span>
                    </div>
                    <div className="mt-1.5 space-y-0.5">
                      {keys.length === 0 ? (
                        <span className="text-muted-foreground">{ev.action}</span>
                      ) : (
                        keys.map((k) => (
                          <div key={k} className="text-muted-foreground">
                            <span className="font-medium text-foreground/80">{k}:</span>{' '}
                            <span className="line-through opacity-60">{String(changes[k][0] ?? '∅')}</span>{' '}
                            → <span className="text-foreground">{String(changes[k][1] ?? '∅')}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </SheetContent>
      </Sheet>
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────────
   Integrations
   ───────────────────────────────────────────────────────────── */
const INTEGRATIONS = [
  { name: 'Google Calendar', icon: Calendar, status: 'connected' as const, desc: 'Sync showings and appointments' },
];
function IntegrationsSection() {
  const statusBadge = (status: 'connected' | 'disconnected' | 'error' | 'unknown') => {
    if (status === 'connected') return <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30" variant="outline">Connected</Badge>;
    if (status === 'error')     return <Badge className="bg-destructive/15 text-destructive border-destructive/30" variant="outline">Error</Badge>;
    if (status === 'unknown')   return <Badge className="bg-muted text-muted-foreground border-border" variant="outline">Unknown</Badge>;
    return <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30" variant="outline">Not Connected</Badge>;
  };

  return (
    <Card className="rounded-xl">
      <CardHeader className="px-3 sm:px-6">
        <CardTitle className="text-base sm:text-lg">Integrations</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 grid-cols-1 sm:grid-cols-2 px-3 sm:px-6">
        <GmailConnectCard />
        {INTEGRATIONS.map((intg) => (
          <div key={intg.name} className="flex items-start gap-3 p-3 sm:p-4 rounded-lg border border-border/60 bg-muted/20">
            <div className="p-2 rounded-md bg-primary/10 shrink-0">
              <intg.icon className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm text-foreground">{intg.name}</span>
                {statusBadge(intg.status)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{intg.desc}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────────
   Notifications (per-user, localStorage)
   ───────────────────────────────────────────────────────────── */
const NOTIFICATION_DEFAULTS = [
  { key: 'new_lead',         label: 'New Lead Alert' },
  { key: 'showing_reminder', label: 'Showing Reminder (1hr before)' },
  { key: 'task_due',         label: 'Task Due Reminder' },
  { key: 'email_opened',     label: 'Email Opened Alert' },
];
function NotificationsSection() {
  const DEFAULTS: Record<string, boolean> = {
    new_lead: true, showing_reminder: true, task_due: true, email_opened: false,
  };
  const [toggles, setToggles] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('crm-notification-toggles');
      if (stored) return { ...DEFAULTS, ...JSON.parse(stored) };
    } catch {}
    return DEFAULTS;
  });
  const handleToggle = (key: string, value: boolean) => {
    const next = { ...toggles, [key]: value };
    setToggles(next);
    localStorage.setItem('crm-notification-toggles', JSON.stringify(next));
  };

  return (
    <Card className="rounded-xl">
      <CardHeader className="flex flex-row items-center gap-2 px-3 sm:px-6">
        <Bell className="h-5 w-5 text-primary" />
        <CardTitle className="text-base sm:text-lg">Notifications</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 sm:space-y-3 px-3 sm:px-6">
        {NOTIFICATION_DEFAULTS.map((n) => (
          <div key={n.key} className="flex items-center justify-between py-2 sm:py-1 min-h-[44px]">
            <span className="text-sm text-foreground">{n.label}</span>
            <Switch checked={toggles[n.key]} onCheckedChange={(v) => handleToggle(n.key, v)} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────────
   Timeline link click behavior (per-user)
   ───────────────────────────────────────────────────────────── */
function TimelinePreferencesSection() {
  const [behavior, setBehaviorState] = useState<TimelineLinkBehavior>(() => getTimelineLinkBehavior());
  const handleChange = (value: TimelineLinkBehavior) => {
    setBehaviorState(value);
    setTimelineLinkBehavior(value);
  };
  const options: { value: TimelineLinkBehavior; title: string; desc: string }[] = [
    { value: 'preview', title: 'Show preview first', desc: 'Click a link to see its host, path and query params before opening.' },
    { value: 'open',    title: 'Open immediately in a new tab', desc: 'Skip the preview popover and go straight to the destination.' },
  ];

  return (
    <Card className="rounded-xl">
      <CardHeader className="flex flex-row items-center gap-2 px-3 sm:px-6">
        <Link2 className="h-5 w-5 text-primary" />
        <CardTitle className="text-base sm:text-lg">Timeline Links</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-3 sm:px-6">
        <p className="text-xs text-muted-foreground">
          Choose what happens when you click a URL inside a lead's activity timeline.
        </p>
        <div className="space-y-2">
          {options.map((opt) => {
            const active = behavior === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleChange(opt.value)}
                className={cn(
                  'w-full text-left rounded-lg border p-3 transition-colors',
                  active
                    ? 'border-primary/50 bg-primary/5'
                    : 'border-border hover:border-border/80 hover:bg-muted/40',
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      'mt-0.5 h-4 w-4 rounded-full border flex items-center justify-center shrink-0',
                      active ? 'border-primary' : 'border-muted-foreground/40',
                    )}
                  >
                    {active && <span className="h-2 w-2 rounded-full bg-primary" />}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground">{opt.title}</div>
                    <div className="text-xs text-muted-foreground">{opt.desc}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────────
   Lead Flow (owner only) — wraps the full LeadSourcesPanel
   ───────────────────────────────────────────────────────────── */
function LeadFlowSection() {
  return (
    <div className="space-y-5">
      <Card className="rounded-xl border-primary/20 bg-primary/5">
        <CardContent className="p-4 sm:p-5 flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
            <GitBranch className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 text-[12.5px] text-foreground/80 leading-relaxed">
            <span className="font-semibold text-foreground">Lead Flow</span> is the live view of every channel sending leads into your CRM —
            webhooks, ads, manual entries. Toggle a source off to stop ingesting from it without losing history.
          </div>
        </CardContent>
      </Card>
      <LeadSourcesPanel />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Plan & Billing (owner only) — pointer to /settings?tab=plan
   ───────────────────────────────────────────────────────────── */
function PlanBillingSection() {
  return (
    <Card className="rounded-xl">
      <CardHeader className="px-3 sm:px-6">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <CreditCard className="h-5 w-5 text-primary" />
          Plan & Billing
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 sm:px-6 space-y-4">
        <p className="text-[13px] text-muted-foreground">
          Subscription, payment method, and account ownership live in your main account settings.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Button asChild variant="outline" className="justify-between h-auto py-3 px-4">
            <a href="/settings?tab=plan">
              <span className="flex items-center gap-2">
                <Crown className="h-4 w-4 text-primary" />
                <span className="text-left">
                  <span className="block text-[13px] font-semibold">Manage Plan</span>
                  <span className="block text-[11px] text-muted-foreground">Upgrade, cancel, billing portal</span>
                </span>
              </span>
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
            </a>
          </Button>
          <Button asChild variant="outline" className="justify-between h-auto py-3 px-4">
            <a href="/admin">
              <span className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                <span className="text-left">
                  <span className="block text-[13px] font-semibold">Admin Console</span>
                  <span className="block text-[11px] text-muted-foreground">Workspace-wide audit & access</span>
                </span>
              </span>
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
