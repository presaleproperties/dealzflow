import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Send, Loader2, Mail, MessageSquare, ChevronsUpDown, Check, Upload, FileText, Map, DollarSign, Paperclip } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { CrmContact } from '@/hooks/useCrmContacts';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

interface Props {
  contact: CrmContact;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Project { slug: string; name: string; city: string | null; status: string | null; presale_slug: string | null }
interface Template { slug: string; name: string }

const FOLLOWUP_SLUG = 'cold-lead-followup';

export function SendProjectDialog({ contact, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const isMobile = useIsMobile();

  // ─── Data: projects, templates, gmail status, automation availability ────
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['send-project.projects'],
    queryFn: async () => {
      const { data } = await supabase
        .from('crm_projects')
        .select('slug, name, city, status, presale_slug')
        .not('presale_slug', 'is', null)
        .eq('is_active', true)
        .order('name');
      return (data ?? []) as Project[];
    },
    staleTime: 5 * 60 * 1000,
    enabled: open,
  });

  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ['send-project.templates'],
    queryFn: async () => {
      const { data } = await supabase
        .from('crm_email_templates')
        .select('slug, name')
        .eq('is_active', true)
        .not('slug', 'is', null)
        .order('name');
      // Only show templates relevant to "Send Project" — the bridge composes
      // the actual project card; we filter out booking/welcome/SMS noise so the
      // picker matches Presale Properties' project-send flow.
      const PROJECT_TEMPLATE_RX = /(project|property|showcase|info-package|recommendation|the-mason)/i;
      const allowed = (data ?? []).filter((t) =>
        PROJECT_TEMPLATE_RX.test(t.slug) || PROJECT_TEMPLATE_RX.test(t.name),
      );
      return (allowed.length > 0 ? allowed : (data ?? [])) as Template[];
    },
    staleTime: 5 * 60 * 1000,
    enabled: open,
  });

  const { data: gmailConnected } = useQuery({
    queryKey: ['send-project.gmail-status'],
    queryFn: async () => {
      const { data } = await supabase.from('gmail_tokens').select('id').limit(1).maybeSingle();
      return Boolean(data);
    },
    staleTime: 30_000,
    enabled: open,
  });

  const { data: automationAvailable } = useQuery({
    queryKey: ['send-project.automation', FOLLOWUP_SLUG],
    queryFn: async () => {
      // crm_automations has no slug column yet; match by name (Prompt 3 will seed).
      const { data } = await supabase
        .from('crm_automations')
        .select('id')
        .or(`name.eq.${FOLLOWUP_SLUG},name.ilike.cold lead followup`)
        .limit(1)
        .maybeSingle();
      return Boolean(data);
    },
    staleTime: 60_000,
    enabled: open,
  });

  // ─── Local state ─────────────────────────────────────────────────────────
  const queryClient = useQueryClient();
  const [projectSlug, setProjectSlug] = useState<string>('');
  const [templateSlug, setTemplateSlug] = useState<string>('');
  const [channel, setChannel] = useState<'email' | 'sms'>('email');
  const [enrollFollowup, setEnrollFollowup] = useState<boolean>(true);
  const [showPreviewMobile, setShowPreviewMobile] = useState<boolean>(false);
  const [sending, setSending] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string>('');
  const [previewSubject, setPreviewSubject] = useState<string>('');
  const [previewError, setPreviewError] = useState<string | null>(null);
  // Attachment toggles + cached availability per project
  const [attachBrochure, setAttachBrochure] = useState(false);
  const [attachFloorPlans, setAttachFloorPlans] = useState(false);
  const [attachPricing, setAttachPricing] = useState(false);

  // ─── Per-project asset availability (manual or Presale) ──────────────────
  type AssetInfo = { url: string | null; filename: string | null; source: 'manual' | 'presale' | null };
  const { data: assets, isLoading: assetsLoading } = useQuery<{ brochure: AssetInfo; floor_plans: AssetInfo; pricing: AssetInfo }>({
    queryKey: ['send-project.assets', projectSlug],
    enabled: open && Boolean(projectSlug),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('presale-project-assets', {
        body: { project_slug: projectSlug },
      });
      if (error) throw error;
      return (data as any).assets;
    },
  });


  // ─── Defaults when modal opens / data arrives ───────────────────────────
  useEffect(() => {
    if (!open || projects.length === 0) return;
    if (projectSlug) return;
    const contactProjects = (contact as unknown as { projects?: string[] }).projects ?? [];
    const match = projects.find(p =>
      contactProjects.some(cp => cp && p.slug && cp.toLowerCase() === p.slug.toLowerCase()),
    );
    setProjectSlug(match?.slug ?? projects[0].slug);
  }, [open, projects, contact, projectSlug]);

  useEffect(() => {
    if (!open || templates.length === 0 || templateSlug) return;
    const preferred =
      templates.find(t => t.slug === 'project-info-package') ||
      templates.find(t => t.slug === 'project-showcase') ||
      templates.find(t => t.slug === 'project-welcome-email');
    setTemplateSlug(preferred?.slug ?? templates[0].slug);
  }, [open, templates, templateSlug]);

  // ─── Debounced live preview ──────────────────────────────────────────────
  const previewTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!open) return;
    if (!projectSlug || !templateSlug || channel !== 'email') return;
    window.clearTimeout(previewTimer.current);
    setPreviewLoading(true);
    setPreviewError(null);
    previewTimer.current = window.setTimeout(async () => {
      const { data, error } = await supabase.functions.invoke('render-and-send', {
        body: {
          contact_id: contact.id,
          project_slug: projectSlug,
          template_slug: templateSlug,
          channel: 'email',
          dry_run: true,
          attachments: {
            brochure: attachBrochure,
            floor_plans: attachFloorPlans,
            pricing: attachPricing,
          },
        },
      });
      if (error || !data?.ok) {
        setPreviewError((error?.message || data?.error || 'Preview unavailable.') as string);
        setPreviewHtml('');
        setPreviewSubject('');
      } else {
        setPreviewHtml(data.html ?? '');
        setPreviewSubject(data.subject ?? '');
      }
      setPreviewLoading(false);
    }, 300);
    return () => window.clearTimeout(previewTimer.current);
  }, [open, contact.id, projectSlug, templateSlug, channel, attachBrochure, attachFloorPlans, attachPricing]);

  // ─── Reset attachment toggles when project changes ───────────────────────
  useEffect(() => {
    setAttachBrochure(false);
    setAttachFloorPlans(false);
    setAttachPricing(false);
  }, [projectSlug]);

  // ─── Upload helper ───────────────────────────────────────────────────────
  const [uploadingKind, setUploadingKind] = useState<null | 'brochure' | 'floor_plans' | 'pricing'>(null);
  const handleUpload = async (kind: 'brochure' | 'floor_plans' | 'pricing', file: File) => {
    if (!projectSlug) return;
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Max 20 MB.', variant: 'destructive' });
      return;
    }
    setUploadingKind(kind);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_');
    const path = `${projectSlug}/${kind}/${Date.now()}-${safeName}`;
    const { error: upErr } = await supabase.storage
      .from('crm-project-assets')
      .upload(path, file, { upsert: true, contentType: file.type || 'application/pdf' });
    if (upErr) {
      setUploadingKind(null);
      toast({ title: 'Upload failed', description: upErr.message, variant: 'destructive' });
      return;
    }
    const { data: signed } = await supabase.storage
      .from('crm-project-assets')
      .createSignedUrl(path, 60 * 60 * 24 * 365);
    const url = signed?.signedUrl;
    if (!url) {
      setUploadingKind(null);
      toast({ title: 'Upload failed', description: 'Could not sign URL.', variant: 'destructive' });
      return;
    }
    const patch: Record<string, string> =
      kind === 'brochure'    ? { brochure_url: url, brochure_filename: file.name } :
      kind === 'floor_plans' ? { floor_plans_url: url, floor_plans_filename: file.name } :
                               { pricing_url: url, pricing_filename: file.name };
    const { error: updErr } = await supabase.from('crm_projects').update(patch).eq('slug', projectSlug);
    setUploadingKind(null);
    if (updErr) {
      toast({ title: 'Saved file but project update failed', description: updErr.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Uploaded', description: file.name });
    queryClient.invalidateQueries({ queryKey: ['send-project.assets', projectSlug] });
    queryClient.invalidateQueries({ queryKey: ['crm-projects'] });
    // Auto-enable the toggle once upload succeeds
    if (kind === 'brochure') setAttachBrochure(true);
    if (kind === 'floor_plans') setAttachFloorPlans(true);
    if (kind === 'pricing') setAttachPricing(true);
  };

  // ─── Send ────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!gmailConnected || !projectSlug || !templateSlug) return;
    setSending(true);
    const { data, error } = await supabase.functions.invoke('render-and-send', {
      body: {
        contact_id: contact.id,
        project_slug: projectSlug,
        template_slug: templateSlug,
        channel: 'email',
        enroll_followup_slug: enrollFollowup && automationAvailable ? FOLLOWUP_SLUG : null,
        dry_run: false,
        attachments: {
          brochure: attachBrochure,
          floor_plans: attachFloorPlans,
          pricing: attachPricing,
        },
      },
    });
    setSending(false);
    if (error || !data?.ok) {
      toast({
        title: 'Send failed',
        description: (error?.message || data?.error || 'Unknown error') as string,
        variant: 'destructive',
      });
      return;
    }
    toast({
      title: 'Email sent',
      description: data.enrolled ? 'Lead enrolled in follow-up sequence.' : undefined,
    });
    onOpenChange(false);
  };

  const sendDisabled = !gmailConnected || !projectSlug || !templateSlug || sending || channel === 'sms';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'p-0 overflow-hidden',
          isMobile
            ? 'max-w-full w-screen h-[100dvh] sm:h-[100dvh] rounded-none'
            : 'max-w-5xl w-[95vw] h-[80vh] grid grid-rows-[auto_1fr]',
        )}
      >
        <DialogHeader className="px-5 py-3 border-b border-border">
          <DialogTitle className="text-[15px] font-semibold tracking-tight">
            Send Project — {contact.first_name || 'Lead'}
          </DialogTitle>
        </DialogHeader>

        <div className={cn(
          'min-h-0',
          isMobile ? 'flex flex-col' : 'grid grid-cols-[40%_60%]',
        )}>
          {/* ─── Form panel ─── */}
          <div className={cn(
            'p-5 space-y-4 overflow-y-auto border-border',
            !isMobile && 'border-r',
            isMobile && showPreviewMobile && 'hidden',
          )}>
            {/* Project picker */}
            <Field label="Project">
              <Combobox
                value={projectSlug}
                onChange={setProjectSlug}
                items={projects.map(p => ({
                  value: p.slug,
                  label: p.name,
                  hint: [p.city, p.status].filter(Boolean).join(' · '),
                }))}
                placeholder="Select project…"
                emptyText="No projects with presale link."
              />
            </Field>

            {/* Template picker — Presale-styled email is auto-composed by the bridge */}
            <Field label="Email style">
              <Combobox
                value={templateSlug}
                onChange={setTemplateSlug}
                items={templates.map(t => ({ value: t.slug, label: t.name }))}
                placeholder="Select email style…"
                emptyText="No project email styles."
              />
              <div className="text-[11px] text-muted-foreground mt-1.5">
                Branded layout & project card from Presale Properties · your CRM signature replaces the default footer.
              </div>
            </Field>

            {/* Attachments — Brochure / Floor Plans / Pricing */}
            <Field label="Attachments">
              <div className="rounded-md border border-border divide-y divide-border">
                <AttachmentRow
                  icon={<FileText className="w-3.5 h-3.5" />}
                  label="Brochure"
                  asset={assets?.brochure}
                  loading={assetsLoading}
                  checked={attachBrochure}
                  onCheckedChange={setAttachBrochure}
                  uploading={uploadingKind === 'brochure'}
                  onPickFile={(file) => handleUpload('brochure', file)}
                />
                <AttachmentRow
                  icon={<Map className="w-3.5 h-3.5" />}
                  label="Floor Plans"
                  asset={assets?.floor_plans}
                  loading={assetsLoading}
                  checked={attachFloorPlans}
                  onCheckedChange={setAttachFloorPlans}
                  uploading={uploadingKind === 'floor_plans'}
                  onPickFile={(file) => handleUpload('floor_plans', file)}
                />
                <AttachmentRow
                  icon={<DollarSign className="w-3.5 h-3.5" />}
                  label="Pricing Sheet"
                  asset={assets?.pricing}
                  loading={assetsLoading}
                  checked={attachPricing}
                  onCheckedChange={setAttachPricing}
                  uploading={uploadingKind === 'pricing'}
                  onPickFile={(file) => handleUpload('pricing', file)}
                />
              </div>
              <div className="text-[11px] text-muted-foreground mt-1.5">
                Pulled from Presale Properties when available. Upload a PDF if the project doesn't have one — it's saved per project for everyone.
              </div>
            </Field>

            {/* Channel tabs */}
            <Field label="Channel">
              <Tabs value={channel} onValueChange={(v) => setChannel(v as 'email' | 'sms')}>
                <TabsList className="grid grid-cols-2 w-full">
                  <TabsTrigger value="email" className="gap-1.5"><Mail className="w-3.5 h-3.5" /> Email</TabsTrigger>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <TabsTrigger value="sms" disabled className="gap-1.5 w-full">
                            <MessageSquare className="w-3.5 h-3.5" /> SMS
                          </TabsTrigger>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>SMS sends in Prompt 3</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TabsList>
              </Tabs>
            </Field>

            {/* Follow-up toggle */}
            <div className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
              <div className="space-y-0.5">
                <div className="text-sm font-medium">Enroll in 3 / 7 / 14 day follow-up</div>
                <div className="text-xs text-muted-foreground">
                  {automationAvailable
                    ? 'Lead enters the cold-lead nurture sequence after sending.'
                    : 'Sequence not seeded yet (waiting on Prompt 3).'}
                </div>
              </div>
              <Switch
                checked={enrollFollowup && Boolean(automationAvailable)}
                onCheckedChange={setEnrollFollowup}
                disabled={!automationAvailable}
              />
            </div>

            {/* Gmail status */}
            {gmailConnected === false && (
              <div className="text-xs rounded-md border border-destructive/40 bg-destructive/10 text-destructive px-3 py-2">
                Connect Gmail in <Link to="/crm/settings" className="underline font-medium">Settings</Link> to send.
              </div>
            )}

            {/* Mobile-only: toggle preview */}
            {isMobile && (
              <Button variant="outline" className="w-full" onClick={() => setShowPreviewMobile(true)}>
                Show preview
              </Button>
            )}

            <div className="hidden sm:flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleSend} disabled={sendDisabled} className="gap-2">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Send
              </Button>
            </div>
          </div>

          {/* ─── Preview panel ─── */}
          <div className={cn(
            'flex flex-col bg-muted/30 min-h-0',
            isMobile && !showPreviewMobile && 'hidden',
          )}>
            <div className="px-4 py-2 border-b border-border flex items-center justify-between text-xs text-muted-foreground">
              <span className="truncate">
                {previewSubject ? <><span className="text-muted-foreground">Subject: </span><span className="text-foreground font-medium">{previewSubject}</span></> : 'Preview'}
              </span>
              {isMobile && (
                <Button size="sm" variant="ghost" onClick={() => setShowPreviewMobile(false)}>
                  Back
                </Button>
              )}
            </div>
            <div className="flex-1 min-h-0 relative">
              {previewLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              )}
              {previewError ? (
                <div className="p-6 text-sm text-muted-foreground">{previewError}</div>
              ) : previewHtml ? (
                <iframe
                  title="Email preview"
                  srcDoc={previewHtml}
                  className="w-full h-full border-0 bg-background"
                  sandbox=""
                />
              ) : (
                <div className="p-6 text-sm text-muted-foreground">Pick a project and template to preview.</div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile sticky footer */}
        {isMobile && (
          <div className="border-t border-border p-3 flex gap-2 sm:hidden">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSend} disabled={sendDisabled} className="flex-1 gap-2">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ───────── Helpers ──────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

function Combobox({
  value, onChange, items, placeholder, emptyText,
}: {
  value: string;
  onChange: (v: string) => void;
  items: { value: string; label: string; hint?: string }[];
  placeholder: string;
  emptyText: string;
}) {
  const [open, setOpen] = useState(false);
  const current = useMemo(() => items.find(i => i.value === value), [items, value]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
          <span className="truncate text-left">
            {current ? (
              <>
                {current.label}
                {current.hint && <span className="text-muted-foreground"> — {current.hint}</span>}
              </>
            ) : placeholder}
          </span>
          <ChevronsUpDown className="w-4 h-4 opacity-50 shrink-0 ml-2" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
        <Command>
          <CommandInput placeholder="Search…" />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {items.map(item => (
                <CommandItem
                  key={item.value}
                  value={`${item.label} ${item.hint ?? ''}`}
                  onSelect={() => { onChange(item.value); setOpen(false); }}
                >
                  <Check className={cn('mr-2 h-4 w-4', value === item.value ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate">
                    {item.label}
                    {item.hint && <span className="text-muted-foreground"> — {item.hint}</span>}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
