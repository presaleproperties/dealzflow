import { ReactNode } from 'react';
import { TopNav } from './TopNav';
import { MobileTabBar } from './MobileTabBar';
import { RightRail } from './RightRail';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="min-h-[calc(100vh-54px)] pb-[calc(58px+env(safe-area-inset-bottom,0px))] lg:pb-0 lg:pr-[52px]">
        {children}
      </main>
      <RightRail />
      <MobileTabBar />
    </div>
  );
}
