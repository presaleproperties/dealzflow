import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CampaignsTab } from '@/components/crm/email/CampaignsTab';
import { ComposeTab } from '@/components/crm/email/ComposeTab';
import { AnalyticsTab } from '@/components/crm/email/AnalyticsTab';

export default function CrmEmailPage() {
  return (
    <Tabs defaultValue="campaigns" className="space-y-4">
      <TabsList>
        <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
        <TabsTrigger value="compose">Compose</TabsTrigger>
        <TabsTrigger value="analytics">Analytics</TabsTrigger>
      </TabsList>
      <TabsContent value="campaigns"><CampaignsTab /></TabsContent>
      <TabsContent value="compose"><ComposeTab /></TabsContent>
      <TabsContent value="analytics"><AnalyticsTab /></TabsContent>
    </Tabs>
  );
}
