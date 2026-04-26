import { TopNav } from '@/components/layout/TopNav';
import { RightRail } from '@/components/layout/RightRail';
import { BottomNav } from '@/components/layout/BottomNav';
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
      <div
        className="h-dvh flex flex-col bg-background overflow-hidden lg:pr-[52px]"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <TopNav />
        <CrmSubNav />
        <div className="flex-1 min-h-0 px-3 sm:px-4 lg:px-6 pt-1 sm:pt-2 lg:pt-4 flex flex-col overflow-y-auto overflow-x-hidden overscroll-contain pb-[calc(72px+env(safe-area-inset-bottom,0px))] lg:pb-6">
          {children}
        </div>
      </div>
      <RightRail />
      <BottomNav />
    </CrmRouteGuard>
  );
}
