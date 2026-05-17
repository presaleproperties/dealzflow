import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pill } from '@/components/crm/shared/Pill';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

type Draft = {
  id: string;
  contact_id: string;
  channel: string;
  inbound_text: string;
  inbound_at: string;
  draft_text: string;
  draft_subject: string | null;
  intent: string | null;
  confidence: number | null;
  guardrails_hit: string[];
  status: string;
  created_at: string;
  assigned_to: string | null;
  consulted_sources: any;
};

type Settings = { mode: 'off' | 'sandbox' | 'live'; test_phone_numbers: string[] };

export default function ZaraQueuePage() {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [testInboundFor, setTestInboundFor] = useState<string | null>(null);
  const [testInboundText, setTestInboundText] = useState("What's the price?");
  const [saveTplDraft, setSaveTplDraft] = useState<Draft | null>(null);
  const [tplTitle, setTplTitle] = useState('');
  const [tplSubject, setTplSubject] = useState('');
  const [tplBody, setTplBody] = useState('');
  const [tplSaving, setTplSaving] = useState(false);
  const [fChannel, setFChannel] = useState<'all' | 'email' | 'sms' | 'whatsapp'>('all');
  const [fSource, setFSource] = useState<'all' | 'K' | 'W' | 'P' | 'none'>('all');
  const [fTag, setFTag] = useState<string>('all');

  const { data: settings } = useQuery({
    queryKey: ['zara-settings'],
    queryFn: async (): Promise<Settings> => {
      const { data } = await supabase.from('zara_settings').select('mode, test_phone_numbers').eq('id', 1).maybeSingle();
      return (data as Settings) ?? { mode: 'sandbox', test_phone_numbers: [] };
    },
  });

  const { data: drafts = [] } = useQuery({
    queryKey: ['zara-drafts'],
    queryFn: async (): Promise<Draft[]> => {
      const { data } = await supabase
        .from('zara_suggested_replies')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      return (data as Draft[]) ?? [];
    },
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ['zara-queue-contacts', drafts.map((d) => d.contact_id).join(',')],
    enabled: drafts.length > 0,
    queryFn: async () => {
      const ids = Array.from(new Set(drafts.map((d) => d.contact_id)));
      const { data } = await supabase.from('crm_contacts').select('id, first_name, last_name, status, tags, phone').in('id', ids);
      return data ?? [];
    },
  });
  const contactMap = useMemo(() => {
    const m = new Map<string, any>();
    contacts.forEach((c: any) => m.set(c.id, c));
    return m;
  }, [contacts]);

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel('zara-queue-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'zara_suggested_replies' }, () => {
        qc.invalidateQueries({ queryKey: ['zara-drafts'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const pending = drafts.filter((d) => d.status === 'pending');

  const banner = (() => {
    const m = settings?.mode ?? 'sandbox';
    if (m === 'off') return { text: 'Zara is OFF — no drafts will be created.', cls: 'bg-muted text-muted-foreground' };
    if (m === 'sandbox') return { text: 'Sandbox mode — drafts only for zara_test_contact tagged contacts will actually send.', cls: 'bg-warning/15 text-warning' };
    return { text: 'Zara is LIVE — drafts route to assigned agents via WhatsApp.', cls: 'bg-success/15 text-success' };
  })();

  const approve = async (d: Draft, finalText: string) => {
    const { data: user } = await supabase.auth.getUser();
    const { data, error } = await supabase.functions.invoke('zara-execute-send', {
      body: { draftId: d.id, finalText, decidedBy: user.user?.id, decidedVia: 'crm_button' },
    });
    if (error) { toast.error(error.message); return; }
    const res = data as any;
    if (res?.blocked) toast.warning(`Sandbox: would send to ${res.would_send_to ?? '(no phone)'}`);
    else toast.success('Sent');
    qc.invalidateQueries({ queryKey: ['zara-drafts'] });
  };

  const reject = async (id: string, reason: string) => {
    const { data: user } = await supabase.auth.getUser();
    const draft = drafts.find((x) => x.id === id);
    if (!draft) return;
    await supabase.from('zara_suggested_replies').update({ status: 'rejected' }).eq('id', id);
    await supabase.from('zara_approval_decisions').insert({
      draft_id: id,
      contact_id: draft.contact_id,
      decision: 'reject',
      original_text: draft.draft_text,
      reject_reason: reason,
      decided_by: user.user?.id,
      decided_via: 'crm_button',
    } as any);
    qc.invalidateQueries({ queryKey: ['zara-drafts'] });
    toast.success('Rejected');
  };

  const snooze = async (id: string) => {
    const until = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
    await supabase.from('zara_suggested_replies').update({ status: 'snoozed', expires_at: until }).eq('id', id);
    qc.invalidateQueries({ queryKey: ['zara-drafts'] });
    toast.success('Snoozed 4h');
  };

  const seedTestContacts = async () => {
    const phones = settings?.test_phone_numbers ?? [];
    if (phones.length === 0) {
      toast.error('Set test_phone_numbers in /crm/settings → Zara mode first');
      return;
    }
    const rows = phones.slice(0, 3).map((phone, i) => ({
      first_name: 'Zara Test',
      last_name: `Lead ${i + 1}`,
      phone,
      tags: ['zara_test_contact'],
      status: 'New Lead',
      zara_enabled: true,
    }));
    const { error } = await supabase.from('crm_contacts').insert(rows as any);
    if (error) toast.error(error.message);
    else { toast.success(`Seeded ${rows.length} test contacts`); qc.invalidateQueries(); }
  };

  const sendTestInbound = async (contactId: string, text: string) => {
    const { error } = await supabase.functions.invoke('zara-suggest-reply', {
      body: { contactId, channel: 'whatsapp', inboundText: text, inboundAt: new Date().toISOString() },
    });
    if (error) toast.error(error.message);
    else toast.success('Test inbound dispatched');
    setTestInboundFor(null);
  };

  const openSaveTemplate = (d: Draft) => {
    setSaveTplDraft(d);
    setTplTitle('');
    setTplSubject(d.draft_subject ?? '');
    setTplBody(d.draft_text ?? '');
  };

  const saveAsTemplate = async () => {
    if (!saveTplDraft) return;
    const title = tplTitle.trim();
    if (!title) { toast.error('Title is required'); return; }
    if (!tplBody.trim()) { toast.error('Body is empty'); return; }
    setTplSaving(true);
    try {
      const ch = saveTplDraft.channel;
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || `tpl-${Date.now()}`;
      let error: any = null;
      if (ch === 'email') {
        ({ error } = await supabase.from('crm_email_templates').insert({
          name: title,
          subject: tplSubject || title,
          body_html: tplBody,
          slug,
          category: 'general',
          source: 'zara',
        } as any));
      } else if (ch === 'sms') {
        ({ error } = await supabase.from('crm_sms_templates').insert({
          name: title, body: tplBody, channel: 'sms', category: 'general',
        } as any));
      } else if (ch === 'whatsapp') {
        ({ error } = await supabase.from('crm_whatsapp_templates').insert({
          name: title, body_text: tplBody, category: 'utility', status: 'approved', language: 'en',
        } as any));
      } else {
        error = { message: `Unsupported channel: ${ch}` };
      }
      if (error) { toast.error(error.message); return; }
      toast.success(`Saved as ${ch} template`);
      setSaveTplDraft(null);
    } finally {
      setTplSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className={`px-4 py-2 text-[12px] font-medium ${banner.cls}`}>{banner.text}</div>

      <div className="flex items-center justify-between px-4 py-3 border-b border-border gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold">Zara queue</h1>
          <p className="text-xs text-muted-foreground">{pending.length} pending · {drafts.length} total</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={seedTestContacts}>Seed test contacts</Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        {pending.length === 0 ? (
          <div className="text-center text-muted-foreground py-16 text-sm">Zara is watching. No drafts pending.</div>
        ) : (
          pending.map((d) => {
            const c = contactMap.get(d.contact_id);
            const isTest = (c?.tags ?? []).includes('zara_test_contact');
            const name = [c?.first_name, c?.last_name].filter(Boolean).join(' ') || '(unknown)';
            const confTone = (d.confidence ?? 0) >= 0.8 ? 'success' : (d.confidence ?? 0) >= 0.6 ? 'warning' : 'danger';
            return (
              <div key={d.id} className="border border-border rounded-lg p-4 bg-card">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Link to={`/crm/leads/${d.contact_id}`} className="font-semibold text-[14px] hover:underline">{name}</Link>
                    <Pill size="sm" tone="muted">{c?.status ?? '—'}</Pill>
                    <Pill size="sm" tone="info">{d.channel}</Pill>
                    {isTest && <Pill size="sm" tone="warning">test</Pill>}
                  </div>
                  <span className="text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(d.created_at), { addSuffix: true })}</span>
                </div>

                <div className="text-[12px] text-muted-foreground border-l-2 border-border pl-3 py-1 mb-2 italic">"{d.inbound_text}"</div>

                <div className="border border-primary/30 bg-primary/5 rounded p-3 mb-3 text-[13px] whitespace-pre-wrap">{d.draft_text}</div>

                <div className="flex items-center gap-2 flex-wrap mb-3">
                  <Pill size="sm" tone="neutral">{d.intent ?? 'unknown'}</Pill>
                  <Pill size="sm" tone={confTone as any}>conf {Math.round((d.confidence ?? 0) * 100)}%</Pill>
                  {(d.guardrails_hit ?? []).map((g) => (
                    <Pill key={g} size="sm" tone="danger">{g}</Pill>
                  ))}
                  <TrainedFromChip sources={d.consulted_sources} />
                </div>

                {editingId === d.id ? (
                  <div className="space-y-2">
                    <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={4} />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => { approve(d, editText); setEditingId(null); }}>Send edited</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" onClick={() => approve(d, d.draft_text)}>Approve &amp; send</Button>
                    <Button size="sm" variant="outline" onClick={() => { setEditingId(d.id); setEditText(d.draft_text); }}>Edit &amp; send</Button>
                    <Button size="sm" variant="outline" onClick={() => openSaveTemplate(d)}>Save as template</Button>
                    <Button size="sm" variant="ghost" onClick={() => setRejectId(d.id)}>Reject</Button>
                    <Button size="sm" variant="ghost" onClick={() => snooze(d.id)}>Snooze 4h</Button>
                    {isTest && (
                      <Button size="sm" variant="ghost" onClick={() => setTestInboundFor(d.contact_id)}>Send test inbound</Button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Show test contacts without pending drafts so user can trigger them */}
        <TestContactList settings={settings} onSendInbound={(id) => setTestInboundFor(id)} />
      </div>

      <Dialog open={!!rejectId} onOpenChange={(o) => !o && setRejectId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject draft</DialogTitle></DialogHeader>
          <Textarea placeholder="Reason (optional)" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectId(null)}>Cancel</Button>
            <Button onClick={() => { if (rejectId) reject(rejectId, rejectReason); setRejectId(null); setRejectReason(''); }}>Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!testInboundFor} onOpenChange={(o) => !o && setTestInboundFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Send test inbound to Zara</DialogTitle></DialogHeader>
          <Textarea value={testInboundText} onChange={(e) => setTestInboundText(e.target.value)} rows={3} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTestInboundFor(null)}>Cancel</Button>
            <Button onClick={() => testInboundFor && sendTestInbound(testInboundFor, testInboundText)}>Send</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!saveTplDraft} onOpenChange={(o) => !o && setSaveTplDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as {saveTplDraft?.channel ?? ''} template</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Title</label>
              <Input value={tplTitle} onChange={(e) => setTplTitle(e.target.value)} placeholder="e.g. Pricing reply — Brentwood" autoFocus />
            </div>
            {saveTplDraft?.channel === 'email' && (
              <div>
                <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Subject</label>
                <Input value={tplSubject} onChange={(e) => setTplSubject(e.target.value)} placeholder="Subject line" />
              </div>
            )}
            <div>
              <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Body</label>
              <Textarea value={tplBody} onChange={(e) => setTplBody(e.target.value)} rows={8} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSaveTplDraft(null)} disabled={tplSaving}>Cancel</Button>
            <Button onClick={saveAsTemplate} disabled={tplSaving}>{tplSaving ? 'Saving…' : 'Save template'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TestContactList({ settings, onSendInbound }: { settings: Settings | undefined; onSendInbound: (id: string) => void }) {
  const { data: testContacts = [] } = useQuery({
    queryKey: ['zara-test-contacts'],
    queryFn: async () => {
      const { data } = await supabase
        .from('crm_contacts')
        .select('id, first_name, last_name, phone')
        .contains('tags', ['zara_test_contact'])
        .limit(20);
      return data ?? [];
    },
  });
  if (testContacts.length === 0) return null;
  return (
    <div className="border border-dashed border-border rounded-lg p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Test contacts ({testContacts.length})</div>
      <div className="space-y-1">
        {testContacts.map((c: any) => (
          <div key={c.id} className="flex items-center justify-between text-[12px]">
            <span>{c.first_name} {c.last_name} · {c.phone}</span>
            <Button size="sm" variant="ghost" onClick={() => onSendInbound(c.id)}>Send test inbound</Button>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * "Trained from" chip — shows how many RAG sources Zara consulted while drafting
 * this reply (chunks + wins + projects). Persisted on zara_suggested_replies.consulted_sources.
 */
function TrainedFromChip({ sources }: { sources: any }) {
  const [open, setOpen] = useState(false);
  const chunks = sources?.chunks ?? [];
  const wins = sources?.wins ?? [];
  const projects = sources?.projects ?? [];
  const total = chunks.length + wins.length + projects.length;
  if (!total) return null;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 h-5 px-2 rounded-full text-[10.5px] font-medium border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors"
        title="What Zara consulted while drafting"
      >
        Trained from {total} source{total === 1 ? '' : 's'}
      </button>
      {open && (
        <div className="absolute z-20 mt-1 left-0 w-72 rounded-md border border-border bg-popover shadow-md p-2 text-[11px] space-y-1">
          {chunks.map((c: any, i: number) => (
            <div key={`k${i}`} className="truncate">
              <span className="text-muted-foreground">K{i + 1}</span> · {c.title ?? 'Untitled'}
              {typeof c.similarity === 'number' && <span className="text-muted-foreground tabular-nums"> · {Math.round(c.similarity * 100)}%</span>}
            </div>
          ))}
          {wins.map((w: any, i: number) => (
            <div key={`w${i}`} className="truncate"><span className="text-muted-foreground">W{i + 1}</span> · {w.profile ?? w.lead_profile ?? '—'}{w.outcome ? ` → ${w.outcome}` : ''}</div>
          ))}
          {projects.map((p: any, i: number) => (
            <div key={`p${i}`} className="truncate"><span className="text-muted-foreground">P{i + 1}</span> · {p.name}{p.city ? ` (${p.city})` : ''}</div>
          ))}
        </div>
      )}
    </div>
  );
}
