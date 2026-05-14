// Zara Knowledge Gaps — unresolved {LOOKUP:...} placeholders captured from drafts
import { useEffect, useState } from 'react';
import { ZaraShell } from '@/components/admin/zara/ZaraShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

const TYPE_LABEL: Record<string,string> = {
  project_fact: 'Project',
  area_fact: 'Area',
  faq_miss: 'FAQ',
  unit_data: 'Unit data',
  brochure_missing: 'Brochure',
  other: 'Other',
};

export default function ZaraGapsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showResolved, setShowResolved] = useState(false);

  async function load() {
    setLoading(true);
    const q = supabase.from('crm_zara_knowledge_gaps').select('*').order('created_at', { ascending: false }).limit(200);
    if (!showResolved) q.eq('resolved', false);
    const { data } = await q;
    setRows(data ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, [showResolved]);

  async function resolve(id: string) {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('crm_zara_knowledge_gaps').update({
      resolved: true, resolved_at: new Date().toISOString(), resolved_by: user?.id ?? null,
    }).eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Marked resolved');
    load();
  }

  const grouped = rows.reduce((acc: Record<string, any[]>, r) => {
    (acc[r.gap_type] ||= []).push(r); return acc;
  }, {});

  return (
    <ZaraShell title="Knowledge Gaps" subtitle="Things Zara needs to know but doesn't"
      actions={<Button size="sm" variant="outline" onClick={() => setShowResolved((v) => !v)}>{showResolved ? 'Hide resolved' : 'Show resolved'}</Button>}>
      {loading ? <Skeleton className="h-64"/> : rows.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No gaps. Zara has all the context she needs.</CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {Object.entries(grouped).map(([type, items]) => (
            <Card key={type}>
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  {TYPE_LABEL[type] ?? type}
                  <Badge variant="outline">{items.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {items.map((r) => (
                  <div key={r.id} className={`flex items-start gap-2 text-sm py-2 border-b border-border/40 last:border-0 ${r.resolved ? 'opacity-50' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-xs">{r.missing_value}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</div>
                    </div>
                    {!r.resolved && (
                      <Button variant="ghost" size="sm" onClick={() => resolve(r.id)}>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1"/>Resolve
                      </Button>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </ZaraShell>
  );
}
