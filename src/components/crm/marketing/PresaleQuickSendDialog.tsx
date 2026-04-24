import { useEffect, useRef, useState } from 'react';
import { Loader2, Search, Send, User, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useBridgeSendEmail, type BridgeTemplate } from '@/hooks/useBridgeEmail';
import { renderForRecipient, renderWithSampleData, type RecipientLead } from '@/lib/emailVariables';
import { useEmailSettings } from '@/hooks/useEmailSettings';

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
  const send = useBridgeSendEmail();
  const { data: emailSettings } = useEmailSettings();
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setRecipients([]);
      setManualEmail('');
    }
    if (open && asset) setSubject(asset.subject || asset.name || '');
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
    // Send each recipient individually so per-recipient tokens render correctly.
    for (const r of recipients) {
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
      } catch (e) {
        console.error('send failed', e);
      }
    }
    onSent?.();
    onOpenChange(false);
  };

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
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
              Recipients ({recipients.length})
            </p>
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
                srcDoc={asset.body_html}
                className="w-full border border-border rounded-lg bg-white"
                style={{ height: '240px' }}
                sandbox="allow-same-origin"
                title="Send preview"
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={recipients.length === 0 || !subject || send.isPending}
            className="gap-1.5"
          >
            {send.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Send to {recipients.length || 0}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
