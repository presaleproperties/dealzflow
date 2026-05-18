// Zara Operations Center — left-rail nav shell.
// Wraps every /admin/zara/* page with a consistent sidebar.
import { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Inbox, Activity, AlertTriangle, BarChart3,
  Banknote, GraduationCap, Workflow, Settings, ArrowLeft, Sparkles, Wrench, Zap,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/admin/zara',            label: 'Overview',         icon: LayoutDashboard, end: true },
  { to: '/admin/zara/drafts',     label: 'Drafts',           icon: Inbox },
  { to: '/admin/zara/jobs',       label: 'Jobs',             icon: Activity },
  { to: '/admin/zara/tools',      label: 'Tools',            icon: Wrench },
  { to: '/admin/zara/triggers',   label: 'Trigger Map',      icon: Zap },
  { to: '/admin/zara/behavior',   label: 'Behavior',         icon: BarChart3 },
  { to: '/admin/zara/gaps',       label: 'Gaps',             icon: AlertTriangle },
  { to: '/admin/zara/cost',       label: 'Models & Cost',    icon: Banknote },
  { to: '/admin/zara/training',   label: 'Training',         icon: GraduationCap },
  { to: '/admin/zara/playbooks',  label: 'Lead Assignment',  icon: Workflow },
  { to: '/admin/zara/settings',   label: 'Settings',         icon: Settings },
];

export function ZaraShell({ title, subtitle, actions, children }: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <AppLayout>
      <Header title="Zara Ops" />
      <div className="flex flex-col lg:flex-row min-h-[calc(100dvh-56px)]">
        {/* Sidebar (desktop) / horizontal tabs (mobile) */}
        <aside className="lg:w-56 lg:border-r border-border bg-card/30 lg:min-h-full">
          <div className="hidden lg:flex items-center gap-2 px-4 py-4 border-b border-border">
            <Sparkles className="h-4 w-4 text-amber-500" />
            <div>
              <div className="text-sm font-semibold">Zara</div>
              <div className="text-[11px] text-muted-foreground">Ops Center</div>
            </div>
          </div>
          <nav className="flex lg:flex-col overflow-x-auto lg:overflow-visible px-2 py-2 gap-1 scrollbar-none">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 px-3 py-2 rounded-md text-sm whitespace-nowrap transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                  )
                }
              >
                <item.icon className="h-4 w-4 flex-shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0">
          <div className="px-4 lg:px-8 py-5 lg:py-6 max-w-[1400px] mx-auto">
            <div className="flex items-start gap-3 mb-5">
              <Button variant="ghost" size="sm" onClick={() => navigate('/admin')} className="-ml-2 hidden lg:inline-flex">
                <ArrowLeft className="h-4 w-4 mr-1" /> Admin
              </Button>
              <div className="flex-1 min-w-0">
                <h1 className="text-xl lg:text-2xl font-semibold tracking-tight">{title}</h1>
                {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
              </div>
              {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
            </div>
            {children}
          </div>
        </main>
      </div>
    </AppLayout>
  );
}
