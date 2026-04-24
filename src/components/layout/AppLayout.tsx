import { ReactNode } from 'react';
import { TopNav } from './TopNav';
import { MobileTabBar } from './MobileTabBar';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main
        className="min-h-[calc(100vh-54px)]"
        style={{ paddingBottom: 'calc(58px + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="lg:[--mobile-tab-pad:0px]" />
        {children}
      </main>
      <MobileTabBar />
    </div>
  );
}
