import { useState, useRef, useEffect, useMemo } from 'react';
import { Search, Send, Paperclip, FileText, MessageCircle, Check, CheckCheck, ArrowLeft, Plus, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { formatDistanceToNow } from 'date-fns';
import { useIsMobile } from '@/hooks/use-mobile';
import { LeadStatusBadge } from '@/components/crm/leads/LeadStatusBadge';
import { formatContactName } from '@/lib/format';
import { NewConversationDialog } from './NewConversationDialog';
import { useWhatsAppStatus } from '@/hooks/useWhatsAppStatus';
import {
  useWAConversations,
  useWAMessages,
  useWATemplates,
  useSendWAMessage,
  useCreateWAConversation,
  type WAConversation,
  type WATemplate,
} from '@/hooks/useWhatsAppData';

export function WhatsAppChat() {
  const { status: waStatus, isLoading: statusLoading } = useWhatsAppStatus();
  const isConnected = waStatus?.connected ?? false;
  const { data: conversations = [], isLoading: loadingConvs } = useWAConversations();
  const { data: templates = [] } = useWATemplates();
  const sendMessage = useSendWAMessage();
  const createConversation = useCreateWAConversation();
  const isMobile = useIsMobile();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [msgText, setMsgText] = useState('');
  const [tplOpen, setTplOpen] = useState(false);
  const [newConvOpen, setNewConvOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const selected = conversations.find(c => c.id === selectedId) ?? null;
  const { data: messages = [], isLoading: loadingMsgs } = useWAMessages(selectedId ?? undefined);

  const filtered = useMemo(() => {
    if (!search) return conversations;
    const q = search.toLowerCase();
    return conversations.filter(c => {
      const name = c.contact ? formatContactName(c.contact.first_name, c.contact.last_name) : '';
      return name.toLowerCase().includes(q) || c.last_message_preview?.toLowerCase().includes(q);
    });
  }, [conversations, search]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = async () => {
    if (!msgText.trim() || !selected) return;
    await sendMessage.mutateAsync({
      conversationId: selected.id,
      content: msgText.trim(),
    });
    setMsgText('');
  };

  const insertTemplate = (tpl: WATemplate) => {
    if (!selected?.contact) return;
    let text = tpl.body_text;
    // Auto-fill {{1}} with contact first name
    text = text.replace('{{1}}', selected.contact.first_name || '');
    setMsgText(text);
    setTplOpen(false);
  };

  const handleNewConversation = async (contact: { id: string; first_name: string; last_name: string; phone: string }) => {
    const convId = await createConversation.mutateAsync({
      contactId: contact.id,
      phoneNumber: contact.phone,
    });
    setSelectedId(convId);
  };

  const showList = !isMobile || !selectedId;
  const showChat = !isMobile || !!selectedId;

  return (
    <TooltipProvider>
      {/* Connection status banner */}
      {!statusLoading && !isConnected && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-3 text-sm"
          style={{ background: 'hsl(39 67% 55% / 0.1)', border: '1px solid hsl(39 67% 55% / 0.25)' }}>
          <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: 'hsl(39 67% 55%)' }} />
          <span className="text-foreground">
            WhatsApp API not connected. Messages will be queued.{' '}
            <Link to="/crm/settings" className="text-primary hover:underline font-medium">Connect in Settings → Integrations</Link>
          </span>
        </div>
      )}
      {!statusLoading && isConnected && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-3 text-sm"
          style={{ background: 'hsl(142 71% 45% / 0.08)', border: '1px solid hsl(142 71% 45% / 0.2)' }}>
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: 'hsl(142 71% 45%)' }} />
          <span className="text-foreground">
            WhatsApp connected{waStatus?.phoneNumber ? ` · ${waStatus.phoneNumber}` : ''}
          </span>
        </div>
      )}

      <div className="flex h-[calc(100vh-220px)] min-h-[400px] sm:min-h-[500px] border border-border rounded-xl overflow-hidden bg-card">
        {/* Left panel — Conversation list */}
        {showList && (
          <div className={`${isMobile ? 'w-full' : 'w-full sm:w-[320px] lg:w-[340px]'} flex-shrink-0 border-r border-border flex flex-col`}>
            {/* New conversation button + search */}
            <div className="p-3 border-b border-border space-y-2">
              <Button
                onClick={() => setNewConvOpen(true)}
                className="w-full bg-[hsl(39_67%_55%)] hover:bg-[hsl(39_67%_48%)] text-white"
                size="sm"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                New Conversation
              </Button>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search conversations..." className="pl-9 h-9 text-sm" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loadingConvs ? (
                <div className="p-3 space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                  <MessageCircle className="w-8 h-8 opacity-30" />
                  <p className="text-sm">No conversations yet</p>
                  <p className="text-xs">Click "New Conversation" to start</p>
                </div>
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
        )}

        {/* Right panel — Chat */}
        {showChat && (
          <div className="flex-1 flex flex-col">
            {!selected ? (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
                <MessageCircle className="w-10 h-10 opacity-30" />
                <p className="text-sm">Select a conversation</p>
              </div>
            ) : (
              <>
                {/* Chat header */}
                <div className="flex items-center justify-between px-3 sm:px-4 py-3 border-b border-border bg-muted/20">
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    {isMobile && (
                      <button
                        onClick={() => setSelectedId(null)}
                        className="shrink-0 h-9 w-9 flex items-center justify-center rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <ArrowLeft className="w-5 h-5 text-foreground" />
                      </button>
                    )}
                    <div className="flex items-center justify-center w-9 h-9 rounded-full flex-shrink-0" style={{ background: 'hsl(142 71% 45% / 0.12)' }}>
                      <MessageCircle className="w-4 h-4" style={{ color: 'hsl(142 71% 45%)' }} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground truncate">
                          {selected.contact ? formatContactName(selected.contact.first_name, selected.contact.last_name) : 'Unknown'}
                        </span>
                        {selected.contact?.status && <LeadStatusBadge status={selected.contact.status} />}
                      </div>
                      <p className="text-xs text-muted-foreground">{selected.phone_number ?? 'No phone'}</p>
                    </div>
                  </div>
                  {selected.contact && (
                    <Link to={`/crm/leads/${selected.contact.id}`} className="text-xs text-primary hover:underline flex-shrink-0 hidden sm:block">
                      View Lead →
                    </Link>
                  )}
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2" style={{ background: 'hsl(var(--muted) / 0.15)' }}>
                  {loadingMsgs ? (
                    <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-3/5 rounded-xl" />)}</div>
                  ) : messages.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-10">No messages yet. Send a message to start the conversation.</p>
                  ) : messages.map(msg => {
                    const isOut = msg.direction === 'outbound';
                    return (
                      <div key={msg.id} className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-3.5 py-2 ${isOut ? 'rounded-br-md' : 'rounded-bl-md'}`}
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
                              msg.status === 'read' ? <CheckCheck className="w-3 h-3" style={{ color: 'hsl(210 62% 46%)' }} /> :
                              msg.status === 'delivered' ? <CheckCheck className="w-3 h-3 text-muted-foreground" /> :
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
                <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-2 sm:py-3 border-t border-border bg-card">
                  {!isMobile && (
                    <>
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
                        <PopoverContent className="w-[280px] p-0" align="start">
                          <div className="p-2 border-b border-border">
                            <p className="text-xs font-medium text-muted-foreground">WhatsApp Templates</p>
                          </div>
                          <div className="max-h-[220px] overflow-y-auto">
                            {templates.length === 0 ? (
                              <p className="px-3 py-4 text-xs text-muted-foreground text-center">No templates</p>
                            ) : templates.map(t => (
                              <div
                                key={t.id}
                                className="px-3 py-2.5 hover:bg-muted/50 cursor-pointer border-b border-border/30 last:border-0"
                                onClick={() => insertTemplate(t)}
                              >
                                <div className="flex items-center justify-between">
                                  <p className="text-sm font-medium text-foreground">{t.name}</p>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground capitalize">{t.category}</span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.body_text}</p>
                              </div>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </>
                  )}

                  <Input
                    value={msgText}
                    onChange={e => setMsgText(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 h-10 sm:h-9 text-sm min-h-[44px] sm:min-h-0"
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  />
                  <Button
                    size="sm"
                    className="h-10 w-10 sm:h-9 sm:w-9 p-0 flex-shrink-0 bg-[hsl(39_67%_55%)] hover:bg-[hsl(39_67%_48%)] text-white min-h-[44px] sm:min-h-0"
                    disabled={!msgText.trim() || sendMessage.isPending}
                    onClick={handleSend}
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <NewConversationDialog
        open={newConvOpen}
        onOpenChange={setNewConvOpen}
        onSelect={handleNewConversation}
      />
    </TooltipProvider>
  );
}

function ConversationRow({ conv, isActive, onClick }: { conv: WAConversation; isActive: boolean; onClick: () => void }) {
  const name = conv.contact ? formatContactName(conv.contact.first_name, conv.contact.last_name) : 'Unknown';
  const unread = conv.unread_count ?? 0;

  return (
    <div
      className={`flex items-center gap-3 px-3 py-3 cursor-pointer transition-colors border-b border-border/30 min-h-[56px] ${isActive ? 'bg-primary/5' : 'hover:bg-muted/30 active:bg-muted/50'}`}
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
