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

const CRM_FIELDS = [
  { value: '__skip__', label: '— Skip —' },
  { value: 'first_name', label: 'First Name' },
  { value: 'last_name', label: 'Last Name' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'phone_secondary', label: 'Phone (Secondary)' },
  { value: 'address', label: 'Address' },
  { value: 'city', label: 'City' },
  { value: 'province', label: 'Province' },
  { value: 'postal_code', label: 'Postal Code' },
  { value: 'source', label: 'Source' },
  { value: 'status', label: 'Status' },
  { value: 'project', label: 'Project' },
  { value: 'assigned_to', label: 'Assigned To' },
  { value: 'budget_min', label: 'Budget Min' },
  { value: 'budget_max', label: 'Budget Max' },
  { value: 'bedrooms_preferred', label: 'Bedrooms Preferred' },
  { value: 'language', label: 'Language' },
  { value: 'lead_type', label: 'Lead Type' },
  { value: 'notes', label: 'Notes' },
  { value: 'co_buyer_name', label: 'Co-Buyer Name' },
  { value: 'co_buyer_phone', label: 'Co-Buyer Phone' },
  { value: 'co_buyer_email', label: 'Co-Buyer Email' },
  { value: 'tags', label: 'Tags' },
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
  'assigned to': 'assigned_to',
  'assigned_to': 'assigned_to',
  'agent': 'assigned_to',
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
  'type': 'lead_type',
  'notes': 'notes',
  'co-buyer name': 'co_buyer_name',
  'co_buyer_name': 'co_buyer_name',
  'co-buyer phone': 'co_buyer_phone',
  'co_buyer_phone': 'co_buyer_phone',
  'co-buyer email': 'co_buyer_email',
  'co_buyer_email': 'co_buyer_email',
  'tags': 'tags',
};

type ImportPhase = 'upload' | 'mapping' | 'importing' | 'done';

interface ImportResult {
  success: number;
  errors: number;
}

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);
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
      // Auto-map headers
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

    for (let i = 0; i < csvRows.length; i += BATCH) {
      const batch = csvRows.slice(i, i + BATCH);
      const records = batch.map(row => {
        const record: Record<string, unknown> = {};
        Object.entries(mapping).forEach(([colIdx, field]) => {
          if (field === '__skip__') return;
          const val = row[Number(colIdx)]?.trim() ?? '';
          if (!val) return;
          if (field === 'budget_min' || field === 'budget_max') {
            const num = parseFloat(val.replace(/[^0-9.-]/g, ''));
            if (!isNaN(num)) record[field] = num;
          } else if (field === 'tags') {
            try {
              record[field] = JSON.parse(val);
            } catch {
              record[field] = val.split(',').map(t => t.trim()).filter(Boolean);
            }
          } else {
            record[field] = val;
          }
        });
        return record;
      }).filter(r => r.first_name && r.last_name);

      if (records.length > 0) {
        const { error } = await supabase.from('crm_contacts').insert(records as never[]);
        if (error) {
          errors += records.length;
        } else {
          success += records.length;
        }
      }

      setProgress(Math.min(100, Math.round(((i + batch.length) / csvRows.length) * 100)));
    }

    setResult({ success, errors });
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
        {/* Upload Phase */}
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
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleInputChange}
            />
          </div>
        )}

        {/* Mapping Phase */}
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

            {/* Mapping UI */}
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {csvHeaders.map((header, i) => (
                <div key={i} className="flex items-center gap-3 py-1.5 px-3 rounded-md bg-muted/20 border border-border/30">
                  <span className="text-sm font-medium text-foreground min-w-[140px] truncate">{header}</span>
                  <span className="text-muted-foreground text-xs">→</span>
                  <Select
                    value={mapping[i] || '__skip__'}
                    onValueChange={(v) => updateMapping(i, v)}
                  >
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
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-[10px]">Mapped</Badge>
                  )}
                </div>
              ))}
            </div>

            {/* Preview Table */}
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

        {/* Importing Phase */}
        {phase === 'importing' && (
          <div className="space-y-3 py-4">
            <p className="text-sm font-medium text-foreground">Importing contacts…</p>
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-muted-foreground">{progress}% complete</p>
          </div>
        )}

        {/* Done Phase */}
        {phase === 'done' && result && (
          <div className="space-y-4 py-4">
            <div className="flex items-start gap-3">
              {result.errors === 0 ? (
                <CheckCircle2 className="h-6 w-6 text-emerald-500 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-6 w-6 text-amber-500 shrink-0 mt-0.5" />
              )}
              <div>
                <p className="text-sm font-medium text-foreground">
                  Imported {result.success} contacts successfully.{' '}
                  {result.errors > 0 && <span className="text-destructive">{result.errors} errors.</span>}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Contacts are now available in the Leads tab.
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={reset}>Import Another File</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
