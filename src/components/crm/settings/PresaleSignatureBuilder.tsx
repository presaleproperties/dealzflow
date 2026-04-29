/**
 * PresaleSignatureBuilder
 * ──────────────────────────────────────────────────────────────────────────
 * Exact 1:1 port of the Presale Properties Marketing Hub → Signature editor
 * (`src/components/dashboard/SignatureEditor.tsx`). Same fields, same two
 * variations (Headshot Left + Headshot Top), same gold accent (#c8a45e),
 * same iframe-rendered live previews.
 *
 * Differences vs Presale:
 *  - No multi-agent dropdown (TEAM_AGENTS) — this is per-user inside the CRM.
 *    We seed the form with the Presale agent record (via usePresaleAgent) and
 *    fall back to the user's CRM email settings.
 *  - No `app_settings.team_signature_overrides` save — instead, "Apply" pushes
 *    the rendered HTML into `crm_email_settings.signature_html` (mode=html)
 *    via the `onApply` callback.
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Copy, Eye, Pencil, RefreshCw, Check, ExternalLink, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePresaleAgent } from "@/stores/usePresaleAgent";
import { supabase } from "@/integrations/supabase/client";

type LayoutVariant = "horizontal" | "stacked";
type HeadshotShape = "circle" | "rounded";

export interface SignatureBuilderFields {
  fullName: string;
  title: string;
  phone: string;
  email: string;
  website: string;
  brokerage: string;
  photoUrl: string;
  instagram: string;
  headshotLink: string;
  headshotShape: HeadshotShape;
}

interface PresaleSignatureBuilderProps {
  /** Falls back to these values when nothing is loaded from Presale yet. */
  fallback: Partial<SignatureBuilderFields>;
  /** Called with the rendered HTML when the user clicks "Apply to CRM". */
  onApply: (html: string, layout: LayoutVariant, fields: SignatureBuilderFields) => void;
}

// ── Helper: build headshot img tag based on shape ────────────────────
function buildHeadshotTag(d: SignatureBuilderFields, size: number): string {
  const initials = d.fullName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const radius = d.headshotShape === "circle" ? "50%" : "14px";
  const img = d.photoUrl
    ? `<img src="${d.photoUrl}" alt="${d.fullName}" width="${size}" height="${size}" style="border-radius: ${radius}; object-fit: cover; object-position: center center; display: block; margin: 0 auto; border: 3px solid #c8a45e; box-shadow: 0 4px 16px rgba(200,164,94,0.2);" />`
    : `<div style="width:${size}px;height:${size}px;border-radius:${radius};background:linear-gradient(135deg,#c8a45e,#a8843e);color:#fff;font-size:${Math.round(size * 0.32)}px;font-weight:700;text-align:center;line-height:${size}px;box-shadow:0 4px 16px rgba(200,164,94,0.2);border:3px solid #c8a45e;">${initials}</div>`;
  return d.headshotLink
    ? `<a href="${d.headshotLink}" target="_blank" style="text-decoration:none;">${img}</a>`
    : img;
}

function buildInstagramButton(d: SignatureBuilderFields): string {
  if (!d.instagram) return "";
  return `<a href="${d.instagram}" target="_blank" style="display: inline-block; padding: 4px 12px; border: 1.5px solid #c8a45e; border-radius: 6px; color: #c8a45e; text-decoration: none; font-size: 11px; font-weight: 700; letter-spacing: 0.3px; line-height: 18px; vertical-align: middle;">Instagram</a>`;
}

// ── Horizontal layout: headshot on the left with gold divider ────────
export function buildHorizontalHtml(d: SignatureBuilderFields): string {
  const headshot = buildHeadshotTag(d, 100);
  const igBtn = buildInstagramButton(d);

  return `<table cellpadding="0" cellspacing="0" border="0" style="font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; font-size: 14px; line-height: 1.5; max-width: 520px;">
  <tr>
    <td style="padding-right: 18px; vertical-align: middle;">
      ${headshot}
    </td>
    <td style="border-left: 3px solid #c8a45e; padding-left: 18px; vertical-align: middle;">
      <p style="margin: 0 0 1px; font-size: 19px; font-weight: 700; color: #1a1a1a; letter-spacing: -0.3px;">${d.fullName}</p>
      <p style="margin: 0 0 10px; font-size: 11px; color: #c8a45e; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">${d.title} · ${d.brokerage}</p>
      <p style="margin: 0; font-size: 13px; color: #333;">
        <a href="tel:${d.phone}" style="color: #333; text-decoration: none;">${d.phone}</a>
        <span style="color: #ddd; padding: 0 6px;">|</span>
        <a href="mailto:${d.email}" style="color: #333; text-decoration: none;">${d.email}</a>
      </p>
      <p style="margin: 6px 0 0; font-size: 13px;">
        <a href="${d.website}" style="color: #c8a45e; text-decoration: none; font-weight: 600;">${d.website.replace(/^https?:\/\//, "")}</a>${
          igBtn
            ? `
        <span style="padding: 0 8px;"></span>${igBtn}`
            : ""
        }
      </p>
    </td>
  </tr>
</table>`;
}

// ── Stacked layout: headshot on top, centered ────────────────────────
export function buildStackedHtml(d: SignatureBuilderFields): string {
  const headshot = buildHeadshotTag(d, 110);
  const igBtn = buildInstagramButton(d);

  return `<table cellpadding="0" cellspacing="0" border="0" style="font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; font-size: 14px; line-height: 1.5; max-width: 340px; margin: 0 auto;">
  <tr>
    <td align="center" style="padding-bottom: 14px;">
      ${headshot}
    </td>
  </tr>
  <tr>
    <td align="center" style="text-align: center;">
      <p style="margin: 0 0 2px; font-size: 20px; font-weight: 700; color: #1a1a1a; letter-spacing: -0.3px;">${d.fullName}</p>
      <p style="margin: 0 0 12px; font-size: 11px; color: #c8a45e; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">${d.title} · ${d.brokerage}</p>
      <div style="width: 40px; height: 2px; background: #c8a45e; margin: 0 auto 12px; border-radius: 1px;"></div>
      <p style="margin: 0 0 3px; font-size: 13px;">
        <a href="tel:${d.phone}" style="color: #333; text-decoration: none;">${d.phone}</a>
        <span style="color: #ddd; padding: 0 6px;">|</span>
        <a href="mailto:${d.email}" style="color: #333; text-decoration: none;">${d.email}</a>
      </p>
      <p style="margin: 0 0 8px; font-size: 13px;">
        <a href="${d.website}" style="color: #c8a45e; text-decoration: none; font-weight: 600;">${d.website.replace(/^https?:\/\//, "")}</a>
      </p>${
        igBtn
          ? `
      <p style="margin: 0;">${igBtn}</p>`
          : ""
      }
    </td>
  </tr>
</table>`;
}

const BLANK: SignatureBuilderFields = {
  fullName: "",
  title: "Presale Specialist",
  phone: "(672) 258-1100",
  email: "",
  website: "https://presaleproperties.com",
  brokerage: "Real Broker",
  photoUrl: "",
  instagram: "",
  headshotLink: "",
  headshotShape: "rounded",
};

interface CrmProfileSeed {
  fullName?: string;
  email?: string;
  phone?: string;
  title?: string;
  brokerage?: string;
  photoUrl?: string;
}

type PrefillSource = "presale" | "profile" | "fallback" | "user";

export default function PresaleSignatureBuilder({ fallback, onApply }: PresaleSignatureBuilderProps) {
  const { agent, status, refresh } = usePresaleAgent();

  const [layout, setLayout] = useState<LayoutVariant>("horizontal");
  const [mode, setMode] = useState<"form" | "html">("form");
  const [fields, setFields] = useState<SignatureBuilderFields>(() => ({
    ...BLANK,
    ...fallback,
  }));
  // Per-field touched + per-field source tracking so user edits never get
  // overwritten by a later prefill, and we can show "from Presale" etc.
  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({});
  const [sourceMap, setSourceMap] = useState<Record<string, PrefillSource>>({});
  const [crmProfile, setCrmProfile] = useState<CrmProfileSeed | null>(null);

  const iframeHRef = useRef<HTMLIFrameElement>(null);
  const iframeVRef = useRef<HTMLIFrameElement>(null);

  // Auto-fetch Presale agent record on mount.
  useEffect(() => {
    if (status === "idle") void refresh();
  }, [status, refresh]);

  // Pull CRM profile (auth user + profiles row) once for fallback prefill.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, phone, title, brokerage, avatar_url")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setCrmProfile({
        fullName: profile?.full_name ?? undefined,
        email: user.email ?? undefined,
        phone: profile?.phone ?? undefined,
        title: profile?.title ?? undefined,
        brokerage: profile?.brokerage ?? undefined,
        photoUrl: profile?.avatar_url ?? undefined,
      });
    })();
    return () => { cancelled = true; };
  }, []);

  // Merge sources whenever any input changes. Precedence per field:
  //   user edit > Presale agent > CRM profile > fallback prop > BLANK default
  useEffect(() => {
    const presale = agent
      ? {
          fullName: agent.name,
          title: agent.title,
          phone: agent.phone,
          email: agent.email,
          website: agent.websiteUrl,
          brokerage: agent.brokerage,
          photoUrl: agent.headshotUrl,
          instagram: agent.instagramUrl,
        }
      : {};

    const profile = crmProfile ?? {};

    const next: SignatureBuilderFields = { ...BLANK };
    const sources: Record<string, PrefillSource> = {};

    const apply = (
      key: keyof SignatureBuilderFields,
      candidates: Array<[unknown, PrefillSource]>,
    ) => {
      // If user explicitly edited this field, keep it.
      if (touchedFields[key]) {
        next[key] = fields[key] as never;
        sources[key] = "user";
        return;
      }
      for (const [val, src] of candidates) {
        if (typeof val === "string" && val.trim() !== "") {
          (next as any)[key] = val;
          sources[key] = src;
          return;
        }
      }
      // Stick with default from BLANK / fallback
      const fb = (fallback as any)?.[key];
      if (typeof fb === "string" && fb.trim() !== "") {
        (next as any)[key] = fb;
        sources[key] = "fallback";
      } else {
        sources[key] = "fallback";
      }
    };

    apply("fullName",  [[presale.fullName, "presale"], [profile.fullName, "profile"]]);
    apply("title",     [[presale.title, "presale"], [profile.title, "profile"]]);
    apply("phone",     [[presale.phone, "presale"], [profile.phone, "profile"]]);
    apply("email",     [[presale.email, "presale"], [profile.email, "profile"]]);
    apply("website",   [[presale.website, "presale"]]);
    apply("brokerage", [[presale.brokerage, "presale"], [profile.brokerage, "profile"]]);
    apply("photoUrl",  [[presale.photoUrl, "presale"], [profile.photoUrl, "profile"]]);
    apply("instagram", [[presale.instagram, "presale"]]);
    // Headshot link/shape are user-only choices
    next.headshotLink = touchedFields.headshotLink ? fields.headshotLink : (fields.headshotLink || BLANK.headshotLink);
    next.headshotShape = touchedFields.headshotShape ? fields.headshotShape : (fields.headshotShape || BLANK.headshotShape);
    sources.headshotLink = touchedFields.headshotLink ? "user" : "fallback";
    sources.headshotShape = touchedFields.headshotShape ? "user" : "fallback";

    setFields(next);
    setSourceMap(sources);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent, crmProfile]);

  const update = (field: keyof SignatureBuilderFields, value: string) => {
    setTouchedFields((prev) => ({ ...prev, [field]: true }));
    setSourceMap((prev) => ({ ...prev, [field]: "user" }));
    setFields((prev) => ({ ...prev, [field]: value }));
  };

  const handleResetField = (field: keyof SignatureBuilderFields) => {
    setTouchedFields((prev) => {
      const { [field]: _, ...rest } = prev;
      return rest;
    });
    // Trigger re-merge by nudging crmProfile reference
    setCrmProfile((prev) => (prev ? { ...prev } : prev));
  };

  const horizontalHtml = useMemo(() => buildHorizontalHtml(fields), [fields]);
  const stackedHtml = useMemo(() => buildStackedHtml(fields), [fields]);
  const activeHtml = layout === "horizontal" ? horizontalHtml : stackedHtml;

  // Render previews into sandboxed iframes — keeps email styles isolated from app CSS.
  useEffect(() => {
    [
      { ref: iframeHRef, html: horizontalHtml },
      { ref: iframeVRef, html: stackedHtml },
    ].forEach(({ ref, html }) => {
      if (!ref.current) return;
      const doc = ref.current.contentDocument;
      if (!doc) return;
      doc.open();
      doc.write(
        `<!DOCTYPE html><html><head><style>body{margin:20px;font-family:'Helvetica Neue',Arial,sans-serif;background:#fff;}</style></head><body>${html}</body></html>`,
      );
      doc.close();
    });
  }, [horizontalHtml, stackedHtml]);

  const handleCopyHtml = async (html?: string) => {
    try {
      await navigator.clipboard.writeText(html || activeHtml);
      toast.success("HTML copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
  };

  const handleApply = () => {
    onApply(activeHtml, layout, fields);
  };

  const isLoading = status === "loading";

  // Source badge component — shows where each field came from
  const SourceBadge = ({ field }: { field: keyof SignatureBuilderFields }) => {
    const src = sourceMap[field];
    if (!src || src === "fallback") return null;
    const config: Record<PrefillSource, { label: string; className: string }> = {
      presale:  { label: "Presale", className: "bg-primary/10 text-primary border-primary/20" },
      profile:  { label: "Profile", className: "bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400" },
      user:     { label: "Edited",  className: "bg-muted text-muted-foreground border-border" },
      fallback: { label: "",        className: "" },
    };
    const cfg = config[src];
    return (
      <button
        type="button"
        onClick={() => src === "user" && handleResetField(field)}
        title={src === "user" ? "Click to reset to auto-filled value" : `Auto-filled from ${cfg.label}`}
        className={cn(
          "ml-2 inline-flex items-center gap-0.5 rounded border px-1 py-0 text-[9px] font-semibold uppercase tracking-wide leading-[14px] h-[14px]",
          cfg.className,
          src === "user" && "cursor-pointer hover:bg-muted/80",
        )}
      >
        {src !== "user" && <Sparkles className="h-2 w-2" />}
        {cfg.label}
      </button>
    );
  };

  // Count how many fields were auto-prefilled
  const prefilledCount = Object.values(sourceMap).filter(
    (s) => s === "presale" || s === "profile",
  ).length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Email Signature
          </p>
          <p className="text-xs text-muted-foreground/70 mt-0.5 flex items-center gap-2">
            Same builder as the Presale Properties agent portal
            {prefilledCount > 0 && (
              <span className="inline-flex items-center gap-1 text-primary font-medium">
                <Sparkles className="h-3 w-3" />
                {prefilledCount} field{prefilledCount === 1 ? "" : "s"} auto-filled
              </span>
            )}
            {status === "unmatched" && (
              <span className="text-amber-600 dark:text-amber-400">
                · No Presale match — using your CRM profile
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
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
            Pull from Presale
          </Button>
          <div className="flex items-center border border-border rounded-lg overflow-hidden h-8">
            <button
              type="button"
              onClick={() => setMode("form")}
              className={cn(
                "px-3 h-full flex items-center gap-1.5 text-xs font-medium transition-colors",
                mode === "form"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              <Pencil className="h-3 w-3" /> Edit
            </button>
            <button
              type="button"
              onClick={() => setMode("html")}
              className={cn(
                "px-3 h-full flex items-center gap-1.5 text-xs font-medium transition-colors",
                mode === "html"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              <Eye className="h-3 w-3" /> HTML
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(420px,520px)_1fr] gap-5 items-start">
        {/* Left: Editor / HTML */}
        <div className="space-y-4">
          {mode === "form" ? (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              {/* Agent preview header */}
              <div className="bg-gradient-to-r from-primary/5 to-primary/10 border-b border-border p-4 flex items-center gap-3">
                {fields.photoUrl ? (
                  <img
                    src={fields.photoUrl}
                    alt=""
                    className="h-14 w-14 rounded-full object-cover ring-2 ring-primary/30 ring-offset-2 ring-offset-background shadow-md"
                  />
                ) : (
                  <div className="h-14 w-14 rounded-full bg-primary/20 ring-2 ring-primary/30 ring-offset-2 ring-offset-background shadow-md flex items-center justify-center text-primary font-bold">
                    {fields.fullName
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase() || "?"}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate">{fields.fullName || "Your name"}</p>
                  <p className="text-[11px] text-primary font-semibold uppercase tracking-wide truncate">
                    {fields.title}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                    {fields.brokerage}
                  </p>
                </div>
              </div>

              {/* Fields */}
              <div className="p-5 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center">
                      Full Name <SourceBadge field="fullName" />
                    </Label>
                    <Input
                      value={fields.fullName}
                      onChange={(e) => update("fullName", e.target.value)}
                      className="h-8 text-sm mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center">
                      Title <SourceBadge field="title" />
                    </Label>
                    <Input
                      value={fields.title}
                      onChange={(e) => update("title", e.target.value)}
                      className="h-8 text-sm mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center">
                      Phone <SourceBadge field="phone" />
                    </Label>
                    <Input
                      value={fields.phone}
                      onChange={(e) => update("phone", e.target.value)}
                      className="h-8 text-sm mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center">
                      Email <SourceBadge field="email" />
                    </Label>
                    <Input
                      value={fields.email}
                      onChange={(e) => update("email", e.target.value)}
                      className="h-8 text-sm mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center">
                      Website <SourceBadge field="website" />
                    </Label>
                    <Input
                      value={fields.website}
                      onChange={(e) => update("website", e.target.value)}
                      className="h-8 text-sm mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center">
                      Brokerage <SourceBadge field="brokerage" />
                    </Label>
                    <Input
                      value={fields.brokerage}
                      onChange={(e) => update("brokerage", e.target.value)}
                      className="h-8 text-sm mt-1"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center">
                      Instagram <SourceBadge field="instagram" />
                    </Label>
                    <Input
                      value={fields.instagram}
                      onChange={(e) => update("instagram", e.target.value)}
                      className="h-8 text-sm mt-1"
                      placeholder="https://instagram.com/..."
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center">
                      Headshot URL <SourceBadge field="photoUrl" />
                    </Label>
                    <Input
                      value={fields.photoUrl}
                      onChange={(e) => update("photoUrl", e.target.value)}
                      className="h-8 text-sm mt-1"
                      placeholder="https://..."
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                      <ExternalLink className="h-3 w-3" /> Headshot Link URL
                    </Label>
                    <Input
                      value={fields.headshotLink}
                      onChange={(e) => update("headshotLink", e.target.value)}
                      className="h-8 text-sm mt-1"
                      placeholder="https://... (clicking headshot opens this link)"
                    />
                    <p className="text-[10px] text-muted-foreground/60 mt-1">
                      When set, the headshot becomes clickable and links to this URL
                    </p>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                      Headshot Shape
                    </Label>
                    <div className="flex items-center gap-2 mt-1.5">
                      <button
                        type="button"
                        onClick={() => update("headshotShape", "circle")}
                        className={cn(
                          "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all",
                          fields.headshotShape === "circle"
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:border-primary/30",
                        )}
                      >
                        <div className="h-5 w-5 rounded-full border-2 border-current" />
                        Circle
                      </button>
                      <button
                        type="button"
                        onClick={() => update("headshotShape", "rounded")}
                        className={cn(
                          "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all",
                          fields.headshotShape === "rounded"
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:border-primary/30",
                        )}
                      >
                        <div className="h-5 w-5 rounded-[4px] border-2 border-current" />
                        Rounded
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground">
                    Variation 1 — Headshot Left
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1.5"
                    onClick={() => handleCopyHtml(horizontalHtml)}
                  >
                    <Copy className="h-3 w-3" /> Copy
                  </Button>
                </div>
                <div className="p-3">
                  <Textarea
                    value={horizontalHtml}
                    readOnly
                    className="font-mono text-[10px] min-h-[180px] bg-muted/20 border-0"
                  />
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground">
                    Variation 2 — Headshot Top
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1.5"
                    onClick={() => handleCopyHtml(stackedHtml)}
                  >
                    <Copy className="h-3 w-3" /> Copy
                  </Button>
                </div>
                <div className="p-3">
                  <Textarea
                    value={stackedHtml}
                    readOnly
                    className="font-mono text-[10px] min-h-[180px] bg-muted/20 border-0"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Apply button — saves the chosen variation as the active CRM signature */}
          <Button type="button" className="gap-1.5 w-full sm:w-auto" onClick={handleApply}>
            <Check className="h-3.5 w-3.5" />
            Apply "{layout === "horizontal" ? "Headshot Left" : "Headshot Top"}" to CRM
          </Button>
        </div>

        {/* Right: Both Previews */}
        <div className="space-y-4">
          {/* Variation 1: Horizontal */}
          <div
            className={cn(
              "rounded-xl border bg-card overflow-hidden transition-all cursor-pointer",
              layout === "horizontal"
                ? "border-primary ring-2 ring-primary/15 shadow-md"
                : "border-border hover:border-primary/20",
            )}
            onClick={() => setLayout("horizontal")}
          >
            <div className="px-4 py-2.5 border-b border-border bg-muted/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "h-3.5 w-3.5 rounded-full border-2 transition-colors flex items-center justify-center",
                    layout === "horizontal"
                      ? "border-primary bg-primary"
                      : "border-muted-foreground/30",
                  )}
                >
                  {layout === "horizontal" && (
                    <div className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                  )}
                </div>
                <p className="text-xs font-semibold">Headshot Left</p>
                {layout === "horizontal" && (
                  <Badge className="text-[9px] bg-primary/10 text-primary border-0 h-4 px-1.5">
                    Active
                  </Badge>
                )}
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 text-[10px] gap-1 px-2"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopyHtml(horizontalHtml);
                }}
              >
                <Copy className="h-2.5 w-2.5" /> Copy
              </Button>
            </div>
            <div className="bg-card">
              <iframe
                ref={iframeHRef}
                title="Horizontal Signature"
                className="w-full border-0 pointer-events-none"
                style={{ minHeight: 170 }}
                sandbox="allow-same-origin"
              />
            </div>
          </div>

          {/* Variation 2: Stacked */}
          <div
            className={cn(
              "rounded-xl border bg-card overflow-hidden transition-all cursor-pointer",
              layout === "stacked"
                ? "border-primary ring-2 ring-primary/15 shadow-md"
                : "border-border hover:border-primary/20",
            )}
            onClick={() => setLayout("stacked")}
          >
            <div className="px-4 py-2.5 border-b border-border bg-muted/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "h-3.5 w-3.5 rounded-full border-2 transition-colors flex items-center justify-center",
                    layout === "stacked"
                      ? "border-primary bg-primary"
                      : "border-muted-foreground/30",
                  )}
                >
                  {layout === "stacked" && (
                    <div className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                  )}
                </div>
                <p className="text-xs font-semibold">Headshot Top</p>
                {layout === "stacked" && (
                  <Badge className="text-[9px] bg-primary/10 text-primary border-0 h-4 px-1.5">
                    Active
                  </Badge>
                )}
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 text-[10px] gap-1 px-2"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopyHtml(stackedHtml);
                }}
              >
                <Copy className="h-2.5 w-2.5" /> Copy
              </Button>
            </div>
            <div className="bg-card">
              <iframe
                ref={iframeVRef}
                title="Stacked Signature"
                className="w-full border-0 pointer-events-none"
                style={{ minHeight: 240 }}
                sandbox="allow-same-origin"
              />
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground/60 text-center">
            Click a variation to select it · Copy HTML for an external email client, or "Apply" to use it inside this CRM
          </p>
        </div>
      </div>
    </div>
  );
}
