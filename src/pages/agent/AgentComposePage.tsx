import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Send, ExternalLink, RefreshCw } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { usePresaleAgent } from "@/stores/usePresaleAgent";
import {
  bridgeClient,
  type BridgeProjectFull,
  type BridgeRenderedEmail,
} from "@/lib/presaleBridgeClient";

import { PresaleProjectPicker } from "@/components/presale/PresaleProjectPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface LeadOption {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

const TEMPLATE_STYLES = [
  { value: "modern", label: "Modern" },
  { value: "modern-v2", label: "Modern V2" },
  { value: "editorial", label: "Editorial" },
  { value: "classic", label: "Classic" },
  { value: "minimal", label: "Minimal" },
];

function fullName(c: Pick<LeadOption, "first_name" | "last_name">) {
  return [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
}

export default function AgentComposePage() {
  const { agent, status: agentStatus } = usePresaleAgent();

  // Lead picker
  const [leadQuery, setLeadQuery] = useState("");
  const [leadResults, setLeadResults] = useState<LeadOption[]>([]);
  const [selectedLead, setSelectedLead] = useState<LeadOption | null>(null);
  const [leadLoading, setLeadLoading] = useState(false);

  // Project picker
  const [project, setProject] = useState<BridgeProjectFull | null>(null);

  // Template + personalisation
  const [templateStyle, setTemplateStyle] = useState("modern");
  const [leadName, setLeadName] = useState("");

  // Preview
  const [rendered, setRendered] = useState<BridgeRenderedEmail | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Send
  const [sending, setSending] = useState(false);

  // Auto-fill lead name when lead selected
  useEffect(() => {
    if (selectedLead) {
      setLeadName(fullName(selectedLead) || "");
    }
  }, [selectedLead]);

  // Lead search (debounced 250ms)
  useEffect(() => {
    const q = leadQuery.trim();
    if (!q) {
      setLeadResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      setLeadLoading(true);
      const tokens = q.split(/\s+/).filter(Boolean);
      let query = supabase
        .from("crm_contacts")
        .select("id, first_name, last_name, email")
        .not("email", "is", null)
        .limit(8);
      for (const t of tokens) {
        const escaped = t.replace(/[%,()]/g, "");
        query = query.or(
          `first_name.ilike.%${escaped}%,last_name.ilike.%${escaped}%,email.ilike.%${escaped}%`,
        );
      }
      const { data } = await query;
      setLeadResults((data ?? []) as LeadOption[]);
      setLeadLoading(false);
    }, 250);
    return () => clearTimeout(handle);
  }, [leadQuery]);

  // Live preview render (debounced 400ms)
  const renderKey = useMemo(
    () =>
      project && agent
        ? `${project.slug}::${agent.slug}::${templateStyle}::${leadName}`
        : null,
    [project, agent, templateStyle, leadName],
  );

  const renderTokenRef = useRef(0);
  useEffect(() => {
    if (!renderKey || !project || !agent) {
      setRendered(null);
      setPreviewError(null);
      return;
    }
    const token = ++renderTokenRef.current;
    const handle = setTimeout(async () => {
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const result = await bridgeClient.renderEmail({
          projectSlug: project.slug,
          agentSlug: agent.slug,
          templateStyle,
          leadName: leadName || undefined,
        });
        if (token !== renderTokenRef.current) return;
        setRendered(result);
      } catch (e: any) {
        if (token !== renderTokenRef.current) return;
        setPreviewError(e?.message ?? "Failed to render preview");
        setRendered(null);
      } finally {
        if (token === renderTokenRef.current) setPreviewLoading(false);
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [renderKey, project, agent, templateStyle, leadName]);

  const canSend =
    !!selectedLead?.email &&
    !!project &&
    !!agent &&
    !!rendered?.html &&
    !sending;

  async function handleSend() {
    if (!canSend || !selectedLead?.email || !project || !agent || !rendered)
      return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "crm-send-via-presale",
        {
          body: {
            to: selectedLead.email,
            to_name: fullName(selectedLead) || leadName || undefined,
            subject: rendered.subject ?? `${project.name ?? project.slug}`,
            html: rendered.html,
            text: rendered.text,
            contact_id: selectedLead.id,
            template_type: `presale_${templateStyle}`,
            metadata: {
              project_slug: project.slug,
              agent_slug: agent.slug,
              template_style: templateStyle,
              source: "agent-compose",
            },
          },
        },
      );
      if (error) throw error;
      if ((data as any)?.ok === false) {
        throw new Error((data as any)?.error ?? "Send failed");
      }
      toast.success("Email sent", {
        description: `Delivered to ${selectedLead.email}`,
        action: {
          label: "View lead",
          onClick: () => {
            window.location.href = `/crm/leads/${selectedLead.id}`;
          },
        },
      });
    } catch (e: any) {
      toast.error("Send failed", { description: e?.message ?? String(e) });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="container mx-auto max-w-7xl px-4 py-6 lg:py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Compose Email</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sends through Presale Properties — pixel-identical to the public site.
          </p>
        </div>
        {agent && (
          <Badge variant="outline" className="gap-1.5">
            <span className="text-muted-foreground">From</span>
            <span className="font-medium">{agent.name ?? agent.slug}</span>
          </Badge>
        )}
      </div>

      {agentStatus === "unmatched" && (
        <Alert className="mb-6" variant="destructive">
          <AlertDescription>
            Your account is not linked to a Presale Properties agent. Ask an
            admin to add you to the roster before sending.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* LEFT: form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Email details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* To */}
            <div className="space-y-2">
              <Label htmlFor="to">To</Label>
              {selectedLead ? (
                <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm">
                  <div>
                    <div className="font-medium">
                      {fullName(selectedLead) || "(no name)"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {selectedLead.email}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedLead(null);
                      setLeadQuery("");
                    }}
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <Input
                    id="to"
                    placeholder="Search leads by name or email…"
                    value={leadQuery}
                    onChange={(e) => setLeadQuery(e.target.value)}
                  />
                  {leadQuery.trim() && (
                    <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-popover shadow-lg">
                      {leadLoading ? (
                        <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Searching…
                        </div>
                      ) : leadResults.length === 0 ? (
                        <div className="px-3 py-3 text-sm text-muted-foreground">
                          No matching leads.
                        </div>
                      ) : (
                        leadResults.map((l) => (
                          <button
                            key={l.id}
                            type="button"
                            onClick={() => {
                              setSelectedLead(l);
                              setLeadQuery("");
                              setLeadResults([]);
                            }}
                            className="flex w-full flex-col items-start gap-0.5 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-accent"
                          >
                            <span className="font-medium">
                              {fullName(l) || "(no name)"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {l.email}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Project */}
            <div className="space-y-2">
              <Label>Project</Label>
              <PresaleProjectPicker
                value={project?.slug}
                initialLabel={project?.name as string | undefined}
                onSelect={(p) => setProject(p)}
              />
              {project && (
                <p className="text-xs text-muted-foreground">
                  {[project.neighborhood, project.developer]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </div>

            {/* Template style */}
            <div className="space-y-2">
              <Label>Template style</Label>
              <Select value={templateStyle} onValueChange={setTemplateStyle}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEMPLATE_STYLES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Personalize */}
            <div className="space-y-2">
              <Label htmlFor="lead-name">Personalize (lead name)</Label>
              <Input
                id="lead-name"
                value={leadName}
                onChange={(e) => setLeadName(e.target.value)}
                placeholder="Auto-filled from lead"
              />
            </div>

            {/* Agent (locked) */}
            <div className="space-y-2">
              <Label>Agent signature</Label>
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                {agent ? (
                  <div className="flex items-center gap-3">
                    {agent.headshotUrl && (
                      <img
                        src={agent.headshotUrl}
                        alt=""
                        className="h-9 w-9 rounded-full object-cover"
                      />
                    )}
                    <div>
                      <div className="font-medium">{agent.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {agent.brokerage ?? agent.email}
                      </div>
                    </div>
                  </div>
                ) : (
                  <span className="text-muted-foreground">
                    Loading agent identity…
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Managed in Presale Properties.{" "}
                <Link to="/agent/profile" className="underline">
                  View profile
                </Link>
              </p>
            </div>

            <Button
              onClick={handleSend}
              disabled={!canSend}
              className="w-full"
              size="lg"
            >
              {sending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Send email
            </Button>
          </CardContent>
        </Card>

        {/* RIGHT: live preview */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <div>
                <CardTitle className="text-base">Live preview</CardTitle>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Renders identically to presaleproperties.com
                </p>
              </div>
              {previewLoading && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md border bg-muted/40 px-3 py-2">
                <div className="text-xs text-muted-foreground">Subject</div>
                <div className="truncate text-sm font-medium">
                  {rendered?.subject ?? (
                    <span className="text-muted-foreground">
                      — pick a project to preview —
                    </span>
                  )}
                </div>
              </div>

              {previewError ? (
                <Alert variant="destructive">
                  <AlertDescription className="flex items-start justify-between gap-3">
                    <span>{previewError}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        // Trigger re-render by bumping the key
                        renderTokenRef.current = 0;
                        setRendered(null);
                        // force effect by tweaking leadName trivially
                        setLeadName((n) => n);
                      }}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : null}

              <div className="overflow-hidden rounded-md border bg-background">
                {rendered?.html ? (
                  <iframe
                    title="Email preview"
                    sandbox=""
                    srcDoc={rendered.html}
                    className="h-[720px] w-full border-0 bg-white"
                  />
                ) : (
                  <div className="flex h-[480px] items-center justify-center p-8 text-center text-sm text-muted-foreground">
                    {!project
                      ? "Pick a project to preview the email."
                      : !agent
                        ? "Waiting on agent identity sync…"
                        : "Rendering…"}
                  </div>
                )}
              </div>

              {project && (
                <a
                  href={`https://presaleproperties.com/${project.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  View project on Presale Properties
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
