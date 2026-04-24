import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import {
  Loader2, Megaphone, Send, Eye, MousePointerClick, Users, RefreshCw, Plus,
  Mail, Target, Clock, FileCheck2, ArrowLeft, ArrowRight, CalendarClock,
} from "lucide-react";
import { renderWithSampleData, renderForRecipient, type RecipientLead } from "@/lib/emailVariables";

interface Campaign {
  id: string;
  subject: string;
  body_html: string | null;
  status: string | null;
  recipients_count: number | null;
  opens: number | null;
  clicks: number | null;
  sent_at: string | null;
  scheduled_for: string | null;
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

type Step = 1 | 2 | 3 | 4;
type SendMode = "now" | "schedule";

const STEPS: { n: Step; label: string; icon: React.ReactNode }[] = [
  { n: 1, label: "Template", icon: <Mail className="h-3.5 w-3.5" /> },
  { n: 2, label: "Audience", icon: <Target className="h-3.5 w-3.5" /> },
  { n: 3, label: "Schedule", icon: <Clock className="h-3.5 w-3.5" /> },
  { n: 4, label: "Preview & send", icon: <FileCheck2 className="h-3.5 w-3.5" /> },
];

export default function CrmEmailCampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [open, setOpen] = useState(false);

  // Wizard state
  const [step, setStep] = useState<Step>(1);
  const [templateId, setTemplateId] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [tagFilter, setTagFilter] = useState<string>("__all__");
  const [statusFilter, setStatusFilter] = useState<string>("__all__");
  const [recipientPreview, setRecipientPreview] = useState<(RecipientLead & { id?: string; email: string; first_name: string | null })[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sendMode, setSendMode] = useState<SendMode>("now");
  const [scheduleDate, setScheduleDate] = useState<string>("");
  const [scheduleTime, setScheduleTime] = useState<string>("09:00");

  const refresh = async () => {
    setLoading(true);
    const [c, t, tg] = await Promise.all([
      supabase.from("crm_email_campaigns").select("*").order("created_at", { ascending: false }).limit(50),
      supabase.from("crm_email_templates").select("id, name, subject, body_html").eq("is_active", true).order("name"),
      supabase.from("crm_tags").select("name").order("usage_count", { ascending: false }).limit(50),
    ]);
    setCampaigns((c.data ?? []) as Campaign[]);
    setTemplates((t.data ?? []) as Template[]);
    setTags(((tg.data ?? []) as { name: string }[]).map((x) => x.name));
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const resetWizard = () => {
    setStep(1);
    setTemplateId("");
    setSubject("");
    setBodyHtml("");
    setTagFilter("__all__");
    setStatusFilter("__all__");
    setRecipientPreview([]);
    setSendMode("now");
    setScheduleDate("");
    setScheduleTime("09:00");
  };

  const loadRecipientPreview = async () => {
    setPreviewLoading(true);
    let q = supabase
      .from("crm_contacts")
      .select("email, first_name")
      .not("email", "is", null)
      .eq("marketing_consent", true)
      .limit(2000);
    if (tagFilter !== "__all__") q = q.contains("tags", [tagFilter]);
    if (statusFilter !== "__all__") q = q.eq("status", statusFilter);
    const { data, error } = await q;
    if (error) { toast.error(error.message); setPreviewLoading(false); return; }
    setRecipientPreview((data ?? []).filter((r) => r.email));
    setPreviewLoading(false);
  };

  useEffect(() => { if (open && step === 2) loadRecipientPreview(); }, [open, step, tagFilter, statusFilter]);

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const tpl = templates.find((t) => t.id === id);
    if (tpl) {
      setSubject(tpl.subject ?? "");
      setBodyHtml(tpl.body_html ?? "");
    }
  };

  const scheduledIso = useMemo(() => {
    if (sendMode !== "schedule" || !scheduleDate) return null;
    const dt = new Date(`${scheduleDate}T${scheduleTime || "09:00"}`);
    return isNaN(dt.getTime()) ? null : dt.toISOString();
  }, [sendMode, scheduleDate, scheduleTime]);

  const previewHtml = useMemo(() => renderWithSampleData(bodyHtml || ""), [bodyHtml]);
  const previewSubject = useMemo(() => renderWithSampleData(subject || ""), [subject]);

  const canProceed = (): boolean => {
    if (step === 1) return !!subject.trim() && !!bodyHtml.trim();
    if (step === 2) return recipientPreview.length > 0;
    if (step === 3) return sendMode === "now" || (!!scheduledIso && new Date(scheduledIso) > new Date());
    return true;
  };

  const finish = async () => {
    if (!canProceed()) return;
    setSending(true);
    try {
      const isScheduled = sendMode === "schedule";
      const { data: campaign, error: cErr } = await supabase
        .from("crm_email_campaigns")
        .insert({
          subject,
          body_html: bodyHtml,
          template_id: templateId || null,
          status: isScheduled ? "scheduled" : "sending",
          scheduled_for: isScheduled ? scheduledIso : null,
          recipients_count: recipientPreview.length,
          segment_filter: { tag: tagFilter, status: statusFilter },
        })
        .select("id")
        .single();
      if (cErr) throw cErr;

      if (isScheduled) {
        toast.success(`Scheduled for ${format(new Date(scheduledIso!), "MMM d, h:mm a")}`);
        setOpen(false);
        resetWizard();
        refresh();
        return;
      }

      // Immediate send
      let sent = 0, failed = 0;
      for (let i = 0; i < recipientPreview.length; i += 25) {
        const chunk = recipientPreview.slice(i, i + 25);
        const results = await Promise.all(chunk.map((r) =>
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
          }).then((res) => (res.error ? false : true)).catch(() => false),
        ));
        sent += results.filter(Boolean).length;
        failed += results.filter((r) => !r).length;
      }

      await supabase
        .from("crm_email_campaigns")
        .update({
          status: failed === recipientPreview.length ? "failed" : "sent",
          sent_at: new Date().toISOString(),
        })
        .eq("id", campaign.id);

      toast.success(`Campaign sent: ${sent} delivered, ${failed} failed`);
      setOpen(false);
      resetWizard();
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
          <p className="text-xs text-muted-foreground">Pick a template, target a segment, schedule it, preview, send.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={refresh}><RefreshCw className="h-3.5 w-3.5 mr-1" />Refresh</Button>
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetWizard(); }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-3.5 w-3.5 mr-1" />New campaign</Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>New campaign</DialogTitle>
              </DialogHeader>

              {/* Stepper */}
              <div className="flex items-center gap-2 py-2">
                {STEPS.map((s, i) => (
                  <div key={s.n} className="flex items-center gap-2 flex-1">
                    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs ${
                      step === s.n ? "bg-primary text-primary-foreground"
                      : step > s.n ? "bg-muted text-foreground"
                      : "text-muted-foreground"
                    }`}>
                      {s.icon}<span className="font-medium">{s.label}</span>
                    </div>
                    {i < STEPS.length - 1 && <div className="flex-1 h-px bg-border" />}
                  </div>
                ))}
              </div>

              {/* Step 1 — Template */}
              {step === 1 && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Start from a template (optional)</Label>
                    <Select value={templateId} onValueChange={applyTemplate}>
                      <SelectTrigger><SelectValue placeholder={templates.length ? "Choose a template" : "No active templates"} /></SelectTrigger>
                      <SelectContent>
                        {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Subject</Label>
                    <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject line — supports {{lead.first_name}}" />
                  </div>
                  <div>
                    <Label className="text-xs">HTML body</Label>
                    <Textarea
                      value={bodyHtml}
                      onChange={(e) => setBodyHtml(e.target.value)}
                      rows={10}
                      placeholder="<p>Hi {{lead.first_name}},</p>"
                      className="font-mono text-xs"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Use merge tokens like <code>{`{{lead.first_name}}`}</code>, <code>{`{{sender.full_name}}`}</code>, <code>{`{{link.unsubscribe}}`}</code>.
                    </p>
                  </div>
                </div>
              )}

              {/* Step 2 — Audience */}
              {step === 2 && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Tag</Label>
                      <Select value={tagFilter} onValueChange={setTagFilter}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__all__">All tags</SelectItem>
                          {tags.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Pipeline status</Label>
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

                  <Card>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {previewLoading ? "Counting…" : `${recipientPreview.length} recipients with marketing consent`}
                        </div>
                        <Button size="sm" variant="ghost" onClick={loadRecipientPreview} disabled={previewLoading}>
                          <RefreshCw className={`h-3 w-3 ${previewLoading ? "animate-spin" : ""}`} />
                        </Button>
                      </div>
                      <div className="max-h-40 overflow-y-auto text-xs space-y-1">
                        {recipientPreview.slice(0, 30).map((r, i) => (
                          <div key={i} className="flex justify-between border-b border-border/50 pb-0.5">
                            <span className="truncate">{r.first_name ?? "—"}</span>
                            <span className="text-muted-foreground truncate ml-2">{r.email}</span>
                          </div>
                        ))}
                        {recipientPreview.length > 30 && (
                          <div className="text-muted-foreground italic">+{recipientPreview.length - 30} more…</div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Step 3 — Schedule */}
              {step === 3 && (
                <div className="space-y-3">
                  <RadioGroup value={sendMode} onValueChange={(v) => setSendMode(v as SendMode)}>
                    <div className="flex items-center gap-2 p-3 rounded-md border">
                      <RadioGroupItem value="now" id="send-now" />
                      <Label htmlFor="send-now" className="flex-1 cursor-pointer">
                        <div className="font-medium text-sm flex items-center gap-2"><Send className="h-3.5 w-3.5" />Send immediately</div>
                        <div className="text-xs text-muted-foreground">Dispatches as soon as you confirm.</div>
                      </Label>
                    </div>
                    <div className="flex items-start gap-2 p-3 rounded-md border">
                      <RadioGroupItem value="schedule" id="send-schedule" className="mt-1" />
                      <Label htmlFor="send-schedule" className="flex-1 cursor-pointer">
                        <div className="font-medium text-sm flex items-center gap-2"><CalendarClock className="h-3.5 w-3.5" />Schedule for later</div>
                        <div className="text-xs text-muted-foreground mb-2">A background processor will dispatch at the scheduled time.</div>
                        {sendMode === "schedule" && (
                          <div className="grid grid-cols-2 gap-2 mt-2">
                            <div>
                              <Label className="text-[11px]">Date</Label>
                              <Input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} min={format(new Date(), "yyyy-MM-dd")} />
                            </div>
                            <div>
                              <Label className="text-[11px]">Time</Label>
                              <Input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} />
                            </div>
                          </div>
                        )}
                      </Label>
                    </div>
                  </RadioGroup>
                  {sendMode === "schedule" && scheduledIso && (
                    <p className="text-xs text-muted-foreground">
                      Will send <strong>{format(new Date(scheduledIso), "EEE MMM d, yyyy 'at' h:mm a")}</strong>.
                    </p>
                  )}
                </div>
              )}

              {/* Step 4 — Preview & send */}
              {step === 4 && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <SummaryItem label="Recipients" value={`${recipientPreview.length}`} />
                    <SummaryItem label="Tag" value={tagFilter === "__all__" ? "All" : tagFilter} />
                    <SummaryItem label="Status" value={statusFilter === "__all__" ? "All" : statusFilter} />
                    <SummaryItem
                      label="Send"
                      value={sendMode === "now" ? "Immediately" : (scheduledIso ? format(new Date(scheduledIso), "MMM d, h:mm a") : "—")}
                    />
                    <SummaryItem label="Template" value={templates.find((t) => t.id === templateId)?.name ?? "Custom"} />
                    <SummaryItem label="Subject" value={previewSubject} />
                  </div>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs flex items-center gap-1"><Eye className="h-3 w-3" /> Preview (sample data)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="border rounded-md p-3 bg-white text-black max-h-[40vh] overflow-y-auto">
                        <div className="text-sm font-semibold border-b pb-2 mb-2">{previewSubject || "(no subject)"}</div>
                        <div
                          className="prose prose-sm max-w-none"
                          dangerouslySetInnerHTML={{ __html: previewHtml || "<em>No body</em>" }}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              <DialogFooter className="flex justify-between sm:justify-between gap-2">
                <Button
                  variant="ghost"
                  onClick={() => (step === 1 ? setOpen(false) : setStep((step - 1) as Step))}
                  disabled={sending}
                >
                  {step === 1 ? "Cancel" : (<><ArrowLeft className="h-3.5 w-3.5 mr-1" />Back</>)}
                </Button>
                {step < 4 ? (
                  <Button onClick={() => setStep((step + 1) as Step)} disabled={!canProceed()}>
                    Next <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                ) : (
                  <Button onClick={finish} disabled={sending || !canProceed()}>
                    {sending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> :
                      sendMode === "schedule" ? <CalendarClock className="h-3.5 w-3.5 mr-1" /> : <Send className="h-3.5 w-3.5 mr-1" />}
                    {sendMode === "schedule" ? "Schedule campaign" : `Send to ${recipientPreview.length}`}
                  </Button>
                )}
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
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.subject}</TableCell>
                    <TableCell>
                      <Badge variant={
                        c.status === "sent" ? "default"
                          : c.status === "failed" ? "destructive"
                          : c.status === "scheduled" ? "outline"
                          : "secondary"
                      }>
                        {c.status ?? "draft"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{c.recipients_count ?? 0}</TableCell>
                    <TableCell className="text-right">{c.opens ?? 0}</TableCell>
                    <TableCell className="text-right">{c.clicks ?? 0}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {c.status === "scheduled" && c.scheduled_for
                        ? `Scheduled ${format(new Date(c.scheduled_for), "MMM d, h:mm a")}`
                        : ago(c.sent_at ?? c.created_at)}
                    </TableCell>
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

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="border rounded-md p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-xs font-medium truncate" title={value}>{value || "—"}</div>
    </div>
  );
}
