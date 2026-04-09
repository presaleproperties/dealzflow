import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, Mail, Reply } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { useCrmContacts } from '@/hooks/useCrmContacts';
import { formatContactName } from '@/lib/format';

type TabType = 'whatsapp' | 'email';

export function ActiveConversationsColumn() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabType>('whatsapp');
  const { data: contacts = [] } = useCrmContacts();

  const contactMap = useMemo(() => {
    const m: Record<string, string> = {};
    contacts.forEach(c => { m[c.id] = formatContactName(c.first_name, c.last_name); });
    return m;
  }, [contacts]);

  const { data: waConvos = [], isLoading: waLoading } = useQuery({
    queryKey: ['cmd-wa-convos'],
    queryFn: async () => {
      const { data } = await supabase
        .from('crm_whatsapp_conversations')
        .select('id, contact_id, phone_number, last_message_preview, last_message_at, unread_count')
        .order('last_message_at', { ascending: false })
        .limit(15);
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const { data: emails = [], isLoading: emailLoading } = useQuery({
    queryKey: ['cmd-recent-emails'],
    queryFn: async () => {
      const { data } = await supabase
        .from('crm_email_log')
        .select('id, contact_id, subject, sent_at, direction')
        .order('sent_at', { ascending: false })
        .limit(15);
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const isLoading = tab === 'whatsapp' ? waLoading : emailLoading;

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm flex flex-col">
      <div className="flex items-center gap-2 p-3 sm:p-4 border-b border-border">
        <MessageCircle className="w-4 h-4 text-[hsl(142_71%_45%)]" />
        <h3 className="text-sm font-semibold text-foreground">Active Conversations</h3>
        <Badge variant="secondary" className="text-[10px] ml-auto">
          {tab === 'whatsapp' ? waConvos.length : emails.length}
        </Badge>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {(['whatsapp', 'email'] as TabType[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-xs font-medium transition-colors border-b-2 ${tab === t ? 'border-[hsl(39_67%_55%)] text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            {t === 'whatsapp' ? 'WhatsApp' : 'Email'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto max-h-[540px] divide-y divide-border/40">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <div key={i} className="p-3"><Skeleton className="h-12 w-full" /></div>)
        ) : tab === 'whatsapp' ? (
          waConvos.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No recent conversations</p>
          ) : (
            waConvos.map(c => (
              <button
                key={c.id}
                onClick={() => navigate('/crm/whatsapp')}
                className="w-full text-left px-3 py-2.5 hover:bg-muted/30 transition-colors flex items-start gap-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground truncate">
                      {contactMap[c.contact_id] || c.phone_number}
                    </p>
                    {c.unread_count > 0 && (
                      <span className="w-2 h-2 rounded-full bg-[hsl(210_62%_46%)] shrink-0" />
                    )}
                  </div>
                  <p className="text-[12px] text-muted-foreground truncate mt-0.5">
                    {c.last_message_preview || 'No messages yet'}
                  </p>
                </div>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0 mt-0.5">
                  {c.last_message_at ? formatDistanceToNow(new Date(c.last_message_at), { addSuffix: true }) : ''}
                </span>
              </button>
            ))
          )
        ) : (
          emails.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No recent emails</p>
          ) : (
            emails.map(e => (
              <button
                key={e.id}
                onClick={() => navigate(`/crm/leads/${e.contact_id}`)}
                className="w-full text-left px-3 py-2.5 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground truncate flex-1">
                    {contactMap[e.contact_id] || 'Contact'}
                  </p>
                  <Badge variant="secondary" className="text-[9px] shrink-0">
                    {e.direction === 'outbound' ? 'Sent' : 'Received'}
                  </Badge>
                </div>
                <p className="text-[12px] text-muted-foreground truncate mt-0.5">{e.subject}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {formatDistanceToNow(new Date(e.sent_at), { addSuffix: true })}
                </p>
              </button>
            ))
          )
        )}
      </div>

      <div className="p-3 border-t border-border">
        <button
          onClick={() => navigate(tab === 'whatsapp' ? '/crm/whatsapp' : '/crm/email')}
          className="text-xs text-primary hover:underline"
        >
          View all →
        </button>
      </div>
    </div>
  );
}
