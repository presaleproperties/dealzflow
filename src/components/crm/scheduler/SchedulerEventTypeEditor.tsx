import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { SchedulerEventType } from '@/hooks/useScheduler';

interface Props {
  eventType: SchedulerEventType | null;
  onClose: () => void;
  onCreate: (payload: Partial<SchedulerEventType>) => Promise<void>;
  onUpdate: (id: string, patch: Partial<SchedulerEventType>) => Promise<void>;
}

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

type Question = { key: string; text: string; required?: boolean; type?: 'text' | 'textarea' };

export function SchedulerEventTypeEditor({ eventType, onClose, onCreate, onUpdate }: Props) {
  const isNew = !eventType;
  const [form, setForm] = useState<Partial<SchedulerEventType>>(
    eventType || {
      title: '', slug: '', description: '', duration_min: 30,
      buffer_before_min: 0, buffer_after_min: 0,
      min_notice_min: 240, max_advance_days: 60,
      location_type: 'phone', location_value: '',
      creates_showing: false, requires_payment: false,
      price_cents: 0, currency: 'CAD', is_active: true,
      color: 'hsl(var(--primary))',
      custom_questions: [],
    }
  );
  const [saving, setSaving] = useState(false);

  const update = (patch: Partial<SchedulerEventType>) => setForm(f => ({ ...f, ...patch }));
  const questions: Question[] = (form.custom_questions as Question[]) || [];
  const setQuestions = (qs: Question[]) => update({ custom_questions: qs });

  const submit = async () => {
    if (!form.title?.trim()) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        slug: form.slug?.trim() || slugify(form.title),
      };
      if (isNew) await onCreate(payload);
      else await onUpdate(eventType!.id, payload);
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent aria-describedby={undefined} className="max-w-[640px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? 'New event type' : `Edit: ${eventType?.title}`}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[12px]">Title</Label>
              <Input
                value={form.title || ''}
                onChange={(e) => update({ title: e.target.value, slug: isNew ? slugify(e.target.value) : form.slug })}
                placeholder="Discovery Call"
              />
            </div>
            <div>
              <Label className="text-[12px]">URL slug</Label>
              <Input
                value={form.slug || ''}
                onChange={(e) => update({ slug: slugify(e.target.value) })}
                placeholder="discovery-call"
              />
            </div>
          </div>

          <div>
            <Label className="text-[12px]">Description</Label>
            <Textarea
              value={form.description || ''}
              onChange={(e) => update({ description: e.target.value })}
              rows={2}
              placeholder="A short description shown on the booking page"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-[12px]">Duration (min)</Label>
              <Input type="number" min={5} step={5}
                value={form.duration_min || 30}
                onChange={(e) => update({ duration_min: parseInt(e.target.value) || 30 })} />
            </div>
            <div>
              <Label className="text-[12px]">Buffer before</Label>
              <Input type="number" min={0} step={5}
                value={form.buffer_before_min || 0}
                onChange={(e) => update({ buffer_before_min: parseInt(e.target.value) || 0 })} />
            </div>
            <div>
              <Label className="text-[12px]">Buffer after</Label>
              <Input type="number" min={0} step={5}
                value={form.buffer_after_min || 0}
                onChange={(e) => update({ buffer_after_min: parseInt(e.target.value) || 0 })} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[12px]">Min notice (min)</Label>
              <Input type="number" min={0}
                value={form.min_notice_min ?? 240}
                onChange={(e) => update({ min_notice_min: parseInt(e.target.value) || 0 })} />
            </div>
            <div>
              <Label className="text-[12px]">Max advance (days)</Label>
              <Input type="number" min={1}
                value={form.max_advance_days ?? 60}
                onChange={(e) => update({ max_advance_days: parseInt(e.target.value) || 60 })} />
            </div>
          </div>

          <div>
            <Label className="text-[12px]">Location</Label>
            <div className="grid grid-cols-[160px_1fr] gap-2">
              <Select value={form.location_type} onValueChange={(v: any) => update({ location_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="phone">Phone</SelectItem>
                  <SelectItem value="video">Video</SelectItem>
                  <SelectItem value="in_person">In Person</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
              <Input
                value={form.location_value || ''}
                onChange={(e) => update({ location_value: e.target.value })}
                placeholder={
                  form.location_type === 'video' ? 'Meeting link (or leave blank to send later)' :
                  form.location_type === 'in_person' ? 'Address' :
                  form.location_type === 'phone' ? 'I will call you' : 'Details'
                }
              />
            </div>
          </div>

          <div className="flex items-center justify-between py-2 border-y border-border">
            <div>
              <Label className="text-[13px]">Create showing in CRM</Label>
              <p className="text-[11.5px] text-muted-foreground">Adds to /crm/calendar automatically</p>
            </div>
            <Switch checked={!!form.creates_showing} onCheckedChange={(v) => update({ creates_showing: v })} />
          </div>

          <div className="flex items-center justify-between py-2 border-b border-border">
            <div>
              <Label className="text-[13px]">Require payment</Label>
              <p className="text-[11.5px] text-muted-foreground">Stripe Checkout before booking confirms</p>
            </div>
            <Switch checked={!!form.requires_payment} onCheckedChange={(v) => update({ requires_payment: v })} />
          </div>

          {form.requires_payment && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[12px]">Price (cents)</Label>
                <Input type="number" min={0}
                  value={form.price_cents || 0}
                  onChange={(e) => update({ price_cents: parseInt(e.target.value) || 0 })} />
              </div>
              <div>
                <Label className="text-[12px]">Currency</Label>
                <Input value={form.currency || 'CAD'}
                  onChange={(e) => update({ currency: e.target.value.toUpperCase() })} />
              </div>
            </div>
          )}

          {/* Custom questions */}
          <div className="pt-2 border-t border-border">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-[13px]">Custom questions for invitees</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setQuestions([
                  ...questions,
                  { key: `q${questions.length + 1}`, text: '', required: false, type: 'text' },
                ])}
              >
                + Add question
              </Button>
            </div>
            {questions.length === 0 && (
              <p className="text-[11.5px] text-muted-foreground">No custom questions. Invitees will only see name, email, phone, and notes.</p>
            )}
            <div className="space-y-2">
              {questions.map((q, i) => (
                <div key={i} className="grid grid-cols-[1fr_120px_90px_28px] gap-2 items-center">
                  <Input
                    value={q.text}
                    placeholder="Question text"
                    onChange={(e) => {
                      const next = [...questions]; next[i] = { ...q, text: e.target.value };
                      setQuestions(next);
                    }}
                  />
                  <Select
                    value={q.type || 'text'}
                    onValueChange={(v: any) => {
                      const next = [...questions]; next[i] = { ...q, type: v };
                      setQuestions(next);
                    }}
                  >
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Short text</SelectItem>
                      <SelectItem value="textarea">Long text</SelectItem>
                    </SelectContent>
                  </Select>
                  <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={!!q.required}
                      onChange={(e) => {
                        const next = [...questions]; next[i] = { ...q, required: e.target.checked };
                        setQuestions(next);
                      }}
                    />
                    Required
                  </label>
                  <button
                    aria-label="Remove question"
                    onClick={() => setQuestions(questions.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-destructive text-[18px] leading-none"
                  >×</button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !form.title?.trim()}>
            {saving ? 'Saving…' : (isNew ? 'Create' : 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
