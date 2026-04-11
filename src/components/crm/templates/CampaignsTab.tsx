import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { Mail, Eye, BarChart3, Clock, CheckCircle2, FileEdit, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export type LocalCampaign = {
  id: string;
  name: string;
  template_name: string;
  subject: string;
  groups: string[];
  recipients: number;
  sent_at: string | null;
  status: string;
  open_rate: number | null;
  click_rate: number | null;
  auto_resend?: boolean;
};

function getStatusBadge(status: string) {
  switch (status) {
    case 'sent':
      return <Badge className="bg-emerald-500/15 text-emerald-400 border-0 text-[10px] gap-1"><CheckCircle2 className="w-3 h-3" /> Sent</Badge>;
    case 'scheduled':
      return <Badge className="bg-blue-500/15 text-blue-400 border-0 text-[10px] gap-1"><Clock className="w-3 h-3" /> Scheduled</Badge>;
    case 'draft':
      return <Badge className="bg-muted text-muted-foreground border-0 text-[10px] gap-1"><FileEdit className="w-3 h-3" /> Draft</Badge>;
    default:
      return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
  }
}

export function CampaignsTab() {
  const [campaigns, setCampaigns] = useState<LocalCampaign[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('df_campaigns') || '[]');
    } catch {
      return [];
    }
  });

  const handleDelete = (id: string) => {
    const updated = campaigns.filter(c => c.id !== id);
    setCampaigns(updated);
    localStorage.setItem('df_campaigns', JSON.stringify(updated));
  };

  if (campaigns.length === 0) {
    return (
      <div className="text-center py-16 space-y-3">
        <Mail className="w-10 h-10 text-muted-foreground/30 mx-auto" />
        <div>
          <p className="text-sm font-medium text-foreground">No campaigns yet</p>
          <p className="text-xs text-muted-foreground mt-1">Select a template and click "Send as Campaign" to get started.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/40 overflow-hidden bg-card/50">
      <Table>
        <TableHeader>
          <TableRow className="border-border/30">
            <TableHead className="text-xs">Campaign</TableHead>
            <TableHead className="text-xs">Groups</TableHead>
            <TableHead className="text-xs text-right">Recipients</TableHead>
            <TableHead className="text-xs">Date</TableHead>
            <TableHead className="text-xs text-center">Opens</TableHead>
            <TableHead className="text-xs text-center">Clicks</TableHead>
            <TableHead className="text-xs text-center">Status</TableHead>
            <TableHead className="text-xs w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {campaigns.map(c => (
            <TableRow key={c.id} className="border-border/20">
              <TableCell>
                <div>
                  <p className="text-xs font-medium text-foreground truncate max-w-[200px]">{c.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">{c.subject}</p>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1 max-w-[180px]">
                  {c.groups.slice(0, 2).map(g => (
                    <Badge key={g} variant="outline" className="text-[9px] px-1 py-0 border-border/40">{g}</Badge>
                  ))}
                  {c.groups.length > 2 && (
                    <span className="text-[10px] text-muted-foreground">+{c.groups.length - 2}</span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right">
                <span className="text-xs tabular-nums text-muted-foreground">{c.recipients.toLocaleString()}</span>
              </TableCell>
              <TableCell>
                <span className="text-xs text-muted-foreground">
                  {c.sent_at ? format(new Date(c.sent_at), 'MMM d, h:mm a') : '—'}
                </span>
              </TableCell>
              <TableCell className="text-center">
                <span className="text-xs tabular-nums">{c.open_rate !== null ? `${c.open_rate}%` : '—'}</span>
              </TableCell>
              <TableCell className="text-center">
                <span className="text-xs tabular-nums">{c.click_rate !== null ? `${c.click_rate}%` : '—'}</span>
              </TableCell>
              <TableCell className="text-center">{getStatusBadge(c.status)}</TableCell>
              <TableCell>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(c.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
