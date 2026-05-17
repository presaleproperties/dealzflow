import { useEffect, useMemo, useState } from 'react';
import { Pin, FileText, MessageSquare, Sparkles, BellOff, Activity, Mail, Wand2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useZaraPin } from '@/hooks/useZaraPin';
import { formatContactName } from '@/lib/format';

export type SlashCommand = {
  key: string;
  label: string;
  hint: string;
  icon: any;
  /** Returns the message text to send (or null to perform a non-send action). */
  exec: (args: { arg: string; pinnedId: string | null }) => Promise<string | null> | string | null;
  needsArg?: boolean;
  needsPin?: boolean;
};

const BASE_COMMANDS: SlashCommand[] = [
  {
    key: 'lead', label: '/lead', hint: 'Pin a lead by name', icon: Pin, needsArg: true,
    exec: () => null, // handled inline (lead picker)
  },
  {
    key: 'send-projects', label: '/send-projects', hint: 'Send 3 best projects to pinned lead', icon: Sparkles, needsPin: true,
    exec: () => 'Send the 3 best matching projects to the pinned lead via email.',
  },
  {
    key: 'draft-reply', label: '/draft-reply', hint: 'Draft a reply to last inbound', icon: Mail, needsPin: true,
    exec: () => 'Draft a reply to the pinned lead\'s most recent inbound message. Be warm, concise, end with one CTA.',
  },
  {
    key: 'summarize', label: '/summarize', hint: 'Summarize pinned lead (30d)', icon: FileText, needsPin: true,
    exec: () => 'Give me a one-paragraph summary of the pinned lead\'s last 30 days: source, engagement, key signals, last touch, and what I should do next.',
  },
  {
    key: 'nudge', label: '/nudge', hint: 'Plan one nudge for pinned lead', icon: MessageSquare, needsPin: true,
    exec: () => 'Plan one outbound nudge for the pinned lead right now. Tell me the trigger, channel, and proposed message.',
  },
  {
    key: 'mute', label: '/mute', hint: 'Mute Zara for N days', icon: BellOff, needsArg: true, needsPin: true,
    exec: ({ arg }) => `Mute Zara outbound on the pinned lead for ${arg || '7'} days. Use add_lead_tag with "zara_muted_${arg || '7'}d" and explain why.`,
  },
  {
    key: 'audit', label: '/audit', hint: 'Show today\'s outbound audit', icon: Activity,
    exec: () => 'Show me today\'s outbound audit: every Zara decision, what fired, what sent, what was blocked.',
  },
  {
    key: 'plan', label: '/plan', hint: 'Dry-run the autonomous planner', icon: Wand2,
    exec: () => 'Run the autonomous outbound planner in dry-run mode and show me what you would send and to whom.',
  },
];

type Props = {
  input: string;
  onSelect: (newInput: string) => void;
  /** Called when a slash command yields a message to send. */
  onCompose: (text: string) => void;
  anchorRef: React.RefObject<HTMLElement | null>;
};

export function SlashCommandPalette({ input, onSelect, onCompose, anchorRef }: Props) {
  const { setPinnedId, pinnedId } = useZaraPin();
  const [leadResults, setLeadResults] = useState<any[]>([]);

  const trimmed = input.trimStart();
  const isOpen = trimmed.startsWith('/');
  const [cmdPart, ...rest] = trimmed.slice(1).split(/\s+/);
  const argPart = rest.join(' ');

  const filtered = useMemo(() => {
    if (!isOpen) return [];
    const q = cmdPart.toLowerCase();
    return BASE_COMMANDS.filter((c) => c.key.startsWith(q) || c.label.includes(q));
  }, [cmdPart, isOpen]);

  // Lead lookup for /lead <name>
  useEffect(() => {
    if (!isOpen || cmdPart !== 'lead' || argPart.length < 2) {
      setLeadResults([]);
      return;
    }
    let cancel = false;
    (async () => {
      const term = `%${argPart}%`;
      const { data } = await supabase
        .from('crm_contacts')
        .select('id, first_name, last_name, email, status')
        .or(`first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term}`)
        .limit(6);
      if (!cancel) setLeadResults(data ?? []);
    })();
    return () => { cancel = true; };
  }, [cmdPart, argPart, isOpen]);

  if (!isOpen) return null;

  // /lead picker
  if (cmdPart === 'lead') {
    return (
      <Panel anchorRef={anchorRef}>
        <Header>Pin a lead</Header>
        {argPart.length < 2 && (
          <div className="px-3 py-2 text-[11.5px] text-muted-foreground">Type at least 2 letters of a name or email.</div>
        )}
        {leadResults.map((l) => (
          <button
            key={l.id}
            onClick={() => {
              setPinnedId(l.id);
              onSelect('');
            }}
            className="w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors flex items-center justify-between gap-2"
          >
            <span className="text-[13px] font-medium truncate">{formatContactName(l.first_name, l.last_name)}</span>
            <span className="text-[10.5px] text-muted-foreground truncate">{l.email ?? l.status ?? ''}</span>
          </button>
        ))}
        {argPart.length >= 2 && leadResults.length === 0 && (
          <div className="px-3 py-2 text-[11.5px] text-muted-foreground">No matches.</div>
        )}
      </Panel>
    );
  }

  return (
    <Panel anchorRef={anchorRef}>
      <Header>Slash commands</Header>
      {filtered.length === 0 && (
        <div className="px-3 py-2 text-[11.5px] text-muted-foreground">No commands match "/{cmdPart}".</div>
      )}
      {filtered.map((c) => {
        const disabled = (c.needsPin && !pinnedId);
        const Icon = c.icon;
        return (
          <button
            key={c.key}
            disabled={disabled}
            onClick={async () => {
              const msg = await c.exec({ arg: argPart, pinnedId });
              if (msg) onCompose(msg);
              else onSelect('');
            }}
            className="w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors flex items-center gap-3 disabled:opacity-40"
            title={disabled ? 'Pin a lead first with /lead' : ''}
          >
            <Icon className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="text-[12.5px] font-mono font-medium">{c.label}</span>
            <span className="text-[11px] text-muted-foreground truncate">{c.hint}</span>
            {c.needsPin && <span className="ml-auto text-[10px] text-muted-foreground uppercase tracking-wider">pin</span>}
          </button>
        );
      })}
    </Panel>
  );
}

function Panel({ children, anchorRef }: { children: React.ReactNode; anchorRef: React.RefObject<HTMLElement | null> }) {
  // simple positioned popover anchored above the textarea container
  return (
    <div className="absolute left-0 right-0 bottom-full mb-2 z-30">
      <div className="mx-auto max-w-2xl rounded-xl border border-border bg-popover text-popover-foreground shadow-lg overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function Header({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/40 border-b border-border/60">
      {children}
    </div>
  );
}
