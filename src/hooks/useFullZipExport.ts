import { useRef, useState } from 'react';
import JSZip from 'jszip';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

const PER_LEAD_TABLES: Array<[string, string]> = [
  ['notes', 'crm_notes'],
  ['emails', 'crm_email_log'],
  ['sms', 'crm_sms_log'],
  ['calls', 'crm_call_log'],
  ['showings', 'crm_showings'],
  ['activity', 'crm_activity_events'],
  ['audit', 'crm_audit_log'],
];

const PAGE = 500;

function escapeCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s: string;
  if (v instanceof Date) s = v.toISOString();
  else if (typeof v === 'object') {
    try { s = JSON.stringify(v); } catch { s = String(v); }
  } else s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(rows: Array<Record<string, unknown>>, fallbackCols: string[] = []): string {
  if (!rows.length) return fallbackCols.join(',') + '\n';
  const cols = Object.keys(rows[0]);
  const out: string[] = [cols.map(escapeCell).join(',')];
  for (const r of rows) out.push(cols.map((c) => escapeCell(r[c])).join(','));
  return out.join('\n') + '\n';
}

function safeSlug(s: string): string {
  return (s || 'lead').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

async function fetchAll(table: string, filter?: (q: any) => any): Promise<any[]> {
  const out: any[] = [];
  let from = 0;
  // recursive paginated fetch
  while (true) {
    let q = (supabase as any).from(table).select('*').range(from, from + PAGE - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw error;
    if (!data?.length) break;
    out.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

export function useFullZipExport() {
  const [running, setRunning] = useState(false);
  const cancelled = useRef(false);

  const run = async () => {
    if (running) return;
    setRunning(true);
    cancelled.current = false;
    const toastId = toast.loading('Preparing full export…');
    const startedAt = Date.now();
    let totalRows = 0;
    const tableCounts: Record<string, number> = {};

    const bump = (msg: string) => toast.loading(msg, { id: toastId });
    const addCount = (table: string, n: number) => {
      tableCounts[table] = (tableCounts[table] ?? 0) + n;
      totalRows += n;
    };

    try {
      const zip = new JSZip();

      bump('Loading contacts…');
      const contacts = await fetchAll('crm_contacts', (q) => q.is('deleted_at', null).order('created_at', { ascending: true }));
      addCount('crm_contacts', contacts.length);
      zip.file('contacts.csv', rowsToCsv(contacts));
      bump(`Contacts: ${contacts.length.toLocaleString()} · 0/${contacts.length} leads packed`);

      bump('Loading team…');
      const team = await fetchAll('crm_team');
      addCount('crm_team', team.length);
      zip.file('team.csv', rowsToCsv(team));

      bump('Loading audit log…');
      const audit = await fetchAll('crm_audit_log', (q) => q.order('occurred_at', { ascending: false }));
      addCount('crm_audit_log', audit.length);
      zip.file('audit_log.csv', rowsToCsv(audit));

      // Per-contact subfolders
      let i = 0;
      for (const c of contacts) {
        if (cancelled.current) throw new Error('cancelled');
        i += 1;
        const id = String(c.id);
        const folder = `leads/${safeSlug(`${c.first_name ?? ''}-${c.last_name ?? ''}-${id.slice(0, 8)}`)}`;
        const z = zip.folder(folder)!;
        z.file('profile.csv', rowsToCsv([c]));

        for (const [outName, table] of PER_LEAD_TABLES) {
          try {
            const filter = table === 'crm_audit_log'
              ? (q: any) => q.eq('record_id', id).order('occurred_at', { ascending: true })
              : (q: any) => q.eq('contact_id', id);
            const rows = await fetchAll(table, filter);
            addCount(table, rows.length);
            z.file(`${outName}.csv`, rowsToCsv(rows));
          } catch (e) {
            console.warn(`[full-zip] ${table} for ${id} failed`, e);
          }
        }

        if (i % 5 === 0 || i === contacts.length) {
          bump(
            `Packing leads ${i.toLocaleString()}/${contacts.length.toLocaleString()} · ` +
            `${totalRows.toLocaleString()} rows`
          );
        }
      }

      bump(`Compressing ${totalRows.toLocaleString()} rows…`);
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      const sizeMb = (blob.size / 1024 / 1024).toFixed(1);

      const today = new Date().toISOString().slice(0, 10);
      const filename = `crm-full-export-${today}.zip`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      // Audit log — action 'export.full_zip'
      try {
        await (supabase as any).rpc('crm_log_bulk_op', {
          _action: 'export.full_zip',
          _affected: totalRows,
          _filter: { include_deleted: false },
          _meta: {
            filename,
            size_bytes: blob.size,
            duration_ms: Date.now() - startedAt,
            contacts: contacts.length,
            table_counts: tableCounts,
          },
        });
      } catch (e) {
        console.warn('[full-zip] audit log failed', e);
      }

      toast.success(
        `Full export ready · ${contacts.length.toLocaleString()} leads, ${totalRows.toLocaleString()} rows, ${sizeMb} MB`,
        { id: toastId, duration: 6000 }
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'cancelled') {
        toast.message('Export cancelled', { id: toastId });
      } else {
        toast.error(`Export failed: ${msg}`, { id: toastId });
      }
    } finally {
      setRunning(false);
    }
  };

  return { run, running, cancel: () => { cancelled.current = true; } };
}
