import { createContext, useContext, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type CrmRole = 'owner' | 'admin' | 'agent' | 'viewer';

interface CrmAccessState {
  isMember: boolean;
  isLoading: boolean;
  role: CrmRole | null;
  isOwnerOrAdmin: boolean;
}

const CrmAccessContext = createContext<CrmAccessState>({
  isMember: false,
  isLoading: true,
  role: null,
  isOwnerOrAdmin: false,
});

export function CrmAccessProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['crm_team_membership', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('crm_team')
        .select('role, is_active')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) {
        console.error('CRM team check error:', error);
        return null;
      }
      return data;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const value = useMemo<CrmAccessState>(() => {
    const isActive = data?.is_active === true;
    const role = isActive ? (data?.role as CrmRole) : null;
    return {
      isMember: isActive,
      isLoading,
      role,
      isOwnerOrAdmin: role === 'owner' || role === 'admin',
    };
  }, [data, isLoading]);

  return (
    <CrmAccessContext.Provider value={value}>
      {children}
    </CrmAccessContext.Provider>
  );
}

export function useCrmAccess() {
  return useContext(CrmAccessContext);
}
