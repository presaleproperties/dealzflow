import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Send, Mail, CheckCircle2, XCircle, RefreshCw, Loader2, Eye, Zap,
  BarChart3, Search, MailOpen, TrendingUp, Trash2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface EmailLog {
  id: string;
  email_to: string;
  recipient_name: string | null;
  subject: string;
  status: string;
  sent_at: string;
  error_message: string | null;
  template_type: string | null;
  campaign_id: string | null;
  opened_at: string | null;
  open_count: number;
  last_opened_at: string | null;
  tracking_id: string | null;
  clicked_at: string | null;
  click_count: number;
  last_clicked_at: string | null;
  clicked_url: string | null;
}

const timeAgo = (iso: string | null) =>
  !iso ? "—" : formatDistanceToNow(new Date(iso), { addSuffix: true });

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "sent" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" :
    status === "failed" ? "bg-destructive/10 text-destructive border-destructive/30" :
    status === "queued" ? "bg-amber-500/10 text-amber-700 border-amber-500/30" :
    "bg-muted text-muted-foreground border-border";
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border", cls)}>
      {status}
    </span>
  );
}

function DashboardStats({ logs }: { logs: EmailLog[] }) {
  const sent = logs.filter(l => l.status === "sent").length;
  const failed = logs.filter(l => l.status === "failed").length;
  const opened = logs.filter(l => l.opened_at).length;
  const openRate = sent > 0 ? Math.round((opened / sent) * 100) : 0;
  const clicked = logs.filter(l => l.clicked_at).length;
  const clickRate = sent > 0 ? Math.round((clicked / sent) * 100) : 0;
  const reopened = logs.filter(l => l.open_count >= 2).length;

  const stats = [
    { label: "Total Sent", value: sent, icon: <Send className="h-4 w-4 text-emerald-500" />, color: "text-emerald-600" },
    { label: "Opened", value: opened, icon: <MailOpen className="h-4 w-4 text-blue-500" />, color: "text-blue-600" },
    { label: "Open Rate", value: `${openRate}%`, icon: <TrendingUp className="h-4 w-4 text-violet-500" />, color: "text-violet-600" },
    { label: "Clicked", value: `${clicked} (${clickRate}%)`, icon: <Zap className="h-4 w-4 text-orange-500" />, color: "text-orange-600" },
    { label: "Re-opened", value: reopened, icon: <RefreshCw className="h-4 w-4 text-amber-500" />, color: "text-amber-600" },
    { label: "Failed", value: failed, icon: <XCircle className="h-4 w-4 text-destructive" />, color: failed > 0 ? "text-destructive" : "text-muted-foreground" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {stats.map(s => (
        <div key={s.label} className="bg-card border border-border rounded-lg px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            {s.icon}
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{s.label}</p>
          </div>
          <p className={cn("text-2xl font-bold", s.color)}>{s.value}</p>
        </div>
      ))}
    </div>
  );
}

function QuickSendCard({ onSent }: { onSent: () => void }) {
  const [to, setTo] = useState("");
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [sending, setSending] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [templateId, setTemplateId] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("email_templates")
        .select("id, name, subject, html_content")
        .order("updated_at", { ascending: false })
        .limit(50);
      setTemplates(data || []);
    })();
  }, []);

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const t = templates.find(t => t.id === id);
    if (t) {
      setSubject(t.subject || "");
      setHtml(t.html_content || "");
    }
  };

  const send = async () => {
    if (!to || !subject || !html) {
      toast.error("Recipient, subject and content are required");
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("crm-send-via-presale", {
        body: { to, to_name: name, subject, html, template_id: templateId || undefined },
      });
      if (error) throw error;
      if ((data as any)?.queued) toast.warning((data as any).message || "Queued");
      else toast.success("Email sent");
      setTo(""); setName(""); setSubject(""); setHtml(""); setTemplateId("");
      onSent();
    } catch (e: any) {
      toast.error(e?.message || "Failed to send");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-4">
      <div className="flex items-center gap-2 pb-3 border-b border-border">
        <Send className="h-4 w-4 text-primary" />
        <div>
          <p className="text-sm font-semibold">Quick Send</p>
          <p className="text-xs text-muted-foreground">Pick a template or compose, sent via Presale's email infra — fully tracked.</p>
        </div>
      </div>

      {templates.length > 0 && (
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Use a synced template</label>
          <Select value={templateId} onValueChange={applyTemplate}>
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="None — compose from scratch" /></SelectTrigger>
            <SelectContent>
              {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input placeholder="Recipient email" value={to} onChange={e => setTo(e.target.value)} />
        <Input placeholder="Recipient name (optional)" value={name} onChange={e => setName(e.target.value)} />
      </div>
      <Input placeholder="Subject" value={subject} onChange={e => setSubject(e.target.value)} />
      <textarea
        className="w-full min-h-[180px] rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
        placeholder="HTML or plain content..."
        value={html}
        onChange={e => setHtml(e.target.value)}
      />
      <div className="flex justify-end">
        <Button onClick={send} disabled={sending}>
          {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
          Send Email
        </Button>
      </div>
    </div>
  );
}

function EmailLogTable({ logs, loading, onDelete }: { logs: EmailLog[]; loading: boolean; onDelete: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [openFilter, setOpenFilter] = useState("all");
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    setDeleting(id);
    const { error } = await (supabase as any).from("crm_email_send_log").delete().eq("id", id);
    if (!error) { onDelete(id); toast.success("Deleted"); } else toast.error("Failed to delete");
    setDeleting(null);
  };

  const filtered = logs.filter(l => {
    const s = search.toLowerCase();
    const matchSearch = !s || l.email_to.toLowerCase().includes(s) || l.subject.toLowerCase().includes(s) || (l.recipient_name || "").toLowerCase().includes(s);
    const matchStatus = statusFilter === "all" || l.status === statusFilter;
    const matchOpen = openFilter === "all"
      || (openFilter === "opened" && l.opened_at)
      || (openFilter === "unopened" && !l.opened_at && l.status === "sent")
      || (openFilter === "reopened" && l.open_count >= 2)
      || (openFilter === "clicked" && l.clicked_at);
    return matchSearch && matchStatus && matchOpen;
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search recipient or subject…" className="pl-8 h-9 text-sm" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-32 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="queued">Queued</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
        <Select value={openFilter} onValueChange={setOpenFilter}>
          <SelectTrigger className="h-9 w-32 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Opens</SelectItem>
            <SelectItem value="opened">Opened</SelectItem>
            <SelectItem value="unopened">Unopened</SelectItem>
            <SelectItem value="reopened">Re-opened</SelectItem>
            <SelectItem value="clicked">Clicked</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">No emails found</div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="grid grid-cols-[1fr_1fr_80px_80px_60px_80px_80px_40px] gap-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted/30 px-4 py-2 border-b border-border">
            <span>Recipient</span><span>Subject</span><span>Status</span><span>Opens</span><span>Clicks</span><span>Last Open</span><span>Sent</span><span></span>
          </div>
          <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
            {filtered.slice(0, 200).map(log => (
              <div key={log.id} className="grid grid-cols-[1fr_1fr_80px_80px_60px_80px_80px_40px] gap-0 px-4 py-2.5 hover:bg-muted/20 items-center group">
                <div className="min-w-0 pr-2">
                  <p className="text-sm font-medium truncate">{log.recipient_name || log.email_to.split("@")[0]}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{log.email_to}</p>
                </div>
                <span className="text-xs text-muted-foreground truncate pr-2">{log.subject}</span>
                <span><StatusBadge status={log.status} /></span>
                <span className="flex items-center gap-1.5">
                  {log.opened_at ? (<><MailOpen className="h-3 w-3 text-blue-500" /><span className="text-xs font-medium text-blue-600">{log.open_count}×</span></>) : <span className="text-[10px] text-muted-foreground">—</span>}
                </span>
                <span className="flex items-center gap-1">
                  {log.clicked_at ? (<><Zap className="h-3 w-3 text-orange-500" /><span className="text-xs font-medium text-orange-600">{log.click_count}×</span></>) : <span className="text-[10px] text-muted-foreground">—</span>}
                </span>
                <span className="text-[10px] text-muted-foreground">{timeAgo(log.last_opened_at)}</span>
                <span className="text-[10px] text-muted-foreground">{timeAgo(log.sent_at)}</span>
                <button onClick={() => handleDelete(log.id)} disabled={deleting === log.id} className="h-7 w-7 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                  {deleting === log.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CrmEmailCenterPage() {
  const [tab, setTab] = useState("send");
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("crm_email_send_log")
      .select("*")
      .order("sent_at", { ascending: false })
      .limit(500);
    setLogs((data || []) as EmailLog[]);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const sentEmails = logs.filter(l => l.status === "sent");
  const opened = sentEmails.filter(l => l.opened_at).length;
  const openRate = sentEmails.length > 0 ? Math.round((opened / sentEmails.length) * 100) : 0;

  return (
    <div className="space-y-5 max-w-[1400px]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center"><Mail className="h-4 w-4 text-primary" /></div>
            Email Center
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Send template emails to leads & track engagement — synced with Presale Properties</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-4 text-xs bg-muted/40 border border-border px-4 py-2 rounded-lg">
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /><span className="font-semibold">{sentEmails.length}</span> sent</span>
            <span className="flex items-center gap-1.5"><MailOpen className="h-3.5 w-3.5 text-blue-500" /><span className="font-semibold">{openRate}%</span> open rate</span>
          </div>
          <Button variant="outline" size="sm" onClick={fetchAll}><RefreshCw className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      <DashboardStats logs={logs} />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-9 gap-0.5">
          <TabsTrigger value="send" className="text-xs gap-1.5 px-4"><Send className="h-3.5 w-3.5" />Send Email</TabsTrigger>
          <TabsTrigger value="history" className="text-xs gap-1.5 px-4">
            <BarChart3 className="h-3.5 w-3.5" />History & Tracking
            {logs.length > 0 && <span className="ml-1 bg-muted text-muted-foreground rounded-full px-1.5 text-[10px] font-semibold">{logs.length}</span>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="send" className="mt-4"><QuickSendCard onSent={fetchAll} /></TabsContent>
        <TabsContent value="history" className="mt-4">
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center gap-2 mb-5 pb-4 border-b border-border">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-semibold">Email History & Open Tracking</p>
                <p className="text-xs text-muted-foreground">See who opened your emails and how many times</p>
              </div>
            </div>
            <EmailLogTable logs={logs} loading={loading} onDelete={(id) => setLogs(prev => prev.filter(l => l.id !== id))} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
