import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow, format } from 'date-fns';
import { useState, useRef } from 'react';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import {
  MessageSquare,
  Phone,
  ExternalLink,
  Calendar,
  Tag,
  DollarSign,
  Home,
  Clock,
  StickyNote,
  Zap,
  User,
  Plus,
  Send,
  X,
} from 'lucide-react';
import type { ProspectRow } from './NeedsAttention';

// ─── helpers ───────────────────────────────────────────────────────────────────
const SOURCE_COLORS: Record<string, string> = {
  tiktok:    'hsl(180 100% 47%)',
  instagram: 'hsl(340 80% 58%)',
  facebook:  'hsl(214 89% 52%)',
  referral:  'hsl(152 69% 40%)',
  whatsapp:  'hsl(142 70% 49%)',
  sms:       'hsl(220 9% 46%)',
  manychat:  'hsl(214 100% 50%)',
};
function srcColor(s: string | null) {
  if (!s) return 'hsl(var(--muted-foreground))';
  return SOURCE_COLORS[s.toLowerCase().trim()] ?? 'hsl(var(--muted-foreground))';
}

function TempBadge({ temp }: { temp: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    hot:  { label: '🔥 Hot',  cls: 'bg-destructive/10 text-destructive border-destructive/20' },
    warm: { label: '☀️ Warm', cls: 'bg-warning/10 text-warning border-warning/20' },
    cold: { label: '❄️ Cold', cls: 'bg-info/10 text-info border-info/20' },
  };
  const t = map[temp?.toLowerCase()] ?? { label: temp, cls: 'bg-muted/50 text-muted-foreground border-border/40' };
  return (
    <span className={cn('text-xs font-semibold px-2.5 py-1 rounded-full border', t.cls)}>
      {t.label}
    </span>
  );
}

function formatBudget(budget: number | null): string {
  if (!budget) return 'Not set';
  if (budget >= 1_000_000) return `$${(budget / 1_000_000).toFixed(2)}M`;
  return `$${(budget / 1_000).toFixed(0)}K`;
}

// ─── Message timeline item ─────────────────────────────────────────────────────
interface Message {
  id: string;
  body: string;
  direction: string;
  sender: string;
  created_at: string;
  status: string | null;
}

function MessageBubble({ msg }: { msg: Message }) {
  const isOut = msg.direction === 'outbound';
  return (
    <div className={cn('flex gap-2', isOut ? 'justify-end' : 'justify-start')}>
      {!isOut && (
        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
          <User className="w-3 h-3 text-primary" />
        </div>
      )}
      <div className={cn(
        'max-w-[75%] px-3 py-2 rounded-2xl text-xs leading-relaxed',
        isOut
          ? 'bg-primary text-primary-foreground rounded-br-sm'
          : 'bg-muted/60 text-foreground rounded-bl-sm border border-border/30',
      )}>
        <p>{msg.body}</p>
        <p className={cn('text-[10px] mt-1 opacity-60', isOut ? 'text-right' : 'text-left')}>
          {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
        </p>
      </div>
      {isOut && (
        <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-1">
          <Zap className="w-3 h-3 text-primary" />
        </div>
      )}
    </div>
  );
}

// ─── Data fetching ─────────────────────────────────────────────────────────────
function useLeadDetail(prospect: ProspectRow | null) {
  // Find matching conversation by lead_name ~ client_name
  const { data: conversation } = useQuery({
    queryKey: ['lead-sheet-conv', prospect?.id],
    queryFn: async () => {
      if (!prospect) return null;
      const { data } = await supabase
        .from('conversations')
        .select('id,lead_name,lead_phone,lead_email,channel,status,created_at,updated_at,last_message_at')
        .ilike('lead_name', `%${prospect.client_name}%`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!prospect,
  });

  const { data: messages = [] } = useQuery({
    queryKey: ['lead-sheet-msgs', conversation?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('messages')
        .select('id,body,direction,sender,created_at,status')
        .eq('conversation_id', conversation!.id)
        .order('created_at', { ascending: true })
        .limit(30);
      return (data ?? []) as Message[];
    },
    enabled: !!conversation?.id,
  });

  const { data: notes = [] } = useQuery({
    queryKey: ['lead-sheet-notes', conversation?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('lead_notes')
        .select('id,body,created_at,created_by')
        .eq('conversation_id', conversation!.id)
        .order('created_at', { ascending: false });
      return data ?? [];
    },
    enabled: !!conversation?.id,
  });

  return { conversation, messages, notes };
}

// ─── Add note hook ─────────────────────────────────────────────────────────────
function useAddNote(conversationId: string | undefined) {
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  async function submit() {
    const body = text.trim();
    if (!body || !conversationId) return;
    if (body.length > 1000) {
      toast.error('Note too long — max 1000 characters');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('lead_notes')
      .insert({ conversation_id: conversationId, body, created_by: 'Uzair' });
    setSaving(false);
    if (error) {
      toast.error('Failed to save note');
      return;
    }
    setText('');
    setOpen(false);
    queryClient.invalidateQueries({ queryKey: ['lead-sheet-notes', conversationId] });
    toast.success('Note saved');
  }

  return { text, setText, saving, open, setOpen, submit, inputRef };
}

// ─── Sheet component ───────────────────────────────────────────────────────────
interface Props {
  prospect: ProspectRow | null;
  open: boolean;
  onClose: () => void;
}

export function LeadDetailSheet({ prospect, open, onClose }: Props) {
  const { conversation, messages, notes } = useLeadDetail(open ? prospect : null);
  const note = useAddNote(conversation?.id);

  if (!prospect) return null;

  const urgencyHours = (Date.now() - new Date(prospect.updated_at).getTime()) / 3_600_000;
  const urgencyLabel = urgencyHours > 48 ? '🔴 Overdue (48h+)' : urgencyHours > 24 ? '🟡 Needs follow-up (24h+)' : '🟢 Recently updated';
  const urgencyCls   = urgencyHours > 48 ? 'text-destructive bg-destructive/10 border-destructive/20'
                     : urgencyHours > 24 ? 'text-warning bg-warning/10 border-warning/20'
                     : 'text-success bg-success/10 border-success/20';

  const whatsappPhone = conversation?.lead_phone?.replace(/\D/g, '') || '';

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[480px] p-0 flex flex-col overflow-hidden bg-card border-l border-border/40"
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <SheetHeader className="px-5 py-4 border-b border-border/40 shrink-0">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-base font-semibold text-foreground truncate">
                {prospect.client_name}
              </SheetTitle>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <TempBadge temp={prospect.temperature} />
                {prospect.source && (
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                    style={{
                      color: srcColor(prospect.source),
                      background: `${srcColor(prospect.source)}18`,
                      borderColor: `${srcColor(prospect.source)}30`,
                    }}
                  >
                    {prospect.source}
                  </span>
                )}
              </div>
            </div>
          </div>
        </SheetHeader>

        {/* ── Scrollable body ─────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">

          {/* Urgency banner */}
          <div className={cn('mx-4 mt-4 px-3 py-2 rounded-xl border text-xs font-semibold', urgencyCls)}>
            {urgencyLabel} · last activity {formatDistanceToNow(new Date(prospect.updated_at), { addSuffix: true })}
          </div>

          {/* ── Details grid ──────────────────────────────────────────────── */}
          <div className="px-4 mt-4 grid grid-cols-2 gap-2.5">
            <DetailCard icon={<DollarSign className="w-3.5 h-3.5" />} label="Budget" value={formatBudget(prospect.budget)} />
            <DetailCard icon={<Home className="w-3.5 h-3.5" />} label="Home Type" value={prospect.status === 'active' ? 'Active' : prospect.status} />
            <DetailCard icon={<Tag className="w-3.5 h-3.5" />} label="Status" value={prospect.status} />
            <DetailCard icon={<Calendar className="w-3.5 h-3.5" />} label="Added" value={format(new Date(prospect.created_at), 'MMM d, yyyy')} />
            <DetailCard icon={<Clock className="w-3.5 h-3.5" />} label="Last Updated" value={formatDistanceToNow(new Date(prospect.updated_at), { addSuffix: true })} />
            {conversation?.lead_phone && (
              <DetailCard icon={<Phone className="w-3.5 h-3.5" />} label="Phone" value={conversation.lead_phone} />
            )}
          </div>

          {/* ── Quick actions ─────────────────────────────────────────────── */}
          <div className="px-4 mt-4 flex gap-2">
            {whatsappPhone && (
              <a
                href={`https://wa.me/${whatsappPhone}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-success/10 text-success border border-success/20 hover:bg-success/20 transition-colors"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                WhatsApp
              </a>
            )}
            {conversation?.lead_phone && (
              <a
                href={`tel:${conversation.lead_phone}`}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
              >
                <Phone className="w-3.5 h-3.5" />
                Call
              </a>
            )}
            <a
              href={`/pipeline`}
              className="ml-auto flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-muted/50 text-muted-foreground border border-border/40 hover:bg-muted transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Pipeline
            </a>
          </div>

          {/* ── Notes ─────────────────────────────────────────────────────── */}
          <Section
            icon={<StickyNote className="w-3.5 h-3.5" />}
            title="Notes"
            count={notes.length}
            action={
              conversation?.id ? (
                <button
                  onClick={() => { note.setOpen(true); setTimeout(() => note.inputRef.current?.focus(), 50); }}
                  className="ml-auto flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Add Note
                </button>
              ) : null
            }
          >
            {/* Inline compose area */}
            <AnimatePresence>
              {note.open && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 py-3 border-b border-border/30 bg-muted/20">
                    <textarea
                      ref={note.inputRef}
                      value={note.text}
                      onChange={e => note.setText(e.target.value.slice(0, 1000))}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) note.submit();
                        if (e.key === 'Escape') note.setOpen(false);
                      }}
                      placeholder="Write a note… (⌘+Enter to save)"
                      rows={3}
                      className="w-full bg-background/60 border border-border/40 rounded-xl px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-1 focus:ring-primary/40"
                    />
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[10px] text-muted-foreground/40">{note.text.length}/1000</span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => { note.setOpen(false); note.setText(''); }}
                          className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg bg-muted/50 text-muted-foreground border border-border/30 hover:bg-muted transition-colors"
                        >
                          <X className="w-3 h-3" /> Cancel
                        </button>
                        <button
                          onClick={note.submit}
                          disabled={!note.text.trim() || note.saving}
                          className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                        >
                          <Send className="w-3 h-3" />
                          {note.saving ? 'Saving…' : 'Save Note'}
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {notes.length === 0 && !note.open ? (
              <p className="text-xs text-muted-foreground/50 italic px-4 py-2">No notes yet.</p>
            ) : notes.map((n: any, i: number) => (
              <motion.div
                key={n.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="px-4 py-2.5 border-b border-border/20 last:border-0"
              >
                <p className="text-xs text-foreground leading-relaxed">{n.body}</p>
                <p className="text-[10px] text-muted-foreground/50 mt-1">
                  {n.created_by ?? 'Zara'} · {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                </p>
              </motion.div>
            ))}
          </Section>

          {/* ── Message history ───────────────────────────────────────────── */}
          <Section icon={<MessageSquare className="w-3.5 h-3.5" />} title="Message History" count={messages.length}>
            {messages.length === 0 ? (
              <p className="text-xs text-muted-foreground/50 italic px-4 py-3">
                {conversation ? 'No messages yet in this conversation.' : 'No conversation found for this lead.'}
              </p>
            ) : (
              <div className="px-4 py-3 space-y-2.5">
                {messages.map((msg, i) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.02 }}
                  >
                    <MessageBubble msg={msg} />
                  </motion.div>
                ))}
              </div>
            )}
          </Section>

        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────
function DetailCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-muted/30 border border-border/30">
      <span className="text-muted-foreground/60 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium">{label}</p>
        <p className="text-xs font-semibold text-foreground truncate">{value}</p>
      </div>
    </div>
  );
}

function Section({
  icon, title, count, children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4">
      <div className="px-4 py-2 flex items-center gap-2 border-y border-border/30 bg-muted/20">
        <span className="text-muted-foreground/60">{icon}</span>
        <span className="text-xs font-semibold text-foreground">{title}</span>
        {count > 0 && (
          <span className="ml-auto text-[10px] font-bold text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded-full">
            {count}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
