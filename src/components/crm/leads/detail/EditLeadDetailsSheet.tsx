import { useEffect, useState } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft } from 'lucide-react';
import { useUpdateCrmContact } from '@/hooks/useCrmLeadDetail';
import { LEAD_STATUSES, AGENTS } from '@/hooks/useCrmContacts';
import { CheckboxDropdown } from '@/components/crm/leads/CheckboxDropdown';
import { FRASER_VALLEY_CITIES, CRM_LANGUAGES } from '@/lib/crmConstants';
import { toast } from 'sonner';
import type { CrmContact } from '@/hooks/useCrmContacts';

interface Props {
  contact: CrmContact;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Right-side drawer that lets the user edit ALL core lead fields top-to-bottom,
 * replacing the per-field inline pencils. Mirrors the iOS-style grouped layout
 * we use for Add Lead.
 */
export function EditLeadDetailsSheet({ contact, open, onOpenChange }: Props) {
  const updateContact = useUpdateCrmContact();
  const [form, setForm] = useState(() => initialForm(contact));
  const [saving, setSaving] = useState(false);

  // Reset form whenever the sheet is (re)opened with a different contact.
  useEffect(() => {
    if (open) setForm(initialForm(contact));
  }, [open, contact]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const cityNorm = (form.city || '').trim();
      const langNorm = (form.language || '').trim();
      const updates: Record<string, unknown> = {
        first_name: form.first_name.trim() || null,
        last_name: form.last_name.trim() || null,
        phone: form.phone.trim() || null,
        phone_secondary: form.phone_secondary.trim() || null,
        email: form.email.trim() || null,
        email_secondary: form.email_secondary.trim() || null,
        city: cityNorm || null,
        language: langNorm || null,
        birthday: form.birthday.trim() || null,
        bedrooms_preferred: form.bedrooms_preferred.trim() || null,
        budget_min: form.budget_min ? Number(form.budget_min) : null,
        budget_max: form.budget_max ? Number(form.budget_max) : null,
        status: form.status,
        assigned_to: form.assigned_to || null,
        co_buyer_name: form.co_buyer_name.trim() || null,
        co_buyer_phone: form.co_buyer_phone.trim() || null,
        co_buyer_email: form.co_buyer_email.trim() || null,
        notes: form.notes.trim() || null,
      };
      // If the stage actually changed, log the change timestamp.
      if (form.status !== (contact.status ?? 'New Lead')) {
        updates.status_changed_at = new Date().toISOString();
      }
      await updateContact.mutateAsync({ id: contact.id, updates });
      toast.success('Lead updated');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const fieldRow = (label: string, control: React.ReactNode) => (
    <div className="flex items-start gap-3 px-4 py-3 min-h-[52px] border-b border-border/40 last:border-b-0">
      <Label className="w-[120px] shrink-0 text-[14px] font-normal text-muted-foreground pt-2">{label}</Label>
      <div className="flex-1 min-w-0">{control}</div>
    </div>
  );

  const inputCls = 'h-9 text-[14px] bg-background border-border';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        hideClose
        className="w-full sm:max-w-md p-0 flex flex-col bg-muted gap-0 border-l border-border"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-2 h-14 border-b border-border bg-background/95 backdrop-blur shrink-0 sticky top-0 z-10">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex items-center justify-center h-10 w-10 -ml-1 rounded-full active:bg-muted/60 transition-colors"
            aria-label="Close"
          >
            <ChevronLeft className="w-6 h-6 text-foreground" strokeWidth={2.2} />
          </button>
          <h2 className="text-[17px] font-semibold text-foreground">Edit Lead</h2>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-3 h-10 text-[16px] font-semibold text-primary disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom,0px)]">
          <Group title="Identity">
            {fieldRow('First Name', <Input className={inputCls} value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />)}
            {fieldRow('Last Name', <Input className={inputCls} value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />)}
          </Group>

          <Group title="Phone">
            {fieldRow('Primary', <Input className={inputCls} type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Add a number" />)}
            {fieldRow('Secondary', <Input className={inputCls} type="tel" value={form.phone_secondary} onChange={(e) => setForm({ ...form, phone_secondary: e.target.value })} placeholder="Optional" />)}
          </Group>

          <Group title="Email">
            {fieldRow('Primary', <Input className={inputCls} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@example.com" />)}
            {fieldRow('Secondary', <Input className={inputCls} type="email" value={form.email_secondary} onChange={(e) => setForm({ ...form, email_secondary: e.target.value })} placeholder="Optional" />)}
          </Group>

          <Group title="Pipeline">
            {fieldRow(
              'Stage',
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>,
            )}
            {fieldRow(
              'Assigned To',
              <Select value={form.assigned_to || undefined} onValueChange={(v) => setForm({ ...form, assigned_to: v })}>
                <SelectTrigger className={inputCls}><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  {AGENTS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>,
            )}
          </Group>

          <Group title="Preferences">
            {fieldRow(
              'City',
              <CheckboxDropdown
                options={FRASER_VALLEY_CITIES}
                selected={form.city ? form.city.split(/\s*\|\s*|,\s*/).filter(Boolean) : []}
                onChange={(v) => setForm({ ...form, city: v.join(' | ') })}
                placeholder="Select cities"
                allowCustom
              />,
            )}
            {fieldRow(
              'Language',
              <CheckboxDropdown
                options={CRM_LANGUAGES}
                selected={form.language ? form.language.split(/\s*\|\s*|,\s*/).filter(Boolean) : []}
                onChange={(v) => setForm({ ...form, language: v.join(' | ') })}
                placeholder="Select languages"
                allowCustom
              />,
            )}
            {fieldRow('Bedrooms', <Input className={inputCls} value={form.bedrooms_preferred} onChange={(e) => setForm({ ...form, bedrooms_preferred: e.target.value })} placeholder="e.g. 2-3" />)}
            {fieldRow('Birthday', <Input className={inputCls} type="text" value={form.birthday} onChange={(e) => setForm({ ...form, birthday: e.target.value })} placeholder="YYYY-MM-DD" />)}
            {fieldRow(
              'Budget',
              <div className="flex items-center gap-2">
                <Input className={inputCls} type="number" value={form.budget_min} onChange={(e) => setForm({ ...form, budget_min: e.target.value })} placeholder="Min" />
                <span className="text-muted-foreground">–</span>
                <Input className={inputCls} type="number" value={form.budget_max} onChange={(e) => setForm({ ...form, budget_max: e.target.value })} placeholder="Max" />
              </div>,
            )}
          </Group>

          <Group title="Co-Buyer">
            {fieldRow('Name', <Input className={inputCls} value={form.co_buyer_name} onChange={(e) => setForm({ ...form, co_buyer_name: e.target.value })} placeholder="Optional" />)}
            {fieldRow('Phone', <Input className={inputCls} type="tel" value={form.co_buyer_phone} onChange={(e) => setForm({ ...form, co_buyer_phone: e.target.value })} placeholder="Optional" />)}
            {fieldRow('Email', <Input className={inputCls} type="email" value={form.co_buyer_email} onChange={(e) => setForm({ ...form, co_buyer_email: e.target.value })} placeholder="Optional" />)}
          </Group>

          <Group title="Notes">
            <div className="px-4 py-3">
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Internal notes about this lead…"
                className="min-h-[100px] text-[14px]"
              />
            </div>
          </Group>

          <div className="h-8" />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 bg-muted">
      <div className="px-4 pb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground/80 font-medium">{title}</div>
      <div className="bg-card border-y border-border/60">{children}</div>
    </div>
  );
}

function initialForm(contact: CrmContact) {
  return {
    first_name: contact.first_name ?? '',
    last_name: contact.last_name ?? '',
    phone: contact.phone ?? '',
    phone_secondary: contact.phone_secondary ?? '',
    email: contact.email ?? '',
    email_secondary: contact.email_secondary ?? '',
    city: contact.city ?? '',
    language: contact.language ?? '',
    birthday: contact.birthday ?? '',
    bedrooms_preferred: contact.bedrooms_preferred ?? '',
    budget_min: contact.budget_min != null ? String(contact.budget_min) : '',
    budget_max: contact.budget_max != null ? String(contact.budget_max) : '',
    status: contact.status ?? 'New Lead',
    assigned_to: contact.assigned_to ?? '',
    co_buyer_name: contact.co_buyer_name ?? '',
    co_buyer_phone: contact.co_buyer_phone ?? '',
    co_buyer_email: contact.co_buyer_email ?? '',
    notes: contact.notes ?? '',
  };
}
