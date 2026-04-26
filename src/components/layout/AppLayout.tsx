import { ReactNode } from 'react';
import { TopNav } from './TopNav';
import { BottomNav } from './BottomNav';
import { RightRail } from './RightRail';
import { useCrmAccess } from '@/contexts/CrmAccessContext';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { isMember } = useCrmAccess();
  // Pill adds ~38px to the nav for CRM members
  const navOffset = isMember ? 96 : 58;
  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main
        className="min-h-[calc(100vh-54px)] pb-[calc(72px+env(safe-area-inset-bottom,0px))] lg:pb-0 lg:pr-[52px]"
        style={{ paddingBottom: `calc(${navOffset}px + env(safe-area-inset-bottom, 0px))` }}
      >
        {children}
      </main>
      <RightRail />
      <BottomNav />
    </div>
  );
}
