import { Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useCrmAccess } from '@/contexts/CrmAccessContext';
import { PageLoader } from '@/components/ui/page-loader';

interface CrmRouteGuardProps {
  children: React.ReactNode;
  requireRole?: ('owner' | 'admin')[];
}

const GUARD_TIMEOUT_MS = 3000;

export function CrmRouteGuard({ children, requireRole }: CrmRouteGuardProps) {
  const { isMember, isLoading, role } = useCrmAccess();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (isLoading) {
      const timer = setTimeout(() => setTimedOut(true), GUARD_TIMEOUT_MS);
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  if (isLoading && !timedOut) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <PageLoader />
      </div>
    );
  }

  if ((isLoading && timedOut) || !isMember) {
    return <Navigate to="/dashboard" replace />;
  }

  if (requireRole && role && !requireRole.includes(role as any)) {
    return <Navigate to="/crm/leads" replace />;
  }

  return <>{children}</>;
}
