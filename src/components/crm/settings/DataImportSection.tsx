import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { normalizeCrmMultiValueList, splitCrmMultiValue } from '@/lib/crmMultiValue';

const CRM_FIELDS = [
  { value: '__skip__', label: '— Skip —' },
  { value: 'first_name', label: 'First Name' },
  { value: 'last_name', label: 'Last Name' },
  { value: 'email', label: 'Email' },
  { value: 'email_secondary', label: 'Email (Secondary / Spouse)' },
  { value: 'phone', label: 'Phone' },
  { value: 'phone_secondary', label: 'Phone (Secondary)' },
  { value: 'address', label: 'Address' },
  { value: 'city', label: 'City' },
  { value: 'province', label: 'Province' },
  { value: 'postal_code', label: 'Postal Code' },
  { value: 'source', label: 'Source' },
  { value: 'status', label: 'Status' },
  { value: 'project', label: 'Project (Primary)' },
  { value: 'projects', label: 'Projects (Multiple)' },
  { value: 'assigned_to', label: 'Assigned To' },
  { value: 'contact_type', label: 'Contact Type' },
  { value: 'budget_min', label: 'Budget Min' },
  { value: 'budget_max', label: 'Budget Max' },
  { value: 'bedrooms_preferred', label: 'Bedrooms Preferred' },
  { value: 'language', label: 'Language' },
  { value: 'lead_type', label: 'Lead Type' },
  { value: 'birthday', label: 'Birthday' },
  { value: 'notes', label: 'Notes' },
  { value: 'co_buyer_name', label: 'Co-Buyer Name' },
  { value: 'co_buyer_phone', label: 'Co-Buyer Phone' },
  { value: 'co_buyer_email', label: 'Co-Buyer Email' },
  { value: 'co_buyer_birthday', label: 'Co-Buyer Birthday' },
  { value: 'tags', label: 'Tags' },
  { value: 'lofty_id', label: 'Lofty ID' },
  { value: 'created_at', label: 'Created At' },
  { value: 'campaign_source', label: 'Campaign Source' },
  { value: 'property_type_pref', label: 'Property Type Preference' },
  { value: 'is_pre_approved', label: 'Pre-Approved' },
  { value: 'referral_source', label: 'Referral Source' },
  { value: 'city_pref', label: 'Preferred City' },
] as const;

const AUTO_MAP: Record<string, string> = {
  'first name': 'first_name',
  'firstname': 'first_name',
  'first_name': 'first_name',
  'last name': 'last_name',
  'lastname': 'last_name',
  'last_name': 'last_name',
  'email': 'email',
  'e-mail': 'email',
  'email secondary': 'email_secondary',
  'email_secondary': 'email_secondary',
  'secondary email': 'email_secondary',
  'spouse email': 'email_secondary',
  'alt email': 'email_secondary',
  'phone': 'phone',
  'phone number': 'phone',
  'phone_number': 'phone',
  'mobile': 'phone',
  'cell': 'phone',
  'phone secondary': 'phone_secondary',
  'phone_secondary': 'phone_secondary',
  'secondary phone': 'phone_secondary',
  'address': 'address',
  'street': 'address',
  'city': 'city',
  'province': 'province',
  'state': 'province',
  'postal code': 'postal_code',
  'postal_code': 'postal_code',
  'zip': 'postal_code',
  'zip code': 'postal_code',
  'source': 'source',
  'lead source': 'source',
  'lead_source': 'source',
  'status': 'status',
  'project': 'project',
  'projects': 'projects',
  'assigned to': 'assigned_to',
  'assigned_to': 'assigned_to',
  'agent': 'assigned_to',
  'contact type': 'contact_type',
  'contact_type': 'contact_type',
  'type': 'contact_type',
  'budget min': 'budget_min',
  'budget_min': 'budget_min',
  'min budget': 'budget_min',
  'budget max': 'budget_max',
  'budget_max': 'budget_max',
  'max budget': 'budget_max',
  'bedrooms': 'bedrooms_preferred',
  'bedrooms_preferred': 'bedrooms_preferred',
  'language': 'language',
  'lead type': 'lead_type',
  'lead_type': 'lead_type',
  'birthday': 'birthday',
  'dob': 'birthday',
  'date of birth': 'birthday',
  'notes': 'notes',
  'co-buyer name': 'co_buyer_name',
  'co_buyer_name': 'co_buyer_name',
  'co-buyer phone': 'co_buyer_phone',
  'co_buyer_phone': 'co_buyer_phone',
  'co-buyer email': 'co_buyer_email',
  'co_buyer_email': 'co_buyer_email',
  'co-buyer birthday': 'co_buyer_birthday',
  'co_buyer_birthday': 'co_buyer_birthday',
  'tags': 'tags',
  'lofty_id': 'lofty_id',
  'lofty id': 'lofty_id',
  'created_at': 'created_at',
  'created at': 'created_at',
  'date added': 'created_at',
  'date_added': 'created_at',
  'campaign': 'campaign_source',
  'campaign_source': 'campaign_source',
  'campaign source': 'campaign_source',
  'property_type': 'property_type_pref',
  'property_preference': 'property_type_pref',
  'property type preference': 'property_type_pref',
  'property_type_pref': 'property_type_pref',
  'pre_approved': 'is_pre_approved',
  'preapproved': 'is_pre_approved',
  'pre-approved': 'is_pre_approved',
  'is_pre_approved': 'is_pre_approved',
  'referral': 'referral_source',
  'referral_source': 'referral_source',
  'referral source': 'referral_source',
  'city_pref': 'city_pref',
  'preferred_city': 'city_pref',
  'preferred city': 'city_pref',
};

const ARRAY_FIELDS = new Set(['tags', 'projects']);
const BOOLEAN_FIELDS = new Set(['is_pre_approved']);

type ImportPhase = 'upload' | 'mapping' | 'importing' | 'done';

interface SkippedRow {
  rowNum: number;
  reason: string;
  data: string;
}

interface ImportResult {
  success: number;
  errors: number;
  skipped: SkippedRow[];
  dbErrors: string[];
}

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const normalized = text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  const parsedRows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];

    if (ch === '"') {
      if (inQuotes && normalized[i + 1] === '"') {
        currentCell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ',' && !inQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = '';
      continue;
    }

    if (ch === '\n' && !inQuotes) {
      currentRow.push(currentCell.trim());
      if (currentRow.some(cell => cell !== '')) {
        parsedRows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
      continue;
    }

    currentCell += ch;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some(cell => cell !== '')) {
      parsedRows.push(currentRow);
    }
  }

  if (parsedRows.length === 0) return { headers: [], rows: [] };

  const [headers, ...rows] = parsedRows;
  return { headers, rows };
}

export default function DataImportSection() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<ImportPhase>('upload');
  const [fileName, setFileName] = useState('');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [mergeMode, setMergeMode] = useState(true);

  const handleFile = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast.error('Please upload a .csv file');
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { headers, rows } = parseCSV(text);
      if (headers.length === 0) {
        toast.error('CSV file appears to be empty');
        return;
      }
      setCsvHeaders(headers);
      setCsvRows(rows);
      const autoMapped: Record<number, string> = {};
      headers.forEach((h, i) => {
        const key = h.toLowerCase().trim();
        if (AUTO_MAP[key]) autoMapped[i] = AUTO_MAP[key];
      });
      setMapping(autoMapped);
      setPhase('mapping');
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const updateMapping = (colIndex: number, field: string) => {
    setMapping(prev => ({ ...prev, [colIndex]: field }));
  };

  const mappedCount = Object.values(mapping).filter(v => v !== '__skip__').length;
  const hasFirstName = Object.values(mapping).includes('first_name');
  const hasLastName = Object.values(mapping).includes('last_name');

  const handleImport = async () => {
    if (!hasFirstName || !hasLastName) {
      toast.error('first_name and last_name mappings are required');
      return;
    }

    setPhase('importing');
    setProgress(0);

    const BATCH = 50;
    let success = 0;
    let errors = 0;
    const skipped: SkippedRow[] = [];
    const dbErrors: string[] = [];

    // Build all records first, tracking skipped rows
    const allRecords: { record: Record<string, unknown>; rowNum: number }[] = [];

    csvRows.forEach((row, rowIndex) => {
      const record: Record<string, unknown> = {};
      Object.entries(mapping).forEach(([colIdx, field]) => {
        if (field === '__skip__') return;
        const val = row[Number(colIdx)]?.trim() ?? '';
        if (!val) return;
        if (field === 'budget_min' || field === 'budget_max') {
          const num = parseFloat(val.replace(/[^0-9.-]/g, ''));
          if (!isNaN(num)) record[field] = num;
        } else if (ARRAY_FIELDS.has(field)) {
          record[field] = splitCrmMultiValue(val);
        } else if (field === 'contact_type') {
          const normalized = val.toLowerCase().trim();
          if (['lead', 'realtor', 'past_client'].includes(normalized)) {
            record[field] = normalized;
          }
        } else if (BOOLEAN_FIELDS.has(field)) {
          const lower = val.toLowerCase();
          record[field] = ['yes', 'true', '1'].includes(lower);
        } else if (field === 'created_at') {
          const d = new Date(val);
          if (!isNaN(d.getTime())) {
            record[field] = d.toISOString();
          }
        } else {
          record[field] = val;
        }
      });

      if (record.projects && Array.isArray(record.projects) && (record.projects as string[]).length > 0 && !record.project) {
        record.project = (record.projects as string[])[0];
      }
      if (record.project && !record.projects) {
        record.projects = [record.project as string];
      }
      if (!record.projects) {
        record.projects = [];
      }

      // Require email or phone — leads without either are useless
      const hasEmail = typeof record.email === 'string' && (record.email as string).trim().length > 0;
      const hasPhone = typeof record.phone === 'string' && (record.phone as string).trim().length > 0;
      if (!hasEmail && !hasPhone) {
        skipped.push({
          rowNum: rowIndex + 2,
          reason: 'Missing email and phone',
          data: row.join(' | ').slice(0, 120),
        });
        return;
      }

      // Normalize names: auto-split full name from first_name when last_name is missing.
      // Never write the literal string "Unknown" — leave last_name blank instead.
      const fnRaw = (record.first_name as string | undefined)?.trim() ?? '';
      const lnRaw = (record.last_name as string | undefined)?.trim() ?? '';

      let firstName = fnRaw;
      let lastName = lnRaw;

      // If first_name has multiple words and last_name is empty/placeholder → split on last space
      if (
        firstName &&
        /\s/.test(firstName) &&
        (!lastName || /^(unknown|\(unknown\))$/i.test(lastName))
      ) {
        const idx = firstName.lastIndexOf(' ');
        lastName = firstName.slice(idx + 1).trim();
        firstName = firstName.slice(0, idx).trim();
      }

      // Strip placeholder values
      if (/^(unknown|\(unknown\))$/i.test(lastName)) lastName = '';
      if (/^(unknown|\(unknown\))$/i.test(firstName)) firstName = '';

      if (!firstName) firstName = 'Unknown';
      record.first_name = firstName;
      record.last_name = lastName;

      allRecords.push({ record, rowNum: rowIndex + 2 });
    });

    // Helper: normalize phone for matching
    const normPhone = (p: unknown) => String(p || '').replace(/[^\d]/g, '').slice(-10);
    const normEmail = (e: unknown) => String(e || '').trim().toLowerCase();

    let merged = 0;

    for (let i = 0; i < allRecords.length; i++) {
      const item = allRecords[i];
      const rec = item.record;

      // Try to find an existing contact (merge mode)
      let existingId: string | null = null;
      let existingTags: string[] = [];

      if (mergeMode) {
        if (rec.lofty_id) {
          const { data } = await supabase.from('crm_contacts').select('id,tags').eq('lofty_id', rec.lofty_id as string).limit(1);
          if (data && data.length > 0) { existingId = data[0].id; existingTags = (data[0].tags as string[]) ?? []; }
        }
        if (!existingId && rec.email) {
          const { data } = await supabase.from('crm_contacts').select('id,tags').ilike('email', normEmail(rec.email)).limit(1);
          if (data && data.length > 0) { existingId = data[0].id; existingTags = (data[0].tags as string[]) ?? []; }
        }
        const phoneNorm = normPhone(rec.phone);
        if (!existingId && phoneNorm.length >= 7) {
          const { data } = await supabase.from('crm_contacts').select('id,tags').ilike('phone', `%${phoneNorm}%`).limit(1);
          if (data && data.length > 0) { existingId = data[0].id; existingTags = (data[0].tags as string[]) ?? []; }
        }
      }

      if (existingId) {
        // Merge tags + projects, don't overwrite other fields
        const incomingTags = normalizeCrmMultiValueList(rec.tags);
        const incomingProjects = normalizeCrmMultiValueList(rec.projects);
        const existingNormalizedTags = normalizeCrmMultiValueList(existingTags);
        const mergedTags = Array.from(
          new Map(
            [...existingNormalizedTags, ...incomingTags].map(tag => [tag.toLowerCase(), tag])
          ).values()
        );

        const updates: Record<string, unknown> = {};
        if (JSON.stringify(mergedTags) !== JSON.stringify(existingNormalizedTags)) {
          updates.tags = mergedTags;
        }
        if (incomingProjects.length > 0) {
          const { data: cur } = await supabase
            .from('crm_contacts')
            .select('projects')
            .eq('id', existingId)
            .maybeSingle();
          const existingProjects = normalizeCrmMultiValueList(cur?.projects);
          const mergedProjects = Array.from(
            new Map([...existingProjects, ...incomingProjects].map(project => [project.toLowerCase(), project])).values()
          );
          if (JSON.stringify(mergedProjects) !== JSON.stringify(existingProjects)) {
            updates.projects = mergedProjects;
          }
        }
        if (Object.keys(updates).length > 0) {
          const { error: updErr } = await supabase
            .from('crm_contacts')
            .update(updates)
            .eq('id', existingId);
          if (updErr) {
            errors++;
            dbErrors.push(`Row ${item.rowNum} (merge): ${updErr.message}`);
          } else {
            merged++;
          }
        } else {
          merged++; // matched but nothing new to add
        }
      } else {
        const { error: insErr } = await supabase.from('crm_contacts').insert(rec as never);
        if (insErr) {
          errors++;
          dbErrors.push(`Row ${item.rowNum}: ${insErr.message}`);
        } else {
          success++;
        }
      }

      if (i % 10 === 0 || i === allRecords.length - 1) {
        setProgress(Math.min(100, Math.round(((i + 1) / allRecords.length) * 100)));
      }
    }

    if (merged > 0) {
      toast.success(`Merged ${merged} existing contacts (tags/projects updated)`);
    }

    setResult({ success, errors, skipped, dbErrors });
    setPhase('done');
  };

  const reset = () => {
    setPhase('upload');
    setFileName('');
    setCsvHeaders([]);
    setCsvRows([]);
    setMapping({});
    setProgress(0);
    setResult(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const previewRows = csvRows.slice(0, 5);
  const mappedHeaders = Object.entries(mapping)
    .filter(([, v]) => v !== '__skip__')
    .map(([idx, field]) => ({ idx: Number(idx), field }));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Data Import</CardTitle>
        </div>
        <CardDescription>Import contacts from a CSV file into the CRM</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {phase === 'upload' && (
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`
              border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
              ${isDragOver ? 'border-primary bg-primary/5' : 'border-border/60 hover:border-primary/40 hover:bg-muted/30'}
            `}
          >
            <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">Drop a CSV file here or click to browse</p>
            <p className="text-xs text-muted-foreground mt-1">Accepts .csv files only</p>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleInputChange} />
          </div>
        )}

        {phase === 'mapping' && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {fileName} — {csvRows.length} rows detected
                </p>
                <p className="text-xs text-muted-foreground">
                  {mappedCount} of {csvHeaders.length} columns mapped
                  {!hasFirstName && <span className="text-destructive ml-2">⚠ first_name required</span>}
                  {!hasLastName && <span className="text-destructive ml-2">⚠ last_name required</span>}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={reset}>Change File</Button>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/20 px-4 py-3">
              <div className="space-y-0.5">
                <Label htmlFor="merge-mode" className="text-sm font-medium">Merge with existing contacts</Label>
                <p className="text-xs text-muted-foreground">
                  Match by email, phone, or Lofty ID. Tags and projects will be merged into the existing lead — no duplicates created.
                </p>
              </div>
              <Switch id="merge-mode" checked={mergeMode} onCheckedChange={setMergeMode} />
            </div>

            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {csvHeaders.map((header, i) => (
                <div key={i} className="flex items-center gap-3 py-1.5 px-3 rounded-md bg-muted/20 border border-border/30">
                  <span className="text-sm font-medium text-foreground min-w-[140px] truncate">{header}</span>
                  <span className="text-muted-foreground text-xs">→</span>
                  <Select value={mapping[i] || '__skip__'} onValueChange={(v) => updateMapping(i, v)}>
                    <SelectTrigger className="h-8 text-xs flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CRM_FIELDS.map(f => (
                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {mapping[i] && mapping[i] !== '__skip__' && (
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-[10px]">
                      {ARRAY_FIELDS.has(mapping[i]) ? 'Array' : 'Mapped'}
                    </Badge>
                  )}
                </div>
              ))}
            </div>

            {mappedHeaders.length > 0 && previewRows.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Preview (first 5 rows)</p>
                <div className="overflow-x-auto rounded-md border border-border/40">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {mappedHeaders.map(({ field }) => (
                          <TableHead key={field} className="text-xs whitespace-nowrap">{field}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewRows.map((row, ri) => (
                        <TableRow key={ri}>
                          {mappedHeaders.map(({ idx, field }) => (
                            <TableCell key={field} className="text-xs py-1.5 max-w-[180px] truncate">
                              {row[idx] || '—'}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            <Button
              onClick={handleImport}
              disabled={!hasFirstName || !hasLastName || csvRows.length === 0}
              className="w-full sm:w-auto"
            >
              Import {csvRows.length} contacts
            </Button>
          </>
        )}

        {phase === 'importing' && (
          <div className="space-y-3 py-4">
            <p className="text-sm font-medium text-foreground">Importing contacts…</p>
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-muted-foreground">{progress}% complete</p>
          </div>
        )}

        {phase === 'done' && result && (
          <div className="space-y-4 py-4">
            <div className="flex items-start gap-3">
              {result.errors === 0 && result.skipped.length === 0 ? (
                <CheckCircle2 className="h-6 w-6 text-primary shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-6 w-6 text-destructive shrink-0 mt-0.5" />
              )}
              <div>
                <p className="text-sm font-medium text-foreground">
                  Imported {result.success} contacts successfully.
                  {result.errors > 0 && <span className="text-destructive"> {result.errors} database errors.</span>}
                  {result.skipped.length > 0 && <span className="text-muted-foreground"> {result.skipped.length} rows skipped.</span>}
                </p>
              </div>
            </div>

            {result.skipped.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Skipped rows (missing required name fields):</p>
                <div className="max-h-[150px] overflow-y-auto rounded-md border border-border/40 p-2 space-y-1">
                  {result.skipped.slice(0, 50).map((s, i) => (
                    <p key={i} className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Row {s.rowNum}:</span> {s.reason} — {s.data}
                    </p>
                  ))}
                  {result.skipped.length > 50 && (
                    <p className="text-xs text-muted-foreground">…and {result.skipped.length - 50} more</p>
                  )}
                </div>
              </div>
            )}

            {result.dbErrors.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-destructive">Database errors:</p>
                <div className="max-h-[150px] overflow-y-auto rounded-md border border-destructive/30 p-2 space-y-1">
                  {result.dbErrors.slice(0, 20).map((e, i) => (
                    <p key={i} className="text-xs text-destructive">{e}</p>
                  ))}
                  {result.dbErrors.length > 20 && (
                    <p className="text-xs text-muted-foreground">…and {result.dbErrors.length - 20} more</p>
                  )}
                </div>
              </div>
            )}

            <Button variant="outline" size="sm" onClick={reset}>Import Another File</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
