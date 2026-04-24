/**
 * Clean and structure imported lead notes (Lofty / Zapier exports).
 *
 * Real-world notes look like a single concatenated blob:
 *   "Notes: Set appt Jan 2-6 -Uzair Muhammad 12/24/2022Calls: Uzair called Dmitriy on
 *    12/24/2022 12:51pm (13 min 11 sec)Texts: Uzair texted Dmitriy on 12/23/2022 8:38pm
 *    Hey Dmitriy, thank you... Dmitriy texted Uzair on 12/23/2022 9:11pmHello..."
 *
 * Strategy:
 *  1. Decode entities, normalize whitespace.
 *  2. Inject newlines BEFORE every recognised event marker:
 *      - Section headers: "Notes:", "Calls:", "Texts:", "Emails:", "Appointments:"
 *      - Person event:    "<Name> called/texted/emailed <Name> on M/D/YYYY H:MMam/pm"
 *      - Trailing parens timestamp:  "(Mon DD, YYYY at HH:MM AM)"
 *  3. Walk lines, classify each as Call / Text / Email / Note / Appointment, attach a
 *     parsed Date, and return entries grouped & sorted newest-first by day.
 */

export type NoteKind = 'call' | 'text' | 'email' | 'appointment' | 'note';

export interface NoteEntry {
  kind: NoteKind;
  /** Optional speaker / actor (e.g. "Uzair Muhammad called Dmitriy") */
  actor?: string;
  /** Body text — message, summary, or duration */
  text: string;
  /** Parsed date for grouping & sorting (null when unknown) */
  date: Date | null;
  /** Pretty timestamp for display, or null */
  timestamp: string | null;
}

export interface NoteDayGroup {
  /** YYYY-MM-DD or "Undated" */
  key: string;
  label: string;            // e.g. "Dec 24, 2022"
  date: Date | null;
  entries: NoteEntry[];
}

/* ─── Decoding helpers ─── */
const ENTITY_MAP: Record<string, string> = {
  '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>',
  '&quot;': '"', '&#39;': "'", '&apos;': "'",
};
function decodeEntities(s: string): string {
  let out = s;
  for (const [k, v] of Object.entries(ENTITY_MAP)) out = out.split(k).join(v);
  return out.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

/* ─── Date parsing ─── */
// "12/24/2022 12:51pm"  or  "1/3/2023 12:12pm"  or  "12/24/2022"
const SLASH_DATE_RE = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})\s*([ap]m))?\b/i;
// "(Mar 5, 2026 at 6:31:09 PM)"
const PARENS_DATE_RE = /\(([A-Z][a-z]{2})\s+(\d{1,2}),\s*(\d{4})\s+at\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP]M)\)/i;

const MONTH_MAP: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function parseSlashDate(s: string): Date | null {
  const m = s.match(SLASH_DATE_RE);
  if (!m) return null;
  const month = parseInt(m[1], 10) - 1;
  const day = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  let hour = m[4] ? parseInt(m[4], 10) : 0;
  const min = m[5] ? parseInt(m[5], 10) : 0;
  if (m[6]) {
    const isPm = m[6].toLowerCase() === 'pm';
    if (isPm && hour < 12) hour += 12;
    if (!isPm && hour === 12) hour = 0;
  }
  const d = new Date(year, month, day, hour, min);
  return isNaN(d.getTime()) ? null : d;
}

function parseParensDate(s: string): Date | null {
  const m = s.match(PARENS_DATE_RE);
  if (!m) return null;
  const month = MONTH_MAP[m[1].toLowerCase()];
  if (month == null) return null;
  const day = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  let hour = parseInt(m[4], 10);
  const min = parseInt(m[5], 10);
  const isPm = m[6].toUpperCase() === 'PM';
  if (isPm && hour < 12) hour += 12;
  if (!isPm && hour === 12) hour = 0;
  const d = new Date(year, month, day, hour, min);
  return isNaN(d.getTime()) ? null : d;
}

function fmtTimestamp(d: Date | null): string | null {
  if (!d) return null;
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function fmtDayLabel(d: Date | null): string {
  if (!d) return 'Undated';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function dayKey(d: Date | null): string {
  if (!d) return 'undated';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ─── Pre-processing ─── */
// Section headers we want to break on
const SECTION_RE = /\b(Notes|Calls|Texts|Emails|Appointments|Tasks):\s*/g;

// Person events: "X called/texted/emailed Y on M/D/YYYY H:MMam/pm"
const EVENT_RE = /([A-Z][\p{L}\p{M}'.\- ]{1,40}?)\s+(called|texted|emailed|left a voicemail for|messaged)\s+([A-Z][\p{L}\p{M}'.\- ]{1,40}?)\s+on\s+(\d{1,2}\/\d{1,2}\/\d{4}(?:\s+\d{1,2}:\d{2}\s*[ap]m)?)/giu;

function preprocess(raw: string): string {
  const decoded = decodeEntities(raw)
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ');

  // 1) Newline before each section header
  let s = decoded.replace(SECTION_RE, '\n\n$1: ');

  // 2) Newline before each person-event marker
  s = s.replace(EVENT_RE, '\n$1 $2 $3 on $4 ');

  // 3) Newline before parens-style timestamp ranges
  s = s.replace(PARENS_DATE_RE, (m) => `\n${m} `);

  // 4) Trim long whitespace runs
  return s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/* ─── Line classification ─── */
function classifyLine(line: string): NoteEntry | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Section labels alone — drop ("Notes:", "Calls:")
  if (/^(Notes|Calls|Texts|Emails|Appointments|Tasks):\s*$/i.test(trimmed)) return null;

  // Strip leading section label from the start of a content line
  const stripped = trimmed.replace(/^(Notes|Calls|Texts|Emails|Appointments|Tasks):\s*/i, '');
  if (!stripped) return null;

  // Detect kind by verb
  let kind: NoteKind = 'note';
  if (/\bcalled\b|\bvoicemail\b/i.test(stripped)) kind = 'call';
  else if (/\btexted\b|\bmessaged\b/i.test(stripped)) kind = 'text';
  else if (/\bemailed\b/i.test(stripped)) kind = 'email';
  else if (/^(appt|appointment|set an appointment|booked|scheduled)/i.test(stripped)) kind = 'appointment';

  // Try to extract a date — slash format first, then parens
  const date = parseSlashDate(stripped) ?? parseParensDate(stripped);

  // Pull out actor + body for events
  const ev = stripped.match(/^([A-Z][\p{L}\p{M}'.\- ]{1,40}?)\s+(called|texted|emailed|messaged|left a voicemail for)\s+([A-Z][\p{L}\p{M}'.\- ]{1,40}?)\s+on\s+\d{1,2}\/\d{1,2}\/\d{4}(?:\s+\d{1,2}:\d{2}\s*[ap]m)?\s*(.*)$/iu);
  let actor: string | undefined;
  let body = stripped;
  if (ev) {
    actor = `${ev[1].trim()} → ${ev[3].trim()}`;
    body = ev[4]?.trim() || '';
    if (!body) {
      // No body after the marker — synthesize a short summary like "Called" / "Texted"
      const verb = ev[2].toLowerCase();
      body = verb.charAt(0).toUpperCase() + verb.slice(1);
    }
  } else {
    // Strip trailing signature like "-Uzair Muhammad 12/24/2022"
    body = body.replace(/\s*-\s*[A-Z][\p{L}\p{M}'.\- ]+\s+\d{1,2}\/\d{1,2}\/\d{4}\s*$/u, '').trim();
  }

  // Drop empty / pure-timestamp residue
  if (!body || /^\d{1,2}\/\d{1,2}\/\d{4}/.test(body) === true && body.length < 14) return null;

  // Final tidy on the body
  body = body
    .replace(/\s{2,}/g, ' ')
    .replace(/([.!?])([A-Z])/g, '$1 $2')
    .trim();

  if (!body) return null;

  return {
    kind,
    actor,
    text: body,
    date,
    timestamp: fmtTimestamp(date),
  };
}

/* ─── Public API ─── */
export function parseImportedNotes(raw: string | null | undefined): NoteEntry[] {
  if (!raw) return [];
  const pre = preprocess(raw);
  const lines = pre.split('\n');
  const entries: NoteEntry[] = [];

  // Carry-forward the most recent date for lines that don't have one
  let carryDate: Date | null = null;

  for (const line of lines) {
    const entry = classifyLine(line);
    if (!entry) continue;
    if (entry.date) carryDate = entry.date;
    else if (carryDate) {
      entry.date = carryDate;
      entry.timestamp = fmtTimestamp(carryDate);
    }
    entries.push(entry);
  }

  // De-duplicate exact (kind, text, day) repeats
  const seen = new Set<string>();
  const deduped: NoteEntry[] = [];
  for (const e of entries) {
    const k = `${e.kind}|${dayKey(e.date)}|${e.text.toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(e);
  }

  // Sort newest first
  deduped.sort((a, b) => {
    const at = a.date?.getTime() ?? 0;
    const bt = b.date?.getTime() ?? 0;
    return bt - at;
  });

  return deduped;
}

export function groupNotesByDay(entries: NoteEntry[]): NoteDayGroup[] {
  const groups = new Map<string, NoteDayGroup>();
  for (const e of entries) {
    const k = dayKey(e.date);
    if (!groups.has(k)) {
      groups.set(k, { key: k, label: fmtDayLabel(e.date), date: e.date, entries: [] });
    }
    groups.get(k)!.entries.push(e);
  }
  // Sort groups newest-first; "undated" goes last
  return Array.from(groups.values()).sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return b.date.getTime() - a.date.getTime();
  });
}
