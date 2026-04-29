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
import {
  Copy,
  Eye,
  Pencil,
  RefreshCw,
  Check,
  ExternalLink,
  Sparkles,
} from "lucide-react";
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
  headshotSize: string; // px as string, 60-160
  headshotPosX: string; // 0-100 (%)
  headshotPosY: string; // 0-100 (%)
}

interface PresaleSignatureBuilderProps {
  /** Falls back to these values when nothing is loaded from Presale yet. */
  fallback: Partial<SignatureBuilderFields>;
  /** Persisted builder state from previous saves — user edits take priority. */
  initialData?: {
    fields?: Partial<SignatureBuilderFields>;
    touchedFields?: Record<string, boolean>;
  } | null;
  /** Called with the rendered HTML when the user clicks "Apply to CRM". */
  onApply: (
    html: string,
    layout: LayoutVariant,
    fields: SignatureBuilderFields,
    touchedFields: Record<string, boolean>,
  ) => void;
}

// ── URL helpers ──────────────────────────────────────────────────────
function normalizeUrl(raw: string): string {
  const v = (raw || "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  if (/^mailto:|^tel:/i.test(v)) return v;
  return `https://${v.replace(/^\/+/, "")}`;
}
function normalizeInstagram(raw: string): string {
  const v = (raw || "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  const handle = v.replace(/^@/, "").replace(/^instagram\.com\//i, "");
  return `https://instagram.com/${handle}`;
}
function escapeAttr(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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
  const px = Math.max(0, Math.min(100, parseInt(d.headshotPosX || "50", 10) || 50));
  const py = Math.max(0, Math.min(100, parseInt(d.headshotPosY || "50", 10) || 50));
  // Premium frame: clean crop, single soft shadow, no busy borders
  const shadow = "0 12px 32px rgba(20,24,31,0.16), 0 2px 6px rgba(20,24,31,0.06)";
  const img = d.photoUrl
    ? `<img src="${escapeAttr(d.photoUrl)}" alt="${escapeAttr(d.fullName)}" width="${size}" height="${size}" style="width:${size}px;height:${size}px;border-radius:${radius};object-fit:cover;object-position:${px}% ${py}%;display:block;margin:0 auto;border:0;outline:0;box-shadow:${shadow};" />`
    : `<div style="width:${size}px;height:${size}px;border-radius:${radius};background:linear-gradient(135deg,#1a1f29 0%,#14181f 100%);color:#d7a542;font-size:${Math.round(size * 0.36)}px;font-weight:400;letter-spacing:1px;text-align:center;line-height:${size}px;font-family:Georgia,'Times New Roman',serif;font-style:italic;margin:0 auto;box-shadow:${shadow};">${initials}</div>`;
  // Headshot links to: explicit headshotLink → Instagram → website
  const linkRaw = d.headshotLink || d.instagram || d.website;
  const link = d.headshotLink
    ? normalizeUrl(d.headshotLink)
    : d.instagram
      ? normalizeInstagram(d.instagram)
      : d.website
        ? normalizeUrl(d.website)
        : "";
  return link
    ? `<a href="${escapeAttr(link)}" target="_blank" rel="noopener" style="display:inline-block;text-decoration:none;line-height:0;margin:0 auto;">${img}</a>`
    : img;
}

function buildInstagramButton(d: SignatureBuilderFields): string {
  if (!d.instagram) return "";
  const href = normalizeInstagram(d.instagram);
  return `<a href="${escapeAttr(href)}" target="_blank" rel="noopener" style="color:#14181f;text-decoration:none;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:500;letter-spacing:1.4px;text-transform:uppercase;border-bottom:1px solid #d7a542;padding-bottom:1px;">Instagram</a>`;
}

// ── Horizontal layout: editorial with serif name + meta hierarchy ────
export function buildHorizontalHtml(d: SignatureBuilderFields): string {
  const sz = Math.max(60, Math.min(160, parseInt(d.headshotSize || "100", 10) || 100));
  const headshot = buildHeadshotTag(d, sz);
  const igBtn = buildInstagramButton(d);
  const cellW = sz + 28;
  const websiteClean = d.website.replace(/^https?:\/\//, "").replace(/\/$/, "");

  return `<table cellpadding="0" cellspacing="0" border="0" style="font-family:'Helvetica Neue',Arial,sans-serif;color:#14181f;font-size:13px;line-height:1.55;max-width:560px;border-collapse:collapse;">
  <tr>
    <td width="${cellW}" align="left" valign="top" style="width:${cellW}px;padding:0 24px 0 0;vertical-align:top;line-height:0;">
      ${headshot}
    </td>
    <td valign="top" style="vertical-align:top;padding:2px 0 0 0;border-left:1px solid #e6e3dc;padding-left:24px;">
      <p style="margin:0 0 2px;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:400;color:#14181f;letter-spacing:-0.4px;line-height:1.15;">${d.fullName}</p>
      <p style="margin:0 0 14px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:500;color:#8a8578;text-transform:uppercase;letter-spacing:2px;">${d.title}<span style="color:#d7a542;padding:0 6px;">·</span>${d.brokerage}</p>
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-family:'Helvetica Neue',Arial,sans-serif;">
        <tr>
          <td style="padding:0 0 4px;font-size:9px;color:#a8a397;text-transform:uppercase;letter-spacing:1.6px;width:48px;vertical-align:middle;">Tel</td>
          <td style="padding:0 0 4px;font-size:13px;color:#14181f;vertical-align:middle;"><a href="tel:${escapeAttr(d.phone.replace(/[^\d+]/g, ""))}" style="color:#14181f;text-decoration:none;">${d.phone}</a></td>
        </tr>
        <tr>
          <td style="padding:0 0 4px;font-size:9px;color:#a8a397;text-transform:uppercase;letter-spacing:1.6px;vertical-align:middle;">Email</td>
          <td style="padding:0 0 4px;font-size:13px;color:#14181f;vertical-align:middle;"><a href="mailto:${escapeAttr(d.email)}" style="color:#14181f;text-decoration:none;">${d.email}</a></td>
        </tr>
        <tr>
          <td style="padding:0;font-size:9px;color:#a8a397;text-transform:uppercase;letter-spacing:1.6px;vertical-align:middle;">Web</td>
          <td style="padding:0;font-size:13px;vertical-align:middle;"><a href="${escapeAttr(normalizeUrl(d.website))}" target="_blank" rel="noopener" style="color:#14181f;text-decoration:none;border-bottom:1px solid #d7a542;padding-bottom:1px;">${websiteClean}</a>${
            igBtn
              ? `<span style="color:#d7a542;padding:0 10px;">·</span>${igBtn}`
              : ""
          }</td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

// ── Stacked layout: centered editorial card ──────────────────────────
export function buildStackedHtml(d: SignatureBuilderFields): string {
  const sz = Math.max(60, Math.min(180, (parseInt(d.headshotSize || "110", 10) || 110) + 10));
  const headshot = buildHeadshotTag(d, sz);
  const igBtn = buildInstagramButton(d);
  const websiteClean = d.website.replace(/^https?:\/\//, "").replace(/\/$/, "");

  return `<table cellpadding="0" cellspacing="0" border="0" style="font-family:'Helvetica Neue',Arial,sans-serif;color:#14181f;font-size:13px;line-height:1.55;max-width:360px;margin:0 auto;border-collapse:collapse;">
  <tr>
    <td align="center" style="padding-bottom:18px;line-height:0;">
      ${headshot}
    </td>
  </tr>
  <tr>
    <td align="center" style="text-align:center;">
      <p style="margin:0 0 4px;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:400;color:#14181f;letter-spacing:-0.4px;line-height:1.15;">${d.fullName}</p>
      <p style="margin:0 0 14px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:500;color:#8a8578;text-transform:uppercase;letter-spacing:2px;">${d.title}<span style="color:#d7a542;padding:0 6px;">·</span>${d.brokerage}</p>
      <div style="width:32px;height:1px;background:#d7a542;margin:0 auto 14px;"></div>
      <p style="margin:0 0 4px;font-size:13px;color:#14181f;">
        <a href="tel:${escapeAttr(d.phone.replace(/[^\d+]/g, ""))}" style="color:#14181f;text-decoration:none;">${d.phone}</a>
        <span style="color:#d7a542;padding:0 8px;">·</span>
        <a href="mailto:${escapeAttr(d.email)}" style="color:#14181f;text-decoration:none;">${d.email}</a>
      </p>
      <p style="margin:0;font-size:13px;">
        <a href="${escapeAttr(normalizeUrl(d.website))}" target="_blank" rel="noopener" style="color:#14181f;text-decoration:none;border-bottom:1px solid #d7a542;padding-bottom:1px;">${websiteClean}</a>${
          igBtn
            ? `<span style="color:#d7a542;padding:0 10px;">·</span>${igBtn}`
            : ""
        }
      </p>
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
  headshotSize: "100",
  headshotPosX: "50",
  headshotPosY: "50",
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

/**
 * ScaledIframe — renders the signature iframe at its natural email width
 * (e.g. 600px) and uses a CSS transform to shrink it down so it ALWAYS
 * fits the parent container with no horizontal scroll. After load, it
 * re-measures the body height and adjusts so there's no vertical scroll
 * either.
 */
function ScaledIframe({
  iframeRef,
  title,
  naturalWidth,
  naturalHeight,
}: {
  iframeRef: React.RefObject<HTMLIFrameElement>;
  title: string;
  naturalWidth: number;
  naturalHeight: number;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [contentHeight, setContentHeight] = useState(naturalHeight);

  // Watch wrapper width → compute scale = min(1, width / naturalWidth)
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      if (w > 0) setScale(Math.min(1, w / naturalWidth));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [naturalWidth]);

  // After iframe content writes, measure real body height. We tick a bounded
  // number of frames so we catch image loads, but only commit a new height if
  // it actually changed (otherwise we'd cause an infinite re-render loop).
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    let raf = 0;
    let lastH = 0;
    const measure = () => {
      const doc = iframe.contentDocument;
      if (!doc) return;
      const bodyH = doc.body?.scrollHeight ?? 0;
      const htmlH = doc.documentElement?.scrollHeight ?? 0;
      const h = Math.min(2000, Math.max(bodyH, htmlH));
      if (h > 0 && Math.abs(h - lastH) > 1) {
        lastH = h;
        setContentHeight(h);
      }
    };
    let count = 0;
    const tick = () => {
      measure();
      if (count++ < 60) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [naturalWidth, naturalHeight]);

  return (
    <div
      ref={wrapperRef}
      className="relative w-full overflow-hidden"
      style={{ height: Math.ceil(contentHeight * scale) }}
    >
      <iframe
        ref={iframeRef}
        title={title}
        scrolling="no"
        className="border-0 pointer-events-none block bg-white absolute top-0 left-0"
        style={{
          width: naturalWidth,
          height: contentHeight,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
        sandbox="allow-same-origin"
      />
    </div>
  );
}

export default function PresaleSignatureBuilder({
  fallback,
  initialData,
  onApply,
}: PresaleSignatureBuilderProps) {
  const { agent, status, refresh } = usePresaleAgent();

  const [layout, setLayout] = useState<LayoutVariant>("horizontal");
  const [mode, setMode] = useState<"form" | "html">("form");
  const [fields, setFields] = useState<SignatureBuilderFields>(() => ({
    ...BLANK,
    ...fallback,
    ...(initialData?.fields ?? {}),
  }));
  // Per-field touched + per-field source tracking so user edits never get
  // overwritten by a later prefill, and we can show "from Presale" etc.
  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>(
    () => initialData?.touchedFields ?? {},
  );
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
      const {
        data: { user },
      } = await supabase.auth.getUser();
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
    return () => {
      cancelled = true;
    };
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

    apply("fullName", [
      [presale.fullName, "presale"],
      [profile.fullName, "profile"],
    ]);
    apply("title", [
      [presale.title, "presale"],
      [profile.title, "profile"],
    ]);
    apply("phone", [
      [presale.phone, "presale"],
      [profile.phone, "profile"],
    ]);
    apply("email", [
      [presale.email, "presale"],
      [profile.email, "profile"],
    ]);
    apply("website", [[presale.website, "presale"]]);
    apply("brokerage", [
      [presale.brokerage, "presale"],
      [profile.brokerage, "profile"],
    ]);
    apply("photoUrl", [
      [presale.photoUrl, "presale"],
      [profile.photoUrl, "profile"],
    ]);
    apply("instagram", [[presale.instagram, "presale"]]);
    // Headshot link/shape are user-only choices
    next.headshotLink = touchedFields.headshotLink
      ? fields.headshotLink
      : fields.headshotLink || BLANK.headshotLink;
    next.headshotShape = touchedFields.headshotShape
      ? fields.headshotShape
      : fields.headshotShape || BLANK.headshotShape;
    next.headshotSize = touchedFields.headshotSize
      ? fields.headshotSize
      : fields.headshotSize || BLANK.headshotSize;
    next.headshotPosX = touchedFields.headshotPosX
      ? fields.headshotPosX
      : fields.headshotPosX || BLANK.headshotPosX;
    next.headshotPosY = touchedFields.headshotPosY
      ? fields.headshotPosY
      : fields.headshotPosY || BLANK.headshotPosY;
    sources.headshotLink = touchedFields.headshotLink ? "user" : "fallback";
    sources.headshotShape = touchedFields.headshotShape ? "user" : "fallback";
    sources.headshotSize = touchedFields.headshotSize ? "user" : "fallback";
    sources.headshotPosX = touchedFields.headshotPosX ? "user" : "fallback";
    sources.headshotPosY = touchedFields.headshotPosY ? "user" : "fallback";

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
        `<!DOCTYPE html><html><head><style>html,body{margin:0;padding:0;overflow:hidden;}body{padding:24px;font-family:'Helvetica Neue',Arial,sans-serif;background:#fff;box-sizing:border-box;}*{box-sizing:border-box;}</style></head><body>${html}</body></html>`,
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
    onApply(activeHtml, layout, fields, touchedFields);
  };

  const isLoading = status === "loading";

  // Source badge component — shows where each field came from
  const SourceBadge = ({ field }: { field: keyof SignatureBuilderFields }) => {
    const src = sourceMap[field];
    if (!src || src === "fallback") return null;
    const config: Record<PrefillSource, { label: string; className: string }> =
      {
        presale: {
          label: "Presale",
          className: "bg-primary/10 text-primary border-primary/20",
        },
        profile: {
          label: "Profile",
          className: "bg-muted text-muted-foreground border-border",
        },
        user: {
          label: "Edited",
          className: "bg-muted text-muted-foreground border-border",
        },
        fallback: { label: "", className: "" },
      };
    const cfg = config[src];
    return (
      <button
        type="button"
        onClick={() => src === "user" && handleResetField(field)}
        title={
          src === "user"
            ? "Click to reset to auto-filled value"
            : `Auto-filled from ${cfg.label}`
        }
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

  const initials = (fields.fullName || "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="space-y-5">
      {/* ─────────── Header row ─────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Email Signature
          </p>
          <p className="text-sm text-muted-foreground/80 mt-1">
            Generate premium signatures for the team
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Agent identity pill (read-only single-agent dropdown look) */}
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card pl-1.5 pr-3 py-1 h-10 min-w-[200px]">
            {fields.photoUrl ? (
              <img
                src={fields.photoUrl}
                alt=""
                className="h-7 w-7 rounded-full object-cover"
              />
            ) : (
              <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                {initials}
              </div>
            )}
            <span className="text-sm font-medium truncate flex-1">
              {fields.fullName || "Your name"}
            </span>
            <RefreshCw
              className={cn(
                "h-3.5 w-3.5 text-muted-foreground cursor-pointer hover:text-foreground",
                isLoading && "animate-spin",
              )}
              onClick={() => refresh({ force: true })}
            />
          </div>
          {/* Edit / HTML toggle */}
          <div className="flex items-center border border-border rounded-lg overflow-hidden h-10">
            <button
              type="button"
              onClick={() => setMode("form")}
              className={cn(
                "px-3 h-full flex items-center gap-1.5 text-sm font-medium transition-colors",
                mode === "form"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
            <button
              type="button"
              onClick={() => setMode("html")}
              className={cn(
                "px-3 h-full flex items-center gap-1.5 text-sm font-medium transition-colors",
                mode === "html"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              <Eye className="h-3.5 w-3.5" /> HTML
            </button>
          </div>
        </div>
      </div>

      {/* ─────────── Two-column body: editor (left) · previews (right stacked) ─────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* ===== LEFT: Editor ===== */}
        {mode === "form" ? (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {/* Agent preview header */}
            <div className="bg-gradient-to-r from-primary/5 to-primary/10 border-b border-border p-4 flex items-center gap-3">
              {fields.photoUrl ? (
                <img
                  src={fields.photoUrl}
                  alt=""
                  className="h-14 w-14 rounded-full object-cover ring-2 ring-primary/30 ring-offset-2 ring-offset-background shadow-md shrink-0"
                />
              ) : (
                <div className="h-14 w-14 rounded-full bg-primary/20 ring-2 ring-primary/30 ring-offset-2 ring-offset-background shadow-md flex items-center justify-center text-primary font-bold shrink-0">
                  {initials}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-base font-bold truncate">
                  {fields.fullName || "Your name"}
                </p>
                <p className="text-[11px] text-primary font-bold uppercase tracking-wide truncate">
                  {fields.title}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                  {fields.brokerage}
                </p>
              </div>
            </div>

            {/* Fields */}
            <div className="p-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
                <div className="md:col-span-2">
                  <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center">
                    Full Name <SourceBadge field="fullName" />
                  </Label>
                  <Input
                    value={fields.fullName}
                    onChange={(e) => update("fullName", e.target.value)}
                    className="h-10 text-sm mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center">
                    Title <SourceBadge field="title" />
                  </Label>
                  <Input
                    value={fields.title}
                    onChange={(e) => update("title", e.target.value)}
                    className="h-10 text-sm mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center">
                    Phone <SourceBadge field="phone" />
                  </Label>
                  <Input
                    value={fields.phone}
                    onChange={(e) => update("phone", e.target.value)}
                    className="h-10 text-sm mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center">
                    Email <SourceBadge field="email" />
                  </Label>
                  <Input
                    value={fields.email}
                    onChange={(e) => update("email", e.target.value)}
                    className="h-10 text-sm mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center">
                    Website <SourceBadge field="website" />
                  </Label>
                  <Input
                    value={fields.website}
                    onChange={(e) => update("website", e.target.value)}
                    className="h-10 text-sm mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center">
                    Brokerage <SourceBadge field="brokerage" />
                  </Label>
                  <Input
                    value={fields.brokerage}
                    onChange={(e) => update("brokerage", e.target.value)}
                    className="h-10 text-sm mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center">
                    Instagram <SourceBadge field="instagram" />
                  </Label>
                  <Input
                    value={fields.instagram}
                    onChange={(e) => update("instagram", e.target.value)}
                    className="h-10 text-sm mt-1"
                    placeholder="https://instagram.com/..."
                  />
                </div>
                <div className="md:col-span-2">
                  <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center">
                    Headshot URL <SourceBadge field="photoUrl" />
                  </Label>
                  <Input
                    value={fields.photoUrl}
                    onChange={(e) => update("photoUrl", e.target.value)}
                    className="h-10 text-sm mt-1"
                    placeholder="https://..."
                  />
                </div>
                <div className="md:col-span-2">
                  <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <ExternalLink className="h-3 w-3" /> Headshot Link URL
                  </Label>
                  <Input
                    value={fields.headshotLink}
                    onChange={(e) => update("headshotLink", e.target.value)}
                    className="h-10 text-sm mt-1"
                    placeholder="https://..."
                  />
                  <p className="text-[10px] text-muted-foreground/70 mt-1">
                    When set, the headshot image becomes clickable and links to
                    this URL
                  </p>
                </div>
                <div className="md:col-span-2">
                  <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                    Headshot Shape
                  </Label>
                  <div className="flex items-center gap-2 mt-1.5">
                    <button
                      type="button"
                      onClick={() => update("headshotShape", "circle")}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-lg border text-xs font-medium transition-all flex-1 justify-center",
                        fields.headshotShape === "circle"
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/30",
                      )}
                    >
                      <div className="h-4 w-4 rounded-full border-2 border-current" />
                      Circle
                    </button>
                    <button
                      type="button"
                      onClick={() => update("headshotShape", "rounded")}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-lg border text-xs font-medium transition-all flex-1 justify-center",
                        fields.headshotShape === "rounded"
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/30",
                      )}
                    >
                      <div className="h-4 w-4 rounded-[4px] border-2 border-current" />
                      Rounded
                    </button>
                  </div>
                </div>
                <div className="md:col-span-2">
                  <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center justify-between">
                    <span>Headshot Size</span>
                    <span className="text-muted-foreground/70 normal-case tracking-normal font-mono">
                      {parseInt(fields.headshotSize || "100", 10) || 100}px
                    </span>
                  </Label>
                  <input
                    type="range"
                    min={60}
                    max={160}
                    step={2}
                    value={parseInt(fields.headshotSize || "100", 10) || 100}
                    onChange={(e) => update("headshotSize", e.target.value)}
                    className="w-full mt-2 accent-primary"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground/60 mt-1">
                    <span>Small</span>
                    <span>Default</span>
                    <span>Large</span>
                  </div>
                </div>
                <div className="md:col-span-2 grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center justify-between">
                      <span>Focus X</span>
                      <span className="text-muted-foreground/70 normal-case tracking-normal font-mono">
                        {parseInt(fields.headshotPosX || "50", 10) || 50}%
                      </span>
                    </Label>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={parseInt(fields.headshotPosX || "50", 10) || 50}
                      onChange={(e) => update("headshotPosX", e.target.value)}
                      className="w-full mt-2 accent-primary"
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground/60 mt-1">
                      <span>Left</span>
                      <span>Right</span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center justify-between">
                      <span>Focus Y</span>
                      <span className="text-muted-foreground/70 normal-case tracking-normal font-mono">
                        {parseInt(fields.headshotPosY || "50", 10) || 50}%
                      </span>
                    </Label>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={parseInt(fields.headshotPosY || "50", 10) || 50}
                      onChange={(e) => update("headshotPosY", e.target.value)}
                      className="w-full mt-2 accent-primary"
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground/60 mt-1">
                      <span>Top</span>
                      <span>Bottom</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground">
                {layout === "horizontal" ? "Headshot Left" : "Headshot Top"} —
                HTML
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5"
                onClick={() => handleCopyHtml(activeHtml)}
              >
                <Copy className="h-3 w-3" /> Copy
              </Button>
            </div>
            <div className="p-3">
              <Textarea
                value={activeHtml}
                readOnly
                className="font-mono text-[10px] min-h-[520px] bg-muted/20 border-0 resize-y"
              />
            </div>
          </div>
        )}

        {/* ===== RIGHT: Previews stacked ===== */}
        <div className="space-y-4">
          {/* Variation 1: Horizontal */}
          <div
            className={cn(
              "rounded-xl border bg-card overflow-hidden transition-all cursor-pointer min-w-0",
              layout === "horizontal"
                ? "border-primary ring-2 ring-primary/20 shadow-lg shadow-primary/5"
                : "border-border hover:border-primary/30",
            )}
            onClick={() => setLayout("horizontal")}
          >
            <div className="px-4 py-3 border-b border-border bg-muted/20 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className={cn(
                    "h-4 w-4 rounded-full border-2 transition-colors flex items-center justify-center shrink-0",
                    layout === "horizontal"
                      ? "border-primary bg-primary"
                      : "border-muted-foreground/40",
                  )}
                >
                  {layout === "horizontal" && (
                    <div className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold leading-none">
                    Headshot Left
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Horizontal · ~520px
                  </p>
                </div>
                {layout === "horizontal" && (
                  <Badge className="text-[9px] bg-primary/15 text-primary border-0 h-4 px-1.5 ml-1">
                    Selected
                  </Badge>
                )}
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-[10px] gap-1 px-2"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopyHtml(horizontalHtml);
                }}
              >
                <Copy className="h-2.5 w-2.5" /> Copy HTML
              </Button>
            </div>
            <div className="bg-[#fafafa] dark:bg-zinc-950/40 p-2">
              <ScaledIframe
                iframeRef={iframeHRef}
                title="Horizontal Signature"
                naturalWidth={620}
                naturalHeight={200}
              />
            </div>
          </div>

          {/* Variation 2: Stacked */}
          <div
            className={cn(
              "rounded-xl border bg-card overflow-hidden transition-all cursor-pointer min-w-0",
              layout === "stacked"
                ? "border-primary ring-2 ring-primary/20 shadow-lg shadow-primary/5"
                : "border-border hover:border-primary/30",
            )}
            onClick={() => setLayout("stacked")}
          >
            <div className="px-4 py-3 border-b border-border bg-muted/20 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className={cn(
                    "h-4 w-4 rounded-full border-2 transition-colors flex items-center justify-center shrink-0",
                    layout === "stacked"
                      ? "border-primary bg-primary"
                      : "border-muted-foreground/40",
                  )}
                >
                  {layout === "stacked" && (
                    <div className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold leading-none">
                    Headshot Top
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Stacked · ~340px
                  </p>
                </div>
                {layout === "stacked" && (
                  <Badge className="text-[9px] bg-primary/15 text-primary border-0 h-4 px-1.5 ml-1">
                    Selected
                  </Badge>
                )}
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-[10px] gap-1 px-2"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopyHtml(stackedHtml);
                }}
              >
                <Copy className="h-2.5 w-2.5" /> Copy HTML
              </Button>
            </div>
            <div className="bg-[#fafafa] dark:bg-zinc-950/40 p-2">
              <ScaledIframe
                iframeRef={iframeVRef}
                title="Stacked Signature"
                naturalWidth={440}
                naturalHeight={420}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ─────────── Save Changes (gold pill, bottom-left) ─────────── */}
      <div className="flex items-center justify-between pt-2">
        <Button
          type="button"
          onClick={handleApply}
          className="h-12 px-6 rounded-xl gap-2 text-sm font-semibold shadow-md shadow-primary/20"
        >
          <Check className="h-4 w-4" />
          Save Changes
        </Button>
        <p className="text-[11px] text-muted-foreground/70 hidden sm:block">
          Click a variation to select it · Copy the HTML into your email
          client's signature settings
        </p>
      </div>
    </div>
  );
}
