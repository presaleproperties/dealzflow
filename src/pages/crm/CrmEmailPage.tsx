import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Mail, Wand2, Workflow, Activity, FileText } from 'lucide-react';
import CrmEmailCenterPage from './CrmEmailCenterPage';
import CrmEmailBuilderPage from './CrmEmailBuilderPage';
import CrmEmailWorkflowsPage from './CrmEmailWorkflowsPage';
import CrmEmailHealthPage from './CrmEmailHealthPage';
import CrmTemplatesPage from './CrmTemplatesPage';

export default function CrmEmailPage() {
  const [tab, setTab] = useState('center');

  return (
    <Tabs value={tab} onValueChange={setTab} className="w-full space-y-4">
      <TabsList className="w-full sm:w-auto grid grid-cols-5 sm:flex">
        <TabsTrigger value="center" className="text-[12px] sm:text-sm gap-1.5"><Mail className="h-3.5 w-3.5" /><span className="hidden sm:inline">Center</span></TabsTrigger>
        <TabsTrigger value="builder" className="text-[12px] sm:text-sm gap-1.5"><Wand2 className="h-3.5 w-3.5" /><span className="hidden sm:inline">Builder</span></TabsTrigger>
        <TabsTrigger value="templates" className="text-[12px] sm:text-sm gap-1.5"><FileText className="h-3.5 w-3.5" /><span className="hidden sm:inline">Templates</span></TabsTrigger>
        <TabsTrigger value="workflows" className="text-[12px] sm:text-sm gap-1.5"><Workflow className="h-3.5 w-3.5" /><span className="hidden sm:inline">Workflows</span></TabsTrigger>
        <TabsTrigger value="health" className="text-[12px] sm:text-sm gap-1.5"><Activity className="h-3.5 w-3.5" /><span className="hidden sm:inline">Health & ROI</span></TabsTrigger>
      </TabsList>

      <TabsContent value="center" className="mt-0">{tab === 'center' && <CrmEmailCenterPage />}</TabsContent>
      <TabsContent value="builder" className="mt-0">{tab === 'builder' && <CrmEmailBuilderPage />}</TabsContent>
      <TabsContent value="templates" className="mt-0">{tab === 'templates' && <CrmTemplatesPage />}</TabsContent>
      <TabsContent value="workflows" className="mt-0">{tab === 'workflows' && <CrmEmailWorkflowsPage />}</TabsContent>
      <TabsContent value="health" className="mt-0">{tab === 'health' && <CrmEmailHealthPage />}</TabsContent>
    </Tabs>
  );
}
