// Zara Operations Center — Apple Intelligence v2 shell.
// Glass rail, hairline dividers, editorial typography. No icon clutter.
import { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';

const NAV = [
  { to: '/admin/zara',            label: 'Overview',         end: true },
  { to: '/admin/zara/drafts',     label: 'Drafts' },
  { to: '/admin/zara/jobs',       label: 'Jobs' },
  { to: '/admin/zara/tools',      label: 'Tools' },
  { to: '/admin/zara/triggers',   label: 'Trigger Map' },
  { to: '/admin/zara/behavior',   label: 'Behavior' },
  { to: '/admin/zara/gaps',       label: 'Gaps' },
  { to: '/admin/zara/cost',       label: 'Models & Cost' },
  { to: '/admin/zara/training',   label: 'Training' },
  { to: '/admin/zara/playbooks',  label: 'Lead Assignment' },
  { to: '/admin/zara/settings',   label: 'Settings' },
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
        {/* Glass rail */}
        <aside className="zara-rail lg:w-60 lg:min-h-full">
          <div className="hidden lg:block px-5 pt-6 pb-5">
            <div className="zara-eyebrow">Zara</div>
            <div className="mt-2 text-[17px] font-medium tracking-tight">Operations</div>
            <div className="zara-meta mt-0.5">One brain, every surface</div>
          </div>
          <nav className="flex lg:flex-col overflow-x-auto lg:overflow-visible px-2 lg:px-3 py-2 gap-0.5 scrollbar-none">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className="block">
                {({ isActive }) => (
                  <span
                    className="zara-rail__item whitespace-nowrap w-full"
                    data-active={isActive ? 'true' : 'false'}
                  >
                    {item.label}
                  </span>
                )}
              </NavLink>
            ))}

          </nav>
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0">
          <div className="px-5 lg:px-10 py-6 lg:py-8 max-w-[1320px] mx-auto">
            <button
              onClick={() => navigate('/admin')}
              className="zara-link text-[11.5px] inline-flex items-center gap-1 mb-5 hidden lg:inline-flex"
            >
              <ArrowLeft className="h-3 w-3" /> Admin
            </button>
            <div className="flex items-start gap-3 mb-7">
              <div className="flex-1 min-w-0">
                <div className="zara-eyebrow">Zara</div>
                <h1 className="mt-1.5 text-[26px] lg:text-[30px] font-medium tracking-[-0.02em] leading-tight">
                  {title}
                </h1>
                {subtitle && (
                  <p className="mt-1.5 text-[13px] text-muted-foreground max-w-xl leading-relaxed">
                    {subtitle}
                  </p>
                )}
              </div>
              {actions && <div className="flex items-center gap-2 flex-wrap pt-2">{actions}</div>}
            </div>
            <hr className="zara-rule mb-7" />
            {children}
          </div>
        </main>
      </div>
    </AppLayout>
  );
}
