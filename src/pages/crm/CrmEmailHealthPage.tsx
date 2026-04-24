import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ShieldCheck, ShieldAlert, ShieldX, RefreshCw, Loader2, DollarSign, Target, TrendingUp, Plus, Activity } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow, format, subDays } from "date-fns";

type AuditRun = { id: string; template_key: string; status: string; total_links: number; total_errors: number; ran_at: string; trigger_source: string | null; };
type Spend = { id: string; spend_date: string; utm_source: string; utm_campaign: string | null; amount: number; currency: string; notes: string | null; };

export default function CrmEmailHealthPage() {
  const [tab, setTab] = useState("health");

  return (
    <div className="space-y-5 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center"><Activity className="h-4 w-4 text-primary" /></div>
          Email Health & ROI
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Deliverability, link audits, cost-per-lead & campaign ROI.</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="health"><ShieldCheck className="h-3.5 w-3.5 mr-1.5" />Email Health</TabsTrigger>
          <TabsTrigger value="roi"><DollarSign className="h-3.5 w-3.5 mr-1.5" />Campaign ROI</TabsTrigger>
        </TabsList>

        <TabsContent value="health" className="mt-4"><HealthPanel /></TabsContent>
        <TabsContent value="roi" className="mt-4"><RoiPanel /></TabsContent>
      </Tabs>
    </div>
  );
}

function HealthPanel() {
  const [runs, setRuns] = useState<AuditRun[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any).from("crm_email_audit_runs").select("*").order("ran_at", { ascending: false }).limit(50);
    setRuns(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const latest = runs[0];
  const totalErrors = runs.reduce((s, r) => s + (r.total_errors || 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card><CardContent className="pt-5">
          <div className="flex items-center gap-2 mb-1"><ShieldCheck className="h-4 w-4 text-emerald-500" /><span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Latest Run</span></div>
          <p className="text-2xl font-bold">{latest ? latest.status : "—"}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{latest ? formatDistanceToNow(new Date(latest.ran_at), { addSuffix: true }) : "No audits yet"}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <div className="flex items-center gap-2 mb-1"><ShieldAlert className="h-4 w-4 text-amber-500" /><span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Total Errors (50 runs)</span></div>
          <p className="text-2xl font-bold">{totalErrors}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <div className="flex items-center gap-2 mb-1"><Activity className="h-4 w-4 text-violet-500" /><span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Recent Runs</span></div>
          <p className="text-2xl font-bold">{runs.length}</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between">
          <CardTitle className="text-sm">Recent Audit Runs</CardTitle>
          <Button size="sm" variant="outline" onClick={load}><RefreshCw className="h-3.5 w-3.5" /></Button>
        </CardHeader>
        <CardContent>
          {loading ? <Loader2 className="h-5 w-5 animate-spin mx-auto my-6" /> :
            runs.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground border border-dashed border-border rounded-lg">
                No audit runs yet. Email health checks will appear here once they run.
              </div>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>Template</TableHead><TableHead>Status</TableHead><TableHead>Links</TableHead><TableHead>Errors</TableHead><TableHead>When</TableHead></TableRow></TableHeader>
                <TableBody>
                  {runs.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs font-medium">{r.template_key}</TableCell>
                      <TableCell><Badge variant="outline" className={r.status === "ok" ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30" : "bg-destructive/10 text-destructive border-destructive/30"}>{r.status}</Badge></TableCell>
                      <TableCell className="text-xs">{r.total_links}</TableCell>
                      <TableCell className="text-xs">{r.total_errors}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(r.ran_at), { addSuffix: true })}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
        </CardContent>
      </Card>
    </div>
  );
}

function RoiPanel() {
  const [days, setDays] = useState(30);
  const [spend, setSpend] = useState<Spend[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const load = async () => {
    setLoading(true);
    const since = format(subDays(new Date(), days), "yyyy-MM-dd");
    const [sRes, lRes] = await Promise.all([
      (supabase as any).from("crm_ad_spend").select("*").gte("spend_date", since),
      supabase.from("crm_contacts").select("source, status, created_at").gte("created_at", subDays(new Date(), days).toISOString()),
    ]);
    setSpend(sRes.data || []);
    setLeads(lRes.data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [days]);

  const rows = useMemo(() => {
    const spendBySrc = new Map<string, number>();
    spend.forEach(s => spendBySrc.set(s.utm_source, (spendBySrc.get(s.utm_source) || 0) + Number(s.amount)));
    const leadsBySrc = new Map<string, { total: number; hot: number }>();
    leads.forEach(l => {
      const k = (l.source || "(direct)").toLowerCase();
      const cur = leadsBySrc.get(k) || { total: 0, hot: 0 };
      cur.total++;
      if (["hot", "qualified", "appointment"].includes(String(l.status || "").toLowerCase())) cur.hot++;
      leadsBySrc.set(k, cur);
    });
    const keys = new Set([...spendBySrc.keys(), ...leadsBySrc.keys()]);
    return Array.from(keys).map(src => {
      const sp = spendBySrc.get(src) || 0;
      const lc = leadsBySrc.get(src) || { total: 0, hot: 0 };
      return { source: src, spend: sp, leads: lc.total, hot: lc.hot, cpl: lc.total > 0 ? sp / lc.total : 0 };
    }).sort((a, b) => b.spend - a.spend);
  }, [spend, leads]);

  const totalSpend = spend.reduce((s, r) => s + Number(r.amount), 0);
  const totalLeads = leads.length;
  const avgCpl = totalLeads > 0 ? totalSpend / totalLeads : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Select value={String(days)} onValueChange={v => setDays(Number(v))}>
          <SelectTrigger className="w-32 h-9 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => setAdding(true)}><Plus className="h-3.5 w-3.5 mr-1.5" />Log Ad Spend</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card><CardContent className="pt-5">
          <div className="flex items-center gap-2 mb-1"><DollarSign className="h-4 w-4 text-emerald-500" /><span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Total Spend</span></div>
          <p className="text-2xl font-bold">${totalSpend.toFixed(0)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <div className="flex items-center gap-2 mb-1"><Target className="h-4 w-4 text-blue-500" /><span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Total Leads</span></div>
          <p className="text-2xl font-bold">{totalLeads}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <div className="flex items-center gap-2 mb-1"><TrendingUp className="h-4 w-4 text-violet-500" /><span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Avg CPL</span></div>
          <p className="text-2xl font-bold">${avgCpl.toFixed(2)}</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">By Source</CardTitle></CardHeader>
        <CardContent>
          {loading ? <Loader2 className="h-5 w-5 animate-spin mx-auto my-6" /> :
            rows.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground border border-dashed border-border rounded-lg">
                No spend or leads in this period yet.
              </div>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>Source</TableHead><TableHead>Spend</TableHead><TableHead>Leads</TableHead><TableHead>Hot</TableHead><TableHead>CPL</TableHead></TableRow></TableHeader>
                <TableBody>
                  {rows.map(r => (
                    <TableRow key={r.source}>
                      <TableCell className="font-medium text-xs">{r.source}</TableCell>
                      <TableCell className="text-xs">${r.spend.toFixed(2)}</TableCell>
                      <TableCell className="text-xs">{r.leads}</TableCell>
                      <TableCell className="text-xs text-emerald-600 font-semibold">{r.hot}</TableCell>
                      <TableCell className="text-xs">${r.cpl.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
        </CardContent>
      </Card>

      <AddSpendDialog open={adding} onOpenChange={setAdding} onSaved={load} />
    </div>
  );
}

function AddSpendDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void; }) {
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [source, setSource] = useState("meta");
  const [campaign, setCampaign] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!amount) { toast.error("Amount required"); return; }
    setSaving(true);
    const { error } = await (supabase as any).from("crm_ad_spend").insert({
      spend_date: date, utm_source: source, utm_campaign: campaign || null, amount: Number(amount),
    });
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success("Logged"); setAmount(""); setCampaign(""); onOpenChange(false); onSaved(); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Log Ad Spend</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="meta">Meta (Facebook / Instagram)</SelectItem>
              <SelectItem value="google">Google Ads</SelectItem>
              <SelectItem value="tiktok">TikTok</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
          <Input placeholder="Campaign name (optional)" value={campaign} onChange={e => setCampaign(e.target.value)} />
          <Input type="number" placeholder="Amount" value={amount} onChange={e => setAmount(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
