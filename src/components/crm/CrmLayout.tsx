import { TopNav } from '@/components/layout/TopNav';
import { RightRail } from '@/components/layout/RightRail';
import { BottomNav } from '@/components/layout/BottomNav';
import { MobileAppHeader } from '@/components/layout/MobileAppHeader';
import { CrmRouteGuard } from './CrmRouteGuard';
import { CrmSubNav } from './CrmSubNav';
import { CrmSectionScope } from './CrmSectionScope';
import { SafeAreaPreview } from '@/components/dev/SafeAreaPreview';

interface CrmLayoutProps {
  requireRole?: ('owner' | 'admin')[];
  children?: React.ReactNode;
}

export function CrmLayout({ requireRole, children }: CrmLayoutProps) {
  return (
    <CrmRouteGuard requireRole={requireRole}>
      <CrmSectionScope />
      <div
        className="h-dvh flex flex-col app-ambient-bg overflow-hidden lg:pr-[52px]"
      >
        <TopNav />
        <MobileAppHeader />
        <CrmSubNav />
        <div
          data-route-scroll-root="true"
          className="flex-1 min-h-0 px-0 lg:px-6 pt-0 lg:pt-4 flex flex-col overflow-y-auto overflow-x-hidden overscroll-contain lg:pb-6"
          style={{ paddingBottom: 'var(--bottom-nav-pad)' }}
        >
          {children}
        </div>
      </div>
      <RightRail />
      <BottomNav />
      <SafeAreaPreview />
    </CrmRouteGuard>
  );
}
