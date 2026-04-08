import { useState, useEffect, useMemo, useRef } from 'react';
import { Eye, Trash2, Monitor, Smartphone, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateTemplate, useUpdateTemplate, useDeleteTemplate } from '@/hooks/useCrmEmail';
import type { CrmEmailTemplate } from '@/hooks/useCrmEmail';

const CATEGORIES = [
  { value: 'project-launch', label: 'Project Launch' },
  { value: 'follow-up', label: 'Follow-Up' },
  { value: 'nurture', label: 'Nurture' },
  { value: 'welcome', label: 'Welcome' },
  { value: 'general', label: 'General' },
];

function detectMergeTags(html: string): string[] {
  const matches = html.match(/\{\{[a-zA-Z_]+\}\}/g);
  return matches ? [...new Set(matches)] : [];
}

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
  const [htmlContent, setHtmlContent] = useState('');
  const [category, setCategory] = useState('general');
  const [previewWidth, setPreviewWidth] = useState<'desktop' | 'mobile'>('desktop');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const mergeTags = useMemo(() => detectMergeTags(htmlContent), [htmlContent]);

  useEffect(() => {
    if (template) {
      setName(template.name);
      setSubject(template.subject);
      setHtmlContent(template.body_html ?? '');
      setCategory((template as any).category ?? 'general');
    } else {
      setName(''); setSubject(''); setHtmlContent(''); setCategory('general');
    }
  }, [template, open]);

  // Update iframe preview
  useEffect(() => {
    if (iframeRef.current) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(htmlContent || '<p style="color:#888;font-family:sans-serif;padding:20px;">Paste your HTML email code here...</p>');
        doc.close();
      }
    }
  }, [htmlContent, previewWidth]);

  const handleSave = async () => {
    if (!name.trim() || !subject.trim()) return;
    const payload = {
      name: name.trim(),
      subject: subject.trim(),
      body_html: htmlContent,
      category,
      merge_tags: mergeTags,
    };
    if (isEdit && template) {
      await updateTemplate.mutateAsync({ id: template.id, updates: payload });
    } else {
      await createTemplate.mutateAsync(payload as any);
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
      <DialogContent className="sm:max-w-[95vw] lg:max-w-6xl max-h-[92vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Template' : 'Create Template'}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-2">
          {/* Left — Editor */}
          <div className="space-y-3">
            <div>
              <Label>Template Name *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. The Mason - VIP Launch" maxLength={200} className="h-9" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Subject Line</Label>
                <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Default subject when using this template" maxLength={200} className="h-9" />
              </div>
            </div>

            <div>
              <Label>HTML Content</Label>
              <Textarea
                value={htmlContent}
                onChange={e => setHtmlContent(e.target.value)}
                placeholder="Paste your HTML email code here. Copy it from your email builder on presaleproperties.com using the 'Copy HTML' button."
                className="min-h-[400px] font-mono text-xs bg-zinc-950 text-green-400 border-border/40 leading-relaxed"
                spellCheck={false}
              />
            </div>

            {/* Merge tags */}
            {mergeTags.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Merge Tags Detected</Label>
                <div className="flex flex-wrap gap-1.5">
                  {mergeTags.map(tag => (
                    <Badge key={tag} variant="secondary" className="text-[10px] font-mono">{tag}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-2">
              <div>
                {isEdit && (
                  <Button variant="destructive" size="sm" className="gap-1" onClick={handleDelete} disabled={deleteTemplate.isPending}>
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </Button>
                )}
              </div>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving || !name.trim() || !subject.trim()}
                className="bg-primary hover:bg-primary/90"
              >
                {saving ? 'Saving...' : isEdit ? 'Update Template' : 'Save Template'}
              </Button>
            </div>
          </div>

          {/* Right — Live Preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Live Preview</Label>
              <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-muted/30 p-0.5">
                <button
                  onClick={() => setPreviewWidth('desktop')}
                  className={`p-1.5 rounded-md transition-colors ${previewWidth === 'desktop' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  <Monitor className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setPreviewWidth('mobile')}
                  className={`p-1.5 rounded-md transition-colors ${previewWidth === 'mobile' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="flex justify-center">
              <div
                className="rounded-lg border border-border/40 bg-white overflow-hidden transition-all"
                style={{ width: previewWidth === 'desktop' ? '100%' : '375px', maxWidth: '100%' }}
              >
                <iframe
                  ref={iframeRef}
                  title="Template Preview"
                  className="w-full border-0"
                  style={{ height: '500px' }}
                  sandbox="allow-same-origin"
                />
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
