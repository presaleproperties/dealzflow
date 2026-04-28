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
import { DealDraftProvider } from "@/contexts/DealDraftContext";
import { CrmAccessProvider } from "@/contexts/CrmAccessContext";
import { CrmLayout } from "@/components/crm/CrmLayout";
import { useNativeShell } from "@/hooks/useNativeShell";
import { useStandaloneMode } from "@/hooks/useStandaloneMode";
import { useGlobalTapHaptics } from "@/hooks/useGlobalTapHaptics";
import { ScrollToTop } from "@/components/ScrollToTop";
import { usePresaleAgentSync } from "@/hooks/usePresaleAgentSync";
import { useHotLeadActivityToasts } from "@/hooks/useHotLeadActivityToasts";

import AuthPage from "./pages/AuthPage";
import DashboardPage from "./pages/DashboardPage";
import DealsPage from "./pages/DealsPage";
import NewDealPage from "./pages/NewDealPage";
import DealDetailPage from "./pages/DealDetailPage";
import PayoutsPage from "./pages/PayoutsPage";
import ExpensesPage from "./pages/ExpensesPage";
import ForecastPage from "./pages/ForecastPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import UnifiedSettingsPage from "./pages/UnifiedSettingsPage";
import AdminPage from "./pages/AdminPage";
import TermsPage from "./pages/TermsPage";
import PrivacyPage from "./pages/PrivacyPage";
import NetworkPage from "./pages/NetworkPage";
import PipelinePage from "./pages/PipelinePage";
import ClientInventoryPage from "./pages/ClientInventoryPage";

import NotFound from "./pages/NotFound";
import PendingApprovalPage from "./pages/PendingApprovalPage";
import ApiDocsPage from "./pages/ApiDocsPage";
import BridgeStatusPage from "./pages/admin/BridgeStatusPage";
import AdminProjectsPage from "./pages/admin/AdminProjectsPage";
import AgentProfilePage from "./pages/agent/AgentProfilePage";
import AgentComposePage from "./pages/agent/AgentComposePage";
import ResponsiveChecklistPage from "./pages/ResponsiveChecklistPage";
import MobileSpacingChecklistPage from "./pages/MobileSpacingChecklistPage";

// CRM pages

import CrmLeadsPage from "./pages/crm/CrmLeadsPage";
import CrmPipelinePage from "./pages/crm/CrmPipelinePage";
import CrmEmailPage from "./pages/crm/CrmEmailPage";
import CrmEmailWorkspacePage from "./pages/crm/CrmEmailWorkspacePage";
import CrmChatsPage from "./pages/crm/CrmChatsPage";
import CrmChatThreadPage from "./pages/crm/CrmChatThreadPage";

import CrmMarketingHubPage from "./pages/crm/CrmMarketingHubPage";
import CrmTemplatesPage from "./pages/crm/CrmTemplatesPage";
import CrmEmailBuilderPage from "./pages/crm/CrmEmailBuilderPage";
// CrmContactsPage removed — merged into CrmLeadsPage
import CrmAutomationsPage from "./pages/crm/CrmAutomationsPage";
import CrmCalendarPage from "./pages/crm/CrmCalendarPage";
import CrmReportsPage from "./pages/crm/CrmReportsPage";
import CrmSettingsPage from "./pages/crm/CrmSettingsPage";
import CrmIntegrationsPage from "./pages/crm/CrmIntegrationsPage";
import CrmBehaviorLeadsPage from "./pages/crm/CrmBehaviorLeadsPage";
import CrmBehaviorDashboardPage from "./pages/crm/CrmBehaviorDashboardPage";
import CrmSmsCenterPage from "./pages/crm/CrmSmsCenterPage";
import LeadDetailPage from "./pages/crm/LeadDetailPage";
import CrmSchedulerPage from "./pages/crm/CrmSchedulerPage";
import PublicAgentLandingPage from "./pages/public/PublicAgentLandingPage";
import PublicBookingPage from "./pages/public/PublicBookingPage";
import PublicBookingPaidPage from "./pages/public/PublicBookingPaidPage";

import { idbPersister } from "./lib/queryPersister";

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
  useHotLeadActivityToasts();
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <AuthProvider>
        <CrmAccessProvider>
          <DealDraftProvider>
            <TooltipProvider>
              <NativeBootstrap>
              <UpdateBanner />
              <Toaster />
              <Sonner />
              <QuietHoursConfirmHost />
              <BrowserRouter>
                <ScrollToTop />
                <Routes>
                  <Route path="/" element={<Navigate to="/auth" replace />} />
                  <Route path="/auth" element={<PublicRoute><AuthPage /></PublicRoute>} />
                  <Route path="/pending-approval" element={<PendingApprovalPage />} />
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
                  <Route path="/agent/profile" element={<ProtectedRoute><AgentProfilePage /></ProtectedRoute>} />
                  <Route path="/agent/compose" element={<ProtectedRoute><AgentComposePage /></ProtectedRoute>} />
                  <Route path="/dev/responsive" element={<ProtectedRoute><ResponsiveChecklistPage /></ProtectedRoute>} />
                  <Route path="/dev/mobile-spacing" element={<ProtectedRoute><MobileSpacingChecklistPage /></ProtectedRoute>} />

                  {/* CRM Routes — guarded by CrmRouteGuard inside CrmLayout */}
                  <Route path="/crm/dashboard" element={<Navigate to="/crm/leads" replace />} />
                  <Route path="/crm/leads" element={<ProtectedRoute><CrmLayout><CrmLeadsPage /></CrmLayout></ProtectedRoute>} />
                  <Route path="/crm/leads/:id" element={<ProtectedRoute><CrmLayout><LeadDetailPage /></CrmLayout></ProtectedRoute>} />
                  <Route path="/crm/pipeline" element={<ProtectedRoute><CrmLayout><CrmPipelinePage /></CrmLayout></ProtectedRoute>} />
                  <Route path="/crm/chats" element={<ProtectedRoute><CrmLayout><CrmChatsPage /></CrmLayout></ProtectedRoute>} />
                  <Route path="/crm/chats/:conversationId" element={<ProtectedRoute><CrmLayout><CrmChatThreadPage /></CrmLayout></ProtectedRoute>} />
                  <Route path="/crm/email" element={<ProtectedRoute><CrmLayout><CrmEmailWorkspacePage /></CrmLayout></ProtectedRoute>} />
                  <Route path="/crm/email/legacy" element={<ProtectedRoute><CrmLayout><CrmEmailPage /></CrmLayout></ProtectedRoute>} />
                  <Route path="/crm/sms" element={<ProtectedRoute><CrmLayout><CrmSmsCenterPage /></CrmLayout></ProtectedRoute>} />
                  <Route path="/crm/whatsapp" element={<Navigate to="/crm/leads" replace />} />
                  <Route path="/crm/templates" element={<ProtectedRoute><CrmLayout><CrmTemplatesPage /></CrmLayout></ProtectedRoute>} />
                  <Route path="/crm/marketing-hub" element={<ProtectedRoute><CrmLayout><CrmMarketingHubPage /></CrmLayout></ProtectedRoute>} />
                  <Route path="/crm/email-builder" element={<ProtectedRoute><CrmLayout><CrmEmailBuilderPage /></CrmLayout></ProtectedRoute>} />
                  <Route path="/crm/contacts" element={<Navigate to="/crm/leads" replace />} />
                  <Route path="/crm/automations" element={<ProtectedRoute><CrmLayout requireRole={['owner', 'admin']}><CrmAutomationsPage /></CrmLayout></ProtectedRoute>} />
                  <Route path="/crm/calendar" element={<ProtectedRoute><CrmLayout><CrmCalendarPage /></CrmLayout></ProtectedRoute>} />
                  <Route path="/crm/reports" element={<ProtectedRoute><CrmLayout><CrmReportsPage /></CrmLayout></ProtectedRoute>} />
                  <Route path="/crm/settings" element={<ProtectedRoute><CrmLayout requireRole={['owner', 'admin']}><CrmSettingsPage /></CrmLayout></ProtectedRoute>} />
                  <Route path="/crm/integrations" element={<ProtectedRoute><CrmLayout requireRole={['owner', 'admin']}><CrmIntegrationsPage /></CrmLayout></ProtectedRoute>} />
                  <Route path="/crm/behavior-leads" element={<ProtectedRoute><CrmLayout requireRole={['owner', 'admin']}><CrmBehaviorLeadsPage /></CrmLayout></ProtectedRoute>} />
                  <Route path="/crm/behavior" element={<ProtectedRoute><CrmLayout><CrmBehaviorDashboardPage /></CrmLayout></ProtectedRoute>} />
                  <Route path="/crm/scheduler" element={<ProtectedRoute><CrmLayout><CrmSchedulerPage /></CrmLayout></ProtectedRoute>} />

                  {/* Public booking pages — no auth. /r/ is the neutral short URL; /book/ kept as alias. */}
                  <Route path="/r/:teamSlug" element={<PublicAgentLandingPage />} />
                  <Route path="/r/:teamSlug/:eventSlug" element={<PublicBookingPage />} />
                  <Route path="/r/:teamSlug/:eventSlug/paid" element={<PublicBookingPaidPage />} />
                  <Route path="/book/:teamSlug" element={<PublicAgentLandingPage />} />
                  <Route path="/book/:teamSlug/:eventSlug" element={<PublicBookingPage />} />
                  <Route path="/book/:teamSlug/:eventSlug/paid" element={<PublicBookingPaidPage />} />

                  <Route path="*" element={<NotFound />} />
                </Routes>
              </BrowserRouter>
              </NativeBootstrap>
            </TooltipProvider>
          </DealDraftProvider>
        </CrmAccessProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
