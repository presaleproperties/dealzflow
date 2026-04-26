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
import { supabase } from '@/integrations/supabase/client';
import { formatContactName } from '@/lib/format';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

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

  // Duplicate detection state — when the email/phone matches existing
  // crm_contacts rows we surface them in a confirm dialog before inserting.
  type DupContact = { id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null; status: string | null };
  const [dupes, setDupes] = useState<DupContact[]>([]);
  const [pendingPayload, setPendingPayload] = useState<Parameters<typeof addContact.mutate>[0] | null>(null);
  const [checkingDupes, setCheckingDupes] = useState(false);

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

  const buildPayload = () => ({
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

  const commitInsert = (payload: ReturnType<typeof buildPayload>) => {
    reset();
    setPendingPayload(null);
    setDupes([]);
    onOpenChange(false);
    addContact.mutate(payload); // success/error toasts handled inside the hook
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    const payload = buildPayload();
    const email = payload.email?.toLowerCase();
    // Last-10-digits comparison handles formatting differences like
    // "+1 (778) 231-3592" vs "778-231-3592" vs "17782313592".
    const phoneLast10 = payload.phone?.replace(/\D/g, '').slice(-10) || '';

    // Build an OR filter against email + phone (substring match on last 10 digits).
    const filters: string[] = [];
    if (email) filters.push(`email.ilike.${email}`);
    if (email) filters.push(`email_secondary.ilike.${email}`);
    if (phoneLast10) filters.push(`phone.ilike.%${phoneLast10}%`);
    if (phoneLast10) filters.push(`phone_secondary.ilike.%${phoneLast10}%`);

    if (filters.length === 0) {
      // No email or phone to compare — skip the check entirely.
      commitInsert(payload);
      return;
    }

    setCheckingDupes(true);
    try {
      const { data, error } = await supabase
        .from('crm_contacts')
        .select('id, first_name, last_name, email, phone, status')
        .or(filters.join(','))
        .limit(5);
      if (error) throw error;
      const matches = (data ?? []) as DupContact[];
      if (matches.length > 0) {
        setPendingPayload(payload);
        setDupes(matches);
        setCheckingDupes(false);
        return;
      }
    } catch {
      // Best-effort check — if the lookup fails, fall through to insert.
    }
    setCheckingDupes(false);
    commitInsert(payload);
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
    <>
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
            disabled={addContact.isPending || checkingDupes}
            className="px-3.5 h-9 mr-1 rounded-full text-[13.5px] font-semibold text-primary-foreground bg-primary hover:bg-primary/90 disabled:opacity-50 transition-all active:scale-95 shadow-sm shadow-primary/20"
          >
            {checkingDupes ? 'Checking…' : addContact.isPending ? 'Saving…' : 'Save'}
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
            <FieldRow label="Phone" error={errors.phone}>
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
            {showSecondaryPhone ? (
              <FieldRow
                label="Secondary phone"
                action={
                  <button
                    type="button"
                    onClick={() => {
                      setShowSecondaryPhone(false);
                      setForm((prev) => ({ ...prev, phone_secondary: '' }));
                    }}
                    className="inline-flex items-center justify-center w-6 h-6 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                    aria-label="Remove secondary phone"
                  >
                    <X className="w-3.5 h-3.5" strokeWidth={2.4} />
                  </button>
                }
              >
                <Input
                  className={inputCls}
                  type="tel"
                  inputMode="tel"
                  value={form.phone_secondary}
                  onChange={(e) => setForm({ ...form, phone_secondary: e.target.value })}
                  placeholder="Optional"
                  maxLength={20}
                  autoFocus
                />
              </FieldRow>
            ) : (
              <AddRow label="Add another number" onClick={() => setShowSecondaryPhone(true)} />
            )}
          </Group>

          <Group title="Email">
            <FieldRow label="Email" error={errors.email}>
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
            {showSecondaryEmail ? (
              <FieldRow
                label="Secondary email"
                action={
                  <button
                    type="button"
                    onClick={() => {
                      setShowSecondaryEmail(false);
                      setForm((prev) => ({ ...prev, email_secondary: '' }));
                    }}
                    className="inline-flex items-center justify-center w-6 h-6 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                    aria-label="Remove secondary email"
                  >
                    <X className="w-3.5 h-3.5" strokeWidth={2.4} />
                  </button>
                }
              >
                <Input
                  className={inputCls}
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  value={form.email_secondary}
                  onChange={(e) => setForm({ ...form, email_secondary: e.target.value })}
                  placeholder="Optional"
                  maxLength={255}
                  autoFocus
                />
              </FieldRow>
            ) : (
              <AddRow label="Add another email" onClick={() => setShowSecondaryEmail(true)} />
            )}
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

    {/* Duplicate-detection prompt — shown when email or phone matches an existing CRM contact. */}
    <AlertDialog open={dupes.length > 0} onOpenChange={(o) => { if (!o) { setDupes([]); setPendingPayload(null); } }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Possible duplicate lead</AlertDialogTitle>
          <AlertDialogDescription>
            We found {dupes.length} existing lead{dupes.length === 1 ? '' : 's'} with a matching email or phone. Create this lead anyway?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="max-h-60 overflow-y-auto -mx-1 px-1 space-y-2">
          {dupes.map((d) => {
            const name = formatContactName(d.first_name, d.last_name) || 'Unnamed lead';
            return (
              <div key={d.id} className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
                <div className="font-medium text-foreground truncate">{name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {[d.email, d.phone].filter(Boolean).join(' · ') || '—'}
                </div>
                {d.status && <div className="text-[10px] uppercase tracking-wider text-muted-foreground/80 mt-0.5">{d.status}</div>}
              </div>
            );
          })}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => pendingPayload && commitInsert(pendingPayload)}>
            Create anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

const inputCls = 'h-10 text-[14px] bg-background/60 border-border/60 rounded-lg focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:border-primary/50 transition-colors';

function FieldRow({
  label,
  error,
  action,
  children,
}: {
  label: string;
  error?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border/30 last:border-b-0">
      <div className="px-4 py-2.5">
        <div className="flex items-center justify-between mb-1.5">
          <Label className="block text-[11px] uppercase tracking-[0.06em] text-muted-foreground/80 font-medium">
            {label}
          </Label>
          {action}
        </div>
        <div className="min-w-0">{children}</div>
        {error && <div className="mt-1.5 text-[12px] text-destructive">{error}</div>}
      </div>
    </div>
  );
}

function AddRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2 px-4 py-2.5 text-[13px] text-primary hover:bg-muted/30 active:bg-muted/50 transition-colors"
    >
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary">
        <Plus className="w-3.5 h-3.5" strokeWidth={2.6} />
      </span>
      <span className="font-medium">{label}</span>
    </button>
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
