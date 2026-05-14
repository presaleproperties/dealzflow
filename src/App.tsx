import { lazy, Suspense } from "react";
import { LazyMotion, MotionConfig, domAnimation } from "framer-motion";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { QuietHoursConfirmHost } from "@/components/crm/sms/QuietHoursConfirm";
import { UpdateBanner } from "@/components/UpdateBanner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useAdmin";
import { useProfile } from "@/hooks/useProfile";
import { ThemeProvider } from "@/components/ThemeProvider";
import { PageLoader } from "@/components/ui/page-loader";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { DealDraftProvider } from "@/contexts/DealDraftContext";
import { CrmAccessProvider } from "@/contexts/CrmAccessContext";
import { CrmLayout } from "@/components/crm/CrmLayout";
import { useNativeShell } from "@/hooks/useNativeShell";
import { useStandaloneMode } from "@/hooks/useStandaloneMode";
import { useGlobalTapHaptics } from "@/hooks/useGlobalTapHaptics";
import { ScrollToTop } from "@/components/ScrollToTop";
import { usePresaleAgentSync } from "@/hooks/usePresaleAgentSync";
import { usePresaleSignatureAutoImport } from "@/hooks/usePresaleSignatureAutoImport";
import { EmailIdentitySetupDialog } from "@/components/email/EmailIdentitySetupDialog";
import { SessionRestoringBanner } from "@/components/auth/SessionRestoringBanner";
import { RouteHydrationGate } from "@/components/auth/RouteHydrationGate";
import { useHotLeadActivityToasts } from "@/hooks/useHotLeadActivityToasts";
import { useLiveNotificationToasts } from "@/hooks/useLiveNotificationToasts";
import { useVisualViewport } from "@/hooks/useVisualViewport";
import { DialerWidget } from "@/components/crm/dialer/DialerWidget";
import { NewChatDialog } from "@/components/crm/chats/NewChatDialog";
import { ViewportDebugOverlay } from "@/components/dev/ViewportDebugOverlay";

// ── Eager-loaded pages ────────────────────────────────────────────────────
// Auth + the most common landing destinations stay eager so first paint is
// instant. Everything else is code-split below to keep the initial bundle
// small (was the main cause of long splash screens).
import AuthPage from "./pages/AuthPage";
import DashboardPage from "./pages/DashboardPage";
import NotFound from "./pages/NotFound";
import PendingApprovalPage from "./pages/PendingApprovalPage";

// ── Lazy-loaded pages ─────────────────────────────────────────────────────
const DealsPage = lazy(() => import("./pages/DealsPage"));
const NewDealPage = lazy(() => import("./pages/NewDealPage"));
const DealDetailPage = lazy(() => import("./pages/DealDetailPage"));
const PayoutsPage = lazy(() => import("./pages/PayoutsPage"));
const ExpensesPage = lazy(() => import("./pages/ExpensesPage"));
const ForecastPage = lazy(() => import("./pages/ForecastPage"));
const AnalyticsPage = lazy(() => import("./pages/AnalyticsPage"));
const UnifiedSettingsPage = lazy(() => import("./pages/UnifiedSettingsPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const TermsPage = lazy(() => import("./pages/TermsPage"));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage"));
const NetworkPage = lazy(() => import("./pages/NetworkPage"));
const PipelinePage = lazy(() => import("./pages/PipelinePage"));
const ClientInventoryPage = lazy(() => import("./pages/ClientInventoryPage"));
const AcceptInvitePage = lazy(() => import("./pages/AcceptInvitePage"));
const ChangePasswordPage = lazy(() => import("./pages/ChangePasswordPage"));
const ApiDocsPage = lazy(() => import("./pages/ApiDocsPage"));
const BridgeStatusPage = lazy(() => import("./pages/admin/BridgeStatusPage"));
const PresaleWebhookLogPage = lazy(() => import("./pages/admin/PresaleWebhookLogPage"));
const AdminProjectsPage = lazy(() => import("./pages/admin/AdminProjectsPage"));
const WebhookValidationPage = lazy(() => import("./pages/admin/WebhookValidationPage"));
const AuditLogPage = lazy(() => import("./pages/admin/AuditLogPage"));
const ZaraSettingsPage = lazy(() => import("./pages/admin/ZaraSettingsPage"));
const ZaraDashboardPage = lazy(() => import("./pages/admin/ZaraDashboardPage"));
const ZaraDraftsPage = lazy(() => import("./pages/admin/ZaraDraftsPage"));
const ZaraOverviewPage = lazy(() => import("./pages/admin/ZaraOverviewPage"));
const ZaraJobsPage = lazy(() => import("./pages/admin/ZaraJobsPage"));
const ZaraBehaviorPage = lazy(() => import("./pages/admin/ZaraBehaviorPage"));
const ZaraGapsPage = lazy(() => import("./pages/admin/ZaraGapsPage"));
const ZaraCostPage = lazy(() => import("./pages/admin/ZaraCostPage"));
const ZaraTrainingPage = lazy(() => import("./pages/admin/ZaraTrainingPage"));
const ZaraPlaybooksPage = lazy(() => import("./pages/admin/ZaraPlaybooksPage"));
const CrmTrashPage = lazy(() => import("./pages/crm/CrmTrashPage"));
const AgentProfilePage = lazy(() => import("./pages/agent/AgentProfilePage"));
const AgentComposePage = lazy(() => import("./pages/agent/AgentComposePage"));
const ResponsiveChecklistPage = lazy(() => import("./pages/ResponsiveChecklistPage"));
const MobileSpacingChecklistPage = lazy(() => import("./pages/MobileSpacingChecklistPage"));
const HelpOnboardingPage = lazy(() => import("./pages/HelpOnboardingPage"));

// CRM pages — also lazy. Leads + LeadDetail stay eager because they're
// the primary CRM landing surfaces.
import CrmLeadsPage from "./pages/crm/CrmLeadsPage";
import LeadDetailPage from "./pages/crm/LeadDetailPage";

const CrmPipelinePage = lazy(() => import("./pages/crm/CrmPipelinePage"));
const CrmEmailWorkspacePage = lazy(() => import("./pages/crm/CrmEmailWorkspacePage"));
const CrmChatsPage = lazy(() => import("./pages/crm/CrmChatsPage"));
const CrmChatThreadPage = lazy(() => import("./pages/crm/CrmChatThreadPage"));
const CrmChatsShell = lazy(() => import("./pages/crm/CrmChatsShell"));
const CrmMarketingHubPage = lazy(() => import("./pages/crm/CrmMarketingHubPage"));
const CrmTemplatesPage = lazy(() => import("./pages/crm/CrmTemplatesPage"));
const CrmEmailBuilderPage = lazy(() => import("./pages/crm/CrmEmailBuilderPage"));
const CrmAutomationsPage = lazy(() => import("./pages/crm/CrmAutomationsPage"));
const CrmCalendarPage = lazy(() => import("./pages/crm/CrmCalendarPage"));
const CrmReportsPage = lazy(() => import("./pages/crm/CrmReportsPage"));
const CrmSettingsPage = lazy(() => import("./pages/crm/CrmSettingsPage"));
const CrmIntegrationsPage = lazy(() => import("./pages/crm/CrmIntegrationsPage"));
const CrmBehaviorLeadsPage = lazy(() => import("./pages/crm/CrmBehaviorLeadsPage"));
const CrmBehaviorDashboardPage = lazy(() => import("./pages/crm/CrmBehaviorDashboardPage"));

const CrmInboxPage = lazy(() => import("./pages/crm/CrmInboxPage"));
const CrmSchedulerPage = lazy(() => import("./pages/crm/CrmSchedulerPage"));
const PublicAgentLandingPage = lazy(() => import("./pages/public/PublicAgentLandingPage"));
const PublicBookingPage = lazy(() => import("./pages/public/PublicBookingPage"));
const PublicBookingPaidPage = lazy(() => import("./pages/public/PublicBookingPaidPage"));
const PublicBookingCancelPage = lazy(() => import("./pages/public/PublicBookingCancelPage"));

import { idbPersister } from "./lib/queryPersister";

/** Shared Suspense fallback — uses the same PageLoader as auth gates so
 * route transitions feel cohesive. */
function RouteFallback() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-background">
      <PageLoader />
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      // IndexedDB persister — only the queries listed in queryPersister.ts
      // get hydrated from disk on cold open (instant lead detail / chat
      // thread reopens), then revalidate from the network in the background.
      persister: idbPersister.persisterFn,
      retry: (failureCount, error: any) => {
        if (error?.message?.includes('authenticated') || error?.message?.includes('Unauthorized')) return false;
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();

  if (loading || (user && profileLoading)) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <PageLoader />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Gate: only approved users can use the workspace
  if (profile && profile.workspace_status !== 'approved') {
    return <Navigate to="/pending-approval" replace />;
  }

  // Gate: invited users on a temp password must set a real one first
  if (profile?.must_change_password) {
    return <Navigate to="/auth/change-password" replace />;
  }

  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { data: isAdmin, isLoading: isCheckingAdmin } = useIsAdmin();
  
  if (loading || isCheckingAdmin) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <PageLoader />
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/auth" replace />;
  }
  
  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }
  
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }
  
  if (user) {
    return <Navigate to="/dashboard" replace />;
  }
  
  return <>{children}</>;
}

function NativeBootstrap({ children }: { children: React.ReactNode }) {
  useNativeShell();
  useStandaloneMode();
  useGlobalTapHaptics();
  usePresaleAgentSync();
  usePresaleSignatureAutoImport();
  useHotLeadActivityToasts();
  useLiveNotificationToasts();
  // Toggle html.keyboard-open globally so iOS PWA chat/email composers
  // never get hidden behind the soft keyboard.
  useVisualViewport();
  return (
    <>
      {children}
      <SessionRestoringBanner />
      <EmailIdentitySetupDialog />
      <DialerWidget />
      <NewChatDialog />
      <ViewportDebugOverlay />
    </>
  );
}


const App = () => (
  <AppErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <AuthProvider>
          <CrmAccessProvider>
            <DealDraftProvider>
              <TooltipProvider>
                <LazyMotion features={domAnimation}>
                <MotionConfig reducedMotion="user" transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}>
                <NativeBootstrap>
                <UpdateBanner />
                <Toaster />
                <Sonner />
                <QuietHoursConfirmHost />
                <BrowserRouter>
                  <ScrollToTop />
                  <Suspense fallback={<RouteFallback />}>
                  <RouteHydrationGate>
                  <Routes>
                    <Route path="/" element={<Navigate to="/auth" replace />} />
                    <Route path="/auth" element={<PublicRoute><AuthPage /></PublicRoute>} />
                    <Route path="/pending-approval" element={<PendingApprovalPage />} />
                    <Route path="/accept-invite" element={<AcceptInvitePage />} />
                    <Route path="/auth/change-password" element={<ChangePasswordPage />} />
                    <Route path="/terms" element={<TermsPage />} />
                    <Route path="/privacy" element={<PrivacyPage />} />

                    <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
                    <Route path="/pipeline" element={<ProtectedRoute><PipelinePage /></ProtectedRoute>} />
                    <Route path="/deals" element={<ProtectedRoute><DealsPage /></ProtectedRoute>} />
                    <Route path="/deals/new" element={<ProtectedRoute><NewDealPage /></ProtectedRoute>} />
                    <Route path="/deals/:id" element={<ProtectedRoute><DealDetailPage /></ProtectedRoute>} />
                    <Route path="/payouts" element={<ProtectedRoute><PayoutsPage /></ProtectedRoute>} />
                    <Route path="/expenses" element={<ProtectedRoute><ExpensesPage /></ProtectedRoute>} />
                    <Route path="/forecast" element={<ProtectedRoute><ForecastPage /></ProtectedRoute>} />
                    <Route path="/analytics" element={<ProtectedRoute><AnalyticsPage /></ProtectedRoute>} />
                    <Route path="/inventory" element={<ProtectedRoute><ClientInventoryPage /></ProtectedRoute>} />
                    <Route path="/command-center" element={<Navigate to="/dashboard" replace />} />

                    <Route path="/network" element={<ProtectedRoute><NetworkPage /></ProtectedRoute>} />
                    <Route path="/settings" element={<ProtectedRoute><UnifiedSettingsPage /></ProtectedRoute>} />
                    <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
                    <Route path="/api-docs" element={<AdminRoute><ApiDocsPage /></AdminRoute>} />
                    <Route path="/admin/bridge-status" element={<AdminRoute><BridgeStatusPage /></AdminRoute>} />
                    <Route path="/admin/projects" element={<AdminRoute><AdminProjectsPage /></AdminRoute>} />
                    <Route path="/admin/webhook-validation" element={<AdminRoute><WebhookValidationPage /></AdminRoute>} />
                    <Route path="/admin/presale-webhooks" element={<AdminRoute><PresaleWebhookLogPage /></AdminRoute>} />
                    <Route path="/admin/audit" element={<AdminRoute><AuditLogPage /></AdminRoute>} />
                    <Route path="/admin/zara" element={<AdminRoute><ZaraOverviewPage /></AdminRoute>} />
                    <Route path="/admin/zara/live" element={<AdminRoute><ZaraDashboardPage /></AdminRoute>} />
                    <Route path="/admin/zara/settings" element={<AdminRoute><ZaraSettingsPage /></AdminRoute>} />
                    <Route path="/admin/zara/drafts" element={<AdminRoute><ZaraDraftsPage /></AdminRoute>} />
                    <Route path="/crm/trash" element={<ProtectedRoute><CrmLayout requireRole={['owner', 'admin']}><CrmTrashPage /></CrmLayout></ProtectedRoute>} />
                    <Route path="/agent/profile" element={<ProtectedRoute><AgentProfilePage /></ProtectedRoute>} />
                    <Route path="/agent/compose" element={<ProtectedRoute><AgentComposePage /></ProtectedRoute>} />
                    <Route path="/dev/responsive" element={<ProtectedRoute><ResponsiveChecklistPage /></ProtectedRoute>} />
                    <Route path="/dev/mobile-spacing" element={<ProtectedRoute><MobileSpacingChecklistPage /></ProtectedRoute>} />
                    <Route path="/help/onboarding" element={<ProtectedRoute><HelpOnboardingPage /></ProtectedRoute>} />

                    {/* CRM Routes — guarded by CrmRouteGuard inside CrmLayout */}
                    <Route path="/crm/dashboard" element={<Navigate to="/crm/leads" replace />} />
                    <Route path="/crm/leads" element={<ProtectedRoute><CrmLayout><CrmLeadsPage /></CrmLayout></ProtectedRoute>} />
                    <Route path="/crm/leads/:id" element={<ProtectedRoute><CrmLayout><LeadDetailPage /></CrmLayout></ProtectedRoute>} />
                    <Route path="/crm/pipeline" element={<ProtectedRoute><CrmLayout><CrmPipelinePage /></CrmLayout></ProtectedRoute>} />
                    <Route path="/crm/chats" element={<ProtectedRoute><CrmLayout><CrmChatsShell /></CrmLayout></ProtectedRoute>} />
                    <Route path="/crm/chats/:conversationId" element={<ProtectedRoute><CrmLayout><CrmChatsShell /></CrmLayout></ProtectedRoute>} />
                    <Route path="/crm/inbox" element={<ProtectedRoute><CrmLayout><CrmInboxPage /></CrmLayout></ProtectedRoute>} />
                    <Route path="/crm/email" element={<ProtectedRoute><CrmLayout><CrmEmailWorkspacePage /></CrmLayout></ProtectedRoute>} />
                    <Route path="/crm/email/legacy" element={<Navigate to="/crm/email" replace />} />
                    <Route path="/crm/sms" element={<Navigate to="/crm/chats" replace />} />
                    <Route path="/crm/whatsapp" element={<Navigate to="/crm/leads" replace />} />
                    <Route path="/crm/templates" element={<ProtectedRoute><CrmLayout><CrmTemplatesPage /></CrmLayout></ProtectedRoute>} />
                    <Route path="/crm/marketing-hub" element={<ProtectedRoute><CrmLayout><CrmMarketingHubPage /></CrmLayout></ProtectedRoute>} />
                    <Route path="/crm/email-builder" element={<ProtectedRoute><CrmLayout><CrmEmailBuilderPage /></CrmLayout></ProtectedRoute>} />
                    <Route path="/crm/contacts" element={<Navigate to="/crm/leads" replace />} />
                    <Route path="/crm/automations" element={<ProtectedRoute><CrmLayout requireRole={['owner', 'admin']}><CrmAutomationsPage /></CrmLayout></ProtectedRoute>} />
                    <Route path="/crm/calendar" element={<ProtectedRoute><CrmLayout><CrmCalendarPage /></CrmLayout></ProtectedRoute>} />
                    <Route path="/crm/reports" element={<ProtectedRoute><CrmLayout><CrmReportsPage /></CrmLayout></ProtectedRoute>} />
                    <Route path="/crm/settings" element={<ProtectedRoute><CrmLayout><CrmSettingsPage /></CrmLayout></ProtectedRoute>} />
                    <Route path="/crm/integrations" element={<ProtectedRoute><CrmLayout requireRole={['owner', 'admin']}><CrmIntegrationsPage /></CrmLayout></ProtectedRoute>} />
                    <Route path="/crm/behavior-leads" element={<ProtectedRoute><CrmLayout requireRole={['owner', 'admin']}><CrmBehaviorLeadsPage /></CrmLayout></ProtectedRoute>} />
                    <Route path="/crm/behavior" element={<ProtectedRoute><CrmLayout><CrmBehaviorDashboardPage /></CrmLayout></ProtectedRoute>} />
                    <Route path="/crm/scheduler" element={<ProtectedRoute><CrmLayout><CrmSchedulerPage /></CrmLayout></ProtectedRoute>} />

                    {/* Public booking pages — no auth. /r/ is the neutral short URL; /book/ kept as alias. */}
                    <Route path="/r/:teamSlug" element={<PublicAgentLandingPage />} />
                    <Route path="/r/:teamSlug/cancel" element={<PublicBookingCancelPage />} />
                    <Route path="/r/:teamSlug/:eventSlug" element={<PublicBookingPage />} />
                    <Route path="/r/:teamSlug/:eventSlug/paid" element={<PublicBookingPaidPage />} />
                    <Route path="/book/:teamSlug" element={<PublicAgentLandingPage />} />
                    <Route path="/book/:teamSlug/cancel" element={<PublicBookingCancelPage />} />
                    <Route path="/book/:teamSlug/:eventSlug" element={<PublicBookingPage />} />
                    <Route path="/book/:teamSlug/:eventSlug/paid" element={<PublicBookingPaidPage />} />

                    <Route path="*" element={<NotFound />} />
                  </Routes>
                  </RouteHydrationGate>
                  </Suspense>
                </BrowserRouter>
                </NativeBootstrap>
                </MotionConfig>
                </LazyMotion>
              </TooltipProvider>
            </DealDraftProvider>
          </CrmAccessProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </AppErrorBoundary>
);

export default App;
