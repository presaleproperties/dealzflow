import { ReactNode } from 'react';
import { TopNav } from './TopNav';
import { BottomNav } from './BottomNav';
import { RightRail } from './RightRail';
import { MobileAppHeader } from './MobileAppHeader';
import { PageTransition } from './PageTransition';
import { SafeAreaPreview } from '@/components/dev/SafeAreaPreview';
import { AgentOnboardingWizard } from '@/components/onboarding/AgentOnboardingWizard';
import { OnboardingBanner } from '@/components/onboarding/OnboardingBanner';


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
        style={{ paddingBottom: 'var(--bottom-nav-pad)' }}
      >
        <OnboardingBanner />
        <PageTransition>{children}</PageTransition>
      </main>
      <RightRail />
      <BottomNav />
      <AgentOnboardingWizard />
      <SafeAreaPreview />
    </div>
  );
}
