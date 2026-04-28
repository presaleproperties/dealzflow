import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useCrmAccess } from '@/contexts/CrmAccessContext';
import { Loader2, Sparkles, Check, X, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface SyncResult {
  id: string;
  name: string;
  email: string;
  status: 'synced' | 'no_presale_match' | 'normalize_failed' | 'update_failed';
  applied?: string[];
  presale?: {
    name?: string; headshot?: boolean; brokerage?: string;
    license?: string; title?: string; phone?: string;
  };
  error?: string;
}

const FIELD_LABELS: Record<string, string> = {
  slug: 'Slug',
  headshot_url: 'Headshot',
  brokerage: 'Brokerage',
  license_no: 'License',
  title: 'Title',
  bio: 'Bio',
};

export function SchedulerTeamPrefillCard() {
  const { isOwnerOrAdmin } = useCrmAccess();
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<SyncResult[] | null>(null);

  if (!isOwnerOrAdmin) return null;

  const run = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('scheduler-prefill-team', { body: {} });
      if (error) throw error;
      setResults(data?.results || []);
      const synced = (data?.results || []).filter((r: SyncResult) => r.status === 'synced').length;
      const missing = (data?.results || []).filter((r: SyncResult) => r.status === 'no_presale_match').length;
      toast.success(`Synced ${synced} of ${data?.results?.length || 0} agents${missing ? ` · ${missing} not found in Presale` : ''}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-[#D7A542]" />
            <h3 className="text-[13.5px] font-semibold text-foreground">Team Presale sync</h3>
            <Badge variant="outline" className="text-[10px] font-normal">Admin</Badge>
          </div>
          <p className="text-[12px] text-muted-foreground mt-1">
            Pre-fill scheduler profiles for every active team member by matching their email against Presale Properties.
            Only fills <em>blank</em> fields — never overwrites what's already set.
          </p>
        </div>
        <Button size="sm" onClick={run} disabled={running}>
          {running ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> Syncing</> : 'Sync now'}
        </Button>
      </div>

      {results && (
        <div className="mt-4 border-t border-border pt-3 space-y-2">
          {results.map((r) => (
            <div key={r.id} className="flex items-start gap-3 py-1.5">
              <div className="mt-0.5 shrink-0">
                {r.status === 'synced' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                ) : r.status === 'no_presale_match' ? (
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-[13px] font-medium text-foreground">{r.name}</span>
                  <span className="text-[11.5px] text-muted-foreground truncate">{r.email}</span>
                </div>
                {r.status === 'synced' && r.applied && r.applied.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {r.applied.map((f) => (
                      <Badge key={f} variant="outline" className="text-[10px] font-normal">
                        + {FIELD_LABELS[f] || f}
                      </Badge>
                    ))}
                  </div>
                )}
                {r.status === 'synced' && r.applied && r.applied.length === 0 && (
                  <span className="text-[11px] text-muted-foreground">Already up to date</span>
                )}
                {r.status === 'no_presale_match' && (
                  <span className="text-[11px] text-muted-foreground">No matching agent in Presale Properties</span>
                )}
                {r.error && <span className="text-[11px] text-destructive">{r.error}</span>}
                {r.presale && r.status === 'synced' && (
                  <div className="text-[10.5px] text-muted-foreground mt-0.5">
                    Presale: {r.presale.name}{r.presale.title && ` · ${r.presale.title}`}
                    {r.presale.brokerage && ` · ${r.presale.brokerage}`}
                    {r.presale.phone && ` · ${r.presale.phone}`}
                    {r.presale.headshot && ' · 📷'}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
