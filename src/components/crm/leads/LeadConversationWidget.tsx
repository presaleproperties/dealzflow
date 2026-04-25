// Inline Gmail conversation view for a lead (interleaved inbound/outbound).
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { Mail, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

type Msg = {
  id: string;
  from_email: string;
  from_name: string | null;
  subject: string | null;
  body_text: string | null;
  snippet: string | null;
  internal_date: string;
  direction: string;
};

export function LeadConversationWidget({ contactId }: { contactId?: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['lead-gmail-conversation', contactId],
    enabled: !!contactId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_gmail_messages')
        .select('id, from_email, from_name, subject, body_text, snippet, internal_date, direction')
        .eq('contact_id', contactId!)
        .order('internal_date', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as Msg[];
    },
  });

  if (!contactId) return null;
  if (isLoading) return <Skeleton className="h-32 w-full" />;

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Inbox className="h-3.5 w-3.5" />
        No synced Gmail conversations yet.
      </div>
    );
  }

  const ordered = [...data].reverse(); // chronological

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">
          {data.length} message{data.length === 1 ? '' : 's'}
        </span>
        <Button asChild size="sm" variant="ghost" className="h-6 text-[11px] gap-1">
          <Link to="/crm/email">
            <Mail className="h-3 w-3" />
            Open Inbox
          </Link>
        </Button>
      </div>
      <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
        {ordered.map(m => {
          const inbound = m.direction === 'inbound';
          return (
            <div
              key={m.id}
              className={cn(
                'rounded-md border p-2.5 text-[12px] shadow-sm',
                inbound ? 'bg-card border-border' : 'bg-primary/5 border-primary/20',
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-foreground text-[11px]">
                  {inbound ? (m.from_name || m.from_email) : 'You'}
                </span>
                <span className="text-[10px] text-muted-foreground ml-auto">
                  {format(new Date(m.internal_date), 'MMM d, h:mm a')}
                </span>
              </div>
              {m.subject && (
                <p className="text-[11px] font-medium text-foreground/80 mb-1 truncate">{m.subject}</p>
              )}
              <p className="text-foreground/80 whitespace-pre-wrap leading-snug line-clamp-6">
                {m.body_text || m.snippet || ''}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
