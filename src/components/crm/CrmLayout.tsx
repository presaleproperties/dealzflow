import { TopNav } from '@/components/layout/TopNav';
import { RightRail } from '@/components/layout/RightRail';
import { CrmRouteGuard } from './CrmRouteGuard';
import { CrmSubNav } from './CrmSubNav';
import { CrmSectionScope } from './CrmSectionScope';

interface CrmLayoutProps {
  requireRole?: ('owner' | 'admin')[];
  children?: React.ReactNode;
}

export function CrmLayout({ requireRole, children }: CrmLayoutProps) {
  return (
    <CrmRouteGuard requireRole={requireRole}>
      <CrmSectionScope />
      <div className="h-dvh flex flex-col bg-background overflow-hidden lg:pr-[52px]">
        <TopNav />
        <CrmSubNav />
        <div className="flex-1 min-h-0 p-3 sm:p-4 lg:p-6 flex flex-col overflow-y-auto">
          {children}
        </div>
      </div>
      <RightRail />
    </CrmRouteGuard>
  );
}
