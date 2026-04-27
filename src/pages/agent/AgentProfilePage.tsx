import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, ExternalLink, Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { usePresaleAgent } from "@/stores/usePresaleAgent";
import { AgentSignatureBlock } from "@/components/agent/AgentSignatureBlock";
import { toast } from "sonner";

function formatRelative(ts: number | null) {
  if (!ts) return "never";
  const diff = Math.max(0, Date.now() - ts);
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm text-foreground break-words">
        {value ? value : <span className="text-muted-foreground/60">—</span>}
      </div>
    </div>
  );
}

export default function AgentProfilePage() {
  const { agent, status, error, lastFetchedAt, refresh } = usePresaleAgent();

  useEffect(() => {
    document.title = "Agent Profile — Presale Properties";
  }, []);

  const handleRefresh = async () => {
    await refresh({ force: true });
    const next = usePresaleAgent;
    // Show toast based on resulting state
    setTimeout(() => {
      const s = (next as any).getState?.() ?? null;
      if (s?.status === "ready") toast.success("Profile refreshed from Presale");
      else if (s?.status === "error") toast.error(s.error ?? "Refresh failed");
      else if (s?.status === "unmatched") toast.message("No matching Presale agent");
    }, 50);
  };

  const initials = (agent?.name ?? agent?.email ?? "?")
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto w-full max-w-4xl px-6 py-10 space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Agent Profile</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Synced from Presale Properties · last updated {formatRelative(lastFetchedAt)}
            </p>
          </div>
          <Button onClick={handleRefresh} disabled={status === "loading"} variant="outline">
            {status === "loading" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh from Presale
          </Button>
        </header>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Read-only</AlertTitle>
          <AlertDescription>
            Managed in Presale Properties — contact admin to update.
          </AlertDescription>
        </Alert>

        {status === "error" && error && (
          <Alert variant="destructive">
            <AlertTitle>Couldn't load profile</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {status === "unmatched" && (
          <Alert>
            <AlertTitle>No matching agent</AlertTitle>
            <AlertDescription>
              {error ?? "Your DealsFlow email isn't linked to a Presale Properties agent."}
            </AlertDescription>
          </Alert>
        )}

        {agent && (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center gap-4 space-y-0">
                <Avatar className="h-20 w-20">
                  <AvatarImage src={agent.headshotUrl} alt={agent.name ?? "Agent headshot"} />
                  <AvatarFallback className="text-lg">{initials || "A"}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <CardTitle className="text-xl truncate">{agent.name ?? "—"}</CardTitle>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {agent.brokerage && <Badge variant="secondary">{agent.brokerage}</Badge>}
                    {agent.licenseNumber && (
                      <span className="text-xs text-muted-foreground">
                        License #{agent.licenseNumber}
                      </span>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-5 sm:grid-cols-2">
                <Field label="Email" value={agent.email} />
                <Field label="Phone" value={agent.phone} />
                <Field label="Slug" value={agent.slug} />
                <Field label="Brokerage" value={agent.brokerage} />
                <Field label="License #" value={agent.licenseNumber} />
                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Calendly</div>
                  {agent.calendlyUrl ? (
                    <a
                      href={agent.calendlyUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-primary hover:underline break-all"
                    >
                      {agent.calendlyUrl}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : (
                    <span className="text-sm text-muted-foreground/60">—</span>
                  )}
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Website</div>
                  {agent.websiteUrl ? (
                    <a
                      href={agent.websiteUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-primary hover:underline break-all"
                    >
                      {agent.websiteUrl}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : (
                    <span className="text-sm text-muted-foreground/60">—</span>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Email signature</CardTitle>
              </CardHeader>
              <CardContent>
                {agent.signatureHtml ? (
                  <div className="rounded-md border border-border bg-card p-4">
                    <AgentSignatureBlock />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No signature configured in Presale Properties.
                  </p>
                )}
              </CardContent>
            </Card>

            {agent.headshotUrl && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Headshot preview</CardTitle>
                </CardHeader>
                <CardContent>
                  <img
                    src={agent.headshotUrl}
                    alt={agent.name ?? "Agent headshot"}
                    className="h-48 w-48 rounded-md object-cover border border-border"
                  />
                  <p className="mt-2 text-xs text-muted-foreground break-all">
                    {agent.headshotUrl}
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {status === "loading" && !agent && (
          <Card>
            <CardContent className="py-10 flex items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading profile from Presale Properties…
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
