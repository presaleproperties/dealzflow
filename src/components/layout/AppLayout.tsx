import { ReactNode } from 'react';
import { Sidebar, useSidebarCollapsed } from './Sidebar';
import { MobileNav } from './MobileNav';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const isCollapsed = useSidebarCollapsed();

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main
        className={`pb-[80px] md:pb-[88px] lg:pb-6 min-h-screen transition-all duration-300 ease-in-out ${
          isCollapsed ? 'md:ml-[54px]' : 'md:ml-[218px]'
        }`}
      >
        {children}
      </main>
      <MobileNav />
    </div>
  );
}
