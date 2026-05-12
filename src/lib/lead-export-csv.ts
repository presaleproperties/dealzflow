/**
 * Per-lead history CSV builder.
 *
 * Single CSV with `## section` separators so it opens cleanly in Excel/Numbers
 * but keeps everything in one file. Used by both the per-lead export edge fn
 * (re-implemented in Deno there) and tested here.
 */

export interface LeadCsvSection {
  /** Section title — rendered as a `## name` line above the rows. */
  name: string;
  /** Column headers in display order. */
  columns: string[];
  /** Row values keyed by column header. Missing keys are emitted as empty. */
  rows: Array<Record<string, unknown>>;
}

/** RFC 4180 cell escaping: wrap if needed, double internal quotes. */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s: string;
  if (value instanceof Date) {
    s = value.toISOString();
  } else if (typeof value === 'object') {
    try {
      s = JSON.stringify(value);
    } catch {
      s = String(value);
    }
  } else {
    s = String(value);
  }
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Build a single multi-section CSV string. */
export function buildLeadHistoryCsv(sections: LeadCsvSection[]): string {
  const out: string[] = [];
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    if (i > 0) out.push('');
    out.push(`## ${s.name}`);
    if (s.columns.length === 0) {
      out.push('(no columns)');
      continue;
    }
    out.push(s.columns.map(escapeCsvCell).join(','));
    if (s.rows.length === 0) {
      out.push('(no rows)');
      continue;
    }
    for (const row of s.rows) {
      out.push(s.columns.map((c) => escapeCsvCell(row[c])).join(','));
    }
  }
  return out.join('\n') + '\n';
}
