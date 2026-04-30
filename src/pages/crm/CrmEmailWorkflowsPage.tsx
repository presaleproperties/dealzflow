import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Workflow, Plus, Loader2, Trash2, Clock, Mail, Play } from "lucide-react";
import { toast } from "sonner";

interface WF { id: string; workflow_key: string; name: string; description: string | null; trigger_event: string; audience_type: string; is_active: boolean; }
interface Step { id: string; workflow_id: string; step_order: number; delay_minutes: number; template_id: string | null; is_active: boolean; }
interface Tmpl { id: string; name: string; }

const TRIGGERS = [
  { value: "lead_created", label: "New Lead" },
  { value: "lead_stage_change", label: "Pipeline Stage Change" },
  { value: "presale_signup", label: "Presale Signup" },
  { value: "presale_brochure_download", label: "Brochure Download" },
  { value: "presale_tour_request", label: "Tour Request" },
  { value: "no_activity_7d", label: "No Activity (7 days)" },
];

const formatDelay = (m: number) => {
  if (m === 0) return "Immediately";
  if (m % 10080 === 0) return `${m/10080}w`;
  if (m % 1440 === 0) return `${m/1440}d`;
  if (m % 60 === 0) return `${m/60}h`;
  return `${m}m`;
};

export default function CrmEmailWorkflowsPage() {
  const [workflows, setWorkflows] = useState<WF[]>([]);
  const [templates, setTemplates] = useState<Tmpl[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<WF | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [creating, setCreating] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    const [wfRes, tmplRes] = await Promise.all([
      (supabase as any).from("crm_email_workflows").select("*").order("created_at", { ascending: false }),
      supabase.from("crm_email_templates").select("id, name").eq("is_active", true).order("name"),
    ]);
    setWorkflows(wfRes.data || []);
    setTemplates(tmplRes.data || []);
    setLoading(false);
  };

  const fetchSteps = async (workflowId: string) => {
    const { data } = await (supabase as any)
      .from("crm_email_workflow_steps")
      .select("*")
      .eq("workflow_id", workflowId)
      .order("step_order");
    setSteps(data || []);
  };

  useEffect(() => { fetchAll(); }, []);
  useEffect(() => { if (selected) fetchSteps(selected.id); }, [selected]);

  const toggleActive = async (wf: WF) => {
    await (supabase as any).from("crm_email_workflows").update({ is_active: !wf.is_active }).eq("id", wf.id);
    fetchAll();
  };

  const addStep = async () => {
    if (!selected) return;
    const next = steps.length + 1;
    await (supabase as any).from("crm_email_workflow_steps").insert({
      workflow_id: selected.id, step_order: next, delay_minutes: next === 1 ? 0 : 1440, template_id: null, is_active: true,
    });
    fetchSteps(selected.id);
  };

  const updateStep = async (id: string, patch: Partial<Step>) => {
    await (supabase as any).from("crm_email_workflow_steps").update(patch).eq("id", id);
    if (selected) fetchSteps(selected.id);
  };

  const deleteStep = async (id: string) => {
    await (supabase as any).from("crm_email_workflow_steps").delete().eq("id", id);
    if (selected) fetchSteps(selected.id);
  };

  return (
    <div className="space-y-5 max-w-[1400px]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center"><Workflow className="h-4 w-4 text-primary" /></div>
            Email Workflows
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Trigger-based drip sequences for new leads, signups, and inactivity.</p>
        </div>
        <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-2" />New Workflow</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-5">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">All Workflows ({workflows.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {loading ? <Loader2 className="h-5 w-5 animate-spin mx-auto my-6" /> :
              workflows.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground border border-dashed border-border rounded-lg">
                  <Workflow className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  No workflows yet
                </div>
              ) : workflows.map(wf => (
                <button key={wf.id} onClick={() => setSelected(wf)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${selected?.id === wf.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold truncate">{wf.name}</span>
                    <Switch checked={wf.is_active} onCheckedChange={() => toggleActive(wf)} onClick={e => e.stopPropagation()} />
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-[10px]">{TRIGGERS.find(t => t.value === wf.trigger_event)?.label || wf.trigger_event}</Badge>
                    {wf.is_active ? <Badge className="text-[10px] bg-emerald-500/10 text-emerald-700 border-emerald-500/30">Active</Badge> : <Badge variant="secondary" className="text-[10px]">Paused</Badge>}
                  </div>
                </button>
              ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">{selected ? `Steps: ${selected.name}` : "Select a workflow"}</CardTitle>
          </CardHeader>
          <CardContent>
            {!selected ? (
              <div className="text-center py-12 text-sm text-muted-foreground">Pick a workflow to edit its steps</div>
            ) : (
              <div className="space-y-3">
                {steps.map((s, i) => (
                  <div key={s.id} className="flex items-center gap-3 p-3 border border-border rounded-lg">
                    <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                      <Clock className="h-3 w-3" />
                      <Input type="number" value={s.delay_minutes} onChange={e => updateStep(s.id, { delay_minutes: parseInt(e.target.value) || 0 })} className="h-7 w-20 text-xs" />
                      <span>min ({formatDelay(s.delay_minutes)})</span>
                    </div>
                    <Select value={s.template_id || ""} onValueChange={v => updateStep(s.id, { template_id: v })}>
                      <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Pick template" /></SelectTrigger>
                      <SelectContent>{templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Switch checked={s.is_active} onCheckedChange={v => updateStep(s.id, { is_active: v })} />
                    <Button size="sm" variant="ghost" onClick={() => deleteStep(s.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addStep}><Plus className="h-3.5 w-3.5 mr-1" />Add Step</Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <NewWorkflowDialog open={creating} onOpenChange={setCreating} onCreated={fetchAll} />
    </div>
  );
}

function NewWorkflowDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void; }) {
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("lead_created");
  const [audience, setAudience] = useState("lead");
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!name.trim()) { toast.error("Name required"); return; }
    setSaving(true);
    const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "_") + "_" + Math.random().toString(36).slice(2, 6);
    const { error } = await (supabase as any).from("crm_email_workflows").insert({
      workflow_key: key, name, trigger_event: trigger, audience_type: audience, is_active: false,
    });
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success("Workflow created"); setName(""); onOpenChange(false); onCreated(); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>New Workflow</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Workflow name (e.g. New Burnaby Lead Nurture)" value={name} onChange={e => setName(e.target.value)} />
          <Select value={trigger} onValueChange={setTrigger}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TRIGGERS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={audience} onValueChange={setAudience}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="lead">All Leads</SelectItem>
              <SelectItem value="hot">Hot Leads</SelectItem>
              <SelectItem value="presale">Presale Buyers</SelectItem>
              <SelectItem value="resale">Resale Clients</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={create} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
