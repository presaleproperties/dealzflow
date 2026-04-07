import { AppLayout } from '@/components/layout/AppLayout';
import { CrmHeader } from './CrmHeader';
import { CrmMobileNav } from './CrmMobileNav';
import { CrmRouteGuard } from './CrmRouteGuard';

interface CrmLayoutProps {
  requireRole?: ('owner' | 'admin')[];
  children?: React.ReactNode;
}

export function CrmLayout({ requireRole, children }: CrmLayoutProps) {
  return (
    <CrmRouteGuard requireRole={requireRole}>
      <AppLayout>
        <div className="flex flex-col flex-1 min-h-0">
          <CrmHeader />
          {/* Mobile: 12px padding, tablet: 16px, desktop: 24px. Bottom padding for mobile nav */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6 pb-20 sm:pb-4 lg:pb-6">
            {children}
          </div>
        </div>
        <CrmMobileNav />
      </AppLayout>
    </CrmRouteGuard>
  );
}
