import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { useZaraCommandBar } from '@/stores/useZaraCommandBar';
import { useZaraDock } from '@/stores/useZaraDock';
import { useZaraPageContext, type ZaraSurface } from '@/hooks/useZaraPageContext';

type Action = {
  id: string;
  label: string;
  hint?: string;
  group: 'Context' | 'Rewrite' | 'Project' | 'Navigate' | 'Workspace';
  run: () => void;
  shortcut?: string;
};

/**
 * Send a prompt straight into the Zara dock and open it.
 * Reuses the existing dock event API — no parallel chat plumbing.
 */
function pushToDock(prompt: string) {
  const dock = useZaraDock.getState();
  dock.setConversationId(null);
  dock.setPendingMessage(prompt);
  dock.setOpen(true);
  setTimeout(() => {
    window.dispatchEvent(new Event('zara-dock:new-and-focus'));
  }, 60);
}

/**
 * Emit a composer-targeted event that ComposeEmailDialog / SMS thread
 * can listen for. Falls back to dock if no composer is mounted.
 */
function emitRewrite(kind: string) {
  const evt = new CustomEvent('zara:rewrite-request', { detail: { kind } });
  const handled = !window.dispatchEvent(evt);
  if (!handled) {
    // No active composer — pivot to a dock prompt instead.
    pushToDock(`Rewrite my last message — ${kind}.`);
  }
}

export function ZaraCommandBar() {
  const { open, setOpen } = useZaraCommandBar();
  const ctx = useZaraPageContext();
  const navigate = useNavigate();

  const actions: Action[] = useMemo(() => {
    const list: Action[] = [];
    const goto = (path: string) => () => { navigate(path); setOpen(false); };

    // ── Context-aware (lead) ────────────────────────────────────────────
    if (ctx.surface === 'lead_detail' && ctx.contact_id) {
      const cid = ctx.contact_id;
      list.push(
        { id: 'lead-draft', label: 'Draft follow-up', group: 'Context', run: () => { pushToDock(`Draft a follow-up for lead ${cid}. Use their memory + the matching playbook.`); setOpen(false); } },
        { id: 'lead-analyze', label: 'Analyze this lead', group: 'Context', run: () => { pushToDock(`Analyze lead ${cid}: emotional state, momentum, objections, next step.`); setOpen(false); } },
        { id: 'lead-objections', label: 'Summarize objections', group: 'Context', run: () => { pushToDock(`Summarize objections + hesitation signals for lead ${cid}.`); setOpen(false); } },
        { id: 'lead-next-step', label: 'Suggest next step', group: 'Context', run: () => { pushToDock(`What's the best next micro-commitment for lead ${cid}?`); setOpen(false); } },
        { id: 'lead-readiness', label: 'Predict readiness', group: 'Context', run: () => { pushToDock(`Score appointment-readiness for lead ${cid} and explain why.`); setOpen(false); } },
        { id: 'lead-investor', label: 'Generate investor angle', group: 'Context', run: () => { pushToDock(`Reframe the conversation with lead ${cid} from an investor angle.`); setOpen(false); } },
      );
    }

    // ── Context-aware (email / chats) — rewrite chips ───────────────────
    if (ctx.surface === 'email' || ctx.surface === 'chats') {
      list.push(
        { id: 'rw-softer', label: 'Rewrite — softer', group: 'Rewrite', run: () => { emitRewrite('softer'); setOpen(false); } },
        { id: 'rw-less-salesy', label: 'Rewrite — less salesy', group: 'Rewrite', run: () => { emitRewrite('less_salesy'); setOpen(false); } },
        { id: 'rw-trust', label: 'Rewrite — more trust-building', group: 'Rewrite', run: () => { emitRewrite('more_trust'); setOpen(false); } },
        { id: 'rw-investor', label: 'Rewrite — investor framing', group: 'Rewrite', run: () => { emitRewrite('investor'); setOpen(false); } },
        { id: 'rw-uzair', label: 'Rewrite like Uzair', group: 'Rewrite', run: () => { emitRewrite('like_uzair'); setOpen(false); } },
      );
    }

    // ── Context-aware (project) ─────────────────────────────────────────
    if (ctx.surface === 'projects_list' || ctx.project_id) {
      const slug = ctx.project_id ?? 'this project';
      list.push(
        { id: 'pr-pitch-inv', label: 'Generate pitch — investor', group: 'Project', run: () => { pushToDock(`Generate an investor pitch for ${slug}.`); setOpen(false); } },
        { id: 'pr-pitch-fam', label: 'Generate pitch — family buyer', group: 'Project', run: () => { pushToDock(`Generate a family-buyer pitch for ${slug}.`); setOpen(false); } },
        { id: 'pr-risk', label: 'Risk analysis', group: 'Project', run: () => { pushToDock(`Walk through the risks/weak spots of ${slug}.`); setOpen(false); } },
        { id: 'pr-compare', label: 'Compare against nearby projects', group: 'Project', run: () => { pushToDock(`Compare ${slug} against 2–3 nearby presale projects.`); setOpen(false); } },
      );
    }

    // ── Always-on navigation ────────────────────────────────────────────
    list.push(
      { id: 'nav-zara', label: 'Open Zara Intelligence', group: 'Navigate', run: goto('/crm/zara'), shortcut: 'g z' },
      { id: 'nav-queue', label: 'Open draft queue', group: 'Navigate', run: goto('/crm/zara/queue') },
      { id: 'nav-founder', label: 'Open Founder Brain', group: 'Navigate', run: goto('/crm/zara/founder') },
      { id: 'nav-training', label: 'Open Training', group: 'Navigate', run: goto('/crm/zara/training') },
      { id: 'nav-leads', label: 'Go to Leads', group: 'Navigate', run: goto('/crm/leads') },
      { id: 'nav-inbox', label: 'Go to Inbox', group: 'Navigate', run: goto('/crm/inbox') },
    );

    // ── Workspace ───────────────────────────────────────────────────────
    list.push(
      { id: 'ws-chat', label: 'Ask Zara anything…', group: 'Workspace', run: () => { pushToDock(''); setOpen(false); }, shortcut: '⌘J' },
      { id: 'ws-hot', label: 'Show hot signals', group: 'Workspace', run: () => { pushToDock('What hot signals do I have right now across all my leads?'); setOpen(false); } },
    );

    return list;
  }, [ctx, navigate, setOpen]);

  // Listen for global open requests (e.g. from useZaraKeyboard).
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener('zara-command-bar:open', onOpen);
    return () => window.removeEventListener('zara-command-bar:open', onOpen);
  }, [setOpen]);

  const groups = useMemo(() => {
    const map = new Map<Action['group'], Action[]>();
    for (const a of actions) {
      const arr = map.get(a.group) ?? [];
      arr.push(a);
      map.set(a.group, arr);
    }
    return Array.from(map.entries());
  }, [actions]);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="What do you want Zara to do?" />
      <CommandList className="max-h-[60dvh]">
        <CommandEmpty>No actions match.</CommandEmpty>
        {groups.map(([group, items], idx) => (
          <div key={group}>
            {idx > 0 && <CommandSeparator />}
            <CommandGroup heading={group}>
              {items.map((a) => (
                <CommandItem key={a.id} value={`${a.group} ${a.label}`} onSelect={a.run}>
                  <span className="text-[13px]">{a.label}</span>
                  {a.shortcut && <CommandShortcut>{a.shortcut}</CommandShortcut>}
                </CommandItem>
              ))}
            </CommandGroup>
          </div>
        ))}
      </CommandList>
    </CommandDialog>
  );
}

// Re-export for parity with other Zara surfaces that need the surface union.
export type { ZaraSurface };
