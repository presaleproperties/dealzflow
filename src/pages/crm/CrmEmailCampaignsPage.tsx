import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Loader2, Megaphone, Send, Eye, MousePointerClick, Users, RefreshCw, Plus } from "lucide-react";

interface Campaign {
  id: string;
  subject: string;
  body_html: string | null;
  status: string | null;
  recipients_count: number | null;
  opens: number | null;
  clicks: number | null;
  sent_at: string | null;
  created_at: string;
  segment_filter: any;
}

interface Template {
  id: string;
  name: string;
  subject: string;
  body_html: string | null;
}

const ago = (iso: string | null) =>
  !iso ? "—" : formatDistanceToNow(new Date(iso), { addSuffix: true });

export default function CrmEmailCampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [open, setOpen] = useState(false);

  // Composer
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [templateId, setTemplateId] = useState<string>("");
  const [tagFilter, setTagFilter] = useState<string>("__all__");
  const [statusFilter, setStatusFilter] = useState<string>("__all__");
  const [recipientPreview, setRecipientPreview] = useState<{ email: string; first_name: string | null }[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const [c, t, tg] = await Promise.all([
      supabase.from("crm_email_campaigns").select("*").order("created_at", { ascending: false }).limit(50),
      supabase.from("crm_email_templates").select("id, name, subject, body_html").eq("is_active", true).order("name"),
      supabase.from("crm_tags").select("name").order("usage_count", { ascending: false }).limit(50),
    ]);
    setCampaigns((c.data ?? []) as Campaign[]);
    setTemplates((t.data ?? []) as Template[]);
    setTags(((tg.data ?? []) as { name: string }[]).map(x => x.name));
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const loadRecipientPreview = async () => {
    setPreviewLoading(true);
    let q = supabase
      .from("crm_contacts")
      .select("email, first_name")
      .not("email", "is", null)
      .eq("marketing_consent", true)
      .limit(500);
    if (tagFilter !== "__all__") q = q.contains("tags", [tagFilter]);
    if (statusFilter !== "__all__") q = q.eq("status", statusFilter);
    const { data, error } = await q;
    if (error) { toast.error(error.message); setPreviewLoading(false); return; }
    setRecipientPreview((data ?? []).filter(r => r.email));
    setPreviewLoading(false);
  };

  useEffect(() => { if (open) loadRecipientPreview(); }, [open, tagFilter, statusFilter]);

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const tpl = templates.find(t => t.id === id);
    if (tpl) {
      if (!subject) setSubject(tpl.subject ?? "");
      if (!bodyHtml) setBodyHtml(tpl.body_html ?? "");
    }
  };

  const sendCampaign = async () => {
    if (!subject.trim() || !bodyHtml.trim()) {
      toast.error("Subject and body required"); return;
    }
    if (recipientPreview.length === 0) {
      toast.error("No recipients match the filter"); return;
    }
    setSending(true);
    try {
      const { data: campaign, error: cErr } = await supabase
        .from("crm_email_campaigns")
        .insert({
          subject,
          body_html: bodyHtml,
          status: "sending",
          recipients_count: recipientPreview.length,
          segment_filter: { tag: tagFilter, status: statusFilter },
        })
        .select("id")
        .single();
      if (cErr) throw cErr;

      // Send via the proxy in chunks to avoid hammering the function
      const chunks: typeof recipientPreview[] = [];
      for (let i = 0; i < recipientPreview.length; i += 25) {
        chunks.push(recipientPreview.slice(i, i + 25));
      }
      let sent = 0, failed = 0;
      for (const chunk of chunks) {
        const results = await Promise.all(chunk.map(r =>
          supabase.functions.invoke("crm-send-via-presale", {
            body: {
              to: r.email,
              to_name: r.first_name,
              subject,
              html: bodyHtml,
              template_id: templateId || undefined,
              template_type: "campaign",
              campaign_id: campaign.id,
            },
          }).then(res => res.error ? false : true).catch(() => false)
        ));
        sent += results.filter(Boolean).length;
        failed += results.filter(r => !r).length;
      }

      await supabase
        .from("crm_email_campaigns")
        .update({ status: failed === recipientPreview.length ? "failed" : "sent", sent_at: new Date().toISOString() })
        .eq("id", campaign.id);

      toast.success(`Campaign sent: ${sent} delivered, ${failed} failed`);
      setOpen(false);
      setSubject(""); setBodyHtml(""); setTemplateId("");
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to send campaign");
    } finally {
      setSending(false);
    }
  };

  const totalSent = useMemo(() => campaigns.reduce((s, c) => s + (c.recipients_count ?? 0), 0), [campaigns]);
  const totalOpens = useMemo(() => campaigns.reduce((s, c) => s + (c.opens ?? 0), 0), [campaigns]);
  const totalClicks = useMemo(() => campaigns.reduce((s, c) => s + (c.clicks ?? 0), 0), [campaigns]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2"><Megaphone className="h-4 w-4" /> Campaigns</h2>
          <p className="text-xs text-muted-foreground">Broadcast to a filtered segment via the Presale send infra.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={refresh}><RefreshCw className="h-3.5 w-3.5 mr-1" />Refresh</Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-3.5 w-3.5 mr-1" />New campaign</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>Compose campaign</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Tag filter</Label>
                    <Select value={tagFilter} onValueChange={setTagFilter}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">All tags</SelectItem>
                        {tags.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Status filter</Label>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">All statuses</SelectItem>
                        <SelectItem value="New Lead">New Lead</SelectItem>
                        <SelectItem value="Contacted">Contacted</SelectItem>
                        <SelectItem value="Qualified">Qualified</SelectItem>
                        <SelectItem value="Hot">Hot</SelectItem>
                        <SelectItem value="Nurture">Nurture</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {previewLoading ? "Counting…" : `${recipientPreview.length} recipients (with marketing consent)`}
                </div>

                <div>
                  <Label className="text-xs">Start from template (optional)</Label>
                  <Select value={templateId} onValueChange={applyTemplate}>
                    <SelectTrigger><SelectValue placeholder="Choose a template" /></SelectTrigger>
                    <SelectContent>
                      {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs">Subject</Label>
                  <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject line" />
                </div>
                <div>
                  <Label className="text-xs">HTML body</Label>
                  <Textarea value={bodyHtml} onChange={e => setBodyHtml(e.target.value)} rows={8}
                    placeholder="<p>Hello {{first_name}}…</p>" className="font-mono text-xs" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={sendCampaign} disabled={sending || recipientPreview.length === 0}>
                  {sending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1" />}
                  Send to {recipientPreview.length}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatCard label="Campaigns" value={campaigns.length} icon={<Megaphone className="h-3.5 w-3.5" />} />
        <StatCard label="Recipients" value={totalSent} icon={<Users className="h-3.5 w-3.5" />} />
        <StatCard label="Opens" value={totalOpens} icon={<Eye className="h-3.5 w-3.5" />} />
        <StatCard label="Clicks" value={totalClicks} icon={<MousePointerClick className="h-3.5 w-3.5" />} />
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Recent campaigns</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-4 w-4 animate-spin" /></div>
          ) : campaigns.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No campaigns yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Recipients</TableHead>
                  <TableHead className="text-right">Opens</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead>Sent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.subject}</TableCell>
                    <TableCell><Badge variant={c.status === "sent" ? "default" : c.status === "failed" ? "destructive" : "secondary"}>{c.status ?? "draft"}</Badge></TableCell>
                    <TableCell className="text-right">{c.recipients_count ?? 0}</TableCell>
                    <TableCell className="text-right">{c.opens ?? 0}</TableCell>
                    <TableCell className="text-right">{c.clicks ?? 0}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{ago(c.sent_at ?? c.created_at)}</TableCell>
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

function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-[11px] text-muted-foreground flex items-center gap-1">{icon}{label}</div>
        <div className="text-xl font-semibold mt-1">{value.toLocaleString()}</div>
      </CardContent>
    </Card>
  );
}
