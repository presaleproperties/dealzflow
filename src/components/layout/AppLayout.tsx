import { ReactNode } from 'react';
import { TopNav } from './TopNav';
import { BottomNav } from './BottomNav';
import { RightRail } from './RightRail';


interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main
        className="min-h-[calc(100vh-54px)] lg:pr-[52px]"
        style={{ paddingBottom: 'var(--bottom-nav-pad)' }}
      >
        {children}
      </main>
      <RightRail />
      <BottomNav />
    </div>
  );
}
