import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ArrowLeft, Monitor, Smartphone, Maximize2, Copy, Send, Save, Trash2, Mail, Eye as EyeIcon, AlertTriangle, History, Cloud, CloudOff, Cloud as CloudIcon, Loader2, RefreshCw } from 'lucide-react';
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
import { AIAssistMenu } from './AIAssistMenu';
import { renderWithSampleData, findUnknownTokens } from '@/lib/emailVariables';
import { applySignatureBlock, hasSignatureBlock, stripSignatureBlock } from '@/lib/templateSignature';
import { usePresaleAgent } from '@/stores/usePresaleAgent';
import { useEmailSettings } from '@/hooks/useEmailSettings';
import { Switch } from '@/components/ui/switch';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { SenderIdentityField } from './SenderIdentityField';
import { SendTestDialog } from './SendTestDialog';
import { SyncHistoryList } from './SyncHistoryList';
import { useTemplateAutosave } from '@/hooks/useTemplateAutosave';
import { PresaleProjectPicker } from '@/components/presale/PresaleProjectPicker';
import { bridgeClient, type BridgeProjectFull } from '@/lib/presaleBridgeClient';

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
const PRESALE_STYLES: { value: string; label: string }[] = [
  { value: 'modern', label: 'Modern' },
  { value: 'editorial', label: 'Editorial' },
  { value: 'classic', label: 'Classic' },
  { value: 'minimal', label: 'Minimal' },
];

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
  const [appendSignature, setAppendSignature] = useState<boolean>(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sendTestOpen, setSendTestOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // ---- Live Presale preview state ----
  const [previewMode, setPreviewMode] = useState<'local' | 'presale'>('local');
  const [presaleProject, setPresaleProject] = useState<BridgeProjectFull | null>(null);
  const [presaleStyle, setPresaleStyle] = useState<string>('modern');
  const [presaleLoading, setPresaleLoading] = useState(false);
  const [presaleError, setPresaleError] = useState<string | null>(null);
  const [presaleHtml, setPresaleHtml] = useState<string>('');
  const [presaleSubject, setPresaleSubject] = useState<string>('');

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
        doc.write(html || '<p style="color:#888;font-family:sans-serif;padding:20px;">Paste your HTML email code here…</p>');
        doc.close();
      }
    }
  }, []);

  const composedHtml = useMemo(
    () => (appendSignature && signatureHtml ? applySignatureBlock(htmlContent, signatureHtml) : htmlContent),
    [htmlContent, appendSignature, signatureHtml],
  );
  const localPreviewHtml = useMemo(
    () => (withSampleData ? renderWithSampleData(composedHtml) : composedHtml),
    [composedHtml, withSampleData],
  );
  const renderedHtml = previewMode === 'presale' && presaleHtml ? presaleHtml : localPreviewHtml;

  useEffect(() => { updateIframe(iframeRef, renderedHtml); }, [renderedHtml, previewWidth, updateIframe]);
  useEffect(() => { if (fullPreview) updateIframe(fullIframeRef, renderedHtml); }, [renderedHtml, fullPreview, updateIframe]);

  const fetchPresaleRender = useCallback(async () => {
    if (!presaleProject?.slug) return;
    if (!agent?.slug) {
      setPresaleError('Your Presale agent identity is not loaded yet.');
      return;
    }
    setPresaleLoading(true);
    setPresaleError(null);
    try {
      const result = await bridgeClient.renderEmail({
        projectSlug: presaleProject.slug,
        agentSlug: agent.slug,
        templateStyle: presaleStyle,
        leadName: 'Alex Sample',
      });
      setPresaleHtml(result.html ?? '');
      setPresaleSubject(result.subject ?? '');
    } catch (e) {
      setPresaleError((e as Error).message);
      setPresaleHtml('');
    } finally {
      setPresaleLoading(false);
    }
  }, [presaleProject, presaleStyle, agent?.slug]);

  // Auto-fetch when entering Presale mode or changing project/style
  useEffect(() => {
    if (previewMode === 'presale' && presaleProject?.slug) fetchPresaleRender();
  }, [previewMode, presaleProject?.slug, presaleStyle, fetchPresaleRender]);

  const insertSnippet = useCallback((snippet: string) => {
    if (lastFocused.current === 'subject') {
      const el = subjectRef.current;
      if (!el) { setSubject(s => s + snippet); return; }
      const start = el.selectionStart ?? subject.length;
      const end = el.selectionEnd ?? subject.length;
      setSubject(subject.slice(0, start) + snippet + subject.slice(end));
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
    setHtmlContent(htmlContent.slice(0, start) + snippet + htmlContent.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + snippet.length;
    });
  }, [htmlContent, subject]);

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

  const handleAdoptPresaleHtml = () => {
    if (!presaleHtml) return;
    setHtmlContent(stripSignatureBlock(presaleHtml));
    if (presaleSubject) setSubject(presaleSubject);
    setPreviewMode('local');
    toast.success('Presale render copied into editor');
  };

  const toggleTag = (tag: string, list: string[], setList: (v: string[]) => void) => {
    setList(list.includes(tag) ? list.filter(t => t !== tag) : [...list, tag]);
  };

  const saving = createTemplate.isPending || updateTemplate.isPending;

  const draftKey = template?.id ?? 'new-template';
  const draftSnapshot = useMemo(
    () => ({ name, subject, previewText, htmlContent, category, projectTags, areaTags, appendSignature }),
    [name, subject, previewText, htmlContent, category, projectTags, areaTags, appendSignature],
  );
  const { dirty, clear: clearDraft } = useTemplateAutosave(draftKey, draftSnapshot);

  const displaySubject = previewMode === 'presale' && presaleSubject
    ? presaleSubject
    : (withSampleData ? renderWithSampleData(subject).replace(/<[^>]+>/g, '') : subject);

  return (
    <div className="flex flex-col h-[calc(100dvh-80px)] min-h-0">
      {/* Top bar */}
      <div className="flex items-center justify-between flex-wrap gap-2 px-1 pb-3 border-b border-border/40">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={onClose}>
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
          <h1 className="text-base font-bold text-foreground truncate">{isEdit ? (name || 'Edit Template') : 'New Template'}</h1>
          {isEdit && template?.source && (
            <Badge variant="outline" className="text-[10px]">{template.source}</Badge>
          )}
          <span
            className={`inline-flex items-center gap-1 text-[10.5px] px-1.5 py-0.5 rounded border ${
              dirty
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                : 'border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400'
            }`}
            title={dirty ? 'Unsaved changes — autosaved locally' : 'All changes saved'}
          >
            {dirty ? <CloudOff className="w-2.5 h-2.5" /> : <Cloud className="w-2.5 h-2.5" />}
            {dirty ? 'Unsaved' : 'Saved'}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <AIAssistMenu
            html={htmlContent}
            subject={subject}
            agentName={agent?.name || undefined}
            onApplyHtml={(next) => setHtmlContent(stripSignatureBlock(next))}
            onApplySubject={(s) => setSubject(s)}
          />
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
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setSendTestOpen(true)}
            disabled={!subject.trim() || !htmlContent.trim()}
          >
            <Send className="w-3.5 h-3.5" /> Send test
          </Button>
          <Button
            size="sm"
            onClick={async () => { await handleSave(); clearDraft(); }}
            disabled={saving || !name.trim()}
            className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <Save className="w-3.5 h-3.5" /> {saving ? 'Saving…' : isEdit ? 'Update' : 'Save Template'}
          </Button>
        </div>
      </div>

      {/* True 3-pane: Inspector | Editor | Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)_minmax(0,520px)] gap-4 flex-1 min-h-0 pt-3">
        {/* LEFT — Inspector */}
        <aside className="space-y-4 bg-card/50 border border-border/40 rounded-xl p-4 overflow-y-auto min-h-0">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Inspector</div>
          <SenderIdentityField />

          <div>
            <Label className="text-xs">Template Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Eden Phase 2 — VIP Launch" className="h-9 mt-1" />
          </div>

          <div>
            <Label className="text-xs">Subject Line</Label>
            <Input
              ref={subjectRef}
              value={subject}
              onChange={e => setSubject(e.target.value)}
              onFocus={() => { lastFocused.current = 'subject'; }}
              placeholder="Supports {{lead.first_name}}"
              className="h-9 mt-1"
            />
          </div>

          <div>
            <Label className="text-xs">Preview Text</Label>
            <Input value={previewText} onChange={e => setPreviewText(e.target.value)} placeholder="Inbox preview snippet" className="h-9 mt-1" />
          </div>

          <div>
            <Label className="text-xs">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Project Tags</Label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
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

          <div>
            <Label className="text-xs">Area Tags</Label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
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

          <div className="rounded-md border border-border/50 bg-muted/20 p-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <Label className="text-xs font-semibold text-foreground">Append my signature</Label>
                <p className="text-[10.5px] text-muted-foreground mt-0.5">
                  {signatureHtml
                    ? 'Stamps your headshot, name, brokerage and contact below the body.'
                    : 'Set up your signature in Settings → Signature.'}
                </p>
              </div>
              <Switch
                checked={appendSignature && !!signatureHtml}
                disabled={!signatureHtml}
                onCheckedChange={setAppendSignature}
              />
            </div>
          </div>

          {mergeTags.length > 0 && (
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Variables in use</Label>
              <div className="flex flex-wrap gap-1">
                {mergeTags.map(tag => (
                  <Badge key={tag} variant="secondary" className="text-[10px] font-mono">{tag}</Badge>
                ))}
              </div>
            </div>
          )}

          {unknownTokens.length > 0 && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 space-y-1">
              <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3" /> Unknown variables
              </p>
              <div className="flex flex-wrap gap-1">
                {unknownTokens.map(t => (
                  <Badge key={t} variant="outline" className="text-[10px] font-mono border-amber-500/40">{`{{${t}}}`}</Badge>
                ))}
              </div>
            </div>
          )}

          {isEdit && template && (
            <Collapsible open={showHistory} onOpenChange={setShowHistory}>
              <CollapsibleTrigger className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
                <span className="inline-flex items-center gap-1.5">
                  <History className="w-3 h-3" /> Sync history
                </span>
                <span className="opacity-60">{showHistory ? 'Hide' : 'Show'}</span>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <SyncHistoryList templateId={template.id} />
              </CollapsibleContent>
            </Collapsible>
          )}
        </aside>

        {/* CENTER — Editor */}
        <section className="flex flex-col gap-2 bg-card/50 border border-border/40 rounded-xl p-3 min-h-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">HTML Editor</span>
              <span className="text-[10.5px] text-muted-foreground/70">{htmlContent.length.toLocaleString()} chars</span>
            </div>
            <div className="flex items-center gap-1.5">
              <VariablePicker onInsert={insertSnippet} />
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground" onClick={handleCopyHtml}>
                <Copy className="w-3 h-3" /> Copy
              </Button>
            </div>
          </div>
          <Textarea
            ref={htmlRef}
            value={htmlContent}
            onChange={e => setHtmlContent(e.target.value)}
            onFocus={() => { lastFocused.current = 'html'; }}
            placeholder="Paste your HTML email code here…"
            className="flex-1 min-h-0 font-mono text-xs bg-zinc-950 text-green-400 border-border/40 leading-relaxed resize-none"
            spellCheck={false}
          />
        </section>

        {/* RIGHT — Preview (Local | Live Presale) */}
        <section className="flex flex-col gap-2 bg-card/50 border border-border/40 rounded-xl p-3 min-h-0">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Preview</span>
            <div className="flex items-center gap-1">
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

          {/* Mode toggle: Local vs Live (Presale) */}
          <div className="flex items-center gap-0.5 rounded-lg border border-border/60 bg-muted/30 p-0.5 self-start">
            <button
              onClick={() => setPreviewMode('local')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${previewMode === 'local' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Local draft
            </button>
            <button
              onClick={() => setPreviewMode('presale')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium inline-flex items-center gap-1 transition-colors ${previewMode === 'presale' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <CloudIcon className="w-3 h-3" /> Live · Presale
            </button>
          </div>

          {previewMode === 'local' ? (
            <Button
              variant={withSampleData ? 'default' : 'outline'}
              size="sm"
              className="h-7 gap-1 text-[10.5px] self-start"
              onClick={() => setWithSampleData(v => !v)}
              title="Replace variables with example data"
            >
              <EyeIcon className="w-3 h-3" /> {withSampleData ? 'Sample data' : 'Raw merge tags'}
            </Button>
          ) : (
            <div className="flex items-center gap-2 rounded-md border border-border/40 bg-muted/20 p-2">
              <div className="flex-1 min-w-0">
                <PresaleProjectPicker
                  value={presaleProject?.slug}
                  initialLabel={presaleProject?.name}
                  onSelect={(p) => setPresaleProject(p)}
                  placeholder="Pick a Presale project to render…"
                />
              </div>
              <Select value={presaleStyle} onValueChange={setPresaleStyle}>
                <SelectTrigger className="h-9 w-[110px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRESALE_STYLES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 w-9 p-0"
                onClick={fetchPresaleRender}
                disabled={!presaleProject?.slug || presaleLoading}
                title="Re-render from Presale"
              >
                {presaleLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              </Button>
            </div>
          )}

          {previewMode === 'presale' && presaleError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-[11px] text-destructive">
              {presaleError}
            </div>
          )}

          {(displaySubject || previewText) && (
            <div className="rounded-lg border border-border/40 bg-muted/20 p-2 space-y-0.5">
              {displaySubject && <p className="text-[11.5px] font-semibold text-foreground truncate">Subject: {displaySubject}</p>}
              {previewText && <p className="text-[10.5px] text-muted-foreground truncate">Preview: {previewText}</p>}
            </div>
          )}

          <div className="flex-1 min-h-0 flex justify-center overflow-auto">
            <div
              className="rounded-lg border border-border/40 bg-white overflow-hidden transition-all w-full"
              style={{ width: previewWidth === 'desktop' ? '100%' : '375px', maxWidth: '100%', minHeight: '100%' }}
            >
              {previewMode === 'presale' && presaleLoading && !presaleHtml ? (
                <div className="flex items-center justify-center h-full text-muted-foreground text-xs gap-2 py-12">
                  <Loader2 className="w-4 h-4 animate-spin" /> Rendering from Presale…
                </div>
              ) : (
                <iframe
                  ref={iframeRef}
                  title="Template Preview"
                  className="w-full h-full border-0"
                  style={{ minHeight: '500px' }}
                  sandbox="allow-same-origin"
                />
              )}
            </div>
          </div>

          {previewMode === 'presale' && presaleHtml && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 self-start"
              onClick={handleAdoptPresaleHtml}
            >
              <Copy className="w-3.5 h-3.5" /> Copy this render into editor
            </Button>
          )}
        </section>
      </div>

      {/* Full-screen preview modal */}
      <Dialog open={fullPreview} onOpenChange={setFullPreview}>
        <DialogContent className="max-w-[95vw] h-[90vh] p-0 gap-0 flex flex-col" aria-describedby={undefined}>
          <DialogTitle className="sr-only">Template Preview</DialogTitle>
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40 bg-card">
            <div className="space-y-0.5 min-w-0">
              {displaySubject && <p className="text-sm font-semibold text-foreground truncate">{displaySubject}</p>}
              {previewText && <p className="text-xs text-muted-foreground truncate">{previewText}</p>}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handleCopyHtml}>
                <Copy className="w-3.5 h-3.5" /> Copy HTML
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => { setFullPreview(false); setSendTestOpen(true); }}
                disabled={!subject.trim() || !htmlContent.trim()}
              >
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

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this template?</AlertDialogTitle>
            <AlertDialogDescription>
              "{name || 'Untitled'}" will be hidden from the library. You can restore it later from the database. Sent emails are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SendTestDialog
        open={sendTestOpen}
        onOpenChange={setSendTestOpen}
        templateId={template?.id ?? null}
        subject={subject}
        html={persistableHtml}
        defaultEmail={agent?.email ?? null}
      />
    </div>
  );
}
