import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CampaignsTab } from '@/components/crm/email/CampaignsTab';
import { ComposeTab } from '@/components/crm/email/ComposeTab';
import { AnalyticsTab } from '@/components/crm/email/AnalyticsTab';

export default function CrmEmailPage() {
  return (
    <Tabs defaultValue="campaigns" className="space-y-3 sm:space-y-4">
      <TabsList className="w-full sm:w-auto grid grid-cols-3 sm:flex">
        <TabsTrigger value="campaigns" className="text-[13px] sm:text-sm min-h-[44px] sm:min-h-0">Campaigns</TabsTrigger>
        <TabsTrigger value="compose" className="text-[13px] sm:text-sm min-h-[44px] sm:min-h-0">Compose</TabsTrigger>
        <TabsTrigger value="analytics" className="text-[13px] sm:text-sm min-h-[44px] sm:min-h-0">Analytics</TabsTrigger>
      </TabsList>
      <TabsContent value="campaigns"><CampaignsTab /></TabsContent>
      <TabsContent value="compose"><ComposeTab /></TabsContent>
      <TabsContent value="analytics"><AnalyticsTab /></TabsContent>
    </Tabs>
  );
}
