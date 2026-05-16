import { TopNav } from '@/components/layout/TopNav';
import { RightRail } from '@/components/layout/RightRail';
import { BottomNav } from '@/components/layout/BottomNav';
import { MobileAppHeader } from '@/components/layout/MobileAppHeader';
import { CrmRouteGuard } from './CrmRouteGuard';
import { CrmSubNav } from './CrmSubNav';
import { CrmSideRail } from './CrmSideRail';
import { CrmSectionScope } from './CrmSectionScope';
import { PageTransition } from '@/components/layout/PageTransition';
import { useLocation } from 'react-router-dom';
import { SafeAreaPreview } from '@/components/dev/SafeAreaPreview';

interface CrmLayoutProps {
  requireRole?: ('owner' | 'admin')[];
  children?: React.ReactNode;
}

export function CrmLayout({ requireRole, children }: CrmLayoutProps) {
  const { pathname } = useLocation();
  // The chats shell (list pane + thread/empty pane) owns its own scroll on
  // every viewport, so the outer route container must NOT add a second
  // page-level scrollbar. Without this, mousewheel events anywhere on the
  // chats route bubble up and scroll the whole CRM page instead of the list.
  const isImmersiveChatsRoute = pathname === '/crm/chats' || pathname === '/crm/chats/new' || /^\/crm\/chats\/[^/]+/.test(pathname);
  const isImmersiveChatThread = isImmersiveChatsRoute;

  return (
    <CrmRouteGuard requireRole={requireRole}>
      <CrmSectionScope />
      <div
        className="h-dvh flex flex-col app-ambient-bg overflow-hidden lg:pr-[52px]"
      >
        <TopNav />
        <MobileAppHeader />
        <CrmSubNav />
        <div
          data-route-scroll-root="true"
          className={`flex-1 min-h-0 px-0 md:px-4 lg:px-6 pt-0 md:pt-3 lg:pt-4 flex flex-col overflow-x-hidden overscroll-contain md:pb-4 lg:pb-6 ${isImmersiveChatThread ? 'overflow-hidden' : 'overflow-y-auto'}`}
          style={{ paddingBottom: isImmersiveChatThread ? 0 : 'var(--bottom-nav-pad)' }}
        >
          {isImmersiveChatThread ? children : <PageTransition>{children}</PageTransition>}
        </div>
      </div>
      <RightRail />
      <BottomNav />
      <SafeAreaPreview />
    </CrmRouteGuard>
  );
}
