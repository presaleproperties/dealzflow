import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ArrowLeft, Monitor, Smartphone, Maximize2, Copy, Send, X, Save, Trash2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  useCreateEmailTemplate,
  useUpdateEmailTemplate,
  useSoftDeleteEmailTemplate,
  type EmailTemplate,
} from '@/hooks/useEmailTemplates';

const CATEGORIES = [
  { value: 'project_launch', label: 'Project Launch' },
  { value: 'nurture', label: 'Nurture' },
  { value: 'follow_up', label: 'Follow-Up' },
  { value: 'newsletter', label: 'Newsletter' },
  { value: 'announcement', label: 'Announcement' },
  { value: 're_engagement', label: 'Re-Engagement' },
  { value: 'custom', label: 'Custom' },
];

const PROJECT_OPTIONS = ['eden', 'rail_district', 'mason', 'the_era', 'concord_gardens', 'park_george'];
const AREA_OPTIONS = ['surrey', 'langley', 'burnaby', 'coquitlam', 'vancouver', 'richmond'];

function detectMergeTags(html: string): string[] {
  const matches = html.match(/\{\{[a-zA-Z_]+\}\}/g);
  return matches ? [...new Set(matches)] : [];
}

interface Props {
  template: EmailTemplate | null;
  onClose: () => void;
  onSendCampaign?: (tpl: EmailTemplate) => void;
}

export function TemplateEditor({ template, onClose, onSendCampaign }: Props) {
  const createTemplate = useCreateEmailTemplate();
  const updateTemplate = useUpdateEmailTemplate();
  const softDelete = useSoftDeleteEmailTemplate();
  const isEdit = !!template;

  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [previewText, setPreviewText] = useState('');
  const [htmlContent, setHtmlContent] = useState('');
  const [category, setCategory] = useState('custom');
  const [projectTags, setProjectTags] = useState<string[]>([]);
  const [areaTags, setAreaTags] = useState<string[]>([]);
  const [previewWidth, setPreviewWidth] = useState<'desktop' | 'mobile'>('desktop');
  const [fullPreview, setFullPreview] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const fullIframeRef = useRef<HTMLIFrameElement>(null);

  const mergeTags = useMemo(() => detectMergeTags(htmlContent), [htmlContent]);

  useEffect(() => {
    if (template) {
      setName(template.name);
      setSubject(template.subject ?? '');
      setPreviewText(template.preview_text ?? '');
      setHtmlContent(template.html_content ?? '');
      setCategory(template.category ?? 'custom');
      setProjectTags(template.project_tags ?? []);
      setAreaTags(template.area_tags ?? []);
    }
  }, [template]);

  const updateIframe = useCallback((ref: React.RefObject<HTMLIFrameElement | null>, html: string) => {
    if (ref.current) {
      const doc = ref.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(html || '<p style="color:#888;font-family:sans-serif;padding:20px;">Paste your HTML email code here...</p>');
        doc.close();
      }
    }
  }, []);

  useEffect(() => { updateIframe(iframeRef, htmlContent); }, [htmlContent, previewWidth, updateIframe]);
  useEffect(() => { if (fullPreview) updateIframe(fullIframeRef, htmlContent); }, [htmlContent, fullPreview, updateIframe]);

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    const payload = {
      name: name.trim(),
      subject: subject.trim() || null,
      preview_text: previewText.trim() || null,
      html_content: htmlContent,
      category,
      project_tags: projectTags,
      area_tags: areaTags,
      source: 'dealflow' as const,
    };
    if (isEdit && template) {
      await updateTemplate.mutateAsync({ id: template.id, updates: payload });
    } else {
      await createTemplate.mutateAsync(payload as any);
    }
    onClose();
  };

  const handleDelete = async () => {
    if (!template) return;
    await softDelete.mutateAsync(template.id);
    onClose();
  };

  const handleCopyHtml = () => {
    navigator.clipboard.writeText(htmlContent);
    toast.success('HTML copied to clipboard');
  };

  const handleDuplicate = async () => {
    await createTemplate.mutateAsync({
      name: `${name} (Copy)`,
      subject,
      preview_text: previewText,
      html_content: htmlContent,
      category,
      project_tags: projectTags,
      area_tags: areaTags,
      source: 'dealflow',
    } as any);
    toast.success('Template duplicated');
  };

  const toggleTag = (tag: string, list: string[], setList: (v: string[]) => void) => {
    setList(list.includes(tag) ? list.filter(t => t !== tag) : [...list, tag]);
  };

  const saving = createTemplate.isPending || updateTemplate.isPending;

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={onClose}>
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
          <h1 className="text-lg font-bold text-foreground">{isEdit ? 'Edit Template' : 'New Template'}</h1>
          {isEdit && template?.source && (
            <Badge variant="outline" className="text-[10px]">Source: {template.source}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isEdit && (
            <>
              {onSendCampaign && template && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onSendCampaign(template)}>
                  <Mail className="w-3.5 h-3.5" /> Use in Campaign
                </Button>
              )}
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handleDuplicate}>
                <Copy className="w-3.5 h-3.5" /> Duplicate
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={handleDelete}>
                <Trash2 className="w-3.5 h-3.5" /> Archive
              </Button>
            </>
          )}
          <Button size="sm" onClick={handleSave} disabled={saving || !name.trim()} className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground">
            <Save className="w-3.5 h-3.5" /> {saving ? 'Saving...' : isEdit ? 'Update' : 'Save Template'}
          </Button>
        </div>
      </div>

      {/* Split view */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" style={{ minHeight: 'calc(100dvh - 220px)' }}>
        {/* Left — Form */}
        <div className="space-y-4 bg-card/50 border border-border/40 rounded-xl p-4 overflow-y-auto" style={{ maxHeight: 'calc(100dvh - 220px)' }}>
          <div>
            <Label>Template Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Eden Phase 2 - VIP Launch" className="h-9" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Subject Line</Label>
              <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Email subject" className="h-9" />
            </div>
            <div>
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Preview Text</Label>
            <Input value={previewText} onChange={e => setPreviewText(e.target.value)} placeholder="Text shown in inbox preview" className="h-9" />
          </div>

          {/* Project Tags */}
          <div>
            <Label className="text-xs">Project Tags</Label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {PROJECT_OPTIONS.map(p => (
                <Badge
                  key={p}
                  variant={projectTags.includes(p) ? 'default' : 'outline'}
                  className="cursor-pointer text-[10px] transition-colors"
                  onClick={() => toggleTag(p, projectTags, setProjectTags)}
                >
                  {p.replace(/_/g, ' ')}
                </Badge>
              ))}
            </div>
          </div>

          {/* Area Tags */}
          <div>
            <Label className="text-xs">Area Tags</Label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {AREA_OPTIONS.map(a => (
                <Badge
                  key={a}
                  variant={areaTags.includes(a) ? 'default' : 'outline'}
                  className="cursor-pointer text-[10px] transition-colors"
                  onClick={() => toggleTag(a, areaTags, setAreaTags)}
                >
                  {a}
                </Badge>
              ))}
            </div>
          </div>

          {/* HTML Editor */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label>HTML Content</Label>
              <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 text-muted-foreground" onClick={handleCopyHtml}>
                <Copy className="w-3 h-3" /> Copy HTML
              </Button>
            </div>
            <Textarea
              value={htmlContent}
              onChange={e => setHtmlContent(e.target.value)}
              placeholder="Paste your HTML email code here..."
              className="min-h-[300px] font-mono text-xs bg-zinc-950 text-green-400 border-border/40 leading-relaxed"
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
        </div>

        {/* Right — Live Preview */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold">Live Preview</Label>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-0.5 rounded-lg border border-border/60 bg-muted/30 p-0.5">
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
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setFullPreview(true)}>
                <Maximize2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {/* Subject + preview text bar */}
          {(subject || previewText) && (
            <div className="rounded-lg border border-border/40 bg-muted/20 p-2.5 space-y-0.5">
              {subject && <p className="text-xs font-semibold text-foreground truncate">Subject: {subject}</p>}
              {previewText && <p className="text-[11px] text-muted-foreground truncate">Preview: {previewText}</p>}
            </div>
          )}

          <div className="flex justify-center">
            <div
              className="rounded-lg border border-border/40 bg-white overflow-hidden transition-all"
              style={{ width: previewWidth === 'desktop' ? '100%' : '375px', maxWidth: '100%' }}
            >
              <iframe
                ref={iframeRef}
                title="Template Preview"
                className="w-full border-0"
                style={{ height: 'calc(100dvh - 320px)' }}
                sandbox="allow-same-origin"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Full-screen preview modal */}
      <Dialog open={fullPreview} onOpenChange={setFullPreview}>
        <DialogContent className="max-w-[95vw] h-[90vh] p-0 gap-0" aria-describedby={undefined}>
          <DialogTitle className="sr-only">Template Preview</DialogTitle>
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40 bg-card">
            <div className="space-y-0.5">
              {subject && <p className="text-sm font-semibold text-foreground">{subject}</p>}
              {previewText && <p className="text-xs text-muted-foreground">{previewText}</p>}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handleCopyHtml}>
                <Copy className="w-3.5 h-3.5" /> Copy HTML
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" disabled>
                <Send className="w-3.5 h-3.5" /> Send Test Email
              </Button>
            </div>
          </div>
          <div className="flex-1 bg-white overflow-auto">
            <iframe
              ref={fullIframeRef}
              title="Full Preview"
              className="w-full h-full border-0"
              sandbox="allow-same-origin"
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
