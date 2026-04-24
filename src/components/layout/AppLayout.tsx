import { ReactNode } from 'react';
import { TopNav } from './TopNav';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="min-h-[calc(100vh-54px)]">
        {children}
      </main>
    </div>
  );
}
