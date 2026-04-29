import { useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Search, Pencil, Eye, Users, Upload, Loader2, FileText, Map, DollarSign, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCrmProjects, useUpdateCrmProject, type CrmProject } from '@/hooks/useCrmProjects';
import { toast } from 'sonner';

const STATUS_OPTIONS = [
  { value: 'presale', label: 'Presale' },
  { value: 'under_construction', label: 'Under Construction' },
  { value: 'move_in_ready', label: 'Move-in Ready' },
  { value: 'completed', label: 'Completed' },
  { value: 'sold_out', label: 'Sold Out' },
];

const TYPE_OPTIONS = [
  { value: 'condo', label: 'Condo' },
  { value: 'townhome', label: 'Townhome' },
  { value: 'detached', label: 'Detached' },
  { value: 'mixed', label: 'Mixed' },
];

export default function ProjectsManagerSection() {
  const { data: projects = [], isLoading } = useCrmProjects();
  const update = useUpdateCrmProject();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<CrmProject | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects.slice(0, 100);
    return projects
      .filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.city ?? '').toLowerCase().includes(q) ||
        (p.developer ?? '').toLowerCase().includes(q)
      )
      .slice(0, 100);
  }, [projects, search]);

  return (
    <Card className="rounded-[10px] lg:rounded-xl">
      <CardHeader className="px-3 sm:px-6">
        <CardTitle className="text-base sm:text-lg">Project Library</CardTitle>
        <p className="text-xs text-muted-foreground">
          {projects.length} projects · auto-pulled from presale-properties traffic. Click any row to enrich it with city, developer, status, price & completion date.
        </p>
      </CardHeader>
      <CardContent className="px-3 sm:px-6 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects, city, developer…"
            className="pl-9 h-10"
          />
        </div>

        {isLoading && <div className="py-6 text-center text-sm text-muted-foreground">Loading…</div>}

        <div className="rounded-lg border border-border/60 divide-y divide-border/40 overflow-hidden">
          {filtered.map((p) => (
            <button
              key={p.id}
              onClick={() => setEditing(p)}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 transition-colors text-left"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-foreground truncate">{p.name}</span>
                  {p.status && (
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground border border-border/60 px-1.5 py-0.5 rounded">
                      {p.status.replace(/_/g, ' ')}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                  {p.city && <span>{p.city}{p.neighborhood ? ` · ${p.neighborhood}` : ''}</span>}
                  {p.developer && <span>· {p.developer}</span>}
                </div>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground shrink-0">
                <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> {p.view_count}</span>
                <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {p.lead_count}</span>
                <Pencil className="h-3.5 w-3.5 opacity-50" />
              </div>
            </button>
          ))}
          {!isLoading && filtered.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">No projects match your search.</div>
          )}
        </div>
      </CardContent>

      <ProjectEditSheet
        project={editing}
        onClose={() => setEditing(null)}
        onSave={async (patch) => {
          if (!editing) return;
          try {
            await update.mutateAsync({ id: editing.id, ...patch });
            toast.success('Project updated');
            setEditing(null);
          } catch (e: any) {
            toast.error(e?.message || 'Update failed');
          }
        }}
        saving={update.isPending}
      />
    </Card>
  );
}

interface SheetProps {
  project: CrmProject | null;
  onClose: () => void;
  onSave: (patch: Partial<CrmProject>) => void;
  saving: boolean;
}

function ProjectEditSheet({ project, onClose, onSave, saving }: SheetProps) {
  const [form, setForm] = useState<Partial<CrmProject>>({});

  // Reset when project changes
  useMemo(() => {
    setForm({
      city: project?.city ?? '',
      neighborhood: project?.neighborhood ?? '',
      developer: project?.developer ?? '',
      property_type: project?.property_type ?? '',
      status: project?.status ?? '',
      price_from: project?.price_from ?? null,
      price_to: project?.price_to ?? null,
      completion_date: project?.completion_date ?? '',
      website_url: project?.website_url ?? '',
      notes: project?.notes ?? '',
    });
  }, [project?.id]);

  if (!project) return null;

  return (
    <Sheet open={!!project} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base">{project.name}</SheetTitle>
          <p className="text-xs text-muted-foreground">{project.view_count} views · {project.lead_count} interested leads</p>
        </SheetHeader>

        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="City">
              <Input value={form.city ?? ''} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Surrey" />
            </Field>
            <Field label="Neighborhood">
              <Input value={form.neighborhood ?? ''} onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} placeholder="Fleetwood" />
            </Field>
          </div>

          <Field label="Developer">
            <Input value={form.developer ?? ''} onChange={(e) => setForm({ ...form, developer: e.target.value })} placeholder="e.g. Polygon" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Property Type">
              <Select value={form.property_type ?? ''} onValueChange={(v) => setForm({ ...form, property_type: v })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={form.status ?? ''} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Price From ($)">
              <Input
                type="number"
                value={form.price_from ?? ''}
                onChange={(e) => setForm({ ...form, price_from: e.target.value ? Number(e.target.value) : null })}
                placeholder="450000"
              />
            </Field>
            <Field label="Price To ($)">
              <Input
                type="number"
                value={form.price_to ?? ''}
                onChange={(e) => setForm({ ...form, price_to: e.target.value ? Number(e.target.value) : null })}
                placeholder="900000"
              />
            </Field>
          </div>

          <Field label="Completion Date">
            <Input type="date" value={form.completion_date ?? ''} onChange={(e) => setForm({ ...form, completion_date: e.target.value })} />
          </Field>

          <Field label="Website">
            <Input value={form.website_url ?? ''} onChange={(e) => setForm({ ...form, website_url: e.target.value })} placeholder="https://…" />
          </Field>

          <Field label="Notes">
            <Input value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Internal notes" />
          </Field>

          <ProjectAssetsBlock project={project} />

          <div className="flex justify-end gap-2 pt-2 sticky bottom-0 bg-background pb-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={() => onSave(form)} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

// ───────── Project assets uploader ─────────────────────────────────────────
type AssetKind = 'brochure' | 'floor_plans' | 'pricing';
const ASSET_META: { kind: AssetKind; label: string; urlField: string; nameField: string; icon: any }[] = [
  { kind: 'brochure',    label: 'Brochure',      urlField: 'brochure_url',    nameField: 'brochure_filename',    icon: FileText },
  { kind: 'floor_plans', label: 'Floor Plans',   urlField: 'floor_plans_url', nameField: 'floor_plans_filename', icon: Map },
  { kind: 'pricing',     label: 'Pricing Sheet', urlField: 'pricing_url',     nameField: 'pricing_filename',     icon: DollarSign },
];

function ProjectAssetsBlock({ project }: { project: CrmProject }) {
  const [busy, setBusy] = useState<AssetKind | null>(null);
  const [version, setVersion] = useState(0);

  const upload = async (kind: AssetKind, file: File) => {
    if (!project.slug) {
      toast.error('Project has no slug yet — save it first.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) { toast.error('Max 20 MB.'); return; }
    setBusy(kind);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_');
    const path = `${project.slug}/${kind}/${Date.now()}-${safeName}`;
    const { error: upErr } = await supabase.storage
      .from('crm-project-assets')
      .upload(path, file, { upsert: true, contentType: file.type || 'application/pdf' });
    if (upErr) { setBusy(null); toast.error(upErr.message); return; }
    const { data: signed } = await supabase.storage
      .from('crm-project-assets')
      .createSignedUrl(path, 60 * 60 * 24 * 365);
    const url = signed?.signedUrl;
    if (!url) { setBusy(null); toast.error('Could not sign URL.'); return; }
    const meta = ASSET_META.find(m => m.kind === kind)!;
    const { error } = await (supabase.from('crm_projects') as any).update({
      [meta.urlField]: url,
      [meta.nameField]: file.name,
    }).eq('id', project.id);
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`${meta.label} uploaded`);
    setVersion(v => v + 1);
  };

  const remove = async (kind: AssetKind) => {
    const meta = ASSET_META.find(m => m.kind === kind)!;
    setBusy(kind);
    const { error } = await (supabase.from('crm_projects') as any).update({
      [meta.urlField]: null,
      [meta.nameField]: null,
    }).eq('id', project.id);
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`${meta.label} removed`);
    setVersion(v => v + 1);
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Email Attachments</Label>
      <div className="rounded-md border border-border divide-y divide-border" key={version}>
        {ASSET_META.map(({ kind, label, urlField, nameField, icon: Icon }) => {
          const url = (project as any)[urlField] as string | null;
          const name = (project as any)[nameField] as string | null;
          return (
            <AssetUploadRow
              key={kind}
              icon={<Icon className="w-3.5 h-3.5" />}
              label={label}
              url={url}
              filename={name}
              busy={busy === kind}
              onPickFile={(f) => upload(kind, f)}
              onRemove={url ? () => remove(kind) : undefined}
            />
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Available in the Send Project dialog as toggles. Falls back to Presale Properties data when nothing is uploaded.
      </p>
    </div>
  );
}

function AssetUploadRow({
  icon, label, url, filename, busy, onPickFile, onRemove,
}: {
  icon: React.ReactNode;
  label: string;
  url: string | null;
  filename: string | null;
  busy: boolean;
  onPickFile: (file: File) => void;
  onRemove?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <div className="text-muted-foreground shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" className="text-[11px] text-muted-foreground truncate block hover:text-foreground">
            {filename || 'View file'}
          </a>
        ) : (
          <div className="text-[11px] text-muted-foreground">No file uploaded</div>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPickFile(f);
            e.target.value = '';
          }}
        />
        <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
          <span className="ml-1">{url ? 'Replace' : 'Upload'}</span>
        </Button>
        {onRemove && (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={onRemove} disabled={busy}>
            <Trash2 className="w-3 h-3" />
          </Button>
        )}
      </div>
    </div>
  );
}
