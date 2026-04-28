// Shared HTML builders + send helper for the DealzFlow Scheduler.
// Sends through the existing CRM bridge-send-email function so all scheduler
// mail goes out from info@presaleproperties.com (Gmail SMTP) — same domain
// reputation as the rest of the CRM.

const PRESALE_FUNCTIONS_URL = "https://thvlisplwqhtjpzpedhq.supabase.co/functions/v1";

interface SendArgs {
  to: string;
  subject: string;
  html: string;
}

export async function sendSchedulerEmail({ to, subject, html }: SendArgs): Promise<void> {
  const bridgeSecret = Deno.env.get("BRIDGE_SECRET");
  if (!bridgeSecret) {
    console.warn("[scheduler-emails] BRIDGE_SECRET not set — skipping send to", to);
    return;
  }

  const res = await fetch(`${PRESALE_FUNCTIONS_URL}/bridge-send-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-bridge-secret": bridgeSecret,
    },
    body: JSON.stringify({
      to: [to],
      subject,
      html,
      source: "dealzflow_scheduler",
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[scheduler-emails] bridge send failed", res.status, text);
    throw new Error(`bridge send failed: ${res.status}`);
  }
}

interface BookingCtx {
  agentName: string;
  agentEmail?: string | null;
  agentPhone?: string | null;
  inviteeName: string;
  eventTitle: string;
  startAt: string; // ISO
  durationMin: number;
  timezone: string;
  locationType: string;
  locationValue?: string | null;
  meetingLink?: string | null;
  notes?: string | null;
  cancelUrl?: string | null;
  rescheduleUrl?: string | null;
}

function fmtDateTime(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toUTCString();
  }
}

function locationLine(c: BookingCtx): string {
  switch (c.locationType) {
    case "video": return c.meetingLink || c.locationValue || "Video call (link to follow)";
    case "phone": return c.locationValue ? `Phone: ${c.locationValue}` : "We will call you";
    case "in_person": return c.locationValue || "In person";
    case "custom": return c.locationValue || "Details to follow";
    default: return "Details to follow";
  }
}

function shell(title: string, inner: string, footerHtml = ""): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f6f5f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#14181F;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f5f2;padding:32px 16px;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #ececec;">
      <tr><td style="padding:28px 32px 8px;border-bottom:1px solid #f0eee9;">
        <div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#D7A542;font-weight:600;">DealzFlow</div>
      </td></tr>
      <tr><td style="padding:24px 32px 32px;">${inner}</td></tr>
      ${footerHtml ? `<tr><td style="padding:16px 32px;background:#fafaf7;border-top:1px solid #f0eee9;font-size:12px;color:#7a7a7a;">${footerHtml}</td></tr>` : ""}
    </table>
  </td></tr>
</table></body></html>`;
}

function detailRows(c: BookingCtx): string {
  const when = fmtDateTime(c.startAt, c.timezone);
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;border:1px solid #f0eee9;border-radius:10px;">
    <tr><td style="padding:14px 16px;border-bottom:1px solid #f5f3ee;font-size:13px;color:#7a7a7a;">When</td>
        <td style="padding:14px 16px;border-bottom:1px solid #f5f3ee;font-size:14px;color:#14181F;font-weight:500;">${when}</td></tr>
    <tr><td style="padding:14px 16px;border-bottom:1px solid #f5f3ee;font-size:13px;color:#7a7a7a;">Duration</td>
        <td style="padding:14px 16px;border-bottom:1px solid #f5f3ee;font-size:14px;color:#14181F;">${c.durationMin} minutes</td></tr>
    <tr><td style="padding:14px 16px;border-bottom:1px solid #f5f3ee;font-size:13px;color:#7a7a7a;">Where</td>
        <td style="padding:14px 16px;border-bottom:1px solid #f5f3ee;font-size:14px;color:#14181F;word-break:break-word;">${escapeHtml(locationLine(c))}</td></tr>
    <tr><td style="padding:14px 16px;font-size:13px;color:#7a7a7a;">With</td>
        <td style="padding:14px 16px;font-size:14px;color:#14181F;">${escapeHtml(c.agentName)}${c.agentEmail ? ` &middot; <a href="mailto:${c.agentEmail}" style="color:#D7A542;text-decoration:none;">${c.agentEmail}</a>` : ""}</td></tr>
  </table>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

function actionButtons(c: BookingCtx): string {
  const buttons: string[] = [];
  if (c.rescheduleUrl) buttons.push(`<a href="${c.rescheduleUrl}" style="display:inline-block;padding:10px 18px;background:#14181F;color:#fff;border-radius:8px;text-decoration:none;font-size:13px;font-weight:500;margin-right:8px;">Reschedule</a>`);
  if (c.cancelUrl) buttons.push(`<a href="${c.cancelUrl}" style="display:inline-block;padding:10px 18px;background:#ffffff;color:#14181F;border:1px solid #14181F;border-radius:8px;text-decoration:none;font-size:13px;font-weight:500;">Cancel</a>`);
  return buttons.length ? `<div style="margin-top:8px;">${buttons.join("")}</div>` : "";
}

export function buildInviteeConfirmation(c: BookingCtx): { subject: string; html: string } {
  const subject = `Confirmed: ${c.eventTitle} with ${c.agentName}`;
  const inner = `
    <h1 style="font-size:22px;margin:0 0 6px;font-weight:600;letter-spacing:-0.01em;">You're booked in.</h1>
    <p style="margin:0 0 18px;color:#55575d;font-size:14px;line-height:1.55;">Hi ${escapeHtml(c.inviteeName)}, your meeting is confirmed. Details below.</p>
    ${detailRows(c)}
    ${c.notes ? `<div style="background:#fafaf7;border-left:3px solid #D7A542;padding:12px 14px;border-radius:4px;margin:0 0 18px;"><div style="font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#7a7a7a;margin-bottom:4px;">Your notes</div><div style="font-size:14px;color:#14181F;line-height:1.5;">${escapeHtml(c.notes)}</div></div>` : ""}
    ${actionButtons(c)}
  `;
  return { subject, html: shell(subject, inner, "Looking forward to connecting.") };
}

export function buildAgentNotification(c: BookingCtx & { inviteeEmail?: string | null; inviteePhone?: string | null }): { subject: string; html: string } {
  const subject = `New booking: ${c.eventTitle} — ${c.inviteeName}`;
  const inner = `
    <h1 style="font-size:22px;margin:0 0 6px;font-weight:600;letter-spacing:-0.01em;">New booking on your calendar</h1>
    <p style="margin:0 0 18px;color:#55575d;font-size:14px;line-height:1.55;"><strong>${escapeHtml(c.inviteeName)}</strong> just booked <strong>${escapeHtml(c.eventTitle)}</strong>.</p>
    ${detailRows(c)}
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;border:1px solid #f0eee9;border-radius:10px;">
      ${c.inviteeEmail ? `<tr><td style="padding:12px 16px;border-bottom:1px solid #f5f3ee;font-size:13px;color:#7a7a7a;">Email</td><td style="padding:12px 16px;border-bottom:1px solid #f5f3ee;font-size:14px;"><a href="mailto:${c.inviteeEmail}" style="color:#D7A542;text-decoration:none;">${c.inviteeEmail}</a></td></tr>` : ""}
      ${c.inviteePhone ? `<tr><td style="padding:12px 16px;font-size:13px;color:#7a7a7a;">Phone</td><td style="padding:12px 16px;font-size:14px;"><a href="tel:${c.inviteePhone}" style="color:#D7A542;text-decoration:none;">${c.inviteePhone}</a></td></tr>` : ""}
    </table>
    ${c.notes ? `<div style="background:#fafaf7;border-left:3px solid #D7A542;padding:12px 14px;border-radius:4px;"><div style="font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#7a7a7a;margin-bottom:4px;">Notes from invitee</div><div style="font-size:14px;color:#14181F;line-height:1.5;">${escapeHtml(c.notes)}</div></div>` : ""}
  `;
  return { subject, html: shell(subject, inner, "DealzFlow Scheduler") };
}

export function buildCancellationEmail(c: BookingCtx & { audience: "invitee" | "agent"; reason?: string | null }): { subject: string; html: string } {
  const subject = c.audience === "invitee"
    ? `Cancelled: ${c.eventTitle} with ${c.agentName}`
    : `Cancelled: ${c.eventTitle} — ${c.inviteeName}`;
  const headline = c.audience === "invitee" ? "Your meeting was cancelled" : "Your invitee cancelled";
  const inner = `
    <h1 style="font-size:22px;margin:0 0 6px;font-weight:600;letter-spacing:-0.01em;">${headline}</h1>
    <p style="margin:0 0 18px;color:#55575d;font-size:14px;line-height:1.55;">${c.audience === "invitee" ? `Hi ${escapeHtml(c.inviteeName)}, the meeting below has been cancelled.` : `${escapeHtml(c.inviteeName)} cancelled the meeting below.`}</p>
    ${detailRows(c)}
    ${c.reason ? `<div style="background:#fafaf7;border-left:3px solid #d9534f;padding:12px 14px;border-radius:4px;"><div style="font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#7a7a7a;margin-bottom:4px;">Reason</div><div style="font-size:14px;color:#14181F;line-height:1.5;">${escapeHtml(c.reason)}</div></div>` : ""}
    ${c.audience === "invitee" && c.rescheduleUrl ? `<div style="margin-top:18px;"><a href="${c.rescheduleUrl}" style="display:inline-block;padding:10px 18px;background:#D7A542;color:#14181F;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;">Book a new time</a></div>` : ""}
  `;
  return { subject, html: shell(subject, inner) };
}

export function buildReminderEmail(c: BookingCtx & { reminderLabel: string }): { subject: string; html: string } {
  const subject = `Reminder: ${c.eventTitle} — ${c.reminderLabel}`;
  const inner = `
    <h1 style="font-size:22px;margin:0 0 6px;font-weight:600;letter-spacing:-0.01em;">${escapeHtml(c.reminderLabel)}</h1>
    <p style="margin:0 0 18px;color:#55575d;font-size:14px;line-height:1.55;">Hi ${escapeHtml(c.inviteeName)}, just a reminder about your upcoming meeting with ${escapeHtml(c.agentName)}.</p>
    ${detailRows(c)}
    ${actionButtons(c)}
  `;
  return { subject, html: shell(subject, inner) };
}
