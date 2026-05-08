import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, Sparkles, Loader2, MoreHorizontal } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useEmailSettings } from '@/hooks/useEmailSettings';
import { useEmailSignatures } from '@/hooks/useEmailSignatures';
import { useBridgeSendEmail } from '@/hooks/useBridgeEmail';
import { renderForRecipient } from '@/lib/emailVariables';
import { toast } from 'sonner';

/**
 * Inline email reply box rendered directly inside the chat thread, just like
 * the SMS / WhatsApp composer. Lets the agent fire off a quick reply without
 * popping the full ComposeEmailDialog.
 *
 * Design rules:
 *  - Single-line collapsed → expands on focus into a multi-line editor with a
 *    Subject row (auto pre-filled "Re: <last subject>"), a Send button and an
 *    "Open full editor" escape hatch for power features (CC/BCC, attachments,
 *    templates, signatures, forwarding, scheduling).
 *  - Reuses `useBridgeSendEmail` so the email goes through the same bridge,
 *    is logged into `crm_email_log`, and the DB trigger creates the linked
 *    `crm_messages` row that the thread renders. No duplicate inserts.
 *  - The active signature is auto-appended (matches dialog behaviour).
 *  - ⌘/Ctrl+Enter sends.
 */
interface Props {
  contact: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
  };
  /** Last known subject in the thread, used to seed "Re: …". */
  lastSubject?: string | null;
  /** Open the full ComposeEmailDialog (for CC/BCC, attach, templates, etc.). */
  onOpenFull: () => void;
}

export function InlineEmailReplyBox({ contact, lastSubject, onOpenFull }: Props) {
  const { user } = useAuth();
  const { data: emailSettings } = useEmailSettings();
  const { data: signatures = [] } = useEmailSignatures();
  const sendBridge = useBridgeSendEmail();

  const [expanded, setExpanded] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  const seededSubject = useMemo(() => {
    const s = (lastSubject || '').replace(/^(re:\s*)+/i, '').trim();
    return s ? `Re: ${s}` : '';
  }, [lastSubject]);

  // Seed subject the first time the box expands (per thread).
  useEffect(() => {
    if (!expanded) return;
    if (!subject) setSubject(seededSubject);
  }, [expanded, seededSubject, subject]);

  const activeSignatureHtml = useMemo(() => {
    const def = signatures.find((s) => s.is_default) ?? signatures[0];
    if (def) return def.html;
    return emailSettings?.signature_html ?? '';
  }, [signatures, emailSettings]);

  const senderCtx = useMemo(
    () => ({
      lead: {
        first_name: contact.first_name,
        last_name: contact.last_name,
        email: contact.email,
        phone: contact.phone,
      },
      sender: {
        full_name: emailSettings?.sender_name ?? user?.email ?? '',
        first_name: (emailSettings?.sender_name ?? '').split(' ')[0] ?? '',
        email: emailSettings?.reply_to ?? user?.email ?? '',
        signature: activeSignatureHtml,
      },
    }),
    [contact, emailSettings, user, activeSignatureHtml],
  );

  const canSend = !!contact.email && !!subject.trim() && !!body.trim();
  const isPending = sendBridge.isPending;

  const reset = () => {
    setBody('');
    setSubject('');
    setExpanded(false);
  };

  const handleSend = async () => {
    if (!canSend || isPending) return;
    // Plain-text → minimal HTML so each line break is preserved.
    const bodyHtml = body
      .split(/\n{2,}/)
      .map((para) =>
        `<p>${para
          .split('\n')
          .map((line) => line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))
          .join('<br/>')}</p>`,
      )
      .join('');
    const merged = renderForRecipient(bodyHtml, senderCtx);
    const finalHtml = activeSignatureHtml ? `${merged}<br/>${activeSignatureHtml}` : merged;
    const renderedSubject = renderForRecipient(subject, senderCtx);

    try {
      await sendBridge.mutateAsync({
        to: contact.email!,
        subject: renderedSubject,
        html: finalHtml,
        contact_id: contact.id,
      });
      reset();
    } catch {
      /* toast handled in hook */
    }
  };

  // Collapsed state — single-line "Reply by email…" launcher
  if (!expanded) {
    return (
      <div className="sticky bottom-0 border-t border-border bg-background/95 backdrop-blur px-3 py-2.5 pb-[calc(env(safe-area-inset-bottom,0px)+10px)]">
        <button
          type="button"
          onClick={() => {
            if (!contact.email) {
              toast.error('This contact has no email on file');
              return;
            }
            setExpanded(true);
            setTimeout(() => bodyRef.current?.focus(), 30);
          }}
          className="w-full h-11 rounded-full bg-muted/60 border border-border text-left px-4 text-[13px] text-muted-foreground hover:text-foreground hover:bg-muted active:scale-[0.99] transition-all"
        >
          Reply by email…
        </button>
      </div>
    );
  }

  // Expanded inline composer
  return (
    <div className="sticky bottom-0 border-t border-border bg-background/95 backdrop-blur px-3 pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+10px)]">
      <div className="rounded-2xl border border-border bg-background shadow-sm overflow-hidden">
        {/* Subject row */}
        <div className="flex items-center gap-2 px-3 h-9 border-b border-border/60">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Subject</span>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Add a subject"
            className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/60"
          />
        </div>

        {/* Body */}
        <textarea
          ref={bodyRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              void handleSend();
            }
            if (e.key === 'Escape' && !body.trim() && !subject.trim()) {
              e.preventDefault();
              setExpanded(false);
            }
          }}
          rows={4}
          placeholder={`Write your reply to ${contact.first_name || contact.email}…`}
          className="w-full resize-none bg-transparent px-3 py-2.5 text-[14px] leading-snug outline-none placeholder:text-muted-foreground/60 max-h-[40vh]"
        />

        {/* Action bar */}
        <div className="flex items-center justify-between gap-2 px-2.5 py-2 border-t border-border/60 bg-muted/20">
          <button
            type="button"
            onClick={onOpenFull}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors px-1.5"
            title="Open full editor for CC/BCC, attachments, templates"
          >
            More options
          </button>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={reset}
              className="h-8 px-3 rounded-full text-[12px] text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend || isPending}
              className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[12px] font-semibold text-primary-foreground active:scale-95 transition-transform shadow-sm disabled:opacity-50 disabled:pointer-events-none"
              style={{ background: 'hsl(var(--primary))' }}
            >
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {isPending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
