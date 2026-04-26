import { useState, useRef, useCallback } from 'react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, AlertTriangle, Plus, X } from 'lucide-react';
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
  // Secondary phone/email start hidden — surfaced via "+ Add another" so the
  // form feels light, with secondary fields fully optional.
  const [showSecondaryPhone, setShowSecondaryPhone] = useState(false);
  const [showSecondaryEmail, setShowSecondaryEmail] = useState(false);

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
    setShowSecondaryPhone(false);
    setShowSecondaryEmail(false);
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

  // ── Swipe-to-dismiss (left edge swipe → close, mirrors iOS back gesture) ──
  const sheetContentRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{ startX: number; startY: number; tracking: boolean; horizontal: boolean | null }>({
    startX: 0, startY: 0, tracking: false, horizontal: null,
  });

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    // Only start gesture from the left ~24px edge (iOS-like)
    if (t.clientX > 28) return;
    dragStateRef.current = { startX: t.clientX, startY: t.clientY, tracking: true, horizontal: null };
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const st = dragStateRef.current;
    if (!st.tracking) return;
    const t = e.touches[0];
    const dx = t.clientX - st.startX;
    const dy = t.clientY - st.startY;
    if (st.horizontal === null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      st.horizontal = Math.abs(dx) > Math.abs(dy);
      if (!st.horizontal) { st.tracking = false; return; }
    }
    if (dx <= 0) return;
    const el = sheetContentRef.current;
    if (el) {
      el.style.transition = 'none';
      el.style.transform = `translate3d(${dx}px, 0, 0)`;
      el.style.opacity = String(Math.max(0.6, 1 - dx / 600));
    }
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    const st = dragStateRef.current;
    if (!st.tracking || !st.horizontal) {
      dragStateRef.current.tracking = false;
      return;
    }
    const t = e.changedTouches[0];
    const dx = t.clientX - st.startX;
    const el = sheetContentRef.current;
    dragStateRef.current.tracking = false;
    if (!el) return;
    el.style.transition = 'transform 240ms cubic-bezier(0.32, 0.72, 0, 1), opacity 240ms ease';
    if (dx > 90) {
      // commit close — animate out then fire close
      el.style.transform = 'translate3d(100%, 0, 0)';
      el.style.opacity = '0';
      window.setTimeout(() => {
        el.style.transform = '';
        el.style.opacity = '';
        handleClose(false);
      }, 220);
    } else {
      el.style.transform = 'translate3d(0, 0, 0)';
      el.style.opacity = '1';
      window.setTimeout(() => {
        el.style.transition = '';
        el.style.transform = '';
        el.style.opacity = '';
      }, 260);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent
        ref={sheetContentRef}
        side="right"
        hideClose
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className="w-full sm:max-w-md p-0 flex flex-col gap-0 border-l border-border/60 bg-gradient-to-b from-background via-background to-muted/20"
      >
        <SheetTitle className="sr-only">Add Lead</SheetTitle>

        {/* Header — frosted, sticky, premium */}
        <div className="flex items-center justify-between px-2 h-[52px] border-b border-border/40 bg-background/80 backdrop-blur-xl shrink-0 sticky top-0 z-10">
          <button
            type="button"
            onClick={() => handleClose(false)}
            className="flex items-center justify-center h-10 w-10 -ml-1 rounded-full active:bg-muted/60 transition-all active:scale-90"
            aria-label="Close"
          >
            <ChevronLeft className="w-[22px] h-[22px] text-foreground" strokeWidth={2.4} />
          </button>
          <h2 className="text-[16px] font-semibold text-foreground tracking-[-0.01em]">New Lead</h2>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={addContact.isPending}
            className="px-3.5 h-9 mr-1 rounded-full text-[13.5px] font-semibold text-primary-foreground bg-primary hover:bg-primary/90 disabled:opacity-50 transition-all active:scale-95 shadow-sm shadow-primary/20"
          >
            {addContact.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom,0px)]">
          {/* Hero hint */}
          <div className="px-5 pt-5 pb-2">
            <div className="text-[22px] font-semibold tracking-[-0.02em] text-foreground leading-tight">Add a new lead</div>
            <div className="text-[13px] text-muted-foreground mt-0.5">Capture the essentials — refine details later.</div>
          </div>

          <Group title="Identity">
            <FieldRow label="First Name" error={errors.first_name}>
              <Input
                className={inputCls}
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                placeholder="Required"
                maxLength={100}
              />
            </FieldRow>
            <FieldRow label="Last Name" error={errors.last_name}>
              <Input
                className={inputCls}
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                placeholder="Required"
                maxLength={100}
              />
            </FieldRow>
          </Group>

          <Group title="Phone">
            <FieldRow label="Primary" error={errors.phone}>
              <Input
                className={inputCls}
                type="tel"
                inputMode="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="Add a number"
                maxLength={20}
              />
            </FieldRow>
            <FieldRow label="Secondary">
              <Input
                className={inputCls}
                type="tel"
                inputMode="tel"
                value={form.phone_secondary}
                onChange={(e) => setForm({ ...form, phone_secondary: e.target.value })}
                placeholder="Optional"
                maxLength={20}
              />
            </FieldRow>
          </Group>

          <Group title="Email">
            <FieldRow label="Primary" error={errors.email}>
              <div className="space-y-1.5">
                <Input
                  className={inputCls}
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  value={form.email}
                  onChange={(e) => handleEmailChange(e.target.value)}
                  placeholder="name@example.com"
                  maxLength={255}
                />
                {emailValidation.suggestion && (
                  <div className="flex items-center gap-1.5 text-[12px]" style={{ color: 'hsl(38 92% 55%)' }}>
                    <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                    <span>{emailValidation.suggestion}</span>
                    <button type="button" onClick={fixEmail} className="font-semibold underline">Fix it</button>
                  </div>
                )}
              </div>
            </FieldRow>
            <FieldRow label="Secondary">
              <Input
                className={inputCls}
                type="email"
                inputMode="email"
                autoCapitalize="none"
                value={form.email_secondary}
                onChange={(e) => setForm({ ...form, email_secondary: e.target.value })}
                placeholder="Optional"
                maxLength={255}
              />
            </FieldRow>
          </Group>

          <Group title="Pipeline">
            <FieldRow label="Stage">
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </FieldRow>
            <FieldRow label="Lead Owner">
              <Select value={form.assigned_to || undefined} onValueChange={(v) => setForm({ ...form, assigned_to: v })}>
                <SelectTrigger className={inputCls}><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  {AGENTS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </FieldRow>
            <FieldRow label="Source">
              <Select value={form.source || undefined} onValueChange={(v) => setForm({ ...form, source: v })}>
                <SelectTrigger className={inputCls}><SelectValue placeholder="Select source" /></SelectTrigger>
                <SelectContent>
                  {LEAD_SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </FieldRow>
          </Group>

          <Group title="Lead Type">
            <div className="px-4 py-3.5">
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
            <FieldRow label="City">
              <CheckboxDropdown
                options={FRASER_VALLEY_CITIES}
                selected={form.city ? form.city.split(/\s*\|\s*/).filter(Boolean) : []}
                onChange={(v) => setForm({ ...form, city: v.join(' | ') })}
                placeholder="Select cities"
                allowCustom
              />
            </FieldRow>
            <FieldRow label="Language">
              <CheckboxDropdown
                options={CRM_LANGUAGES}
                selected={form.language ? form.language.split(/\s*\|\s*/).filter(Boolean) : []}
                onChange={(v) => setForm({ ...form, language: v.join(' | ') })}
                placeholder="Select languages"
                allowCustom
              />
            </FieldRow>
            <FieldRow label="Bedrooms">
              <Input
                className={inputCls}
                value={form.bedrooms_preferred}
                onChange={(e) => setForm({ ...form, bedrooms_preferred: e.target.value })}
                placeholder="e.g. 2-3"
              />
            </FieldRow>
            <FieldRow label="Birthday">
              <Input
                className={inputCls}
                value={form.birthday}
                onChange={(e) => setForm({ ...form, birthday: e.target.value })}
                placeholder="YYYY-MM-DD"
              />
            </FieldRow>
            <FieldRow label="Budget">
              <div className="flex items-center gap-2">
                <Input
                  className={inputCls}
                  type="number"
                  inputMode="numeric"
                  value={form.budget_min}
                  onChange={(e) => setForm({ ...form, budget_min: e.target.value })}
                  placeholder="Min"
                />
                <span className="text-muted-foreground text-[13px]">–</span>
                <Input
                  className={inputCls}
                  type="number"
                  inputMode="numeric"
                  value={form.budget_max}
                  onChange={(e) => setForm({ ...form, budget_max: e.target.value })}
                  placeholder="Max"
                />
              </div>
            </FieldRow>
          </Group>

          <Group title="Projects">
            <div className="px-4 py-3.5">
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
            <div className="px-4 py-3.5">
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
            <div className="px-4 py-3.5">
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Internal notes about this lead…"
                className="min-h-[110px] text-[14px] bg-background/60 border-border/60 rounded-xl resize-none"
              />
            </div>
          </Group>

          <div className="h-10" />
        </div>
      </SheetContent>
    </Sheet>
  );
}

const inputCls = 'h-10 text-[14px] bg-background/60 border-border/60 rounded-lg focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:border-primary/50 transition-colors';

function FieldRow({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-border/30 last:border-b-0">
      <div className="px-4 py-2.5">
        <Label className="block text-[11px] uppercase tracking-[0.06em] text-muted-foreground/80 font-medium mb-1.5">
          {label}
        </Label>
        <div className="min-w-0">{children}</div>
        {error && <div className="mt-1.5 text-[12px] text-destructive">{error}</div>}
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 px-3">
      <div className="px-2 pb-1.5 text-[11px] uppercase tracking-[0.08em] text-muted-foreground/60 font-semibold">{title}</div>
      <div className="bg-card/80 border border-border/50 rounded-2xl overflow-hidden shadow-[0_1px_2px_hsl(var(--foreground)/0.04)]">
        {children}
      </div>
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
