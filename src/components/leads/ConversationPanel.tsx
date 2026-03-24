import { useRef, useEffect, useState } from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import { useMessages, useSendMessage, useUpdateConversation, type Conversation } from '@/hooks/useConversations';
import { MessageBubble } from './MessageBubble';
import { MessageComposer } from './MessageComposer';
import { NotesPanel, ActivityPanel } from './LeadPanels';
import { ChannelBadge } from './ChannelBadge';
import { cn } from '@/lib/utils';
import { Phone, Mail, MoreHorizontal, Zap, Flame, Loader2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const statusColors: Record<string, string> = {
  new: 'hsl(217 91% 60%)', contacted: 'hsl(43 96% 56%)', engaged: 'hsl(158 64% 52%)',
  qualified: 'hsl(262 83% 63%)', booked: 'hsl(142 72% 45%)', escalated: 'hsl(0 84% 60%)',
  unresponsive: 'hsl(0 0% 60%)', disqualified: 'hsl(0 0% 45%)', closed: 'hsl(0 0% 50%)',
};

const statusLabels: Record<string, string> = {
  new: 'New', contacted: 'Contacted', engaged: 'Engaged', qualified: 'Qualified',
  booked: 'Booked', escalated: 'Escalated', unresponsive: 'No Reply', disqualified: 'Disqualified', closed: 'Closed',
};

function DateDivider({ date }: { date: Date }) {
  const label = isToday(date) ? 'Today' : isYesterday(date) ? 'Yesterday' : format(date, 'MMMM d, yyyy');
  return (
    <div className="flex items-center gap-2 my-3">
      <div className="flex-1 h-px bg-border/40" />
      <span className="text-[10px] font-medium text-muted-foreground/50 px-2">{label}</span>
      <div className="flex-1 h-px bg-border/40" />
    </div>
  );
}

interface Props {
  conversation: Conversation;
}

export function ConversationPanel({ conversation }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const { data: messages = [], isLoading } = useMessages(conversation.id);
  const sendMessage = useSendMessage();
  const updateConversation = useUpdateConversation();
  const [tab, setTab] = useState<'messages' | 'notes' | 'activity'>('messages');
  const [zaraTriggering, setZaraTriggering] = useState(false);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = (body: string) => {
    sendMessage.mutate({ conversationId: conversation.id, body, sender: 'uzair' });
    // If Zara was active, switch to uzair when manually sending
    if (conversation.assigned_to === 'zara') {
      updateConversation.mutate({ id: conversation.id, assigned_to: 'uzair' });
    }
  };

  const toggleZara = () => {
    updateConversation.mutate({
      id: conversation.id,
      assigned_to: conversation.assigned_to === 'zara' ? 'uzair' : 'zara',
    });
  };

  const triggerZara = async () => {
    if (zaraTriggering) return;
    setZaraTriggering(true);
    try {
      const { data, error } = await supabase.functions.invoke('zara-respond', {
        body: { conversationId: conversation.id },
      });
      if (error) throw error;
      if (data?.skipped) {
        toast.info('Zara is not assigned to this conversation');
      } else if (data?.success) {
        toast.success('Zara replied successfully');
      } else {
        toast.error('Zara could not respond: ' + (data?.error || 'Unknown error'));
      }
    } catch (err: unknown) {
      toast.error('Failed to trigger Zara: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setZaraTriggering(false);
    }
  };

  // Group messages by day
  const groupedMessages: { date: Date; messages: typeof messages }[] = [];
  for (const msg of messages) {
    const date = new Date(msg.created_at);
    const dateStr = format(date, 'yyyy-MM-dd');
    const existing = groupedMessages.find(g => format(g.date, 'yyyy-MM-dd') === dateStr);
    if (existing) existing.messages.push(msg);
    else groupedMessages.push({ date, messages: [msg] });
  }

  const initials = conversation.lead_name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Lead Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 border-b border-border/40 flex-shrink-0"
        style={{ background: 'hsl(var(--background) / 0.95)', backdropFilter: 'blur(12px)' }}
      >
        {/* Avatar */}
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-semibold flex-shrink-0"
          style={{ background: 'hsl(var(--muted))', color: 'hsl(var(--foreground))' }}
        >
          {initials}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-semibold text-foreground truncate">{conversation.lead_name}</span>
            <ChannelBadge channel={conversation.channel} size="sm" />
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
              style={{
                background: (statusColors[conversation.status] || 'hsl(0 0% 60%)') + '20',
                color: statusColors[conversation.status] || 'hsl(0 0% 60%)',
              }}
            >
              {statusLabels[conversation.status] || conversation.status}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {conversation.lead_phone && (
              <span className="text-[10px] text-muted-foreground/60 flex items-center gap-0.5">
                <Phone className="h-2.5 w-2.5" /> {conversation.lead_phone}
              </span>
            )}
            {conversation.lead_email && (
              <span className="text-[10px] text-muted-foreground/60 flex items-center gap-0.5">
                <Mail className="h-2.5 w-2.5" /> {conversation.lead_email}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Heat score */}
          {conversation.heat > 0 && (
            <div className="flex items-center gap-0.5 px-2 py-1 rounded-lg bg-orange-500/10">
              <Flame className="h-3 w-3 text-orange-500" />
              <span className="text-[10px] font-semibold text-orange-500">{conversation.heat}</span>
            </div>
          )}

          {/* Trigger Zara manually */}
          {conversation.assigned_to === 'zara' && (
            <button
              onClick={triggerZara}
              disabled={zaraTriggering}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold bg-muted/60 text-muted-foreground hover:bg-muted transition-all disabled:opacity-50"
              title="Trigger Zara to respond now"
            >
              {zaraTriggering ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3 text-yellow-500" />}
              Reply
            </button>
          )}

          {/* Zara toggle */}
          <button
            onClick={toggleZara}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-all',
              conversation.assigned_to === 'zara'
                ? 'bg-primary/15 text-primary'
                : 'bg-muted/60 text-muted-foreground hover:bg-muted',
            )}
            title={conversation.assigned_to === 'zara' ? 'Zara is active — click to take over' : 'Click to hand off to Zara'}
          >
            <Zap className="h-3 w-3" />
            {conversation.assigned_to === 'zara' ? 'Zara ON' : 'Zara OFF'}
          </button>

          <button className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/60 transition-all">
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={v => setTab(v as typeof tab)} className="flex flex-col flex-1 min-h-0">
        <TabsList className="flex-shrink-0 h-8 rounded-none border-b border-border/40 bg-transparent px-4 justify-start gap-0 p-0">
          {(['messages', 'notes', 'activity'] as const).map(t => (
            <TabsTrigger
              key={t}
              value={t}
              className={cn(
                'h-8 px-3 text-[11px] font-medium rounded-none border-b-2 -mb-px transition-all capitalize',
                tab === t ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground/60 hover:text-foreground',
              )}
            >
              {t}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Messages */}
        <TabsContent value="messages" className="flex-1 flex flex-col min-h-0 mt-0">
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {isLoading && (
              <div className="flex items-center justify-center py-8">
                <div className="text-[12px] text-muted-foreground/50">Loading messages...</div>
              </div>
            )}
            {!isLoading && messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="text-3xl mb-2">💬</div>
                <p className="text-[13px] font-medium text-foreground/60">No messages yet</p>
                <p className="text-[11px] text-muted-foreground/50 mt-1">Send the first message below</p>
              </div>
            )}
            {groupedMessages.map(group => (
              <div key={format(group.date, 'yyyy-MM-dd')}>
                <DateDivider date={group.date} />
                {group.messages.map(msg => (
                  <MessageBubble key={msg.id} message={msg} channel={conversation.channel} />
                ))}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <MessageComposer
            onSend={handleSend}
            zaraActive={conversation.assigned_to === 'zara'}
            isLoading={sendMessage.isPending}
          />
        </TabsContent>

        {/* Notes */}
        <TabsContent value="notes" className="flex-1 flex flex-col min-h-0 mt-0 overflow-hidden">
          <NotesPanel conversationId={conversation.id} />
        </TabsContent>

        {/* Activity */}
        <TabsContent value="activity" className="flex-1 flex flex-col min-h-0 mt-0 overflow-hidden">
          <ActivityPanel conversationId={conversation.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
