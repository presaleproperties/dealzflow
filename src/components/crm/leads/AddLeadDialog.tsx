import { useState } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Plus, AlertTriangle, BookUser } from 'lucide-react';
import { useAddCrmContact, LEAD_STATUSES, LEAD_SOURCES, AGENTS, PROJECTS } from '@/hooks/useCrmContacts';
import { useCrmTags, useCreateCrmTag } from '@/hooks/useCrmTags';
import { validateEmail, type EmailValidation } from '@/lib/emailValidation';
import { InlineLibraryPicker } from './InlineLibraryPicker';
import { FRASER_VALLEY_CITIES, CRM_LANGUAGES } from '@/lib/crmConstants';
import { CheckboxDropdown } from './CheckboxDropdown';
import { cn } from '@/lib/utils';

const PROPERTY_TYPE_OPTIONS = [
  { value: 'condo', label: 'Condo' },
  { value: 'townhome', label: 'Townhome' },
  { value: 'both', label: 'Both' },
];

interface AddLeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/* ── Tiny iOS-style row primitives ───────────────────────────────────────── */
function GroupHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 pt-5 pb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground/80 font-medium">
      {children}
    </div>
  );
}

function Group({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-card border-y border-border/60 divide-y divide-border/50">
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  onClick,
  trailing,
  className,
  error,
}: {
  label: React.ReactNode;
  value?: React.ReactNode;
  onClick?: () => void;
  trailing?: React.ReactNode;
  className?: string;
  error?: string;
}) {
  const Comp: any = onClick ? 'button' : 'div';
  return (
    <div className={cn(error && 'bg-destructive/5')}>
      <Comp
        type={onClick ? 'button' : undefined}
        onClick={onClick}
        className={cn(
          'w-full text-left flex items-center gap-3 px-4 py-3.5 min-h-[52px] active:bg-muted/30 transition-colors',
          className,
        )}
      >
        <div className="text-[15px] text-foreground font-normal shrink-0">{label}</div>
        <div className="ml-auto flex items-center gap-2 min-w-0 max-w-[60%] justify-end">
          {value !== undefined && (
            <div className="text-[15px] text-muted-foreground truncate text-right">{value}</div>
          )}
          {trailing}
        </div>
      </Comp>
      {error && <div className="px-4 pb-2 text-[12px] text-destructive">{error}</div>}
    </div>
  );
}

function InputRow({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  maxLength,
  error,
  trailing,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  maxLength?: number;
  error?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div className={cn(error && 'bg-destructive/5')}>
      <div className="flex items-center gap-3 px-4 py-2.5 min-h-[52px]">
        <label className="text-[15px] text-foreground font-normal shrink-0 w-[110px]">{label}</label>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          type={type}
          maxLength={maxLength}
          className="flex-1 border-0 bg-transparent px-0 h-9 text-[15px] focus-visible:ring-0 placeholder:text-muted-foreground/60 shadow-none"
        />
        {trailing}
      </div>
      {error && <div className="px-4 pb-2 text-[12px] text-destructive">{error}</div>}
    </div>
  );
}

function EmailWarning({ validation, onFix }: { validation: EmailValidation; onFix: () => void }) {
  if (!validation.suggestion) return null;
  return (
    <div className="flex items-center gap-1.5 px-4 pb-2">
      <AlertTriangle className="w-3 h-3 flex-shrink-0" style={{ color: 'hsl(38 92% 50%)' }} />
      <span className="text-xs" style={{ color: 'hsl(38 92% 50%)' }}>{validation.suggestion}</span>
      <button type="button" onClick={onFix} className="text-xs font-semibold underline" style={{ color: 'hsl(38 92% 50%)' }}>
        Fix it
      </button>
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────────────── */
export function AddLeadDialog({ open, onOpenChange }: AddLeadDialogProps) {
  const addContact = useAddCrmContact();
  const { data: tagLib = [] } = useCrmTags();
  const createTag = useCreateCrmTag();

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    email: '',
    project: '',
    source: '',
    status: 'New Lead',
    assigned_to: '',
    tags: [] as string[],
    campaign_source: '',
    property_type_pref: '',
    is_pre_approved: false,
    referral_source: '',
    city_pref: '',
    language: '',
    hidden: false,
    call_optin: false,
    text_optin: false,
    email_optin: false,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [emailValidation, setEmailValidation] = useState<EmailValidation>({ isValid: true, suggestion: null, correctedEmail: null });
  const [tagsOpen, setTagsOpen] = useState(false);

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

  const handleSubmit = async () => {
    if (!validate()) return;
    await addContact.mutateAsync({
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      project: form.project || undefined,
      source: form.source || undefined,
      status: form.status,
      assigned_to: form.assigned_to || undefined,
      tags: form.tags,
      campaign_source: form.campaign_source.trim() || undefined,
      property_type_pref: form.property_type_pref || undefined,
      is_pre_approved: form.is_pre_approved,
      referral_source: form.referral_source.trim() || undefined,
      city_pref: form.city_pref || undefined,
      language: form.language || undefined,
    } as any);
    setForm({
      first_name: '', last_name: '', phone: '', email: '', project: '', source: '', status: 'New Lead',
      assigned_to: '', tags: [], campaign_source: '', property_type_pref: '', is_pre_approved: false,
      referral_source: '', city_pref: '', language: '',
      hidden: false, call_optin: false, text_optin: false, email_optin: false,
    });
    setErrors({});
    setEmailValidation({ isValid: true, suggestion: null, correctedEmail: null });
    onOpenChange(false);
  };

  const tagsLabel = form.tags.length === 0 ? 'None' : form.tags.length === 1 ? form.tags[0] : `${form.tags.length} tags`;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        hideClose
        className="w-full sm:max-w-md p-0 flex flex-col bg-muted/30 gap-0 border-l border-border"
      >
        {/* iOS-style header */}
        <div className="flex items-center justify-between px-2 h-14 border-b border-border bg-background/95 backdrop-blur shrink-0 sticky top-0 z-10">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
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

        {/* Scroll body */}
        <div className="flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom,0px)]">
          {/* Import row */}
          <div className="mt-3">
            <Group>
              <Row
                label={
                  <span className="flex items-center gap-3">
                    <BookUser className="w-5 h-5 text-primary" strokeWidth={2} />
                    <span>Import from Contacts</span>
                  </span>
                }
                onClick={() => {
                  // Hook for native contact picker — placeholder for now.
                }}
                trailing={<ChevronRight className="w-4 h-4 text-muted-foreground/60" />}
              />
            </Group>
          </div>

          {/* Identity group */}
          <div className="mt-3">
            <Group>
              <Row
                label="Hidden lead details"
                trailing={<Switch checked={form.hidden} onCheckedChange={(v) => setForm({ ...form, hidden: v })} />}
              />
              <InputRow
                label="First Name"
                value={form.first_name}
                onChange={(v) => setForm({ ...form, first_name: v })}
                placeholder="Required"
                maxLength={100}
                error={errors.first_name}
              />
              <InputRow
                label="Last Name"
                value={form.last_name}
                onChange={(v) => setForm({ ...form, last_name: v })}
                placeholder="Required"
                maxLength={100}
                error={errors.last_name}
              />
            </Group>
          </div>

          {/* Phone */}
          <GroupHeader>Phone</GroupHeader>
          <Group>
            <InputRow
              label="Phone"
              value={form.phone}
              onChange={(v) => setForm({ ...form, phone: v })}
              placeholder="Add a number"
              type="tel"
              maxLength={20}
              error={errors.phone}
            />
          </Group>

          {/* Email */}
          <GroupHeader>Email</GroupHeader>
          <Group>
            <InputRow
              label="Email"
              value={form.email}
              onChange={handleEmailChange}
              placeholder="Add an email"
              type="email"
              maxLength={255}
              error={errors.email}
            />
            <EmailWarning validation={emailValidation} onFix={fixEmail} />
          </Group>

          {/* Permission */}
          <GroupHeader>Permission to Contact</GroupHeader>
          <Group>
            <Row label="Call Opt-in" trailing={<Switch checked={form.call_optin} onCheckedChange={(v) => setForm({ ...form, call_optin: v })} />} />
            <Row label="Text Opt-in" trailing={<Switch checked={form.text_optin} onCheckedChange={(v) => setForm({ ...form, text_optin: v })} />} />
            <Row label="Email Opt-in" trailing={<Switch checked={form.email_optin} onCheckedChange={(v) => setForm({ ...form, email_optin: v })} />} />
          </Group>

          {/* Pipeline / Type / Owner / Source */}
          <div className="mt-3">
            <Group>
              <SelectRow
                label="Pipeline Stage"
                value={form.status}
                onChange={(v) => setForm({ ...form, status: v })}
                options={LEAD_STATUSES.map((s) => ({ value: s, label: s }))}
                placeholder="Select stage"
              />
              <SelectRow
                label="Project"
                value={form.project}
                onChange={(v) => setForm({ ...form, project: v })}
                options={PROJECTS.map((p) => ({ value: p, label: p }))}
                placeholder="Select project"
              />
              <SelectRow
                label="Lead Owner"
                value={form.assigned_to}
                onChange={(v) => setForm({ ...form, assigned_to: v })}
                options={AGENTS.map((a) => ({ value: a, label: a }))}
                placeholder="Unassigned"
              />
              <SelectRow
                label="Source"
                value={form.source}
                onChange={(v) => setForm({ ...form, source: v })}
                options={LEAD_SOURCES.map((s) => ({ value: s, label: s }))}
                placeholder="Other"
              />
            </Group>
          </div>

          {/* Preferences */}
          <GroupHeader>Preferences</GroupHeader>
          <Group>
            <SelectRow
              label="Property Type"
              value={form.property_type_pref}
              onChange={(v) => setForm({ ...form, property_type_pref: v })}
              options={PROPERTY_TYPE_OPTIONS}
              placeholder="Select type"
            />
            <div className="flex items-center gap-3 px-4 py-2.5 min-h-[52px]">
              <span className="text-[15px] text-foreground shrink-0 w-[110px]">Preferred City</span>
              <div className="flex-1">
                <CheckboxDropdown
                  options={FRASER_VALLEY_CITIES}
                  selected={form.city_pref ? form.city_pref.split(', ').filter(Boolean) : []}
                  onChange={(v) => setForm({ ...form, city_pref: v.join(', ') })}
                  placeholder="Select cities"
                />
              </div>
            </div>
            <div className="flex items-center gap-3 px-4 py-2.5 min-h-[52px]">
              <span className="text-[15px] text-foreground shrink-0 w-[110px]">Language</span>
              <div className="flex-1">
                <CheckboxDropdown
                  options={CRM_LANGUAGES}
                  selected={form.language ? form.language.split(', ').filter(Boolean) : []}
                  onChange={(v) => setForm({ ...form, language: v.join(', ') })}
                  placeholder="Select languages"
                />
              </div>
            </div>
            <Row
              label="Pre-Approved"
              trailing={<Switch checked={form.is_pre_approved} onCheckedChange={(v) => setForm({ ...form, is_pre_approved: v })} />}
            />
          </Group>

          {/* Attribution */}
          <GroupHeader>Attribution</GroupHeader>
          <Group>
            <InputRow
              label="Campaign"
              value={form.campaign_source}
              onChange={(v) => setForm({ ...form, campaign_source: v })}
              placeholder="e.g. FB_Surrey_Apr2026"
            />
            <InputRow
              label="Referral"
              value={form.referral_source}
              onChange={(v) => setForm({ ...form, referral_source: v })}
              placeholder="e.g. Parm Heer"
            />
          </Group>

          {/* Tags */}
          <GroupHeader>Tags</GroupHeader>
          <Group>
            <Row
              label="Tags"
              value={tagsLabel}
              onClick={() => setTagsOpen((v) => !v)}
              trailing={<ChevronRight className={cn('w-4 h-4 text-muted-foreground/60 transition-transform', tagsOpen && 'rotate-90')} />}
            />
            {tagsOpen && (
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
            )}
          </Group>

          <div className="h-8" />
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ── Select disclosure row ──────────────────────────────────────────────── */
function SelectRow({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  const display = options.find((o) => o.value === value)?.label;
  return (
    <div className="relative flex items-center gap-3 px-4 py-2.5 min-h-[52px]">
      <span className="text-[15px] text-foreground shrink-0">{label}</span>
      <div className="ml-auto flex items-center gap-1 min-w-0">
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="border-0 bg-transparent shadow-none h-auto px-0 py-0 gap-1 [&>svg]:hidden text-[15px] text-muted-foreground focus:ring-0 justify-end max-w-[200px]">
            <SelectValue placeholder={placeholder}>
              {display ?? <span className="text-muted-foreground/70">{placeholder}</span>}
            </SelectValue>
          </SelectTrigger>
          <SelectContent align="end">
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ChevronRight className="w-4 h-4 text-muted-foreground/60 shrink-0" />
      </div>
    </div>
  );
}
