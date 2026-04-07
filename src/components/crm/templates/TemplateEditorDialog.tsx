import { useState, useEffect } from 'react';
import { Eye, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RichTextEditor } from '@/components/crm/email/RichTextEditor';
import { useCreateTemplate, useUpdateTemplate, useDeleteTemplate } from '@/hooks/useCrmEmail';
import { PROJECTS } from '@/hooks/useCrmContacts';
import type { CrmEmailTemplate } from '@/hooks/useCrmEmail';

interface Props {
  template: CrmEmailTemplate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TemplateEditorDialog({ template, open, onOpenChange }: Props) {
  const createTemplate = useCreateTemplate();
  const updateTemplate = useUpdateTemplate();
  const deleteTemplate = useDeleteTemplate();

  const isEdit = !!template;
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [project, setProject] = useState('');
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    if (template) {
      setName(template.name);
      setSubject(template.subject);
      setBody(template.body_html ?? '');
      setProject(template.project ?? '');
    } else {
      setName(''); setSubject(''); setBody(''); setProject('');
    }
    setPreviewing(false);
  }, [template, open]);

  const handleSave = async () => {
    if (!name.trim() || !subject.trim()) return;
    if (isEdit && template) {
      await updateTemplate.mutateAsync({
        id: template.id,
        updates: { name: name.trim(), subject: subject.trim(), body_html: body, project: project || null },
      });
    } else {
      await createTemplate.mutateAsync({
        name: name.trim(),
        subject: subject.trim(),
        body_html: body,
        project: project || undefined,
      });
    }
    onOpenChange(false);
  };

  const handleDelete = async () => {
    if (!template) return;
    await deleteTemplate.mutateAsync(template.id);
    onOpenChange(false);
  };

  const saving = createTemplate.isPending || updateTemplate.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Template' : 'Create Template'}</DialogTitle>
        </DialogHeader>

        {previewing ? (
          <div className="space-y-3">
            <div className="bg-white dark:bg-card border border-border rounded-xl p-6 shadow-sm">
              <h2 className="text-lg font-bold text-foreground mb-4">{subject}</h2>
              <div className="prose prose-sm max-w-none text-foreground" dangerouslySetInnerHTML={{ __html: body || '<p class="text-muted-foreground">No content</p>' }} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPreviewing(false)}>Back to Editor</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 pt-1">
            <div>
              <Label>Template Name *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Eden — Initial Brochure" maxLength={200} />
            </div>
            <div>
              <Label>Subject Line *</Label>
              <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Email subject" maxLength={200} />
            </div>
            <div>
              <Label>Project</Label>
              <Select value={project} onValueChange={setProject}>
                <SelectTrigger><SelectValue placeholder="Select project..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="General">General</SelectItem>
                  {PROJECTS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Body</Label>
              <RichTextEditor content={body} onChange={setBody} placeholder="Write your template content..." />
            </div>
            <div className="flex items-center justify-between pt-2">
              <div className="flex gap-2">
                {isEdit && (
                  <Button variant="destructive" size="sm" className="gap-1" onClick={handleDelete} disabled={deleteTemplate.isPending}>
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-1" onClick={() => setPreviewing(true)} disabled={!subject.trim()}>
                  <Eye className="w-3.5 h-3.5" /> Preview
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving || !name.trim() || !subject.trim()}>
                  {saving ? 'Saving...' : isEdit ? 'Update' : 'Create'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
