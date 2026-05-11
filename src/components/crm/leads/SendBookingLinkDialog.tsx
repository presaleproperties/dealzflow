import { useMemo, useState } from 'react';
import { ResponsiveDialog, ResponsiveDialogContent, ResponsiveDialogHeader, ResponsiveDialogTitle, ResponsiveDialogFooter } from '@/components/ui/responsive-dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Copy, Mail, MessageSquare, ExternalLink, Calendar as CalIcon, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAgentSchedulerProfile, useSchedulerEventTypes } from '@/hooks/useScheduler';
import { ComposeEmailDialog } from './ComposeEmailDialog';
import { SendTextDialog } from './SendTextDialog';
import type { CrmContact } from '@/hooks/useCrmContacts';

interface Props {
  contact: CrmContact;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SendBookingLinkDialog({ contact, open, onOpenChange }: Props) {
  const { data: profile, isLoading: loadingProfile } = useAgentSchedulerProfile();
  const { data: eventTypes = [], isLoading: loadingTypes } = useSchedulerEventTypes();
  const active = useMemo(() => eventTypes.filter((e) => e.is_active), [eventTypes]);
  const [selectedSlug, setSelectedSlug] = useState<string>('landing');
  const [prefill, setPrefill] = useState(true);
  const [composeEmail, setComposeEmail] = useState(false);
  const [composeSms, setComposeSms] = useState(false);

  const slug = profile?.slug || null;
  const baseUrl = useMemo(() => {
    if (!slug) return null;
    return selectedSlug === 'landing'
      ? `${window.location.origin}/r/${slug}`
      : `${window.location.origin}/r/${slug}/${selectedSlug}`;
  }, [slug, selectedSlug]);

  const url = useMemo(() => {
    if (!baseUrl) return null;
    if (!prefill) return baseUrl;
    const params = new URLSearchParams();
    const name = `${contact.first_name || ''} ${contact.last_name && contact.last_name !== '(unknown)' ? contact.last_name : ''}`.trim();
    if (name) params.set('prefill_name', name);
    if (contact.email) params.set('prefill_email', contact.email);
    if (contact.phone) params.set('prefill_phone', contact.phone);
    return params.toString() ? `${baseUrl}?${params.toString()}` : baseUrl;
  }, [baseUrl, prefill, contact]);

  const eventTitle = selectedSlug === 'landing'
    ? 'a meeting'
    : (active.find((e) => e.slug === selectedSlug)?.title || 'a meeting');

  const emailSubject = `Book ${eventTitle} with ${profile?.display_name || 'me'}`;
  const emailBody = `<p>Hi ${contact.first_name || 'there'},</p>
<p>Here's a quick link to book ${eventTitle} on my calendar — pick whatever time works for you:</p>
<p><a href="${url}" style="color:#D7A542;text-decoration:underline">${url}</a></p>
<p>Looking forward to it.</p>`;

  const smsBody = `Hi ${contact.first_name || ''}, grab a time on my calendar here: ${url}`.trim();

  const copy = () => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    toast.success('Link copied');
  };

  const setupNeeded = !loadingProfile && !slug;

  return (
    <>
      <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
        <ResponsiveDialogContent className="max-w-[520px]">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle className="flex items-center gap-2">
              <CalIcon className="w-4 h-4 text-primary" /> Send booking link
            </ResponsiveDialogTitle>
          </ResponsiveDialogHeader>

          {loadingProfile || loadingTypes ? (
            <div className="py-8 flex items-center justify-center text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading…
            </div>
          ) : setupNeeded ? (
            <div className="py-6 text-center space-y-3">
              <p className="text-[13.5px] text-muted-foreground">Set up your scheduler URL to share booking links.</p>
              <Button size="sm" onClick={() => window.open('/crm/scheduler?tab=setup&section=profile', '_blank')}>
                Open Scheduler setup <ExternalLink className="w-3 h-3 ml-1.5" />
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label className="text-[12px]">Choose what to share</Label>
                <select
                  value={selectedSlug}
                  onChange={(e) => setSelectedSlug(e.target.value)}
                  className="w-full h-9 mt-1 px-3 rounded-md border border-input bg-background text-[13px]"
                >
                  <option value="landing">Landing page (all event types)</option>
                  {active.map((et) => (
                    <option key={et.id} value={et.slug}>{et.title} · {et.duration_min}m</option>
                  ))}
                </select>
                {active.length === 0 && (
                  <p className="text-[11.5px] text-amber-600 mt-1.5">No active event types — only the landing page link is shareable.</p>
                )}
              </div>

              <div className="flex items-center justify-between py-2 border-y border-border">
                <div>
                  <Label className="text-[13px]">Pre-fill invitee details</Label>
                  <p className="text-[11.5px] text-muted-foreground">Name, email, phone from this lead</p>
                </div>
                <Switch checked={prefill} onCheckedChange={setPrefill} />
              </div>

              <div>
                <Label className="text-[12px]">Link</Label>
                <div className="mt-1 px-3 py-2 rounded-md border border-border bg-muted/40 text-[12px] break-all font-mono text-foreground/80">
                  {url}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <Button variant="outline" size="sm" onClick={copy}>
                  <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy
                </Button>
                <Button variant="outline" size="sm" onClick={() => setComposeEmail(true)} disabled={!contact.email}>
                  <Mail className="w-3.5 h-3.5 mr-1.5" /> Email
                </Button>
                <Button variant="outline" size="sm" onClick={() => setComposeSms(true)} disabled={!contact.phone}>
                  <MessageSquare className="w-3.5 h-3.5 mr-1.5" /> SMS
                </Button>
              </div>
            </div>
          )}

          <ResponsiveDialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      <ComposeEmailDialog
        contact={contact}
        open={composeEmail}
        onOpenChange={(o) => { setComposeEmail(o); if (!o) onOpenChange(false); }}
        initialSubject={emailSubject}
        initialBodyHtml={emailBody}
      />
      <SendTextDialog
        contact={contact}
        open={composeSms}
        onOpenChange={(o) => { setComposeSms(o); if (!o) onOpenChange(false); }}
        initialChannel="sms"
        initialBody={smsBody}
      />
    </>
  );
}
