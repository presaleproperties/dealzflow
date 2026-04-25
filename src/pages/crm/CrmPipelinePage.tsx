import { PipelineKanban } from '@/components/crm/pipeline/PipelineKanban';
import { CrmLeadsMobileShell } from '@/components/crm/CrmLeadsMobileShell';
import { useIsMobile } from '@/hooks/use-mobile';

export default function CrmPipelinePage() {
  const isMobile = useIsMobile();
  return (
    <CrmLeadsMobileShell initialTab="pipeline" active={isMobile}>
      <PipelineKanban />
    </CrmLeadsMobileShell>
  );
}
