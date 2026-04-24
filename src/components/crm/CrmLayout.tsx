import { TopNav } from '@/components/layout/TopNav';
import { CrmRouteGuard } from './CrmRouteGuard';

interface CrmLayoutProps {
  requireRole?: ('owner' | 'admin')[];
  children?: React.ReactNode;
}

export function CrmLayout({ requireRole, children }: CrmLayoutProps) {
  return (
    <CrmRouteGuard requireRole={requireRole}>
      <div className="h-dvh flex flex-col bg-background overflow-hidden">
        <TopNav />
        <div className="flex-1 min-h-0 p-3 sm:p-4 lg:p-6 flex flex-col overflow-y-auto">
          {children}
        </div>
      </div>
    </CrmRouteGuard>
  );
}
