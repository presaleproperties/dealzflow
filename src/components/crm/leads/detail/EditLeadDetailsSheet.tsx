import { useEffect, useMemo, useState } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, AlertCircle } from 'lucide-react';
import { useUpdateCrmContact } from '@/hooks/useCrmLeadDetail';
import { LEAD_STATUSES, AGENTS, LEAD_SOURCES, LEAD_TYPES, LEAD_TYPE_LABELS } from '@/hooks/useCrmContacts';
import { CheckboxDropdown } from '@/components/crm/leads/CheckboxDropdown';
import { FRASER_VALLEY_CITIES, CRM_LANGUAGES } from '@/lib/crmConstants';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useCrmTags, useCreateCrmTag } from '@/hooks/useCrmTags';
import { useCrmProjects, useCreateCrmProject } from '@/hooks/useCrmProjects';
import { useCrmLeadTypes, useCreateCrmLeadType } from '@/hooks/useCrmLeadTypes';
import { useCrmSources } from '@/hooks/useCrmSources';
import { InlineLibraryPicker } from '@/components/crm/leads/InlineLibraryPicker';
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
  const { data: tagLib = [] } = useCrmTags();
  const { data: projectLib = [] } = useCrmProjects();
  const { data: leadTypeLib = [] } = useCrmLeadTypes();
  const { data: librarySources = [] } = useCrmSources();
  const createTag = useCreateCrmTag();
  const createProject = useCreateCrmProject();
  const createLeadType = useCreateCrmLeadType();
  const [form, setForm] = useState(() => initialForm(contact));
  const [saving, setSaving] = useState(false);
  // Field-level error map. Populated on save attempt and cleared per-field as
  // the user edits, so red highlights disappear the moment a value is fixed.
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Tracks whether the user has attempted to save once. Before that, we stay
  // quiet; after, we re-validate on every keystroke for live feedback.
  const [submitted, setSubmitted] = useState(false);

  // Reset form whenever the sheet is (re)opened with a different contact.
  useEffect(() => {
    if (open) {
      setForm(initialForm(contact));
      setErrors({});
      setSubmitted(false);
    }
  }, [open, contact]);

  // Validation rules — kept colocated so it's obvious what counts as "valid"
  // for a saved lead. Mirrors the requirements enforced in AddLeadDialog.
  const validate = (state: ReturnType<typeof initialForm>): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!state.first_name.trim()) e.first_name = 'First name is required';
    if (!state.last_name.trim()) e.last_name = 'Last name is required';

    const hasPhone = !!state.phone.trim();
    const hasEmail = !!state.email.trim();
    if (!hasPhone && !hasEmail) {
      e.phone = 'Add a phone or email';
      e.email = 'Add a phone or email';
    }

    if (state.email.trim() && !isValidEmail(state.email.trim())) {
      e.email = 'Enter a valid email address';
    }
    if (state.email_secondary.trim() && !isValidEmail(state.email_secondary.trim())) {
      e.email_secondary = 'Enter a valid email address';
    }
    if (state.co_buyer_email.trim() && !isValidEmail(state.co_buyer_email.trim())) {
      e.co_buyer_email = 'Enter a valid email address';
    }

    if (state.phone.trim() && !isValidPhone(state.phone.trim())) {
      e.phone = 'Enter a valid phone number';
    }
    if (state.phone_secondary.trim() && !isValidPhone(state.phone_secondary.trim())) {
      e.phone_secondary = 'Enter a valid phone number';
    }
    if (state.co_buyer_phone.trim() && !isValidPhone(state.co_buyer_phone.trim())) {
      e.co_buyer_phone = 'Enter a valid phone number';
    }

    if (state.birthday.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(state.birthday.trim())) {
      e.birthday = 'Use YYYY-MM-DD format';
    }

    const bMin = state.budget_min ? Number(state.budget_min) : null;
    const bMax = state.budget_max ? Number(state.budget_max) : null;
    if (state.budget_min && Number.isNaN(bMin)) e.budget_min = 'Enter a number';
    if (state.budget_max && Number.isNaN(bMax)) e.budget_max = 'Enter a number';
    if (bMin != null && bMin < 0) e.budget_min = 'Cannot be negative';
    if (bMax != null && bMax < 0) e.budget_max = 'Cannot be negative';
    if (bMin != null && bMax != null && bMax < bMin) e.budget_max = 'Max must be ≥ min';

    if (!state.status) e.status = 'Pipeline stage is required';
    return e;
  };

  // Update one field at a time, and re-validate live once the user has
  // already submitted once — keeps the form quiet until they ask for a save.
  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (submitted) setErrors(validate(next));
      else setErrors((p) => (p[key as string] ? { ...p, [key as string]: '' } : p));
      return next;
    });
  };

  // Live error map — used both for inline highlights AND for the summary banner.
  const liveErrors = submitted ? errors : {};
  const errorList = useMemo(
    () => Object.entries(liveErrors).filter(([, msg]) => !!msg),
    [liveErrors],
  );

  const handleSave = async () => {
    setSubmitted(true);
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      toast.error(`Please fix ${Object.keys(errs).length} field${Object.keys(errs).length === 1 ? '' : 's'} before saving`);
      return;
    }

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
        source: form.source || null,
        lead_types: form.lead_types,
        lead_type: form.lead_types[0] ?? null,
        tags: form.tags,
        projects: form.projects,
        project: form.projects[0] ?? null,
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

  // Field row that knows about errors — renders the control + an inline
  // error message + a red asterisk on required fields.
  const fieldRow = (
    label: string,
    control: React.ReactNode,
    opts?: { errorKey?: string; required?: boolean },
  ) => {
    const errorKey = opts?.errorKey;
    const errorMsg = errorKey ? liveErrors[errorKey] : undefined;
    return (
      <div className="flex items-start gap-3 px-4 py-3 min-h-[52px] border-b border-border/40 last:border-b-0">
        <Label className="w-[120px] shrink-0 text-[14px] font-normal text-muted-foreground pt-2">
          {label}
          {opts?.required && <span className="text-destructive ml-0.5">*</span>}
        </Label>
        <div className="flex-1 min-w-0">
          {control}
          {errorMsg && (
            <div className="flex items-center gap-1 mt-1 text-[12px] text-destructive">
              <AlertCircle className="w-3 h-3 shrink-0" strokeWidth={2.4} />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Helper to apply red border to inputs flagged as invalid.
  const inputCls = (errorKey?: string) =>
    cn(
      'h-9 text-[14px] bg-background border-border',
      errorKey && liveErrors[errorKey] && 'border-destructive focus-visible:ring-destructive/30 focus-visible:border-destructive',
    );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        hideClose
        className="w-full sm:max-w-md p-0 flex flex-col bg-muted gap-0 border-l border-border native-safe-top"
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
          {/* Validation summary — only after first save attempt */}
          {errorList.length > 0 && (
            <div className="mx-3 mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" strokeWidth={2.4} />
              <div className="text-[13px] text-destructive">
                <div className="font-semibold mb-0.5">
                  {errorList.length} field{errorList.length === 1 ? '' : 's'} need{errorList.length === 1 ? 's' : ''} attention
                </div>
                <div className="text-destructive/85 leading-snug">
                  Fix the highlighted field{errorList.length === 1 ? '' : 's'} below to save your changes.
                </div>
              </div>
            </div>
          )}

          <Group title="Identity">
            {fieldRow(
              'First Name',
              <Input className={inputCls('first_name')} value={form.first_name} onChange={(e) => update('first_name', e.target.value)} maxLength={100} />,
              { errorKey: 'first_name', required: true },
            )}
            {fieldRow(
              'Last Name',
              <Input className={inputCls('last_name')} value={form.last_name} onChange={(e) => update('last_name', e.target.value)} maxLength={100} />,
              { errorKey: 'last_name', required: true },
            )}
          </Group>

          <Group title="Phone">
            {fieldRow(
              'Primary',
              <Input className={inputCls('phone')} type="tel" value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="Add a number" maxLength={20} />,
              { errorKey: 'phone' },
            )}
            {fieldRow(
              'Secondary',
              <Input className={inputCls('phone_secondary')} type="tel" value={form.phone_secondary} onChange={(e) => update('phone_secondary', e.target.value)} placeholder="Optional" maxLength={20} />,
              { errorKey: 'phone_secondary' },
            )}
          </Group>

          <Group title="Email">
            {fieldRow(
              'Primary',
              <Input className={inputCls('email')} type="email" value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="name@example.com" maxLength={255} />,
              { errorKey: 'email' },
            )}
            {fieldRow(
              'Secondary',
              <Input className={inputCls('email_secondary')} type="email" value={form.email_secondary} onChange={(e) => update('email_secondary', e.target.value)} placeholder="Optional" maxLength={255} />,
              { errorKey: 'email_secondary' },
            )}
          </Group>

          <Group title="Pipeline">
            {fieldRow(
              'Stage',
              <Select value={form.status} onValueChange={(v) => update('status', v)}>
                <SelectTrigger className={inputCls('status')}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>,
              { errorKey: 'status', required: true },
            )}
            {fieldRow(
              'Assigned To',
              <Select value={form.assigned_to || undefined} onValueChange={(v) => update('assigned_to', v)}>
                <SelectTrigger className={inputCls()}><SelectValue placeholder="Unassigned" /></SelectTrigger>
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
                onChange={(v) => update('city', v.join(' | '))}
                placeholder="Select cities"
                allowCustom
              />,
            )}
            {fieldRow(
              'Language',
              <CheckboxDropdown
                options={CRM_LANGUAGES}
                selected={form.language ? form.language.split(/\s*\|\s*|,\s*/).filter(Boolean) : []}
                onChange={(v) => update('language', v.join(' | '))}
                placeholder="Select languages"
                allowCustom
              />,
            )}
            {fieldRow(
              'Bedrooms',
              <Input className={inputCls()} value={form.bedrooms_preferred} onChange={(e) => update('bedrooms_preferred', e.target.value)} placeholder="e.g. 2-3" />,
            )}
            {fieldRow(
              'Birthday',
              <Input className={inputCls('birthday')} type="text" value={form.birthday} onChange={(e) => update('birthday', e.target.value)} placeholder="YYYY-MM-DD" maxLength={10} />,
              { errorKey: 'birthday' },
            )}
            {fieldRow(
              'Budget',
              <div>
                <div className="flex items-center gap-2">
                  <Input className={inputCls('budget_min')} type="number" value={form.budget_min} onChange={(e) => update('budget_min', e.target.value)} placeholder="Min" />
                  <span className="text-muted-foreground">–</span>
                  <Input className={inputCls('budget_max')} type="number" value={form.budget_max} onChange={(e) => update('budget_max', e.target.value)} placeholder="Max" />
                </div>
                {(liveErrors.budget_min || liveErrors.budget_max) && (
                  <div className="flex items-center gap-1 mt-1 text-[12px] text-destructive">
                    <AlertCircle className="w-3 h-3 shrink-0" strokeWidth={2.4} />
                    <span>{liveErrors.budget_min || liveErrors.budget_max}</span>
                  </div>
                )}
              </div>,
              // Error rendered inline above so we don't double-render
            )}
          </Group>

          <Group title="Co-Buyer">
            {fieldRow('Name', <Input className={inputCls()} value={form.co_buyer_name} onChange={(e) => update('co_buyer_name', e.target.value)} placeholder="Optional" maxLength={200} />)}
            {fieldRow(
              'Phone',
              <Input className={inputCls('co_buyer_phone')} type="tel" value={form.co_buyer_phone} onChange={(e) => update('co_buyer_phone', e.target.value)} placeholder="Optional" maxLength={20} />,
              { errorKey: 'co_buyer_phone' },
            )}
            {fieldRow(
              'Email',
              <Input className={inputCls('co_buyer_email')} type="email" value={form.co_buyer_email} onChange={(e) => update('co_buyer_email', e.target.value)} placeholder="Optional" maxLength={255} />,
              { errorKey: 'co_buyer_email' },
            )}
          </Group>

          <Group title="Notes">
            <div className="px-4 py-3">
              <Textarea
                value={form.notes}
                onChange={(e) => update('notes', e.target.value)}
                placeholder="Internal notes about this lead…"
                className="min-h-[100px] text-[14px]"
                maxLength={5000}
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

// Email + phone validators — intentionally permissive so we don't block
// legitimate international formats. Phone allows +, digits, spaces, dashes,
// parens; must contain at least 7 digits.
function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
function isValidPhone(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return false;
  return /^[+\d][\d\s\-().]*$/.test(value);
}

function initialForm(contact: CrmContact) {
  const ext = contact as unknown as Record<string, unknown>;
  const leadTypes = (ext.lead_types as string[] | undefined) ?? (contact.lead_type ? [contact.lead_type] : []);
  const projects = contact.projects?.length ? contact.projects : (contact.project ? [contact.project] : []);
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
    source: contact.source ?? '',
    lead_types: leadTypes,
    tags: (contact.tags ?? []) as string[],
    projects,
    co_buyer_name: contact.co_buyer_name ?? '',
    co_buyer_phone: contact.co_buyer_phone ?? '',
    co_buyer_email: contact.co_buyer_email ?? '',
    notes: contact.notes ?? '',
  };
}
