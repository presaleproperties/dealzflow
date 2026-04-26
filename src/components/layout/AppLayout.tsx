import { ReactNode } from 'react';
import { TopNav } from './TopNav';
import { BottomNav } from './BottomNav';
import { RightRail } from './RightRail';


interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="h-[100dvh] flex flex-col bg-background overflow-hidden">
      <TopNav />
      <main
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain lg:pr-[52px]"
        style={{ paddingBottom: 'var(--bottom-nav-pad)' }}
      >
        {children}
      </main>
      <RightRail />
      <BottomNav />
    </div>
  );
}
