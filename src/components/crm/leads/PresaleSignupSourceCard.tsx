import { format } from "date-fns";
import { ExternalLink, Globe } from "lucide-react";

interface Props {
  contact: any;
}

/**
 * Shows where this lead originally signed up on Presale Properties:
 * landing/signup URL, source, UTM, referrer, and signup completion time.
 * Pulls from dedicated columns first, then falls back to presale_metadata.
 */
export function PresaleSignupSourceCard({ contact }: Props) {
  if (!contact) return null;

  const meta = (contact.presale_metadata || {}) as Record<string, any>;

  const signupUrl: string | null =
    meta.signup_url ||
    meta.page_url ||
    meta.landing_page ||
    meta.url ||
    meta.source_url ||
    null;

  const referrer: string | null = meta.referrer || meta.http_referrer || null;
  const utmSource: string | null = meta.utm_source || contact.campaign_source || null;
  const utmMedium: string | null = meta.utm_medium || null;
  const utmCampaign: string | null = meta.utm_campaign || null;
  const leadSource: string | null = meta.lead_source || contact.source || null;
  const persona: string | null = meta.persona || null;
  const intentTier: string | null = meta.intent_tier || contact.intent || null;
  const signupAt: string | null = contact.signup_completed_at || meta.signup_completed_at || null;

  const buildAbsolute = (u: string | null) => {
    if (!u) return null;
    if (/^https?:\/\//i.test(u)) return u;
    return `https://presaleproperties.com${u.startsWith("/") ? "" : "/"}${u}`;
  };
  const absoluteSignupUrl = buildAbsolute(signupUrl);

  const rows: { label: string; value: React.ReactNode }[] = [];

  if (absoluteSignupUrl) {
    rows.push({
      label: "Signup URL",
      value: (
        <a
          href={absoluteSignupUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-primary hover:underline break-all"
        >
          <span className="truncate">{signupUrl}</span>
          <ExternalLink className="w-3 h-3 shrink-0" />
        </a>
      ),
    });
  }
  if (leadSource) rows.push({ label: "Lead source", value: <span className="capitalize">{leadSource.replace(/_/g, " ")}</span> });
  if (utmSource) rows.push({ label: "UTM source", value: utmSource });
  if (utmMedium) rows.push({ label: "UTM medium", value: utmMedium });
  if (utmCampaign) rows.push({ label: "UTM campaign", value: utmCampaign });
  if (referrer)
    rows.push({
      label: "Referrer",
      value: (
        <a href={referrer} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">
          {referrer}
        </a>
      ),
    });
  if (persona) rows.push({ label: "Persona", value: <span className="capitalize">{persona}</span> });
  if (intentTier) rows.push({ label: "Intent", value: <span className="capitalize">{intentTier}</span> });
  if (contact.presale_user_id) rows.push({ label: "Presale ID", value: <span className="font-mono text-[10px] text-muted-foreground break-all">{contact.presale_user_id}</span> });
  if (signupAt) rows.push({ label: "Signed up", value: format(new Date(signupAt), "MMM d, yyyy · h:mm a") });

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <Globe className="w-6 h-6 text-muted-foreground/40 mb-2" />
        <p className="text-xs text-muted-foreground">No signup source data captured</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label} className="flex items-start gap-3 text-xs">
          <div className="w-24 shrink-0 text-muted-foreground">{r.label}</div>
          <div className="min-w-0 flex-1 text-foreground">{r.value}</div>
        </div>
      ))}
    </div>
  );
}
