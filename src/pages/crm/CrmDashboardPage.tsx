import { CrmKpiCards } from '@/components/crm/dashboard/CrmKpiCards';
import { CrmLeadsOverTime } from '@/components/crm/dashboard/CrmLeadsOverTime';
import { CrmLeadsBySource } from '@/components/crm/dashboard/CrmLeadsBySource';
import { CrmRecentActivity } from '@/components/crm/dashboard/CrmRecentActivity';
import { CrmPipelineSnapshot } from '@/components/crm/dashboard/CrmPipelineSnapshot';
import { DataHealthCard } from '@/components/crm/dashboard/DataHealthCard';

export default function CrmDashboardPage() {
  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6">
      <CrmKpiCards />
      <DataHealthCard />
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 sm:gap-4 lg:gap-6">
        <div className="lg:col-span-3">
          <CrmLeadsOverTime />
        </div>
        <div className="lg:col-span-2">
          <CrmLeadsBySource />
        </div>
      </div>
      <CrmRecentActivity />
      <CrmPipelineSnapshot />
    </div>
  );
}
