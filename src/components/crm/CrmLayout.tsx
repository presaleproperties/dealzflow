import { Outlet } from 'react-router-dom';
import { CrmHeader } from './CrmHeader';
import { CrmRouteGuard } from './CrmRouteGuard';

interface CrmLayoutProps {
  requireRole?: ('owner' | 'admin')[];
  children?: React.ReactNode;
}

export function CrmLayout({ requireRole, children }: CrmLayoutProps) {
  return (
    <CrmRouteGuard requireRole={requireRole}>
      <div className="flex flex-col flex-1 min-h-0">
        <CrmHeader />
        <div className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children || <Outlet />}
        </div>
      </div>
    </CrmRouteGuard>
  );
}
