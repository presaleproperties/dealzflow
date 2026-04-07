import { Navigate } from 'react-router-dom';
import { useCrmAccess } from '@/contexts/CrmAccessContext';
import { PageLoader } from '@/components/ui/page-loader';

interface CrmRouteGuardProps {
  children: React.ReactNode;
  requireRole?: ('owner' | 'admin')[];
}

export function CrmRouteGuard({ children, requireRole }: CrmRouteGuardProps) {
  const { isMember, isLoading, role } = useCrmAccess();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <PageLoader />
      </div>
    );
  }

  if (!isMember) {
    return <Navigate to="/dashboard" replace />;
  }

  if (requireRole && role && !requireRole.includes(role as any)) {
    return <Navigate to="/crm/dashboard" replace />;
  }

  return <>{children}</>;
}
