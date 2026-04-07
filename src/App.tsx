import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { UpdateBanner } from "@/components/UpdateBanner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useAdmin";
import { ThemeProvider } from "@/components/ThemeProvider";
import { PageLoader } from "@/components/ui/page-loader";
import { DealDraftProvider } from "@/contexts/DealDraftContext";
import { CrmAccessProvider } from "@/contexts/CrmAccessContext";
import { CrmLayout } from "@/components/crm/CrmLayout";

import AuthPage from "./pages/AuthPage";
import DashboardPage from "./pages/DashboardPage";
import DealsPage from "./pages/DealsPage";
import NewDealPage from "./pages/NewDealPage";
import DealDetailPage from "./pages/DealDetailPage";
import PayoutsPage from "./pages/PayoutsPage";
import ExpensesPage from "./pages/ExpensesPage";
import ForecastPage from "./pages/ForecastPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import SettingsPage from "./pages/SettingsPage";
import AdminPage from "./pages/AdminPage";
import TermsPage from "./pages/TermsPage";
import PrivacyPage from "./pages/PrivacyPage";
import NetworkPage from "./pages/NetworkPage";
import PipelinePage from "./pages/PipelinePage";
import ClientInventoryPage from "./pages/ClientInventoryPage";
import CommandCenterPage from "./pages/CommandCenterPage";
import NotFound from "./pages/NotFound";
import ApiDocsPage from "./pages/ApiDocsPage";

// CRM pages
import CrmDashboardPage from "./pages/crm/CrmDashboardPage";
import CrmLeadsPage from "./pages/crm/CrmLeadsPage";
import CrmPipelinePage from "./pages/crm/CrmPipelinePage";
import CrmEmailPage from "./pages/crm/CrmEmailPage";
import CrmWhatsAppPage from "./pages/crm/CrmWhatsAppPage";
import CrmTemplatesPage from "./pages/crm/CrmTemplatesPage";
import CrmContactsPage from "./pages/crm/CrmContactsPage";
import CrmAutomationsPage from "./pages/crm/CrmAutomationsPage";
import CrmCalendarPage from "./pages/crm/CrmCalendarPage";
import CrmReportsPage from "./pages/crm/CrmReportsPage";
import CrmSettingsPage from "./pages/crm/CrmSettingsPage";
import LeadDetailPage from "./pages/crm/LeadDetailPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
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
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <PageLoader />
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/auth" replace />;
  }
  
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { data: isAdmin, isLoading: isCheckingAdmin } = useIsAdmin();
  
  if (loading || isCheckingAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <PageLoader />
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/auth" replace />;
  }
  
  if (!isAdmin) {
    return <Navigate to="/command-center" replace />;
  }
  
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }
  
  if (user) {
    return <Navigate to="/command-center" replace />;
  }
  
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <AuthProvider>
        <CrmAccessProvider>
          <DealDraftProvider>
            <TooltipProvider>
              <UpdateBanner />
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <Routes>
                  <Route path="/" element={<Navigate to="/auth" replace />} />
                  <Route path="/auth" element={<PublicRoute><AuthPage /></PublicRoute>} />
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
                  <Route path="/command-center" element={<ProtectedRoute><CommandCenterPage /></ProtectedRoute>} />
                  
                  <Route path="/network" element={<ProtectedRoute><NetworkPage /></ProtectedRoute>} />
                  <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
                  <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
                  <Route path="/api-docs" element={<AdminRoute><ApiDocsPage /></AdminRoute>} />

                  {/* CRM Routes — guarded by CrmRouteGuard inside CrmLayout */}
                  <Route path="/crm/dashboard" element={<ProtectedRoute><CrmLayout><CrmDashboardPage /></CrmLayout></ProtectedRoute>} />
                  <Route path="/crm/leads" element={<ProtectedRoute><CrmLayout><CrmLeadsPage /></CrmLayout></ProtectedRoute>} />
                  <Route path="/crm/leads/:id" element={<ProtectedRoute><CrmLayout><LeadDetailPage /></CrmLayout></ProtectedRoute>} />
                  <Route path="/crm/pipeline" element={<ProtectedRoute><CrmLayout><CrmPipelinePage /></CrmLayout></ProtectedRoute>} />
                  <Route path="/crm/email" element={<ProtectedRoute><CrmLayout><CrmEmailPage /></CrmLayout></ProtectedRoute>} />
                  <Route path="/crm/whatsapp" element={<ProtectedRoute><CrmLayout><CrmWhatsAppPage /></CrmLayout></ProtectedRoute>} />
                  <Route path="/crm/templates" element={<ProtectedRoute><CrmLayout><CrmTemplatesPage /></CrmLayout></ProtectedRoute>} />
                  <Route path="/crm/contacts" element={<ProtectedRoute><CrmLayout><CrmContactsPage /></CrmLayout></ProtectedRoute>} />
                  <Route path="/crm/automations" element={<ProtectedRoute><CrmLayout requireRole={['owner', 'admin']}><CrmAutomationsPage /></CrmLayout></ProtectedRoute>} />
                  <Route path="/crm/calendar" element={<ProtectedRoute><CrmLayout><CrmCalendarPage /></CrmLayout></ProtectedRoute>} />
                  <Route path="/crm/reports" element={<ProtectedRoute><CrmLayout><CrmReportsPage /></CrmLayout></ProtectedRoute>} />
                  <Route path="/crm/settings" element={<ProtectedRoute><CrmLayout requireRole={['owner', 'admin']}><CrmSettingsPage /></CrmLayout></ProtectedRoute>} />

                  <Route path="*" element={<NotFound />} />
                </Routes>
              </BrowserRouter>
            </TooltipProvider>
          </DealDraftProvider>
        </CrmAccessProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
