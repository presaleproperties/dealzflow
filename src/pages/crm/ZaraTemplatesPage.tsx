import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Mail, MessageSquare, MessageCircle, Plus, Trash2, Save, Search, ArrowLeft, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Pill } from '@/components/crm/shared/Pill';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

type Channel = 'email' | 'sms' | 'whatsapp';

interface BaseTpl {
  id: string;
  name: string;
  category: string | null;
  updated_at: string;
  channel: Channel;
  // channel-specific
  subject?: string | null;
  body: string;
  language?: string | null;
  is_active?: boolean;
}

const CHANNEL_META: Record<Channel, { label: string; icon: typeof Mail; table: string; tone: 'success' | 'info' | 'warning' }> = {
  email: { label: 'Email', icon: Mail, table: 'crm_email_templates', tone: 'success' },
  sms: { label: 'SMS', icon: MessageSquare, table: 'crm_sms_templates', tone: 'info' },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle, table: 'crm_whatsapp_templates', tone: 'warning' },
};

function newDraft(channel: Channel): BaseTpl {
  return {
    id: 'new',
    name: '',
    category: channel === 'whatsapp' ? 'utility' : 'general',
    updated_at: new Date().toISOString(),
    channel,
    subject: channel === 'email' ? '' : null,
    body: '',
    language: channel === 'whatsapp' ? 'en' : null,
    is_active: true,
  };
}

export default function ZaraTemplatesPage() {
  const qc = useQueryClient();
  const [channel, setChannel] = useState<Channel>('email');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<BaseTpl | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Fetch list for the active channel.
  const { data: templates = [], isLoading } = useQuery<BaseTpl[]>({
    queryKey: ['zara-templates', channel],
    queryFn: async () => {
      if (channel === 'email') {
        const { data, error } = await supabase
          .from('crm_email_templates')
          .select('id, name, subject, body_html, category, updated_at, is_active')
          .order('updated_at', { ascending: false })
          .limit(500);
        if (error) throw error;
        return (data ?? []).map((r: any) => ({
          id: r.id, name: r.name, subject: r.subject, body: r.body_html ?? '',
          category: r.category, updated_at: r.updated_at, is_active: r.is_active,
          channel: 'email' as Channel,
        }));
      }
      if (channel === 'sms') {
        const { data, error } = await supabase
          .from('crm_sms_templates')
          .select('id, name, body, category, updated_at, is_active')
          .order('updated_at', { ascending: false })
          .limit(500);
        if (error) throw error;
        return (data ?? []).map((r: any) => ({
          id: r.id, name: r.name, body: r.body,
          category: r.category, updated_at: r.updated_at, is_active: r.is_active,
          channel: 'sms' as Channel,
        }));
      }
      const { data, error } = await supabase
        .from('crm_whatsapp_templates')
        .select('id, name, body_text, category, language, updated_at')
        .order('updated_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id, name: r.name, body: r.body_text,
        category: r.category, language: r.language, updated_at: r.updated_at,
        channel: 'whatsapp' as Channel, is_active: true,
      }));
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) =>
      t.name.toLowerCase().includes(q) ||
      (t.subject ?? '').toLowerCase().includes(q) ||
      t.body.toLowerCase().includes(q) ||
      (t.category ?? '').toLowerCase().includes(q),
    );
  }, [templates, search]);

  // Hydrate draft when selection changes.
  useEffect(() => {
    if (!selectedId) { setDraft(null); return; }
    if (selectedId === 'new') { setDraft(newDraft(channel)); return; }
    const found = templates.find((t) => t.id === selectedId);
    if (found) setDraft({ ...found });
  }, [selectedId, templates, channel]);

  // Reset selection when switching channels.
  useEffect(() => { setSelectedId(null); setDraft(null); setSearch(''); }, [channel]);

  const isDirty = useMemo(() => {
    if (!draft) return false;
    if (draft.id === 'new') return !!(draft.name.trim() || draft.body.trim());
    const original = templates.find((t) => t.id === draft.id);
    if (!original) return false;
    return original.name !== draft.name
      || original.body !== draft.body
      || (original.subject ?? '') !== (draft.subject ?? '')
      || (original.category ?? '') !== (draft.category ?? '')
      || (original.language ?? '') !== (draft.language ?? '')
      || (original.is_active ?? true) !== (draft.is_active ?? true);
  }, [draft, templates]);

  const save = async () => {
    if (!draft) return;
    if (!draft.name.trim()) { toast.error('Name is required'); return; }
    if (!draft.body.trim()) { toast.error('Body is required'); return; }
    if (draft.channel === 'email' && !(draft.subject ?? '').trim()) {
      toast.error('Subject is required for email');
      return;
    }
    setSaving(true);
    try {
      if (draft.channel === 'email') {
        if (draft.id === 'new') {
          const { data, error } = await supabase.from('crm_email_templates').insert({
            name: draft.name.trim(),
            subject: draft.subject ?? '',
            body_html: draft.body,
            category: draft.category ?? 'general',
            is_active: draft.is_active ?? true,
            source: 'crm',
          } as any).select('id').single();
          if (error) throw error;
          setSelectedId((data as any).id);
        } else {
          const { error } = await supabase.from('crm_email_templates').update({
            name: draft.name.trim(),
            subject: draft.subject ?? '',
            body_html: draft.body,
            category: draft.category ?? 'general',
            is_active: draft.is_active ?? true,
          } as any).eq('id', draft.id);
          if (error) throw error;
        }
      } else if (draft.channel === 'sms') {
        if (draft.id === 'new') {
          const { data, error } = await supabase.from('crm_sms_templates').insert({
            name: draft.name.trim(),
            body: draft.body,
            category: draft.category ?? 'general',
            is_active: draft.is_active ?? true,
            channel: 'sms',
          } as any).select('id').single();
          if (error) throw error;
          setSelectedId((data as any).id);
        } else {
          const { error } = await supabase.from('crm_sms_templates').update({
            name: draft.name.trim(),
            body: draft.body,
            category: draft.category ?? 'general',
            is_active: draft.is_active ?? true,
          } as any).eq('id', draft.id);
          if (error) throw error;
        }
      } else {
        // whatsapp
        if (draft.id === 'new') {
          const { data, error } = await supabase.from('crm_whatsapp_templates').insert({
            name: draft.name.trim(),
            body_text: draft.body,
            category: draft.category ?? 'utility',
            language: draft.language ?? 'en',
            status: 'approved',
          } as any).select('id').single();
          if (error) throw error;
          setSelectedId((data as any).id);
        } else {
          const { error } = await supabase.from('crm_whatsapp_templates').update({
            name: draft.name.trim(),
            body_text: draft.body,
            category: draft.category ?? 'utility',
            language: draft.language ?? 'en',
          } as any).eq('id', draft.id);
          if (error) throw error;
        }
      }
      toast.success('Template saved');
      qc.invalidateQueries({ queryKey: ['zara-templates', draft.channel] });
    } catch (e: any) {
      toast.error(e?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!draft || draft.id === 'new') return;
    if (!confirm(`Delete "${draft.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const { table } = CHANNEL_META[draft.channel];
      const { error } = await supabase.from(table as any).delete().eq('id', draft.id);
      if (error) throw error;
      toast.success('Template deleted');
      setSelectedId(null);
      qc.invalidateQueries({ queryKey: ['zara-templates', draft.channel] });
    } catch (e: any) {
      toast.error(e?.message ?? 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <header className="px-4 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/crm/zara" className="p-1 rounded-md hover:bg-muted/60 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-4 h-4 text-primary shrink-0" />
            <h1 className="text-[15px] font-semibold tracking-tight">Zara templates</h1>
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-0.5">
          {(Object.keys(CHANNEL_META) as Channel[]).map((c) => {
            const meta = CHANNEL_META[c];
            const Icon = meta.icon;
            return (
              <button
                key={c}
                onClick={() => setChannel(c)}
                className={cn(
                  'inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[12px] font-medium transition-colors',
                  channel === c ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {meta.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* Two-pane body */}
      <div className="flex-1 min-h-0 flex">
        {/* Left rail — list */}
        <aside className="w-[300px] xl:w-[340px] shrink-0 border-r border-border bg-muted/20 flex flex-col min-h-0">
          <div className="p-2.5 space-y-2 border-b border-border/60">
            <Button
              size="sm"
              onClick={() => setSelectedId('new')}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              New {CHANNEL_META[channel].label.toLowerCase()} template
            </Button>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, body, category…"
                className="h-8 pl-7 text-[12px]"
              />
            </div>
            <div className="text-[10.5px] text-muted-foreground px-1">
              {filtered.length} of {templates.length}
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-1.5 space-y-0.5">
            {isLoading && (
              <div className="flex items-center justify-center text-[12px] text-muted-foreground py-6 gap-2">
                <Loader2 className="w-3 h-3 animate-spin" /> Loading…
              </div>
            )}
            {!isLoading && filtered.length === 0 && (
              <div className="text-center text-[11.5px] text-muted-foreground py-6 px-3">
                No templates yet. Hit "New" to create one.
              </div>
            )}
            {filtered.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className={cn(
                  'w-full text-left px-2 py-2 rounded-md transition-colors',
                  selectedId === t.id ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted/60 border border-transparent',
                )}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[12.5px] font-medium truncate flex-1">{t.name || '(untitled)'}</span>
                  {t.is_active === false && <Pill size="sm" tone="muted">off</Pill>}
                </div>
                {t.subject && (
                  <div className="text-[11px] text-muted-foreground truncate">{t.subject}</div>
                )}
                <div className="flex items-center gap-1.5 mt-0.5">
                  {t.category && <Pill size="sm" tone="neutral">{t.category}</Pill>}
                  <span className="text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(t.updated_at), { addSuffix: true })}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* Right — editor */}
        <section className="flex-1 min-w-0 flex flex-col">
          {!draft ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
              <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-3">
                <Sparkles className="w-6 h-6 text-primary" />
              </div>
              <h2 className="text-[15px] font-semibold tracking-tight mb-1">Pick a template to edit</h2>
              <p className="text-[12.5px] text-muted-foreground max-w-sm">
                These templates power Zara's <code className="px-1 bg-muted/60 rounded">draft_email</code>,{' '}
                <code className="px-1 bg-muted/60 rounded">draft_sms</code>, and{' '}
                <code className="px-1 bg-muted/60 rounded">draft_whatsapp</code> tools. Use{' '}
                <code className="px-1 bg-muted/60 rounded">{'{{first_name}}'}</code>,{' '}
                <code className="px-1 bg-muted/60 rounded">{'{{project_name}}'}</code> for merge fields.
              </p>
            </div>
          ) : (
            <Editor
              draft={draft}
              setDraft={setDraft}
              isDirty={isDirty}
              saving={saving}
              deleting={deleting}
              onSave={save}
              onDelete={remove}
              onCancel={() => setSelectedId(null)}
            />
          )}
        </section>
      </div>
    </div>
  );
}

function Editor({
  draft, setDraft, isDirty, saving, deleting, onSave, onDelete, onCancel,
}: {
  draft: BaseTpl;
  setDraft: (d: BaseTpl) => void;
  isDirty: boolean;
  saving: boolean;
  deleting: boolean;
  onSave: () => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const meta = CHANNEL_META[draft.channel];
  const Icon = meta.icon;
  const isNew = draft.id === 'new';
  const charCount = draft.body.length;
  const smsSegments = Math.max(1, Math.ceil(charCount / 160));

  return (
    <>
      {/* Editor header */}
      <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Pill size="sm" tone={meta.tone}><Icon className="w-2.5 h-2.5 mr-0.5 inline" /> {meta.label}</Pill>
          <span className="text-[13px] font-semibold tracking-tight truncate">
            {isNew ? `New ${meta.label.toLowerCase()} template` : draft.name || '(untitled)'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {!isNew && (
            <Button size="sm" variant="ghost" onClick={onDelete} disabled={deleting || saving} className="text-destructive hover:text-destructive hover:bg-destructive/10">
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>Close</Button>
          <Button size="sm" onClick={onSave} disabled={!isDirty || saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Save className="w-3.5 h-3.5 mr-1.5" />
            {saving ? 'Saving…' : isNew ? 'Create' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Editor form */}
      <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4 max-w-3xl">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-[11px]">Name *</Label>
            <Input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="e.g. Floorplan request follow-up"
              className="h-9 text-[13px]"
            />
          </div>
          <div>
            <Label className="text-[11px]">Category</Label>
            <Input
              value={draft.category ?? ''}
              onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              placeholder={draft.channel === 'whatsapp' ? 'utility' : 'general'}
              className="h-9 text-[13px]"
            />
          </div>
        </div>

        {draft.channel === 'email' && (
          <div>
            <Label className="text-[11px]">Subject *</Label>
            <Input
              value={draft.subject ?? ''}
              onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
              placeholder="{{first_name}}, here's the floorplan you asked for"
              className="h-9 text-[13px]"
            />
          </div>
        )}

        {draft.channel === 'whatsapp' && (
          <div className="w-32">
            <Label className="text-[11px]">Language</Label>
            <Input
              value={draft.language ?? 'en'}
              onChange={(e) => setDraft({ ...draft, language: e.target.value })}
              placeholder="en"
              className="h-9 text-[13px]"
            />
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-1">
            <Label className="text-[11px]">Body *</Label>
            <span className="text-[10.5px] text-muted-foreground tabular-nums">
              {charCount} chars
              {draft.channel === 'sms' && ` · ${smsSegments} segment${smsSegments === 1 ? '' : 's'}`}
            </span>
          </div>
          <Textarea
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            rows={draft.channel === 'email' ? 14 : 8}
            className={cn('text-[13px]', draft.channel === 'email' && 'font-mono')}
            placeholder={
              draft.channel === 'email'
                ? '<p>Hi {{first_name}},</p>\n<p>Here\'s the latest on {{project_name}}…</p>'
                : 'Hi {{first_name}}, quick update on {{project_name}}…'
            }
          />
          <p className="text-[10.5px] text-muted-foreground mt-1">
            Merge fields: <code className="px-1 bg-muted/60 rounded">{'{{first_name}}'}</code>,{' '}
            <code className="px-1 bg-muted/60 rounded">{'{{last_name}}'}</code>,{' '}
            <code className="px-1 bg-muted/60 rounded">{'{{project_name}}'}</code>,{' '}
            <code className="px-1 bg-muted/60 rounded">{'{{agent_name}}'}</code>
            {draft.channel === 'email' && <> · HTML allowed</>}
          </p>
        </div>

        {(draft.channel === 'email' || draft.channel === 'sms') && (
          <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <input
              type="checkbox"
              checked={draft.is_active ?? true}
              onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
              className="rounded border-border"
            />
            Active (visible to Zara and the composer)
          </label>
        )}
      </div>
    </>
  );
}
