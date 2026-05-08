// Pure client-side ICS (RFC 5545) builder for scheduler bookings.
// Produces a minimal VCALENDAR with a single VEVENT — enough for Apple
// Calendar, Outlook, Google Calendar import, etc.

export interface IcsEvent {
  uid: string;
  title: string;
  startIso: string;
  endIso: string;
  description?: string;
  location?: string;
  organizerName?: string;
  organizerEmail?: string;
}

const fmt = (iso: string) =>
  new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

const esc = (s: string) =>
  (s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');

export function buildIcs(ev: IcsEvent): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DealzFlow Scheduler//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${ev.uid}@dealzflow.ca`,
    `DTSTAMP:${fmt(new Date().toISOString())}`,
    `DTSTART:${fmt(ev.startIso)}`,
    `DTEND:${fmt(ev.endIso)}`,
    `SUMMARY:${esc(ev.title)}`,
  ];
  if (ev.description) lines.push(`DESCRIPTION:${esc(ev.description)}`);
  if (ev.location) lines.push(`LOCATION:${esc(ev.location)}`);
  if (ev.organizerEmail) {
    lines.push(`ORGANIZER;CN=${esc(ev.organizerName || ev.organizerEmail)}:mailto:${ev.organizerEmail}`);
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadIcs(filename: string, ev: IcsEvent) {
  const blob = new Blob([buildIcs(ev)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.ics') ? filename : `${filename}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function googleCalendarUrl(ev: IcsEvent): string {
  const dates = `${fmt(ev.startIso)}/${fmt(ev.endIso)}`;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.title,
    dates,
    details: ev.description || '',
    location: ev.location || '',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
