import { useState, useRef } from 'react';
import { Upload, Eye, Play, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Progress } from '@/components/ui/progress';

interface ParsedUpdate {
  lofty_id: string;
  source: string;
}

function normalizeSource(raw: string): string | null {
  if (!raw) return null;
  const lower = raw.trim().toLowerCase();

  if (lower === 'other') return null; // skip
  if (lower === 'facebook ads' || lower === 'facebook') return 'Facebook Ad';
  if (lower === 'instagram') return 'Instagram';
  if (lower === 'tiktok' || lower === 'tiktok ads') return 'TikTok';
  if (lower.includes('whatsapp') || lower.includes('whats app')) return 'WhatsApp';
  if (lower === 'csv import') return 'Lofty Import';
  if (lower.includes('presale') || lower.includes('lead|presale')) return 'presaleproperties.com';
  if (lower.includes('jerichopresale') || lower.includes('presalewithuzair') || lower.includes('vancouverpresaleacademy')) return 'presaleproperties.com';
  if (lower.includes('40listings')) return 'Website Form';
  if (lower.includes('referral')) return 'Referral';
  if (lower.includes('calendly')) return 'Calendly';

  return 'Website Form';
}

function parseCSV(text: string): { loftyId: string; rawSource: string }[] {
  const lines = text.split('\n');
  if (lines.length < 2) return [];

  // Find header indices
  const header = lines[0];
  const headerCols = parseCSVLine(header);
  const leadIdIdx = headerCols.findIndex(h => h.trim().toLowerCase() === 'lead id');
  const sourceIdx = headerCols.findIndex(h => h.trim().toLowerCase() === 'source');

  if (leadIdIdx === -1 || sourceIdx === -1) return [];

  const results: { loftyId: string; rawSource: string }[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseCSVLine(line);
    const loftyId = cols[leadIdIdx]?.trim();
    const rawSource = cols[sourceIdx]?.trim();
    if (loftyId && rawSource) {
      results.push({ loftyId, rawSource });
    }
  }
  return results;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

export default function SourceBackfillSection() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [updates, setUpdates] = useState<ParsedUpdate[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [previewed, setPreviewed] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<{ totalUpdated: number; bySource: Record<string, number> } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setPreviewed(false);
    setUpdates([]);
    setSummary({});
    setResults(null);
  };

  const handlePreview = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { toast.error('Please select a CSV file'); return; }

    const text = await file.text();
    const rows = parseCSV(text);

    const parsed: ParsedUpdate[] = [];
    const counts: Record<string, number> = {};

    for (const { loftyId, rawSource } of rows) {
      const normalized = normalizeSource(rawSource);
      if (!normalized) continue;
      parsed.push({ lofty_id: loftyId, source: normalized });
      counts[normalized] = (counts[normalized] || 0) + 1;
    }

    setUpdates(parsed);
    setSummary(counts);
    setPreviewed(true);
    toast.success(`Parsed ${parsed.length} leads to update`);
  };

  const handleRun = async () => {
    setConfirmOpen(false);
    setRunning(true);
    setProgress(10);

    try {
      const CHUNK = 2000;
      let totalUpdated = 0;
      const combinedBySource: Record<string, number> = {};

      for (let i = 0; i < updates.length; i += CHUNK) {
        const chunk = updates.slice(i, i + CHUNK);
        setProgress(Math.round(10 + (i / updates.length) * 80));

        const { data, error } = await supabase.functions.invoke('backfill-sources', {
          body: { updates: chunk },
        });

        if (error) throw error;
        if (data?.totalUpdated) totalUpdated += data.totalUpdated;
        if (data?.bySource) {
          for (const [src, cnt] of Object.entries(data.bySource)) {
            combinedBySource[src] = (combinedBySource[src] || 0) + (cnt as number);
          }
        }
      }

      setProgress(100);
      setResults({ totalUpdated, bySource: combinedBySource });
      toast.success(`Updated ${totalUpdated.toLocaleString()} leads`);
    } catch (err) {
      toast.error(`Backfill failed: ${(err as Error).message}`);
    } finally {
      setRunning(false);
    }
  };

  const sortedSummary = Object.entries(summary).sort((a, b) => b[1] - a[1]);
  const totalLeads = updates.length;

  return (
    <Card className="border-border/40">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Upload className="h-4 w-4 text-primary" />
          <h4 className="text-sm font-semibold text-foreground">Backfill Lead Sources from CSV</h4>
        </div>

        <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-xs text-foreground/70">
            This will update the <strong>source</strong> field for leads that currently have "Manual Entry" and have a matching Lofty ID. The original CSV with correct source data is required.
          </p>
        </div>

        {/* File Upload */}
        <div className="flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="hidden"
          />
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-3 w-3 mr-1.5" />
            {fileName || 'Choose CSV File'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={handlePreview}
            disabled={!fileName || running}
          >
            <Eye className="h-3 w-3 mr-1.5" />
            Preview
          </Button>
        </div>

        {/* Preview Summary */}
        {previewed && sortedSummary.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">
                {totalLeads.toLocaleString()} leads to update
              </span>
              <Badge variant="outline" className="text-[10px]">
                {sortedSummary.length} sources
              </Badge>
            </div>

            <div className="overflow-x-auto rounded-md border border-border/40 max-h-[200px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[11px] px-3">Source</TableHead>
                    <TableHead className="text-[11px] px-3 text-right">Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedSummary.map(([source, count]) => (
                    <TableRow key={source}>
                      <TableCell className="text-[11px] px-3 py-1.5 font-medium">{source}</TableCell>
                      <TableCell className="text-[11px] px-3 py-1.5 text-right text-muted-foreground">
                        {count.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <Button
              size="sm"
              className="h-8 text-xs w-full"
              disabled={running}
              onClick={() => setConfirmOpen(true)}
            >
              <Play className="h-3 w-3 mr-1.5" />
              Run Backfill ({totalLeads.toLocaleString()} leads)
            </Button>
          </div>
        )}

        {previewed && sortedSummary.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-2">
            No matching leads found in the CSV. Make sure the file has "Lead Id" and "Source" columns.
          </p>
        )}

        {/* Progress */}
        {running && (
          <div className="space-y-2">
            <Progress value={progress} className="h-2" />
            <p className="text-[11px] text-muted-foreground text-center">
              Updating sources… {progress}%
            </p>
          </div>
        )}

        {/* Results */}
        {results && (
          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span className="text-sm font-medium text-foreground">
                Backfill Complete — {results.totalUpdated.toLocaleString()} leads updated
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1">
              {Object.entries(results.bySource).sort((a, b) => b[1] - a[1]).map(([src, cnt]) => (
                <div key={src} className="text-[11px] text-foreground/70">
                  {src}: <span className="font-medium">{(cnt as number).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Confirm Dialog */}
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Run Source Backfill?</AlertDialogTitle>
              <AlertDialogDescription>
                This will update the source field for {totalLeads.toLocaleString()} leads that currently have "Manual Entry" and a matching Lofty ID. This action cannot be easily undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleRun}>Run Backfill</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
