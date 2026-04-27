import { ReactNode } from 'react';
import { TopNav } from './TopNav';
import { BottomNav } from './BottomNav';
import { RightRail } from './RightRail';
import { MobileAppHeader } from './MobileAppHeader';


interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="h-[100dvh] flex flex-col app-ambient-bg overflow-hidden">
      <TopNav />
      <MobileAppHeader />
      <main
        data-route-scroll-root="true"
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain lg:pr-[52px]"
      >
        {children}
      </main>
      <BottomNav />
      <RightRail />
    </div>
  );
}
