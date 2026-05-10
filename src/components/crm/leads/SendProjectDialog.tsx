import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Send, Loader2, Mail, ChevronsUpDown, Check, Upload, FileText, Map, DollarSign, AlertCircle } from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { CrmContact } from '@/hooks/useCrmContacts';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { loadAgentPrefs, saveAgentPrefs, loadContactDraft, saveContactDraft, clearContactDraft } from '@/lib/sendProjectMemory';
import { useAuth } from '@/hooks/useAuth';

interface Props {
  contact: CrmContact;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Project { slug: string; name: string; city: string | null; status: string | null; presale_slug: string | null }
interface Template { slug: string; name: string }

// (Legacy FOLLOWUP_SLUG removed — funnel picker drives enroll_followup_slug.)

// Presale signup-style funnels (seeded in crm_automations). Each = a sequence
// of emails using Presale's Template A (with docs) or Template B (agent intro)
// — exactly what fires when a lead signs up on presaleproperties.com.
type Funnel = {
  slug: string;
  name: string;
  description: string | null;
  steps: { step_order: number; delay_hours: number; template_slug: string }[];
};
const NONE_FUNNEL_SLUG = '__none__';

function describeSequence(steps: Funnel['steps']): string {
  if (!steps?.length) return 'Sends one email — no follow-ups.';
  const labels = steps.map((s) => {
    if (s.delay_hours === 0) return 'now';
    const days = Math.round(s.delay_hours / 24);
    return days >= 1 ? `+${days}d` : `+${s.delay_hours}h`;
  });
  return `Sends ${labels.join(' → ')} (${steps.length} email${steps.length === 1 ? '' : 's'})`;
}

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

  const { data: templates = [], refetch: refetchTemplates } = useQuery<Template[]>({
    queryKey: ['send-project.templates'],
    queryFn: async () => {
      // ONLY Presale system auto-response templates — admin-managed, branded,
      // identical to the emails leads receive when they sign up on
      // presaleproperties.com. Local CRM templates are intentionally excluded
      // so every Send Project email uses the same Presale styling.
      try {
        const { data } = await supabase.functions.invoke('fetch-presale-templates', {
          method: 'GET',
        });
        const list = (data as { templates?: Array<{ id: string; name: string; description?: string }> } | null)?.templates ?? [];
        // Strip the leading "★ " star — every option is now a system template,
        // so the marker is redundant. Keep names clean.
        return list.map((t) => ({ slug: t.id, name: t.name }));
      } catch (e) {
        console.warn('[SendProject] presale auto-templates fetch failed', e);
        return [];
      }
    },
    staleTime: 5 * 60 * 1000,
    enabled: open,
  });

  // ─── Auto-refresh templates from Presale if stale (>24h) ─────────────────
  // Fires once per dialog open. Silent — uses background invoke + refetch.
  const triedRefreshRef = useRef(false);
  useEffect(() => {
    if (!open || triedRefreshRef.current || templates.length === 0) return;
    const newest = templates
      .map((t: any) => t.last_synced_at ? new Date(t.last_synced_at).getTime() : 0)
      .reduce((a, b) => Math.max(a, b), 0);
    const ageMs = Date.now() - newest;
    if (newest === 0 || ageMs > 24 * 60 * 60 * 1000) {
      triedRefreshRef.current = true;
      void supabase.functions
        .invoke('sync-bridge-templates', { body: {} })
        .then(({ error }) => { if (!error) refetchTemplates(); })
        .catch(() => {});
    }
  }, [open, templates, refetchTemplates]);


  const { data: gmailConnected } = useQuery({
    queryKey: ['send-project.gmail-status'],
    queryFn: async () => {
      const { data } = await supabase.from('gmail_tokens').select('id').limit(1).maybeSingle();
      return Boolean(data);
    },
    staleTime: 30_000,
    enabled: open,
  });

  // (Legacy single-funnel availability check removed — replaced by funnel
  // picker that lists all `presale-*` automations seeded in crm_automations.)


  // ─── Local state ─────────────────────────────────────────────────────────
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const agentKey = user?.id ?? 'anon';
  const [projectSlug, setProjectSlug] = useState<string>('');
  const [templateSlug, setTemplateSlug] = useState<string>('');
  const [funnelSlug, setFunnelSlug] = useState<string>(NONE_FUNNEL_SLUG);
  const [showPreviewMobile, setShowPreviewMobile] = useState<boolean>(false);
  const [sending, setSending] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string>('');
  const [previewSubject, setPreviewSubject] = useState<string>('');
  const [previewError, setPreviewError] = useState<string | null>(null);
  // Composer fields (Phase 1)
  const [subjectOverride, setSubjectOverride] = useState<string>('');
  const [personalNote, setPersonalNote] = useState<string>('');
  // Attachment toggles + cached availability per project
  const [attachBrochure, setAttachBrochure] = useState(false);
  const [attachFloorPlans, setAttachFloorPlans] = useState(false);
  const [attachPricing, setAttachPricing] = useState(false);
  // CTA button toggles (default ON — match Presale auto-template).
  // Brochure / Floor Plans / Pricing buttons are governed by the Attachments
  // toggles below — no separate CTA toggle for them.
  const [ctaProjectDetails, setCtaProjectDetails] = useState(true);
  const [ctaCallNow, setCtaCallNow] = useState(true);
  // CTA URL override (per-email; blank = use Presale default)
  const [projectDetailsUrlOverride, setProjectDetailsUrlOverride] = useState<string>('');

  // Hydrate per-agent defaults (personal note + CTA toggles) once per open.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!open) { hydratedRef.current = false; return; }
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const prefs = loadAgentPrefs(agentKey);
    if (typeof prefs.defaultPersonalNote === 'string' && !personalNote) {
      setPersonalNote(prefs.defaultPersonalNote);
    }
    if (typeof prefs.defaultCtaProjectDetails === 'boolean') {
      setCtaProjectDetails(prefs.defaultCtaProjectDetails);
    }
    if (typeof prefs.defaultCtaCallNow === 'boolean') {
      setCtaCallNow(prefs.defaultCtaCallNow);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, agentKey]);

  const saveNoteAsDefault = () => {
    saveAgentPrefs(agentKey, { defaultPersonalNote: personalNote });
    toast({ title: 'Saved', description: 'This note will pre-fill your future Send Project drafts.' });
  };
  const saveCtasAsDefault = () => {
    saveAgentPrefs(agentKey, {
      defaultCtaProjectDetails: ctaProjectDetails,
      defaultCtaCallNow: ctaCallNow,
    });
    toast({ title: 'Saved', description: 'These CTA defaults will apply to your future sends.' });
  };

  // ─── Presale signup-style funnels (seeded in crm_automations) ────────────
  const { data: funnels = [] } = useQuery<Funnel[]>({
    queryKey: ['send-project.funnels'],
    enabled: open,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: autos } = await supabase
        .from('crm_automations')
        .select('id, slug, name, description')
        .like('slug', 'presale-%')
        .eq('is_active', true)
        .order('name');
      if (!autos?.length) return [];
      const ids = autos.map((a) => a.id);
      const { data: steps } = await supabase
        .from('crm_automation_steps')
        .select('automation_id, step_order, delay_hours, action_config')
        .in('automation_id', ids)
        .order('step_order');
      return autos.map((a) => ({
        slug: a.slug as string,
        name: a.name,
        description: a.description ?? null,
        steps: (steps ?? [])
          .filter((s) => s.automation_id === a.id)
          .map((s) => ({
            step_order: s.step_order,
            delay_hours: s.delay_hours ?? 0,
            template_slug: ((s.action_config as { template_slug?: string } | null)?.template_slug) ?? '',
          })),
      }));
    },
  });
  const selectedFunnel = funnels.find((f) => f.slug === funnelSlug) ?? null;

  // ─── Recipient signal: last email + open count ────────────────────────
  const { data: lastEmail } = useQuery({
    queryKey: ['send-project.last-email', contact.id],
    enabled: open && !!contact.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('crm_email_log')
        .select('sent_at, open_count')
        .eq('contact_id', contact.id)
        .eq('direction', 'outbound')
        .order('sent_at', { ascending: false })
        .limit(5);
      if (!data || data.length === 0) return null;
      const opens = data.filter(d => (d.open_count ?? 0) > 0).length;
      return { lastSentAt: data[0].sent_at, totalRecent: data.length, openedRecent: opens };
    },
  });

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
      templates.find(t => t.slug === 'auto_project_details_docs') ||
      templates.find(t => t.slug === 'auto_agent_followup') ||
      templates.find(t => t.slug === 'project-info-package') ||
      templates.find(t => t.slug === 'project-showcase') ||
      templates.find(t => t.slug === 'project-welcome-email');
    setTemplateSlug(preferred?.slug ?? templates[0].slug);
  }, [open, templates, templateSlug]);

  // ─── Debounced live preview ──────────────────────────────────────────────
  const previewTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!open) return;
    if (!projectSlug || !templateSlug) return;
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
          subject_override: subjectOverride || null,
          personal_note: personalNote || null,
          attachments: {
            brochure: attachBrochure,
            floor_plans: attachFloorPlans,
            pricing: attachPricing,
          },
          ctas: {
            project_details: ctaProjectDetails,
            call_now: ctaCallNow,
          },
          cta_overrides: {
            project_details_url: projectDetailsUrlOverride.trim() || null,
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
    }, 350);
    return () => window.clearTimeout(previewTimer.current);
  }, [open, contact.id, projectSlug, templateSlug, subjectOverride, personalNote, attachBrochure, attachFloorPlans, attachPricing, ctaProjectDetails, ctaCallNow, projectDetailsUrlOverride]);

  // ─── Reset attachment toggles + URL overrides when project changes ──────
  useEffect(() => {
    setAttachBrochure(false);
    setAttachFloorPlans(false);
    setAttachPricing(false);
    setProjectDetailsUrlOverride('');
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
        enroll_followup_slug: funnelSlug && funnelSlug !== NONE_FUNNEL_SLUG ? funnelSlug : null,
        dry_run: false,
        attachments: {
          brochure: attachBrochure,
          floor_plans: attachFloorPlans,
          pricing: attachPricing,
        },
        ctas: {
          project_details: ctaProjectDetails,
          call_now: ctaCallNow,
        },
        cta_overrides: {
          project_details_url: projectDetailsUrlOverride.trim() || null,
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

  const sendDisabled = !gmailConnected || !projectSlug || !templateSlug || sending;

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

            {/* CTA buttons — show / hide each call-to-action */}
            <Field label="Call-to-action buttons">
              <div className="rounded-md border border-border divide-y divide-border">
                <div className="px-3 py-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm">View Project Details</div>
                    <Switch checked={ctaProjectDetails} onCheckedChange={setCtaProjectDetails} />
                  </div>
                  {ctaProjectDetails && (
                    <Input
                      type="url"
                      inputMode="url"
                      placeholder="Override project link (optional) — https://…"
                      value={projectDetailsUrlOverride}
                      onChange={(e) => setProjectDetailsUrlOverride(e.target.value)}
                      className="h-8 text-xs"
                    />
                  )}
                </div>
                <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="text-sm">Call Now</div>
                  <Switch checked={ctaCallNow} onCheckedChange={setCtaCallNow} />
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground mt-1.5">
                Brochure / Floor Plans / Pricing buttons are controlled by the Attachments toggles above.
              </div>
            </Field>

            {/* Channel: email only (SMS removed) */}

            {/* Signup-style funnel picker — mirrors what fires when a lead
                signs up on PresaleProperties.com. The first email sends now;
                subsequent steps are queued and fired by the automation worker. */}
            <Field label="Signup-style funnel">
              <Combobox
                value={funnelSlug}
                onChange={setFunnelSlug}
                items={[
                  { value: NONE_FUNNEL_SLUG, label: 'No follow-up — single send' },
                  ...funnels.map((f) => ({
                    value: f.slug,
                    label: f.name.replace(/^Presale ·\s*/, ''),
                    hint: `${f.steps.length} email${f.steps.length === 1 ? '' : 's'}`,
                  })),
                ]}
                placeholder="Select funnel…"
                emptyText="No funnels seeded."
              />
              <div className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
                {funnelSlug === NONE_FUNNEL_SLUG || !selectedFunnel
                  ? 'Just sends this email — no automated follow-ups.'
                  : (
                      <>
                        {selectedFunnel.description ?? ''}
                        <br />
                        <span className="text-foreground">{describeSequence(selectedFunnel.steps)}</span>
                      </>
                    )}
              </div>
            </Field>

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

// ───────── Attachment row ───────────────────────────────────────────────────
type AssetInfoLite = { url: string | null; filename: string | null; source: 'manual' | 'presale' | null };

function AttachmentRow({
  icon, label, asset, loading, checked, onCheckedChange, uploading, onPickFile,
}: {
  icon: React.ReactNode;
  label: string;
  asset: AssetInfoLite | undefined;
  loading: boolean;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  uploading: boolean;
  onPickFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const available = Boolean(asset?.url);

  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <div className="text-muted-foreground shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{label}</span>
          {loading ? (
            <span className="text-[10px] text-muted-foreground">Checking…</span>
          ) : available ? (
            <span className={cn(
              "text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border",
              asset?.source === 'manual'
                ? "border-primary/40 text-primary"
                : "border-border text-muted-foreground",
            )}>
              {asset?.source === 'manual' ? 'Uploaded' : 'From Presale'}
            </span>
          ) : (
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Not available</span>
          )}
        </div>
        {asset?.filename && (
          <div className="text-[11px] text-muted-foreground truncate mt-0.5">{asset.filename}</div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPickFile(f);
            e.target.value = '';
          }}
        />
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-[11px]"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
          <span className="ml-1">{available ? 'Replace' : 'Upload'}</span>
        </Button>
        <Switch
          checked={available && checked}
          onCheckedChange={onCheckedChange}
          disabled={!available}
        />
      </div>
    </div>
  );
}
