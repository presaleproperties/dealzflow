/**
 * ZaraEngagePanel — in-lead command surface to engage Zara directly.
 *
 * Four one-tap actions: Follow up now · Schedule follow-up · Summarize lead ·
 * Book a showing — plus a free-text composer that asks Zara to take an
 * action on this specific lead.
 *
 * All routes through the `zara-engage-action` edge function so auth/audit/
 * scheduling live in one place. Results land in the lead's timeline + the
 * Zara Reply Chip (already mounted in CenterColumn).
 */
import { useState } from 'react';
import { Sparkles, Send, Clock, RefreshCw, CalendarDays, Loader2, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useQueryClient } from '@tanstack/react-query';
import { BookShowingDialog } from './BookShowingDialog';
import type { CrmContact } from '@/hooks/useCrmContacts';

type Channel = 'email' | 'sms' | 'whatsapp';
type ActionKind = 'follow_up_now' | 'schedule_followup' | 'summarize_lead' | 'custom';

const QUICK_PROMPTS = [
  'Follow up — they went quiet for a week',
  'Ask if they have time for a 15-min call this week',
  'Share next steps and a calendar link',
  'Check in on financing — see if they need a broker intro',
];

export function ZaraEngagePanel({ contact }: { contact: CrmContact }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<ActionKind | null>(null);
  const [open, setOpen] = useState(true);
  const [channel, setChannel] = useState<Channel>(contact.email ? 'email' : 'sms');
  const [prompt, setPrompt] = useState('');
  const [showShowing, setShowShowing] = useState(false);
  const [scheduleHours, setScheduleHours] = useState<number>(24);

  const run = async (kind: ActionKind, payload: Record<string, any> = {}) => {
    setBusy(kind);
    try {
      const { data, error } = await supabase.functions.invoke('zara-engage-action', {
        body: { kind, contactId: contact.id, channel, ...payload },
      });
      if (error) throw error;
      switch (kind) {
        case 'follow_up_now':
        case 'custom':
          toast.success('Zara is drafting — review the gold chip above the timeline.', { duration: 5000 });
          qc.invalidateQueries({ queryKey: ['zara-lead-draft', contact.id] });
          break;
        case 'schedule_followup':
          toast.success(`Scheduled in ${payload.in_hours ?? 24}h`, { description: 'Zara will surface this in your nudges.' });
          qc.invalidateQueries({ queryKey: ['engagement-events', contact.id] });
          break;
        case 'summarize_lead': {
          const summary = (data as any)?.memory?.summary;
          toast.success('Memory refreshed', { description: summary ? summary.slice(0, 120) : undefined });
          qc.invalidateQueries({ queryKey: ['zara-lead-memory', contact.id] });
          break;
        }
      }
      if (kind === 'custom') setPrompt('');
    } catch (e: any) {
      toast.error(e?.message ?? 'Engage failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="rounded-xl border border-primary/30 bg-gradient-to-b from-primary/[0.06] to-transparent shadow-sm overflow-hidden">
        <button
          onClick={() => setOpen((o) => !o)}
          className="w-full px-4 py-2.5 flex items-center justify-between border-b border-primary/15 hover:bg-primary/[0.04] transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
            </span>
            <div className="text-left">
              <div className="text-[12.5px] font-semibold tracking-tight">Engage Zara</div>
              <div className="text-[10.5px] text-muted-foreground">Ask her to act on this lead</div>
            </div>
          </div>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="p-3 space-y-3">
            {/* Channel selector */}
            <div className="flex items-center gap-1 text-[10.5px]">
              <span className="uppercase tracking-wider text-muted-foreground mr-1">Channel</span>
              {(['email', 'sms', 'whatsapp'] as const).map((c) => {
                const enabled = c === 'email' ? !!contact.email : !!contact.phone;
                return (
                  <button
                    key={c}
                    onClick={() => enabled && setChannel(c)}
                    disabled={!enabled}
                    className={`px-2 py-0.5 rounded-md border transition-colors uppercase tracking-wider ${
                      channel === c
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card border-border text-muted-foreground hover:border-primary/40 disabled:opacity-40'
                    }`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>

            {/* Quick actions */}
            <div className="grid grid-cols-2 gap-1.5">
              <Button
                size="sm"
                onClick={() => run('follow_up_now')}
                disabled={busy !== null}
                className="h-9 text-[12px] gap-1.5 justify-start bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {busy === 'follow_up_now' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Follow up now
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => run('schedule_followup', { in_hours: scheduleHours })}
                disabled={busy !== null}
                className="h-9 text-[12px] gap-1.5 justify-start"
              >
                {busy === 'schedule_followup' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Clock className="w-3.5 h-3.5 text-primary" />}
                In {scheduleHours}h
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => run('summarize_lead')}
                disabled={busy !== null}
                className="h-9 text-[12px] gap-1.5 justify-start"
              >
                {busy === 'summarize_lead' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 text-primary" />}
                Summarize
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowShowing(true)}
                className="h-9 text-[12px] gap-1.5 justify-start"
              >
                <CalendarDays className="w-3.5 h-3.5 text-primary" />
                Book showing
              </Button>
            </div>

            {/* Schedule presets */}
            <div className="flex items-center gap-1 text-[10.5px]">
              <span className="uppercase tracking-wider text-muted-foreground mr-1">Schedule</span>
              {[
                { l: '1h', v: 1 }, { l: '24h', v: 24 }, { l: '3d', v: 72 }, { l: '7d', v: 168 },
              ].map((p) => (
                <button
                  key={p.v}
                  onClick={() => setScheduleHours(p.v)}
                  className={`px-2 py-0.5 rounded-md border transition-colors ${
                    scheduleHours === p.v
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card border-border text-muted-foreground hover:border-primary/40'
                  }`}
                >
                  {p.l}
                </button>
              ))}
            </div>

            {/* Free-text composer */}
            <div className="rounded-lg border border-border bg-card focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/15 transition p-1.5">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && prompt.trim()) {
                    e.preventDefault();
                    run('custom', { prompt: prompt.trim() });
                  }
                }}
                rows={2}
                placeholder="Tell Zara what to do — e.g. 'Follow up about parking spot question'"
                className="w-full resize-none bg-transparent outline-none text-[12.5px] px-1.5 py-1 min-h-[44px]"
              />
              <div className="flex items-center justify-between gap-2 pt-1">
                <div className="flex gap-1 overflow-x-auto pb-0.5">
                  {QUICK_PROMPTS.map((q) => (
                    <button
                      key={q}
                      onClick={() => setPrompt(q)}
                      className="shrink-0 text-[10.5px] px-2 py-0.5 rounded-full border border-border bg-background hover:bg-muted/60 hover:border-primary/40 whitespace-nowrap text-muted-foreground"
                    >
                      {q}
                    </button>
                  ))}
                </div>
                <Button
                  size="sm"
                  onClick={() => prompt.trim() && run('custom', { prompt: prompt.trim() })}
                  disabled={!prompt.trim() || busy !== null}
                  className="h-7 px-2 text-[11px] gap-1 bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
                >
                  {busy === 'custom' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                  Ask
                </Button>
              </div>
            </div>

            <p className="text-[10px] text-muted-foreground/80 leading-snug">
              Zara drafts on the {channel.toUpperCase()} channel. Review and approve the gold chip above the timeline before it sends.
            </p>
          </div>
        )}
      </div>

      <BookShowingDialog
        contactId={contact.id}
        project={(contact as any).project}
        open={showShowing}
        onOpenChange={setShowShowing}
      />
    </>
  );
}
