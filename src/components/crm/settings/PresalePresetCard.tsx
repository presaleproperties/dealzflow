import { useEffect, useMemo, useState } from "react";
import { Sparkles, RefreshCw, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { usePresaleAgent } from "@/stores/usePresaleAgent";
import {
  PRESALE_SIGNATURE_PRESETS,
  type PresaleSignaturePresetId,
  type PresaleSignatureAgent,
} from "@/lib/presaleSignatures";
import LiveSignaturePreview from "./LiveSignaturePreview";

interface PresalePresetCardProps {
  /** Fallback agent info from current email settings (used if Presale fetch hasn't completed). */
  fallbackAgent: PresaleSignatureAgent;
  /** Called when the user picks a preset — receives the rendered HTML. */
  onApply: (preset: PresaleSignaturePresetId, html: string, agent: PresaleSignatureAgent) => void;
}

/**
 * "Pull from Presale Properties" — fetches the agent's record from Presale via
 * the existing `presale-agent-me` edge function and lets them apply one of the
 * two official Presale signature presets in one click.
 */
export default function PresalePresetCard({ fallbackAgent, onApply }: PresalePresetCardProps) {
  const { agent, status, error, refresh, lastFetchedAt } = usePresaleAgent();
  const [selected, setSelected] = useState<PresaleSignaturePresetId>("presale_headshot_left");

  // Auto-fetch on mount (will no-op if cached & fresh).
  useEffect(() => {
    if (status === "idle") void refresh();
  }, [status, refresh]);

  const merged: PresaleSignatureAgent = useMemo(() => {
    if (agent) {
      return {
        full_name: agent.name ?? fallbackAgent.full_name ?? null,
        title: (agent as any).title ?? fallbackAgent.title ?? null,
        photo_url: agent.headshotUrl ?? fallbackAgent.photo_url ?? null,
        phone: agent.phone ?? fallbackAgent.phone ?? null,
        email: agent.email ?? fallbackAgent.email ?? null,
        website_url: agent.websiteUrl ?? fallbackAgent.website_url ?? null,
        calendly_url: agent.calendlyUrl ?? fallbackAgent.calendly_url ?? null,
        brokerage: agent.brokerage ?? fallbackAgent.brokerage ?? null,
        license_no: agent.licenseNumber ?? fallbackAgent.license_no ?? null,
        instagram_url: (agent as any).instagramUrl ?? fallbackAgent.instagram_url ?? null,
      };
    }
    return fallbackAgent;
  }, [agent, fallbackAgent]);

  const activePreset = PRESALE_SIGNATURE_PRESETS.find((p) => p.id === selected)!;
  const previewHtml = activePreset.build(merged);

  const handleApply = () => {
    onApply(selected, previewHtml, merged);
  };

  const isLoading = status === "loading";
  const isReady = status === "ready" && !!agent;

  return (
    <Card className="rounded-[10px] lg:rounded-xl border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <CardContent className="space-y-4 p-3 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm sm:text-base font-semibold leading-tight">
                Pull from Presale Properties
              </h4>
              <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">
                Use the same official signatures as on presaleproperties.com — auto-filled with your
                agent record (headshot, license, phone).
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => refresh({ force: true })}
            disabled={isLoading}
            className="h-8 text-xs"
          >
            {isLoading ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            )}
            Refresh
          </Button>
        </div>

        {/* Status row */}
        <div className="flex items-center gap-2 text-[11px]">
          {isReady && (
            <Badge variant="secondary" className="gap-1 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20">
              <CheckCircle2 className="h-3 w-3" />
              Linked to {agent?.name ?? "Presale agent"}
            </Badge>
          )}
          {status === "unmatched" && (
            <Badge variant="secondary" className="gap-1 bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20">
              <AlertCircle className="h-3 w-3" />
              No matching Presale agent — using your CRM info
            </Badge>
          )}
          {status === "error" && (
            <Badge variant="secondary" className="gap-1 bg-destructive/10 text-destructive border-destructive/20">
              <AlertCircle className="h-3 w-3" />
              {error ?? "Couldn't reach Presale"}
            </Badge>
          )}
          {lastFetchedAt && (
            <span className="text-muted-foreground">
              Synced {new Date(lastFetchedAt).toLocaleTimeString()}
            </span>
          )}
        </div>

        {/* Preset chooser */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {PRESALE_SIGNATURE_PRESETS.map((preset) => {
            const active = preset.id === selected;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => setSelected(preset.id)}
                className={cn(
                  "text-left rounded-lg border p-3 transition-all min-h-[68px]",
                  active
                    ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                    : "border-border/60 bg-background hover:border-primary/40",
                )}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-semibold">{preset.label}</span>
                  {active && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  {preset.description}
                </p>
              </button>
            );
          })}
        </div>

        {/* Live preview */}
        <div className="space-y-1.5">
          <p className="text-[11px] text-muted-foreground">Preview</p>
          <LiveSignaturePreview html={previewHtml} withEmailContext />
        </div>

        <div className="flex justify-end">
          <Button type="button" onClick={handleApply} className="min-h-[40px]">
            Use this signature
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
