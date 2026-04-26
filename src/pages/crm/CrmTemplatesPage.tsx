import { useMemo, useState } from 'react';
import { Mail, MessageSquare, Plus, Search, FileText, Star, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  useEmailTemplates,
  useSoftDeleteEmailTemplate,
  useToggleFavorite,
  type EmailTemplate,
} from '@/hooks/useEmailTemplates';
import { TemplateEditor } from '@/components/crm/templates/TemplateEditor';
import { useSmsTemplates, type MessagingChannel } from '@/hooks/useSms';
import { TemplatesTab as MessagingTemplatesTab } from './CrmSmsCenterPage';

type Channel = 'sms' | 'whatsapp';

export default function CrmTemplatesPage() {
  const [tab, setTab] = useState<'email' | 'messaging'>('email');
  const [channel, setChannel] = useState<Channel>('sms');

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="border-b border-border bg-gradient-to-br from-card via-card to-muted/30 px-4 sm:px-6 py-5 shrink-0">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center shrink-0">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Templates</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Create and manage email, SMS &amp; WhatsApp templates in one place.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5">
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'email' | 'messaging')} className="space-y-4">
            <TabsList className="grid w-full grid-cols-2 max-w-md">
              <TabsTrigger value="email" className="gap-1.5">
                <Mail className="w-3.5 h-3.5" /> Email
              </TabsTrigger>
              <TabsTrigger value="messaging" className="gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" /> Messaging
              </TabsTrigger>
            </TabsList>

            <TabsContent value="email" className="mt-0">
              <EmailTemplatesPanel />
            </TabsContent>

            <TabsContent value="messaging" className="mt-0 space-y-3">
              <ChannelToggle channel={channel} onChange={setChannel} />
              <MessagingPanel channel={channel} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

// ===================================================================
// Email panel
// ===================================================================
function EmailTemplatesPanel() {
  const { data: templates = [], isLoading } = useEmailTemplates();
  const softDelete = useSoftDeleteEmailTemplate();
  const toggleFav = useToggleFavorite();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) =>
      `${t.name} ${t.subject ?? ''} ${t.category}`.toLowerCase().includes(q),
    );
  }, [templates, search]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search email templates…"
            className="h-9 pl-8 text-sm"
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{filtered.length} template{filtered.length === 1 ? '' : 's'}</span>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" /> New email template
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Loading templates…</Card>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center space-y-2">
          <Mail className="w-7 h-7 mx-auto opacity-40" />
          <div className="text-sm text-muted-foreground">
            {search ? 'No templates match your search.' : 'No email templates yet.'}
          </div>
          {!search && (
            <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Create your first template
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((t) => (
            <Card key={t.id} className="p-3 group hover:border-primary/40 transition-colors">
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm truncate flex items-center gap-1.5">
                    {t.is_favorite && <Star className="w-3 h-3 fill-amber-400 text-amber-400 shrink-0" />}
                    {t.name}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
                    {t.category} · {t.source}
                  </div>
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    size="icon" variant="ghost" className="h-6 w-6"
                    onClick={() => toggleFav.mutate({ id: t.id, is_favorite: !t.is_favorite })}
                    title={t.is_favorite ? 'Unfavorite' : 'Favorite'}
                  >
                    <Star className={cn('w-3 h-3', t.is_favorite && 'fill-amber-400 text-amber-400')} />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditing(t)}>
                    <Pencil className="w-3 h-3" />
                  </Button>
                  <Button
                    size="icon" variant="ghost" className="h-6 w-6 text-destructive"
                    onClick={() => { if (confirm(`Archive "${t.name}"?`)) softDelete.mutate(t.id); }}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
              {t.subject && (
                <div className="text-xs text-foreground/80 truncate mb-1.5">
                  <span className="text-muted-foreground">Subject: </span>{t.subject}
                </div>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                {(t.project_tags ?? []).slice(0, 3).map((tag) => (
                  <Badge key={tag} variant="outline" className="text-[9px] py-0 px-1.5 h-4">{tag}</Badge>
                ))}
              </div>
              <div className="text-[10px] text-muted-foreground mt-2">
                Used {t.times_used}× · Updated {new Date(t.updated_at).toLocaleDateString()}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={creating || !!editing} onOpenChange={(o) => { if (!o) { setEditing(null); setCreating(false); } }}>
        <DialogContent className="max-w-6xl w-[96vw] max-h-[92vh] overflow-y-auto p-4">
          <TemplateEditor
            template={editing}
            onClose={() => { setEditing(null); setCreating(false); }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ===================================================================
// Messaging panel (SMS / WhatsApp)
// ===================================================================
function MessagingPanel({ channel }: { channel: Channel }) {
  const { data: templates = [], isLoading } = useSmsTemplates();
  const channelTemplates = useMemo(
    () => templates.filter((t: any) => (t.channel || 'sms') === channel),
    [templates, channel],
  );

  if (isLoading) {
    return <Card className="p-8 text-center text-sm text-muted-foreground">Loading templates…</Card>;
  }

  return <MessagingTemplatesTab channel={channel as MessagingChannel} templates={channelTemplates} />;
}

// ===================================================================
// Channel toggle
// ===================================================================
function ChannelToggle({ channel, onChange }: { channel: Channel; onChange: (c: Channel) => void }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-0.5">
      <button
        onClick={() => onChange('sms')}
        className={cn(
          'rounded-md px-3 py-1.5 text-xs font-semibold transition-all flex items-center gap-1.5',
          channel === 'sms' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <MessageSquare className="w-3.5 h-3.5" /> SMS / MMS
      </button>
      <button
        onClick={() => onChange('whatsapp')}
        className={cn(
          'rounded-md px-3 py-1.5 text-xs font-semibold transition-all flex items-center gap-1.5',
          channel === 'whatsapp' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <span className="w-2 h-2 rounded-full bg-emerald-500" /> WhatsApp
      </button>
    </div>
  );
}
