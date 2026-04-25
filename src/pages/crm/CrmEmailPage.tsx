import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Mail, Workflow, Activity, Megaphone, BarChart3 } from 'lucide-react';
import CrmMarketingHubPage from './CrmMarketingHubPage';
import CrmEmailCenterPage from './CrmEmailCenterPage';
import CrmEmailWorkflowsPage from './CrmEmailWorkflowsPage';
import CrmEmailHealthPage from './CrmEmailHealthPage';
import CrmEmailCampaignsPage from './CrmEmailCampaignsPage';
import CrmEmailAnalyticsPage from './CrmEmailAnalyticsPage';

export default function CrmEmailPage() {
  const [tab, setTab] = useState('hub');

  return (
    <Tabs value={tab} onValueChange={setTab} className="w-full space-y-4">
      <TabsList className="w-full sm:w-auto grid grid-cols-6 sm:flex">
        <TabsTrigger value="hub" className="text-[12px] sm:text-sm gap-1.5"><Megaphone className="h-3.5 w-3.5" /><span className="hidden sm:inline">Marketing Hub</span></TabsTrigger>
        <TabsTrigger value="center" className="text-[12px] sm:text-sm gap-1.5"><Mail className="h-3.5 w-3.5" /><span className="hidden sm:inline">Inbox</span></TabsTrigger>
        <TabsTrigger value="campaigns" className="text-[12px] sm:text-sm gap-1.5"><Megaphone className="h-3.5 w-3.5" /><span className="hidden sm:inline">Campaigns</span></TabsTrigger>
        <TabsTrigger value="workflows" className="text-[12px] sm:text-sm gap-1.5"><Workflow className="h-3.5 w-3.5" /><span className="hidden sm:inline">Workflows</span></TabsTrigger>
        <TabsTrigger value="analytics" className="text-[12px] sm:text-sm gap-1.5"><BarChart3 className="h-3.5 w-3.5" /><span className="hidden sm:inline">Analytics</span></TabsTrigger>
        <TabsTrigger value="health" className="text-[12px] sm:text-sm gap-1.5"><Activity className="h-3.5 w-3.5" /><span className="hidden sm:inline">Health</span></TabsTrigger>
      </TabsList>

      <TabsContent value="hub" className="mt-0">{tab === 'hub' && <CrmMarketingHubPage />}</TabsContent>
      <TabsContent value="center" className="mt-0">{tab === 'center' && <CrmEmailCenterPage />}</TabsContent>
      <TabsContent value="campaigns" className="mt-0">{tab === 'campaigns' && <CrmEmailCampaignsPage />}</TabsContent>
      <TabsContent value="workflows" className="mt-0">{tab === 'workflows' && <CrmEmailWorkflowsPage />}</TabsContent>
      <TabsContent value="analytics" className="mt-0">{tab === 'analytics' && <CrmEmailAnalyticsPage />}</TabsContent>
      <TabsContent value="health" className="mt-0">{tab === 'health' && <CrmEmailHealthPage />}</TabsContent>
    </Tabs>
  );
}
