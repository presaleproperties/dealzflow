import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ArrowLeft, Monitor, Smartphone, Maximize2, Copy, Send, X, Save, Trash2, Mail, Eye as EyeIcon, AlertTriangle } from 'lucide-react';
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
import { VariablePicker } from './VariablePicker';
import { TemplateVersionHistory } from './TemplateVersionHistory';
import { renderWithSampleData, findUnknownTokens } from '@/lib/emailVariables';
import { applySignatureBlock, hasSignatureBlock, stripSignatureBlock } from '@/lib/templateSignature';
import { usePresaleAgent } from '@/stores/usePresaleAgent';
import { useEmailSettings } from '@/hooks/useEmailSettings';
import { Switch } from '@/components/ui/switch';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

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

interface TemplateDraft {
  name?: string;
  subject?: string | null;
  preview_text?: string | null;
  html_content?: string;
  category?: string;
  project_tags?: string[];
  area_tags?: string[];
}

interface Props {
  template: EmailTemplate | null;
  /** Optional starting values when creating a new template (e.g. cloning a Presale asset). */
  initialDraft?: TemplateDraft;
  onClose: () => void;
  onSendCampaign?: (tpl: EmailTemplate) => void;
}

export function TemplateEditor({ template, initialDraft, onClose, onSendCampaign }: Props) {
  const createTemplate = useCreateEmailTemplate();
  const updateTemplate = useUpdateEmailTemplate();
  const softDelete = useSoftDeleteEmailTemplate();
  const isEdit = !!template;
  const { agent } = usePresaleAgent();
  const { data: emailSettings } = useEmailSettings();
  const signatureHtml = (agent?.signatureHtml || emailSettings?.signature_html || '').trim();

  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [previewText, setPreviewText] = useState('');
  const [htmlContent, setHtmlContent] = useState('');
  const [category, setCategory] = useState('custom');
  const [projectTags, setProjectTags] = useState<string[]>([]);
  const [areaTags, setAreaTags] = useState<string[]>([]);
  const [previewWidth, setPreviewWidth] = useState<'desktop' | 'mobile'>('desktop');
  const [fullPreview, setFullPreview] = useState(false);
  const [withSampleData, setWithSampleData] = useState(true);
  // ON by default for new drafts; for an existing template, ON only if it
  // already has a stamped signature block (so we never silently mutate
  // legacy templates that have a manually-pasted signature).
  const [appendSignature, setAppendSignature] = useState<boolean>(true);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const fullIframeRef = useRef<HTMLIFrameElement>(null);
  const htmlRef = useRef<HTMLTextAreaElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const lastFocused = useRef<'html' | 'subject'>('html');

  const mergeTags = useMemo(() => detectMergeTags(htmlContent + ' ' + subject), [htmlContent, subject]);
  const unknownTokens = useMemo(() => findUnknownTokens(htmlContent + ' ' + subject), [htmlContent, subject]);

  useEffect(() => {
    if (template) {
      const tplHtml = template.html_content ?? '';
      setName(template.name);
      setSubject(template.subject ?? '');
      setPreviewText(template.preview_text ?? '');
      // Strip any stamped block while editing so the textarea stays clean;
      // it gets re-applied at save time when the toggle is on.
      setHtmlContent(stripSignatureBlock(tplHtml));
      setCategory(template.category ?? 'custom');
      setProjectTags(template.project_tags ?? []);
      setAreaTags(template.area_tags ?? []);
      setAppendSignature(hasSignatureBlock(tplHtml));
    } else if (initialDraft) {
      setName(initialDraft.name ?? '');
      setSubject(initialDraft.subject ?? '');
      setPreviewText(initialDraft.preview_text ?? '');
      setHtmlContent(stripSignatureBlock(initialDraft.html_content ?? ''));
      setCategory(initialDraft.category ?? 'custom');
      setProjectTags(initialDraft.project_tags ?? []);
      setAreaTags(initialDraft.area_tags ?? []);
      setAppendSignature(true);
    }
  }, [template, initialDraft]);

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

  // Compose preview = body + (optional) signature, then render sample data
  const composedHtml = useMemo(
    () => (appendSignature && signatureHtml ? applySignatureBlock(htmlContent, signatureHtml) : htmlContent),
    [htmlContent, appendSignature, signatureHtml],
  );
  const renderedHtml = useMemo(
    () => (withSampleData ? renderWithSampleData(composedHtml) : composedHtml),
    [composedHtml, withSampleData],
  );

  useEffect(() => { updateIframe(iframeRef, renderedHtml); }, [renderedHtml, previewWidth, updateIframe]);
  useEffect(() => { if (fullPreview) updateIframe(fullIframeRef, renderedHtml); }, [renderedHtml, fullPreview, updateIframe]);

  /** Insert a snippet at the caret of whichever input was last focused. */
  const insertSnippet = useCallback((snippet: string) => {
    if (lastFocused.current === 'subject') {
      const el = subjectRef.current;
      if (!el) { setSubject(s => s + snippet); return; }
      const start = el.selectionStart ?? subject.length;
      const end = el.selectionEnd ?? subject.length;
      const next = subject.slice(0, start) + snippet + subject.slice(end);
      setSubject(next);
      requestAnimationFrame(() => {
        el.focus();
        el.selectionStart = el.selectionEnd = start + snippet.length;
      });
      return;
    }
    const el = htmlRef.current;
    if (!el) { setHtmlContent(h => h + snippet); return; }
    const start = el.selectionStart ?? htmlContent.length;
    const end = el.selectionEnd ?? htmlContent.length;
    const next = htmlContent.slice(0, start) + snippet + htmlContent.slice(end);
    setHtmlContent(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + snippet.length;
    });
  }, [htmlContent, subject]);


  // What we actually persist (signature stamped or stripped)
  const persistableHtml = useMemo(
    () => (appendSignature && signatureHtml ? applySignatureBlock(htmlContent, signatureHtml) : stripSignatureBlock(htmlContent)),
    [htmlContent, appendSignature, signatureHtml],
  );

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    const payload = {
      name: name.trim(),
      subject: subject.trim() || null,
      preview_text: previewText.trim() || null,
      html_content: persistableHtml,
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
    setConfirmDelete(false);
    onClose();
  };

  const handleCopyHtml = () => {
    navigator.clipboard.writeText(persistableHtml);
    toast.success('HTML copied to clipboard');
  };

  const handleDuplicate = async () => {
    await createTemplate.mutateAsync({
      name: `${name} (Copy)`,
      subject,
      preview_text: previewText,
      html_content: persistableHtml,
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
              {template && <TemplateVersionHistory templateId={template.id} onRestore={(v) => {
                setName(v.name); setSubject(v.subject ?? ''); setPreviewText(v.preview_text ?? '');
                setHtmlContent(stripSignatureBlock(v.html_content || ''));
                setAppendSignature(hasSignatureBlock(v.html_content || ''));
                setCategory(v.category ?? 'custom');
                setProjectTags(v.project_tags ?? []); setAreaTags(v.area_tags ?? []);
              }} />}
              {onSendCampaign && template && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onSendCampaign(template)}>
                  <Mail className="w-3.5 h-3.5" /> Use in Campaign
                </Button>
              )}
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handleDuplicate}>
                <Copy className="w-3.5 h-3.5" /> Duplicate
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="w-3.5 h-3.5" /> Archive
              </Button>
            </>
          )}
          <Button size="sm" onClick={handleSave} disabled={saving || !name.trim()} className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground">
            <Save className="w-3.5 h-3.5" /> {saving ? 'Saving...' : isEdit ? 'Update' : 'Save Template'}
          </Button>
        </div>
      </div>

      {/* Split view: form / preview / variables */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_280px] gap-4" style={{ minHeight: 'calc(100dvh - 220px)' }}>
        {/* Left — Form */}
        <div className="space-y-4 bg-card/50 border border-border/40 rounded-xl p-4 overflow-y-auto" style={{ maxHeight: 'calc(100dvh - 220px)' }}>
          <div>
            <Label>Template Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Eden Phase 2 - VIP Launch" className="h-9" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Subject Line</Label>
              <Input
                ref={subjectRef}
                value={subject}
                onChange={e => setSubject(e.target.value)}
                onFocus={() => { lastFocused.current = 'subject'; }}
                placeholder="Email subject — supports {{lead.first_name}}"
                className="h-9"
              />
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
              ref={htmlRef}
              value={htmlContent}
              onChange={e => setHtmlContent(e.target.value)}
              onFocus={() => { lastFocused.current = 'html'; }}
              placeholder="Paste your HTML email code here..."
              className="min-h-[300px] font-mono text-xs bg-zinc-950 text-green-400 border-border/40 leading-relaxed"
              spellCheck={false}
            />
          </div>

          {/* Brand signature — keeps every saved template on-brand */}
          <div className="rounded-md border border-border/50 bg-muted/20 p-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <Label className="text-xs font-semibold text-foreground">Append my signature</Label>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {signatureHtml
                    ? 'Stamps your headshot, name, brokerage and contact details below the email body when saved or sent.'
                    : 'Set up your signature in Settings → Signature to enable this.'}
                </p>
              </div>
              <Switch
                checked={appendSignature && !!signatureHtml}
                disabled={!signatureHtml}
                onCheckedChange={setAppendSignature}
              />
            </div>
            {appendSignature && signatureHtml && (
              <div
                className="rounded border border-border/40 bg-background p-2 max-h-[120px] overflow-auto text-[11px]"
                dangerouslySetInnerHTML={{ __html: signatureHtml }}
              />
            )}
          </div>

          {/* Merge tags */}
          {mergeTags.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Variables in use</Label>
              <div className="flex flex-wrap gap-1.5">
                {mergeTags.map(tag => (
                  <Badge key={tag} variant="secondary" className="text-[10px] font-mono">{tag}</Badge>
                ))}
              </div>
            </div>
          )}

          {unknownTokens.length > 0 && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 space-y-1">
              <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3" /> Unknown variables — these won’t be replaced when sent:
              </p>
              <div className="flex flex-wrap gap-1">
                {unknownTokens.map(t => (
                  <Badge key={t} variant="outline" className="text-[10px] font-mono border-amber-500/40">{`{{${t}}}`}</Badge>
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
              <Button
                variant={withSampleData ? 'default' : 'outline'}
                size="sm"
                className="h-7 gap-1 text-[10px]"
                onClick={() => setWithSampleData(v => !v)}
                title="Replace variables with example data"
              >
                <EyeIcon className="w-3 h-3" /> {withSampleData ? 'Sample data' : 'Raw'}
              </Button>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setFullPreview(true)}>
                <Maximize2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {/* Subject + preview text bar */}
          {(subject || previewText) && (
            <div className="rounded-lg border border-border/40 bg-muted/20 p-2.5 space-y-0.5">
              {subject && <p className="text-xs font-semibold text-foreground truncate">Subject: {withSampleData ? renderWithSampleData(subject).replace(/<[^>]+>/g, '') : subject}</p>}
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

        {/* Far right — Variable picker */}
        <div className="space-y-2 lg:sticky lg:top-4 self-start">
          <VariablePicker onInsert={insertSnippet} />
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
