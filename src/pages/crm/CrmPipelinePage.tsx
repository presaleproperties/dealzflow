import { PipelineKanban } from '@/components/crm/pipeline/PipelineKanban';
import { MobilePipelineView } from '@/components/crm/pipeline/MobilePipelineView';
import { useIsCompact } from '@/hooks/use-mobile';

// Phones (<768) get the stage-by-stage list; tablets and up get the kanban,
// which fits 2-3 columns at iPad widths and the full board on desktop.
export default function CrmPipelinePage() {
  const isCompact = useIsCompact();
  return isCompact ? <MobilePipelineView /> : <PipelineKanban />;
}
