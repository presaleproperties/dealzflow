import { useState } from 'react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, AlertTriangle } from 'lucide-react';
import { useAddCrmContact, LEAD_STATUSES, LEAD_SOURCES, AGENTS } from '@/hooks/useCrmContacts';
import { useCrmTags, useCreateCrmTag } from '@/hooks/useCrmTags';
import { useCrmProjects, useCreateCrmProject } from '@/hooks/useCrmProjects';
import { useCrmLeadTypes, useCreateCrmLeadType } from '@/hooks/useCrmLeadTypes';
import { LEAD_TYPES, LEAD_TYPE_LABELS } from '@/hooks/useCrmContacts';
import { validateEmail, type EmailValidation } from '@/lib/emailValidation';
import { InlineLibraryPicker } from './InlineLibraryPicker';
import { CheckboxDropdown } from './CheckboxDropdown';
import { FRASER_VALLEY_CITIES, CRM_LANGUAGES } from '@/lib/crmConstants';

interface AddLeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddLeadDialog({ open, onOpenChange }: AddLeadDialogProps) {
  const addContact = useAddCrmContact();
  const { data: tagLib = [] } = useCrmTags();
  const { data: projectLib = [] } = useCrmProjects();
  const { data: leadTypeLib = [] } = useCrmLeadTypes();
  const createTag = useCreateCrmTag();
  const createProject = useCreateCrmProject();
  const createLeadType = useCreateCrmLeadType();

  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [emailValidation, setEmailValidation] = useState<EmailValidation>({
    isValid: true, suggestion: null, correctedEmail: null,
  });

  const handleEmailChange = (email: string) => {
    setForm((prev) => ({ ...prev, email }));
    if (email.trim()) setEmailValidation(validateEmail(email));
    else setEmailValidation({ isValid: true, suggestion: null, correctedEmail: null });
  };

  const fixEmail = () => {
    if (emailValidation.correctedEmail) {
      setForm((prev) => ({ ...prev, email: emailValidation.correctedEmail! }));
      setEmailValidation({ isValid: true, suggestion: null, correctedEmail: null });
    }
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.first_name.trim()) errs.first_name = 'First name is required';
    if (!form.last_name.trim()) errs.last_name = 'Last name is required';
    if (!form.email.trim() && !form.phone.trim()) {
      errs.email = 'Email or phone is required';
      errs.phone = 'Email or phone is required';
    }
    if (form.email && !validateEmail(form.email).isValid) errs.email = 'Invalid email format';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const reset = () => {
    setForm(initialForm());
    setErrors({});
    setEmailValidation({ isValid: true, suggestion: null, correctedEmail: null });
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    await addContact.mutateAsync({
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      phone: form.phone.trim() || undefined,
      phone_secondary: form.phone_secondary.trim() || undefined,
      email: form.email.trim() || undefined,
      email_secondary: form.email_secondary.trim() || undefined,
      status: form.status,
      assigned_to: form.assigned_to || undefined,
      source: form.source || undefined,
      projects: form.projects.length ? form.projects : undefined,
      project: form.projects[0] || undefined,
      tags: form.tags.length ? form.tags : undefined,
      lead_types: form.lead_types.length ? form.lead_types : undefined,
      city: form.city || undefined,
      language: form.language || undefined,
      bedrooms_preferred: form.bedrooms_preferred.trim() || undefined,
      budget_min: form.budget_min ? Number(form.budget_min) : undefined,
      budget_max: form.budget_max ? Number(form.budget_max) : undefined,
      birthday: form.birthday.trim() || undefined,
      notes: form.notes.trim() || undefined,
    });
    reset();
    onOpenChange(false);
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const fieldRow = (label: string, control: React.ReactNode, error?: string) => (
    <div className="border-b border-border/40 last:border-b-0">
      <div className="flex items-start gap-3 px-4 py-3 min-h-[52px]">
        <Label className="w-[120px] shrink-0 text-[14px] font-normal text-muted-foreground pt-2">{label}</Label>
        <div className="flex-1 min-w-0">{control}</div>
      </div>
      {error && <div className="px-4 pb-2 text-[12px] text-destructive -mt-1">{error}</div>}
    </div>
  );

  const inputCls = 'h-9 text-[14px] bg-background border-border';

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent
        side="right"
        hideClose
        className="w-full sm:max-w-md p-0 flex flex-col bg-muted/30 gap-0 border-l border-border"
      >
        <SheetTitle className="sr-only">Add Lead</SheetTitle>

        {/* Header */}
        <div className="flex items-center justify-between px-2 h-14 border-b border-border bg-background/95 backdrop-blur shrink-0 sticky top-0 z-10">
          <button
            type="button"
            onClick={() => handleClose(false)}
            className="flex items-center justify-center h-10 w-10 -ml-1 rounded-full active:bg-muted/60 transition-colors"
            aria-label="Close"
          >
            <ChevronLeft className="w-6 h-6 text-foreground" strokeWidth={2.2} />
          </button>
          <h2 className="text-[17px] font-semibold text-foreground">Add Lead</h2>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={addContact.isPending}
            className="px-3 h-10 text-[16px] font-semibold text-primary disabled:opacity-50"
          >
            {addContact.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom,0px)]">
          <Group title="Identity">
            {fieldRow(
              'First Name',
              <Input
                className={inputCls}
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                placeholder="Required"
                maxLength={100}
              />,
              errors.first_name,
            )}
            {fieldRow(
              'Last Name',
              <Input
                className={inputCls}
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                placeholder="Required"
                maxLength={100}
              />,
              errors.last_name,
            )}
          </Group>

          <Group title="Phone">
            {fieldRow(
              'Primary',
              <Input
                className={inputCls}
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="Add a number"
                maxLength={20}
              />,
              errors.phone,
            )}
            {fieldRow(
              'Secondary',
              <Input
                className={inputCls}
                type="tel"
                value={form.phone_secondary}
                onChange={(e) => setForm({ ...form, phone_secondary: e.target.value })}
                placeholder="Optional"
                maxLength={20}
              />,
            )}
          </Group>

          <Group title="Email">
            {fieldRow(
              'Primary',
              <div className="space-y-1">
                <Input
                  className={inputCls}
                  type="email"
                  value={form.email}
                  onChange={(e) => handleEmailChange(e.target.value)}
                  placeholder="name@example.com"
                  maxLength={255}
                />
                {emailValidation.suggestion && (
                  <div className="flex items-center gap-1.5 text-xs" style={{ color: 'hsl(38 92% 50%)' }}>
                    <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                    <span>{emailValidation.suggestion}</span>
                    <button type="button" onClick={fixEmail} className="font-semibold underline">
                      Fix it
                    </button>
                  </div>
                )}
              </div>,
              errors.email,
            )}
            {fieldRow(
              'Secondary',
              <Input
                className={inputCls}
                type="email"
                value={form.email_secondary}
                onChange={(e) => setForm({ ...form, email_secondary: e.target.value })}
                placeholder="Optional"
                maxLength={255}
              />,
            )}
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
              'Lead Owner',
              <Select value={form.assigned_to || undefined} onValueChange={(v) => setForm({ ...form, assigned_to: v })}>
                <SelectTrigger className={inputCls}><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  {AGENTS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>,
            )}
            {fieldRow(
              'Source',
              <Select value={form.source || undefined} onValueChange={(v) => setForm({ ...form, source: v })}>
                <SelectTrigger className={inputCls}><SelectValue placeholder="Select source" /></SelectTrigger>
                <SelectContent>
                  {LEAD_SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>,
            )}
          </Group>

          <Group title="Lead Type">
            <div className="px-4 py-3">
              {(() => {
                const libMap = new Map<string, { label: string; count: number }>();
                leadTypeLib.forEach((l) => libMap.set(l.name.toLowerCase(), { label: l.name, count: l.usage_count }));
                LEAD_TYPES.forEach((t) => {
                  if (!libMap.has(t.toLowerCase())) libMap.set(t.toLowerCase(), { label: t, count: 0 });
                });
                const merged = Array.from(libMap.values()).sort((a, b) => b.count - a.count);
                return (
                  <InlineLibraryPicker
                    selected={form.lead_types}
                    library={merged}
                    onChange={(next) => setForm({ ...form, lead_types: next })}
                    onCreate={(name) => createLeadType.mutate(name)}
                    renderLabel={(v) => LEAD_TYPE_LABELS[v] ?? v}
                    variant="primary"
                    placeholder="Search or add lead type…"
                    emptyText="No lead types yet"
                  />
                );
              })()}
            </div>
          </Group>

          <Group title="Preferences">
            {fieldRow(
              'City',
              <CheckboxDropdown
                options={FRASER_VALLEY_CITIES}
                selected={form.city ? form.city.split(/\s*\|\s*/).filter(Boolean) : []}
                onChange={(v) => setForm({ ...form, city: v.join(' | ') })}
                placeholder="Select cities"
                allowCustom
              />,
            )}
            {fieldRow(
              'Language',
              <CheckboxDropdown
                options={CRM_LANGUAGES}
                selected={form.language ? form.language.split(/\s*\|\s*/).filter(Boolean) : []}
                onChange={(v) => setForm({ ...form, language: v.join(' | ') })}
                placeholder="Select languages"
                allowCustom
              />,
            )}
            {fieldRow(
              'Bedrooms',
              <Input
                className={inputCls}
                value={form.bedrooms_preferred}
                onChange={(e) => setForm({ ...form, bedrooms_preferred: e.target.value })}
                placeholder="e.g. 2-3"
              />,
            )}
            {fieldRow(
              'Birthday',
              <Input
                className={inputCls}
                value={form.birthday}
                onChange={(e) => setForm({ ...form, birthday: e.target.value })}
                placeholder="YYYY-MM-DD"
              />,
            )}
            {fieldRow(
              'Budget',
              <div className="flex items-center gap-2">
                <Input
                  className={inputCls}
                  type="number"
                  value={form.budget_min}
                  onChange={(e) => setForm({ ...form, budget_min: e.target.value })}
                  placeholder="Min"
                />
                <span className="text-muted-foreground">–</span>
                <Input
                  className={inputCls}
                  type="number"
                  value={form.budget_max}
                  onChange={(e) => setForm({ ...form, budget_max: e.target.value })}
                  placeholder="Max"
                />
              </div>,
            )}
          </Group>

          <Group title="Projects">
            <div className="px-4 py-3">
              <InlineLibraryPicker
                selected={form.projects}
                library={projectLib.map((p) => ({ label: p.name, count: p.usage_count }))}
                onChange={(next) => setForm({ ...form, projects: next })}
                onCreate={(name) => createProject.mutate(name)}
                placeholder="Search or add project…"
                emptyText="No projects yet"
              />
            </div>
          </Group>

          <Group title="Tags">
            <div className="px-4 py-3">
              <InlineLibraryPicker
                selected={form.tags}
                library={tagLib.map((t) => ({ label: t.name, count: t.usage_count ?? 0 }))}
                onChange={(next) => setForm({ ...form, tags: next })}
                onCreate={(name) => createTag.mutate(name)}
                placeholder="Search or add tag…"
                emptyText="No tags yet"
              />
            </div>
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
    <div className="mt-3">
      <div className="px-4 pb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground/80 font-medium">{title}</div>
      <div className="bg-card border-y border-border/60">{children}</div>
    </div>
  );
}

function initialForm() {
  return {
    first_name: '',
    last_name: '',
    phone: '',
    phone_secondary: '',
    email: '',
    email_secondary: '',
    status: 'New Lead',
    assigned_to: '',
    source: '',
    projects: [] as string[],
    tags: [] as string[],
    lead_types: [] as string[],
    city: '',
    language: '',
    bedrooms_preferred: '',
    budget_min: '',
    budget_max: '',
    birthday: '',
    notes: '',
  };
}
