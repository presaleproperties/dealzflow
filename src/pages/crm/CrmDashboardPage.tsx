import { CommandCenterStats } from '@/components/crm/dashboard/CommandCenterStats';
import { HotLeadsColumn } from '@/components/crm/dashboard/HotLeadsColumn';
import { ActivityFeedColumn } from '@/components/crm/dashboard/ActivityFeedColumn';
import { PipelinePulse } from '@/components/crm/dashboard/PipelinePulse';
import { TasksWidget } from '@/components/crm/dashboard/TasksWidget';
import { LeadConversionFunnel } from '@/components/crm/dashboard/LeadConversionFunnel';

export default function CrmDashboardPage() {
  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-5">
      {/* Row 1: Stat Bar */}
      <CommandCenterStats />

      {/* Row 2: Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        {/* Column 1: Hot Leads */}
        <HotLeadsColumn />

        {/* Column 2: Tasks + Activity + Insights */}
        <div className="space-y-3 sm:space-y-4">
          <TasksWidget />
          <ActivityFeedColumn />
        </div>
      </div>

      {/* Row 3: Funnel + Pulse side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        <LeadConversionFunnel />
        <PipelinePulse />
      </div>
    </div>
  );
}
