import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Search, Send, User, X, XCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useBridgeSendEmail, type BridgeTemplate } from '@/hooks/useBridgeEmail';
import { renderForRecipient, renderWithSampleData, type RecipientLead } from '@/lib/emailVariables';
import { useEmailSettings } from '@/hooks/useEmailSettings';
import {
  loadQuickSendMemory,
  saveQuickSendMemory,
} from '@/lib/quickSendMemory';

type Recipient = { id?: string; email: string; name: string; lead?: RecipientLead };

/**
 * Mirror of Presale's TemplateQuickSendDialog. Lets the user search CRM
 * leads/clients, multi-select, and fire the email through the Presale bridge.
 */
export function PresaleQuickSendDialog({
  asset,
  open,
  onOpenChange,
  onSent,
}: {
  asset: BridgeTemplate | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSent?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Recipient[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [manualEmail, setManualEmail] = useState('');
  const [searching, setSearching] = useState(false);
  const [subject, setSubject] = useState('');
  type SendStatus = 'pending' | 'sending' | 'success' | 'failed';
  const [sendProgress, setSendProgress] = useState<
    Record<string, { status: SendStatus; error?: string }>
  >({});
  const [isSending, setIsSending] = useState(false);
  const send = useBridgeSendEmail();
  const { data: emailSettings } = useEmailSettings();
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  const [prefilledFromMemory, setPrefilledFromMemory] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setRecipients([]);
      setManualEmail('');
      setSendProgress({});
      setIsSending(false);
      setPrefilledFromMemory(false);
      return;
    }
    if (!asset) return;

    // Try to hydrate from saved memory for this template; otherwise fall back
    // to the template's default subject and an empty recipient list.
    const memory = loadQuickSendMemory(asset.id);
    setSubject(memory?.subject || asset.subject || asset.name || '');

    if (!memory || memory.recipients.length === 0) {
      setPrefilledFromMemory(false);
      return;
    }

    // Seed recipients immediately with what we have; refetch full lead
    // records in the background so per-recipient personalization tokens
    // resolve correctly on send/preview.
    setRecipients(
      memory.recipients.map((r) => ({ id: r.id, email: r.email, name: r.name })),
    );
    setPrefilledFromMemory(true);

    const ids = memory.recipients.map((r) => r.id).filter((x): x is string => !!x);
    if (ids.length === 0) return;

    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('crm_contacts')
        .select(
          'id, first_name, last_name, email, phone, city, intent, budget_max, timeframe, property_type_pref, co_buyer_name, co_buyer_email',
        )
        .in('id', ids);
      if (cancelled || !data) return;
      const byId = new Map(data.map((c) => [c.id, c as RecipientLead]));
      setRecipients((prev) =>
        prev.map((r) => (r.id && byId.has(r.id) ? { ...r, lead: byId.get(r.id) } : r)),
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [open, asset]);

  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([]);
      return;
    }
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      const term = `%${query}%`;
      const { data } = await supabase
        .from('crm_contacts')
        .select('id, first_name, last_name, email, phone, city, intent, budget_max, timeframe, property_type_pref, co_buyer_name, co_buyer_email')
        .or(`first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term}`)
        .not('email', 'is', null)
        .limit(10);
      const mapped: Recipient[] = (data ?? [])
        .filter((c) => c.email)
        .map((c) => ({
          id: c.id,
          email: c.email!,
          name: [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email!,
          lead: c as RecipientLead,
        }));
      setResults(mapped);
      setSearching(false);
    }, 300);
  }, [query]);

  const addRecipient = (r: Recipient) => {
    if (recipients.some((x) => x.email.toLowerCase() === r.email.toLowerCase())) return;
    setRecipients((prev) => [...prev, r]);
    setQuery('');
    setResults([]);
  };

  const addManual = () => {
    const e = manualEmail.trim();
    if (!e || !/^\S+@\S+\.\S+$/.test(e)) return;
    addRecipient({ email: e, name: e });
    setManualEmail('');
  };

  const removeRecipient = (email: string) => {
    setRecipients((prev) => prev.filter((r) => r.email !== email));
  };

  const handleSend = async () => {
    if (!asset || recipients.length === 0) return;
    const html = asset.body_html || '';
    const sender = {
      first_name: (emailSettings?.sender_name || '').split(' ')[0] || '',
      full_name: emailSettings?.sender_name || '',
      email: emailSettings?.reply_to || '',
      phone: (emailSettings as any)?.signature_builder_data?.phone || '',
      signature: emailSettings?.signature_html || '',
    };
    setIsSending(true);
    setSendProgress(
      Object.fromEntries(recipients.map((r) => [r.email, { status: 'pending' as SendStatus }])),
    );
    let successes = 0;
    let failures = 0;
    // Send each recipient individually so per-recipient tokens render correctly.
    for (const r of recipients) {
      setSendProgress((p) => ({ ...p, [r.email]: { status: 'sending' } }));
      const ctx = { lead: r.lead ?? { first_name: r.name }, sender };
      const personalizedHtml = renderForRecipient(html, ctx);
      const personalizedSubject = renderForRecipient(
        subject || asset.name || 'Presale Properties',
        ctx,
      );
      try {
        await send.mutateAsync({
          to: r.email,
          subject: personalizedSubject,
          html: personalizedHtml,
          template_id: asset.id,
          contact_id: r.id ?? null,
        });
        successes++;
        setSendProgress((p) => ({ ...p, [r.email]: { status: 'success' } }));
      } catch (e: any) {
        failures++;
        console.error('send failed', e);
        setSendProgress((p) => ({
          ...p,
          [r.email]: { status: 'failed', error: e?.message || 'Failed to send' },
        }));
      }
    }
    setIsSending(false);
    // Persist subject + recipients so the next quick-send for this template
    // is prefilled. Only save when at least one send succeeded.
    if (asset && successes > 0) {
      saveQuickSendMemory(
        asset.id,
        subject,
        recipients.map((r) => ({ id: r.id, email: r.email, name: r.name })),
      );
    }
    onSent?.();
    // Keep dialog open so user can review per-recipient results.
    // They close manually via the Close button.
  };

  const completedCount = Object.values(sendProgress).filter(
    (s) => s.status === 'success' || s.status === 'failed',
  ).length;
  const successCount = Object.values(sendProgress).filter((s) => s.status === 'success').length;
  const failedCount = Object.values(sendProgress).filter((s) => s.status === 'failed').length;
  const totalCount = Object.keys(sendProgress).length;
  const hasProgress = totalCount > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Send {asset?.name ?? 'Template'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 overflow-y-auto pr-1">
          {/* Subject */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
              Subject
            </p>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject"
              className="h-9"
            />
          </div>

          {/* Recipients */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Recipients ({recipients.length})
              </p>
              {prefilledFromMemory && recipients.length > 0 && !hasProgress && (
                <button
                  type="button"
                  onClick={() => {
                    setRecipients([]);
                    setPrefilledFromMemory(false);
                  }}
                  className="text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground"
                  title="Clear prefilled recipients"
                >
                  Prefilled · Clear
                </button>
              )}
            </div>
            {recipients.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {recipients.map((r) => (
                  <Badge key={r.email} variant="secondary" className="gap-1 pl-2 pr-1 py-1">
                    <span className="text-xs">{r.name}</span>
                    <button
                      onClick={() => removeRecipient(r.email)}
                      className="rounded hover:bg-muted p-0.5"
                      title="Remove"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search CRM contacts by name or email…"
                className="pl-9 h-9"
              />
              {searching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-muted-foreground" />
              )}
            </div>

            {results.length > 0 && (
              <div className="mt-1.5 border border-border rounded-lg bg-card max-h-48 overflow-y-auto">
                {results.map((r) => (
                  <button
                    key={r.email}
                    onClick={() => addRecipient(r)}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent/40 text-left border-b border-border last:border-0"
                  >
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm flex-1">{r.name}</span>
                    <span className="text-xs text-muted-foreground">{r.email}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Manual */}
            <div className="flex gap-1.5 mt-2">
              <Input
                value={manualEmail}
                onChange={(e) => setManualEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addManual();
                  }
                }}
                placeholder="Or type an email address"
                className="h-8 text-sm"
              />
              <Button size="sm" variant="outline" className="h-8 px-3 text-xs" onClick={addManual}>
                Add
              </Button>
            </div>
          </div>

          {/* Preview snippet */}
          {asset?.body_html && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
                Preview
              </p>
              <iframe
                srcDoc={
                  recipients[0]?.lead
                    ? renderForRecipient(asset.body_html, { lead: recipients[0].lead })
                    : renderWithSampleData(asset.body_html)
                }
                className="w-full border border-border rounded-lg bg-white"
                style={{ height: '240px' }}
                sandbox="allow-same-origin"
                title="Send preview"
              />
            </div>
          )}

          {/* Send progress panel */}
          {hasProgress && (
            <div className="border border-border rounded-lg p-3 bg-muted/30 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {isSending ? 'Sending…' : 'Send results'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {completedCount}/{totalCount}
                  {!isSending && (
                    <>
                      {' · '}
                      <span className="text-emerald-600 dark:text-emerald-400">{successCount} sent</span>
                      {failedCount > 0 && (
                        <>
                          {' · '}
                          <span className="text-destructive">{failedCount} failed</span>
                        </>
                      )}
                    </>
                  )}
                </p>
              </div>
              <Progress value={totalCount ? (completedCount / totalCount) * 100 : 0} className="h-1.5" />
              <div className="max-h-40 overflow-y-auto space-y-1 mt-2">
                {recipients.map((r) => {
                  const s = sendProgress[r.email];
                  if (!s) return null;
                  return (
                    <div
                      key={r.email}
                      className="flex items-center gap-2 text-xs px-2 py-1 rounded bg-background/60"
                    >
                      {s.status === 'pending' && (
                        <span className="h-3.5 w-3.5 rounded-full border border-muted-foreground/30 shrink-0" />
                      )}
                      {s.status === 'sending' && (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
                      )}
                      {s.status === 'success' && (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      )}
                      {s.status === 'failed' && (
                        <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                      )}
                      <span className="flex-1 truncate">{r.name}</span>
                      <span className="text-muted-foreground truncate max-w-[180px]">
                        {s.status === 'failed' && s.error ? s.error : r.email}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSending}>
            {hasProgress && !isSending ? 'Close' : 'Cancel'}
          </Button>
          <Button
            onClick={handleSend}
            disabled={recipients.length === 0 || !subject || isSending}
            className="gap-1.5"
          >
            {isSending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            {isSending
              ? `Sending ${completedCount}/${totalCount}…`
              : hasProgress && failedCount > 0
                ? `Retry ${failedCount} failed`
                : `Send to ${recipients.length || 0}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
