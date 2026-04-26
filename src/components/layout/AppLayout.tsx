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
  // Floating pill nav (≈58px) + 8px gap + breathing room.
  // CRM members get the mode-switch pill above the nav, adding ~38px.
  const navOffset = isMember ? 110 : 76;
  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main
        className="min-h-[calc(100vh-54px)] lg:pb-0 lg:pr-[52px]"
        style={{ paddingBottom: `calc(${navOffset}px + env(safe-area-inset-bottom, 0px))` }}
      >
        {children}
      </main>
      <RightRail />
      <BottomNav />
    </div>
  );
}
