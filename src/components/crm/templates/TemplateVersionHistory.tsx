import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { History, RotateCcw, Loader2, Eye, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Version {
  id: string;
  version_number: number;
  name: string;
  subject: string | null;
  preview_text: string | null;
  html_content: string;
  category: string | null;
  project_tags: string[];
  area_tags: string[];
  detected_variables: string[];
  change_note: string | null;
  created_by: string | null;
  created_at: string;
}

interface Props {
  templateId: string;
  /** Called when the user wants to load a version's content back into the editor. */
  onRestore: (v: Version) => void;
}

export function TemplateVersionHistory({ templateId, onRestore }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [previewing, setPreviewing] = useState<Version | null>(null);

  const { data: versions = [], isLoading } = useQuery({
    queryKey: ['email-template-versions', templateId],
    enabled: open && !!templateId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_template_versions' as any)
        .select('*')
        .eq('template_id', templateId)
        .order('version_number', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Version[];
    },
  });

  const restore = useMutation({
    mutationFn: async (v: Version) => {
      const { error } = await supabase
        .from('email_templates' as any)
        .update({
          name: v.name,
          subject: v.subject,
          preview_text: v.preview_text,
          html_content: v.html_content,
          category: v.category,
          project_tags: v.project_tags,
          area_tags: v.area_tags,
        } as any)
        .eq('id', templateId);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['email-templates'] });
      qc.invalidateQueries({ queryKey: ['email-template-versions', templateId] });
      onRestore(v);
      setOpen(false);
      toast.success(`Restored to version ${v.version_number}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <History className="w-3.5 h-3.5" /> History
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-3xl max-h-[85vh] p-0 overflow-hidden flex flex-col">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/40">
            <DialogTitle className="text-base">Version history</DialogTitle>
          </DialogHeader>

          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : versions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">No versions yet.</p>
          ) : (
            <ScrollArea className="flex-1">
              <div className="divide-y divide-border/30">
                {versions.map((v, idx) => (
                  <div key={v.id} className="flex items-start gap-3 px-5 py-3 hover:bg-muted/30 transition-colors">
                    <div className="shrink-0 w-12 text-center">
                      <div className="text-xs font-mono font-semibold text-foreground">v{v.version_number}</div>
                      {idx === 0 && <Badge variant="secondary" className="text-[9px] mt-0.5">Current</Badge>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{v.name}</p>
                      {v.subject && <p className="text-xs text-muted-foreground truncate">Subject: {v.subject}</p>}
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                        <span>{format(new Date(v.created_at), 'MMM d, yyyy h:mm a')}</span>
                        {v.detected_variables?.length > 0 && (
                          <span>· {v.detected_variables.length} variables</span>
                        )}
                        <span>· {v.html_content.length.toLocaleString()} chars</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setPreviewing(v)} title="Preview">
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      {idx !== 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1 text-xs"
                          onClick={() => restore.mutate(v)}
                          disabled={restore.isPending}
                        >
                          {restore.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                          Restore
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

      {/* Preview drawer */}
      <Dialog open={!!previewing} onOpenChange={() => setPreviewing(null)}>
        <DialogContent className="max-w-4xl h-[85vh] p-0 overflow-hidden flex flex-col">
          <DialogHeader className="px-5 pt-4 pb-3 border-b border-border/40 flex-row items-center justify-between space-y-0">
            <div>
              <DialogTitle className="text-sm">v{previewing?.version_number} — {previewing?.name}</DialogTitle>
              {previewing?.subject && <p className="text-xs text-muted-foreground mt-0.5">{previewing.subject}</p>}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setPreviewing(null)}><X className="h-4 w-4" /></Button>
          </DialogHeader>
          <iframe
            title="version-preview"
            srcDoc={previewing?.html_content || '<p style="padding:24px;color:#888;font-family:sans-serif">Empty version</p>'}
            className="flex-1 border-0 bg-white"
            sandbox="allow-same-origin"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
