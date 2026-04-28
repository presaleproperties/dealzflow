// Best-effort helpers for Google Calendar integration in the scheduler.
// All functions silently degrade (return [] / null) when:
//   - the agent has not connected Google Calendar
//   - GOOGLE_CALENDAR_CLIENT_ID/SECRET are missing
//   - the refresh fails
// We never block a booking or availability response on calendar issues.

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

export interface BusyRange { startMs: number; endMs: number; }

async function getValidAccessToken(supabase: any, userId: string): Promise<string | null> {
  const { data: tokenRow } = await supabase
    .from("google_calendar_tokens")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (!tokenRow) return null;

  const expiresAt = new Date(tokenRow.token_expires_at).getTime();
  if (expiresAt - Date.now() > 60_000) return tokenRow.access_token;

  const CLIENT_ID = Deno.env.get("GOOGLE_CALENDAR_CLIENT_ID");
  const CLIENT_SECRET = Deno.env.get("GOOGLE_CALENDAR_CLIENT_SECRET");
  if (!CLIENT_ID || !CLIENT_SECRET) return null;

  try {
    const refreshRes = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: tokenRow.refresh_token,
        grant_type: "refresh_token",
      }),
    });
    const data = await refreshRes.json();
    if (!refreshRes.ok || !data.access_token) {
      console.warn("[gcal] refresh failed", data);
      return null;
    }
    const newExpiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString();
    await supabase
      .from("google_calendar_tokens")
      .update({ access_token: data.access_token, token_expires_at: newExpiresAt })
      .eq("user_id", userId);
    return data.access_token;
  } catch (e) {
    console.warn("[gcal] refresh threw", e);
    return null;
  }
}

export async function fetchGoogleBusy(
  supabase: any,
  userId: string,
  fromIso: string,
  toIso: string,
): Promise<BusyRange[]> {
  const token = await getValidAccessToken(supabase, userId);
  if (!token) return [];
  try {
    const res = await fetch(`${CALENDAR_API}/freeBusy`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        timeMin: fromIso,
        timeMax: toIso,
        items: [{ id: "primary" }],
      }),
    });
    if (!res.ok) {
      console.warn("[gcal] freebusy failed", res.status);
      return [];
    }
    const data = await res.json();
    const busy = data?.calendars?.primary?.busy || [];
    return busy.map((b: any) => ({
      startMs: new Date(b.start).getTime(),
      endMs: new Date(b.end).getTime(),
    }));
  } catch (e) {
    console.warn("[gcal] freebusy threw", e);
    return [];
  }
}

interface InsertEventArgs {
  summary: string;
  description?: string;
  startIso: string;
  endIso: string;
  timezone: string;
  attendees?: { email: string; displayName?: string }[];
  location?: string;
}

export async function insertGoogleEvent(
  supabase: any,
  userId: string,
  args: InsertEventArgs,
): Promise<{ eventId: string; calendarId: string } | null> {
  const token = await getValidAccessToken(supabase, userId);
  if (!token) return null;
  try {
    const res = await fetch(`${CALENDAR_API}/calendars/primary/events?sendUpdates=none`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: args.summary,
        description: args.description,
        location: args.location,
        start: { dateTime: args.startIso, timeZone: args.timezone },
        end: { dateTime: args.endIso, timeZone: args.timezone },
        attendees: args.attendees,
        reminders: { useDefault: true },
      }),
    });
    if (!res.ok) {
      console.warn("[gcal] insert event failed", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = await res.json();
    return { eventId: data.id, calendarId: "primary" };
  } catch (e) {
    console.warn("[gcal] insert event threw", e);
    return null;
  }
}

export async function deleteGoogleEvent(
  supabase: any,
  userId: string,
  calendarId: string,
  eventId: string,
): Promise<boolean> {
  const token = await getValidAccessToken(supabase, userId);
  if (!token) return false;
  try {
    const res = await fetch(`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok || res.status === 404 || res.status === 410;
  } catch (e) {
    console.warn("[gcal] delete event threw", e);
    return false;
  }
}
