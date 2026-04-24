import { Mail, Clock, ArrowUpRight, ArrowDownLeft, Eye, MousePointerClick } from 'lucide-react';
import { format } from 'date-fns';
import { useCrmEmailLog } from '@/hooks/useCrmEmailLog';
import { Skeleton } from '@/components/ui/skeleton';

export function LeadEmailHistory({ contactId }: { contactId: string }) {
  const { data: emails, isLoading } = useCrmEmailLog(contactId);

  if (isLoading) {
    return (
      <div className="bg-card rounded-xl border border-border p-5 shadow-sm space-y-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border p-5 shadow-sm space-y-3">
      <div className="flex items-center gap-2">
        <Mail className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Email History</h3>
        {emails && emails.length > 0 && (
          <span className="text-xs text-muted-foreground ml-auto">{emails.length} email{emails.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {(!emails || emails.length === 0) ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No emails yet</p>
      ) : (
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {emails.map((email) => (
            <div key={email.id} className="flex items-start gap-3 p-3 rounded-lg border border-border/50 bg-muted/20 hover:bg-muted/40 transition-colors">
              <div className={`p-1.5 rounded-md shrink-0 ${email.direction === 'outbound' ? 'bg-primary/10' : 'bg-emerald-500/10'}`}>
                {email.direction === 'outbound'
                  ? <ArrowUpRight className="w-3.5 h-3.5 text-primary" />
                  : <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm text-foreground truncate">{email.subject}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                    email.direction === 'outbound'
                      ? 'bg-primary/10 text-primary'
                      : 'bg-emerald-500/10 text-emerald-600'
                  }`}>
                    {email.direction === 'outbound' ? 'Sent' : 'Received'}
                  </span>
                  {email.direction === 'outbound' && (email.open_count ?? 0) > 0 && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-emerald-500/10 text-emerald-600 inline-flex items-center gap-1"
                      title={email.last_opened_at ? `Last opened ${format(new Date(email.last_opened_at), 'MMM d, h:mm a')}` : 'Opened'}
                    >
                      <Eye className="w-3 h-3" />
                      {email.open_count} open{email.open_count === 1 ? '' : 's'}
                    </span>
                  )}
                  {email.direction === 'outbound' && (email.click_count ?? 0) > 0 && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-blue-500/10 text-blue-600 inline-flex items-center gap-1"
                      title={email.last_clicked_at ? `Last clicked ${format(new Date(email.last_clicked_at), 'MMM d, h:mm a')}` : 'Clicked'}
                    >
                      <MousePointerClick className="w-3 h-3" />
                      {email.click_count} click{email.click_count === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
                {email.body && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{email.body}</p>
                )}
                <div className="flex items-center gap-1 mt-1.5 text-[11px] text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  {format(new Date(email.sent_at), 'MMM d, yyyy · h:mm a')}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
