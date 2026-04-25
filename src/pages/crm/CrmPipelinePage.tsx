import { PipelineKanban } from '@/components/crm/pipeline/PipelineKanban';
import { MobilePipelineView } from '@/components/crm/pipeline/MobilePipelineView';
import { useIsMobile } from '@/hooks/use-mobile';

export default function CrmPipelinePage() {
  const isMobile = useIsMobile();
  return isMobile ? <MobilePipelineView /> : <PipelineKanban />;
}
