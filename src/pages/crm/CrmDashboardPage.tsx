import { CommandCenterStats } from '@/components/crm/dashboard/CommandCenterStats';
import { HotLeadsColumn } from '@/components/crm/dashboard/HotLeadsColumn';
import { ActiveConversationsColumn } from '@/components/crm/dashboard/ActiveConversationsColumn';
import { ActivityFeedColumn } from '@/components/crm/dashboard/ActivityFeedColumn';
import { PipelinePulse } from '@/components/crm/dashboard/PipelinePulse';

export default function CrmDashboardPage() {
  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-5">
      {/* Row 1: Stat Bar */}
      <CommandCenterStats />

      {/* Row 2: Three-Column Command Center */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {/* Column 1: Hot Leads */}
        <HotLeadsColumn />

        {/* Column 2: Active Conversations */}
        <ActiveConversationsColumn />

        {/* Column 3: Activity Feed + Pipeline Pulse */}
        <div className="space-y-3 sm:space-y-4 md:col-span-2 lg:col-span-1">
          <ActivityFeedColumn />
          <PipelinePulse />
        </div>
      </div>
    </div>
  );
}
