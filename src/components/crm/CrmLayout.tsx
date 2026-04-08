import { Sidebar, useSidebarCollapsed } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { CrmHeader } from './CrmHeader';
import { CrmMobileNav } from './CrmMobileNav';
import { CrmRouteGuard } from './CrmRouteGuard';

interface CrmLayoutProps {
  requireRole?: ('owner' | 'admin')[];
  children?: React.ReactNode;
}

export function CrmLayout({ requireRole, children }: CrmLayoutProps) {
  const isCollapsed = useSidebarCollapsed();

  return (
    <CrmRouteGuard requireRole={requireRole}>
      <div className="h-dvh flex flex-col bg-background overflow-hidden">
        <Sidebar />
        <div
          className={`flex flex-col flex-1 min-h-0 transition-all duration-300 ease-in-out ${
            isCollapsed ? 'md:ml-[54px]' : 'md:ml-[218px]'
          }`}
        >
          <CrmHeader />
          {/* Mobile: 12px padding, tablet: 16px, desktop: 24px. Bottom padding for mobile nav */}
          <div className="flex-1 overflow-y-auto min-h-0 p-3 sm:p-4 lg:p-6 pb-20 sm:pb-4 lg:pb-6">
            {children}
          </div>
        </div>
        <CrmMobileNav />
        <MobileNav />
      </div>
    </CrmRouteGuard>
  );
}
