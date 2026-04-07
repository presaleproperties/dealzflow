import { useState, useRef, useEffect, useMemo } from 'react';
import { Search, Send, Paperclip, FileText, MessageCircle, Check, CheckCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatDistanceToNow, format } from 'date-fns';
import { useCrmConversations, useCrmConversationMessages } from '@/hooks/useCrmWhatsApp';
import { useCrmEmailTemplates } from '@/hooks/useCrmEmail';
import { useAddCrmMessage } from '@/hooks/useCrmLeadDetail';
import { LeadStatusBadge } from '@/components/crm/leads/LeadStatusBadge';
import type { CrmConversation } from '@/hooks/useCrmWhatsApp';

export function WhatsAppChat() {
  const { data: conversations = [], isLoading: loadingConvs } = useCrmConversations();
  const { data: templates = [] } = useCrmEmailTemplates();
  const addMessage = useAddCrmMessage();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [msgText, setMsgText] = useState('');
  const [tplOpen, setTplOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const selected = conversations.find(c => c.id === selectedId) ?? null;
  const { data: messages = [], isLoading: loadingMsgs } = useCrmConversationMessages(selectedId ?? undefined);

  const filtered = useMemo(() => {
    if (!search) return conversations;
    const q = search.toLowerCase();
    return conversations.filter(c => {
      const name = c.contact ? `${c.contact.first_name} ${c.contact.last_name}` : '';
      return name.toLowerCase().includes(q) || c.last_message_preview?.toLowerCase().includes(q);
    });
  }, [conversations, search]);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = async () => {
    if (!msgText.trim() || !selected) return;
    await addMessage.mutateAsync({
      contact_id: selected.contact_id,
      conversation_id: selected.id,
      direction: 'outbound',
      content: msgText.trim(),
      channel: 'whatsapp',
      sent_by: 'Agent',
      message_type: 'text',
    });
    setMsgText('');
  };

  const insertTemplate = (body: string | null) => {
    if (body) {
      // Strip HTML tags for chat
      const text = body.replace(/<[^>]+>/g, '').trim();
      setMsgText(text);
    }
    setTplOpen(false);
  };

  return (
    <TooltipProvider>
      <div className="flex h-[calc(100vh-180px)] min-h-[500px] border border-border rounded-xl overflow-hidden bg-card">
        {/* Left panel — Conversation list */}
        <div className="w-full sm:w-[320px] lg:w-[340px] flex-shrink-0 border-r border-border flex flex-col">
          {/* Search */}
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search conversations..." className="pl-9 h-9 text-sm" />
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {loadingConvs ? (
              <div className="p-3 space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">No conversations</p>
            ) : filtered.map(conv => (
              <ConversationRow
                key={conv.id}
                conv={conv}
                isActive={conv.id === selectedId}
                onClick={() => setSelectedId(conv.id)}
              />
            ))}
          </div>
        </div>

        {/* Right panel — Chat */}
        <div className={`flex-1 flex flex-col ${!selected ? '' : ''} ${selected ? '' : 'hidden sm:flex'}`}>
          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
              <MessageCircle className="w-10 h-10 opacity-30" />
              <p className="text-sm">Select a conversation</p>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex items-center justify-center w-9 h-9 rounded-full flex-shrink-0" style={{ background: 'hsl(142 71% 45% / 0.12)' }}>
                    <MessageCircle className="w-4 h-4" style={{ color: 'hsl(142 71% 45%)' }} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground truncate">
                        {selected.contact ? `${selected.contact.first_name} ${selected.contact.last_name}` : 'Unknown'}
                      </span>
                      {selected.contact?.status && <LeadStatusBadge status={selected.contact.status} />}
                    </div>
                    <p className="text-xs text-muted-foreground">{selected.contact?.phone ?? 'No phone'}</p>
                  </div>
                </div>
                {selected.contact && (
                  <Link to={`/crm/leads/${selected.contact.id}`} className="text-xs text-primary hover:underline flex-shrink-0">
                    View Lead →
                  </Link>
                )}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2" style={{ background: 'hsl(var(--muted) / 0.15)' }}>
                {loadingMsgs ? (
                  <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-3/5 rounded-xl" />)}</div>
                ) : messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-10">No messages yet</p>
                ) : messages.map(msg => {
                  const isOut = msg.direction === 'outbound';
                  return (
                    <div key={msg.id} className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[75%] rounded-2xl px-3.5 py-2 ${isOut ? 'rounded-br-md' : 'rounded-bl-md'}`}
                        style={{
                          background: isOut ? 'hsl(39 67% 55% / 0.15)' : 'hsl(var(--muted) / 0.6)',
                          border: `1px solid ${isOut ? 'hsl(39 67% 55% / 0.25)' : 'hsl(var(--border))'}`,
                        }}
                      >
                        <p className="text-sm text-foreground whitespace-pre-wrap break-words">{msg.content}</p>
                        <div className={`flex items-center gap-1 mt-1 ${isOut ? 'justify-end' : ''}`}>
                          <span className="text-[10px] text-muted-foreground">
                            {msg.created_at ? format(new Date(msg.created_at), 'h:mm a') : ''}
                          </span>
                          {isOut && (
                            msg.read ? <CheckCheck className="w-3 h-3" style={{ color: 'hsl(210 62% 46%)' }} /> :
                            msg.delivered ? <CheckCheck className="w-3 h-3 text-muted-foreground" /> :
                            <Check className="w-3 h-3 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              {/* Composer */}
              <div className="flex items-center gap-2 px-3 py-3 border-t border-border bg-card">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-9 w-9 p-0 flex-shrink-0" disabled>
                      <Paperclip className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Coming soon</TooltipContent>
                </Tooltip>

                <Popover open={tplOpen} onOpenChange={setTplOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-9 w-9 p-0 flex-shrink-0">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[260px] p-0" align="start">
                    <div className="p-2 border-b border-border">
                      <p className="text-xs font-medium text-muted-foreground">Quick Templates</p>
                    </div>
                    <div className="max-h-[200px] overflow-y-auto">
                      {templates.length === 0 ? (
                        <p className="px-3 py-4 text-xs text-muted-foreground text-center">No templates</p>
                      ) : templates.map(t => (
                        <div
                          key={t.id}
                          className="px-3 py-2 hover:bg-muted/50 cursor-pointer"
                          onClick={() => insertTemplate(t.body_html)}
                        >
                          <p className="text-sm font-medium text-foreground">{t.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{t.subject}</p>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>

                <Input
                  value={msgText}
                  onChange={e => setMsgText(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 h-9 text-sm"
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                />
                <Button
                  size="sm"
                  className="h-9 w-9 p-0 flex-shrink-0 bg-[hsl(39_67%_55%)] hover:bg-[hsl(39_67%_48%)] text-white"
                  disabled={!msgText.trim() || addMessage.isPending}
                  onClick={handleSend}
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

function ConversationRow({ conv, isActive, onClick }: { conv: CrmConversation; isActive: boolean; onClick: () => void }) {
  const name = conv.contact ? `${conv.contact.first_name} ${conv.contact.last_name}` : 'Unknown';
  const unread = conv.unread_count ?? 0;

  return (
    <div
      className={`flex items-center gap-3 px-3 py-3 cursor-pointer transition-colors border-b border-border/30 ${isActive ? 'bg-primary/5' : 'hover:bg-muted/30'}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-center w-10 h-10 rounded-full flex-shrink-0 text-xs font-bold" style={{ background: 'hsl(142 71% 45% / 0.12)', color: 'hsl(142 71% 45%)' }}>
        {name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className={`text-sm truncate ${unread > 0 ? 'font-semibold text-foreground' : 'font-medium text-foreground'}`}>{name}</span>
          <span className="text-[10px] text-muted-foreground flex-shrink-0 ml-2">
            {conv.last_message_at ? formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: true }) : ''}
          </span>
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <p className="text-xs text-muted-foreground truncate flex-1">{conv.last_message_preview ?? 'No messages'}</p>
          {unread > 0 && (
            <span className="flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold ml-2 flex-shrink-0 text-white" style={{ background: 'hsl(39 67% 55%)' }}>
              {unread}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
