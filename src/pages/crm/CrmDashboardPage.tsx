import { CrmLayout } from '@/components/crm/CrmLayout';
import { CrmKpiCards } from '@/components/crm/dashboard/CrmKpiCards';
import { CrmLeadsOverTime } from '@/components/crm/dashboard/CrmLeadsOverTime';
import { CrmLeadsBySource } from '@/components/crm/dashboard/CrmLeadsBySource';
import { CrmRecentActivity } from '@/components/crm/dashboard/CrmRecentActivity';
import { CrmPipelineSnapshot } from '@/components/crm/dashboard/CrmPipelineSnapshot';

export default function CrmDashboardPage() {
  return (
    <CrmLayout>
      <div className="space-y-6">
        {/* Row 1 — KPI Cards */}
        <CrmKpiCards />

        {/* Row 2 — Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3">
            <CrmLeadsOverTime />
          </div>
          <div className="lg:col-span-2">
            <CrmLeadsBySource />
          </div>
        </div>

        {/* Row 3 — Recent Activity */}
        <CrmRecentActivity />

        {/* Row 4 — Pipeline Snapshot */}
        <CrmPipelineSnapshot />
      </div>
    </CrmLayout>
  );
}
