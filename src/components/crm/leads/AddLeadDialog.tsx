import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChevronLeft, ChevronRight, AlertTriangle, Plus, X } from 'lucide-react';
import { MobilePickerDrawer } from './MobilePickerDrawer';
import { MobileMultiPickerDrawer } from './MobileMultiPickerDrawer';
import { MobileTextEditDrawer } from './MobileTextEditDrawer';
import { useAddCrmContact, LEAD_STATUSES, LEAD_SOURCES } from '@/hooks/useCrmContacts';
import { useAgentNames, useMyAgentName } from '@/hooks/useTeamAgents';
import { useCrmTags, useCreateCrmTag } from '@/hooks/useCrmTags';
import { useCrmProjects, useCreateCrmProject } from '@/hooks/useCrmProjects';
import { useCrmLeadTypes, useCreateCrmLeadType } from '@/hooks/useCrmLeadTypes';
import { LEAD_TYPES, LEAD_TYPE_LABELS } from '@/hooks/useCrmContacts';
import { validateEmail, type EmailValidation } from '@/lib/emailValidation';
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

type DrawerKey =
  | null
  | 'status' | 'assigned_to' | 'source'
  | 'city' | 'language' | 'tags' | 'projects' | 'lead_types'
  | 'bedrooms_preferred' | 'budget_min' | 'budget_max' | 'birthday'
  | 'notes';

export function AddLeadDialog({ open, onOpenChange }: AddLeadDialogProps) {
  const addContact = useAddCrmContact();
  const { data: tagLib = [] } = useCrmTags();
  const { data: projectLib = [] } = useCrmProjects();
  const { data: leadTypeLib = [] } = useCrmLeadTypes();
  const createTag = useCreateCrmTag();
  const createProject = useCreateCrmProject();
  const createLeadType = useCreateCrmLeadType();
  const AGENTS = useAgentNames();
  const myAgentName = useMyAgentName();

  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [emailValidation, setEmailValidation] = useState<EmailValidation>({
    isValid: true, suggestion: null, correctedEmail: null,
  });
  const [showSecondaryPhone, setShowSecondaryPhone] = useState(false);
  const [showSecondaryEmail, setShowSecondaryEmail] = useState(false);
  const [drawer, setDrawer] = useState<DrawerKey>(null);

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
    if (!form.status) errs.status = 'Pipeline stage is required';
    if (!form.assigned_to) errs.assigned_to = 'Assign an agent';
    if (!form.source) errs.source = 'Lead source is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const canSubmit =
    !!form.first_name.trim() &&
    !!form.last_name.trim() &&
    (!!form.email.trim() || !!form.phone.trim()) &&
    (!form.email || validateEmail(form.email).isValid) &&
    !!form.status &&
    !!form.assigned_to &&
    !!form.source;

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

  const commitInsert = (payload: Parameters<typeof addContact.mutate>[0]) => {
    reset();
    setPendingPayload(null);
    setDupes([]);
    onOpenChange(false);
    addContact.mutate(payload);
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    const payload = buildPayload();
    const email = payload.email?.toLowerCase() ?? null;
    const phone = payload.phone ?? null;

    if (!email && !phone) { commitInsert(payload); return; }

    setCheckingDupes(true);
    try {
      // Per-agent dup check — only flags conflicts in the current user's
      // own assignment bucket. Leads owned by another agent (even with the
      // same email/phone) do NOT count as a duplicate for this user.
      const { data, error } = await supabase.rpc('crm_find_my_duplicates', {
        _email: email,
        _phone: phone,
        _limit: 5,
      });
      if (error) throw error;
      const matches = (data ?? []) as DupContact[];
      if (matches.length > 0) {
        setPendingPayload(payload);
        setDupes(matches);
        setCheckingDupes(false);
        return;
      }
    } catch { /* best effort — never block lead creation on a dup-check failure */ }
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

  // ── Derived display values ────────────────────────────────────────────────
  const cityList = useMemo(() => form.city ? form.city.split(/\s*\|\s*/).filter(Boolean) : [], [form.city]);
  const languageList = useMemo(() => form.language ? form.language.split(/\s*\|\s*/).filter(Boolean) : [], [form.language]);

  const cityOptions = useMemo(() => {
    const set = new Set<string>([...FRASER_VALLEY_CITIES, ...cityList]);
    return Array.from(set).map((c) => ({ value: c, label: c }));
  }, [cityList]);
  const languageOptions = useMemo(() => {
    const set = new Set<string>([...CRM_LANGUAGES, ...languageList]);
    return Array.from(set).map((c) => ({ value: c, label: c }));
  }, [languageList]);

  const tagOptions = useMemo(() => tagLib.map((t) => ({ value: t.name, label: t.name, count: t.usage_count ?? 0 })), [tagLib]);
  const projectOptions = useMemo(() => projectLib.map((p) => ({ value: p.name, label: p.name, count: p.usage_count })), [projectLib]);
  const leadTypeOptions = useMemo(() => {
    const libMap = new Map<string, { value: string; label: string; count: number }>();
    leadTypeLib.forEach((l) => libMap.set(l.name.toLowerCase(), { value: l.name, label: l.name, count: l.usage_count }));
    LEAD_TYPES.forEach((t) => {
      if (!libMap.has(t.toLowerCase())) libMap.set(t.toLowerCase(), { value: t, label: LEAD_TYPE_LABELS[t] ?? t, count: 0 });
    });
    return Array.from(libMap.values()).sort((a, b) => b.count - a.count);
  }, [leadTypeLib]);

  const budgetDisplay = useMemo(() => {
    const min = form.budget_min ? `$${Number(form.budget_min).toLocaleString()}` : '';
    const max = form.budget_max ? `$${Number(form.budget_max).toLocaleString()}` : '';
    if (min && max) return `${min} – ${max}`;
    if (min) return `From ${min}`;
    if (max) return `Up to ${max}`;
    return '';
  }, [form.budget_min, form.budget_max]);

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
        className="w-full sm:max-w-md p-0 flex flex-col gap-0 border-l border-border/60 bg-gradient-to-b from-background via-background to-muted/10 native-safe-top"
      >
        <SheetTitle className="sr-only">Add Lead</SheetTitle>

        {/* Header */}
        <div className="flex items-center justify-between px-2 h-[54px] border-b border-border/40 bg-background/85 backdrop-blur-xl shrink-0 sticky top-0 z-10">
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
            disabled={addContact.isPending || checkingDupes || !canSubmit}
            className="px-3.5 h-9 mr-1 rounded-full text-[13.5px] font-semibold text-primary-foreground bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95 shadow-sm shadow-primary/20"
          >
            {checkingDupes ? 'Checking…' : addContact.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom,0px)]">

          {/* Identity — text inputs only, label sits above input for fast typing */}
          <Section title="Identity">
            <TextField
              label="First Name"
              required
              error={errors.first_name}
              value={form.first_name}
              onChange={(v) => { setForm({ ...form, first_name: v }); if (errors.first_name) setErrors((e) => ({ ...e, first_name: '' })); }}
              placeholder="Jane"
              maxLength={100}
            />
            <TextField
              label="Last Name"
              required
              error={errors.last_name}
              value={form.last_name}
              onChange={(v) => { setForm({ ...form, last_name: v }); if (errors.last_name) setErrors((e) => ({ ...e, last_name: '' })); }}
              placeholder="Doe"
              maxLength={100}
            />
          </Section>

          {/* Contact */}
          <Section title="Contact">
            <TextField
              label="Phone"
              type="tel"
              error={errors.phone}
              value={form.phone}
              onChange={(v) => { setForm({ ...form, phone: v }); if (errors.phone) setErrors((e) => ({ ...e, phone: '' })); }}
              placeholder="(778) 555-0123"
              maxLength={20}
            />
            {showSecondaryPhone ? (
              <TextField
                label="Secondary phone"
                type="tel"
                value={form.phone_secondary}
                onChange={(v) => setForm({ ...form, phone_secondary: v })}
                placeholder="Optional"
                maxLength={20}
                autoFocus
                onRemove={() => { setShowSecondaryPhone(false); setForm((p) => ({ ...p, phone_secondary: '' })); }}
              />
            ) : (
              <AddRow label="Add another number" onClick={() => setShowSecondaryPhone(true)} />
            )}

            <Divider />

            <TextField
              label="Email"
              type="email"
              error={errors.email}
              value={form.email}
              onChange={handleEmailChange}
              placeholder="name@example.com"
              maxLength={255}
              hint={
                emailValidation.suggestion ? (
                  <span className="inline-flex items-center gap-1.5" style={{ color: 'hsl(38 92% 55%)' }}>
                    <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                    <span>{emailValidation.suggestion}</span>
                    <button type="button" onClick={fixEmail} className="font-semibold underline">Fix it</button>
                  </span>
                ) : null
              }
            />
            {showSecondaryEmail ? (
              <TextField
                label="Secondary email"
                type="email"
                value={form.email_secondary}
                onChange={(v) => setForm({ ...form, email_secondary: v })}
                placeholder="Optional"
                maxLength={255}
                autoFocus
                onRemove={() => { setShowSecondaryEmail(false); setForm((p) => ({ ...p, email_secondary: '' })); }}
              />
            ) : (
              <AddRow label="Add another email" onClick={() => setShowSecondaryEmail(true)} />
            )}
          </Section>

          {/* Pipeline — chevron rows that open drawers */}
          <Section title="Pipeline">
            <PickerRow
              label="Stage"
              required
              value={form.status}
              placeholder="Select stage"
              error={errors.status}
              onClick={() => setDrawer('status')}
            />
            <PickerRow
              label="Lead Owner"
              required
              value={form.assigned_to}
              placeholder="Assign an agent"
              error={errors.assigned_to}
              onClick={() => setDrawer('assigned_to')}
            />
            <PickerRow
              label="Source"
              required
              value={form.source}
              placeholder="Select source"
              error={errors.source}
              onClick={() => setDrawer('source')}
              last
            />
          </Section>

          {/* Classification */}
          <Section title="Classification">
            <PickerRow
              label="Lead Type"
              value={form.lead_types.map((t) => LEAD_TYPE_LABELS[t] ?? t).join(', ')}
              placeholder="None"
              onClick={() => setDrawer('lead_types')}
            />
            <PickerRow
              label="Tags"
              value={form.tags.join(', ')}
              placeholder="None"
              onClick={() => setDrawer('tags')}
            />
            <PickerRow
              label="Projects"
              value={form.projects.join(', ')}
              placeholder="None"
              onClick={() => setDrawer('projects')}
              last
            />
          </Section>

          {/* Preferences */}
          <Section title="Preferences">
            <PickerRow
              label="City"
              value={cityList.join(', ')}
              placeholder="Any"
              onClick={() => setDrawer('city')}
            />
            <PickerRow
              label="Language"
              value={languageList.join(', ')}
              placeholder="Any"
              onClick={() => setDrawer('language')}
            />
            <PickerRow
              label="Bedrooms"
              value={form.bedrooms_preferred}
              placeholder="Any"
              onClick={() => setDrawer('bedrooms_preferred')}
            />
            <PickerRow
              label="Budget"
              value={budgetDisplay}
              placeholder="Any"
              onClick={() => setDrawer('budget_min')}
            />
            <PickerRow
              label="Birthday"
              value={form.birthday}
              placeholder="—"
              onClick={() => setDrawer('birthday')}
              last
            />
          </Section>

          {/* Notes */}
          <Section title="Notes">
            <button
              type="button"
              onClick={() => setDrawer('notes')}
              className="w-full text-left px-4 py-3.5 active:bg-muted/40 transition-colors"
            >
              {form.notes ? (
                <p className="text-[14px] text-foreground leading-relaxed line-clamp-3 whitespace-pre-wrap">{form.notes}</p>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-[14px] text-muted-foreground/70">Add internal notes…</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/50" strokeWidth={2.2} />
                </div>
              )}
            </button>
          </Section>

          <div className="h-12" />
        </div>
      </SheetContent>
    </Sheet>

    {/* ── Drawers ───────────────────────────────────────────────────────── */}
    <MobilePickerDrawer
      open={drawer === 'status'}
      onOpenChange={(o) => { if (!o) setDrawer(null); }}
      title="Stage"
      options={LEAD_STATUSES.map((s) => ({ value: s, label: s }))}
      value={form.status}
      onChange={(v) => { setForm((p) => ({ ...p, status: v })); setErrors((p) => ({ ...p, status: '' })); }}
    />
    <MobilePickerDrawer
      open={drawer === 'assigned_to'}
      onOpenChange={(o) => { if (!o) setDrawer(null); }}
      title="Lead Owner"
      options={AGENTS.map((a) => ({ value: a, label: a }))}
      value={form.assigned_to}
      onChange={(v) => { setForm((p) => ({ ...p, assigned_to: v })); setErrors((p) => ({ ...p, assigned_to: '' })); }}
    />
    <MobilePickerDrawer
      open={drawer === 'source'}
      onOpenChange={(o) => { if (!o) setDrawer(null); }}
      title="Source"
      options={LEAD_SOURCES.map((s) => ({ value: s, label: s }))}
      value={form.source}
      onChange={(v) => { setForm((p) => ({ ...p, source: v })); setErrors((p) => ({ ...p, source: '' })); }}
    />

    <MobileMultiPickerDrawer
      open={drawer === 'lead_types'}
      onOpenChange={(o) => { if (!o) setDrawer(null); }}
      title="Lead Type"
      options={leadTypeOptions}
      value={form.lead_types}
      onChange={(next) => setForm((p) => ({ ...p, lead_types: next }))}
      onCreate={(name) => createLeadType.mutate(name)}
      placeholder="Search or add lead type…"
    />
    <MobileMultiPickerDrawer
      open={drawer === 'tags'}
      onOpenChange={(o) => { if (!o) setDrawer(null); }}
      title="Tags"
      options={tagOptions}
      value={form.tags}
      onChange={(next) => setForm((p) => ({ ...p, tags: next }))}
      onCreate={(name) => createTag.mutate(name)}
      placeholder="Search or add tag…"
    />
    <MobileMultiPickerDrawer
      open={drawer === 'projects'}
      onOpenChange={(o) => { if (!o) setDrawer(null); }}
      title="Projects"
      options={projectOptions}
      value={form.projects}
      onChange={(next) => setForm((p) => ({ ...p, projects: next }))}
      onCreate={(name) => createProject.mutate(name)}
      placeholder="Search or add project…"
    />
    <MobileMultiPickerDrawer
      open={drawer === 'city'}
      onOpenChange={(o) => { if (!o) setDrawer(null); }}
      title="City"
      options={cityOptions}
      value={cityList}
      onChange={(next) => setForm((p) => ({ ...p, city: next.join(' | ') }))}
      onCreate={(name) => setForm((p) => ({ ...p, city: [...cityList, name].join(' | ') }))}
      placeholder="Search or add city…"
    />
    <MobileMultiPickerDrawer
      open={drawer === 'language'}
      onOpenChange={(o) => { if (!o) setDrawer(null); }}
      title="Language"
      options={languageOptions}
      value={languageList}
      onChange={(next) => setForm((p) => ({ ...p, language: next.join(' | ') }))}
      onCreate={(name) => setForm((p) => ({ ...p, language: [...languageList, name].join(' | ') }))}
      placeholder="Search or add language…"
    />

    <MobileTextEditDrawer
      open={drawer === 'bedrooms_preferred'}
      onOpenChange={(o) => { if (!o) setDrawer(null); }}
      title="Bedrooms"
      value={form.bedrooms_preferred}
      onSave={(v) => setForm((p) => ({ ...p, bedrooms_preferred: v }))}
      placeholder="e.g. 2-3"
      description="Range or single number — e.g. “3” or “2-4”."
    />
    <MobileTextEditDrawer
      open={drawer === 'budget_min'}
      onOpenChange={(o) => { if (!o) setDrawer(null); }}
      title="Minimum budget"
      value={form.budget_min}
      onSave={(v) => { setForm((p) => ({ ...p, budget_min: v })); setDrawer('budget_max'); }}
      placeholder="500000"
      type="number"
      description="Lowest end of their target price. We'll ask for the maximum next."
    />
    <MobileTextEditDrawer
      open={drawer === 'budget_max'}
      onOpenChange={(o) => { if (!o) setDrawer(null); }}
      title="Maximum budget"
      value={form.budget_max}
      onSave={(v) => setForm((p) => ({ ...p, budget_max: v }))}
      placeholder="900000"
      type="number"
      description="Highest end of their target price."
    />
    <MobileTextEditDrawer
      open={drawer === 'birthday'}
      onOpenChange={(o) => { if (!o) setDrawer(null); }}
      title="Birthday"
      value={form.birthday}
      onSave={(v) => setForm((p) => ({ ...p, birthday: v }))}
      placeholder="YYYY-MM-DD"
      type="date"
    />
    <MobileTextEditDrawer
      open={drawer === 'notes'}
      onOpenChange={(o) => { if (!o) setDrawer(null); }}
      title="Notes"
      value={form.notes}
      onSave={(v) => setForm((p) => ({ ...p, notes: v }))}
      placeholder="Internal notes about this lead…"
      type="textarea"
    />

    {/* Duplicate-detection prompt */}
    <AlertDialog open={dupes.length > 0} onOpenChange={(o) => { if (!o) { setDupes([]); setPendingPayload(null); } }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            Possible duplicate lead
          </AlertDialogTitle>
          <AlertDialogDescription>
            You already have {dupes.length} lead{dupes.length === 1 ? '' : 's'} in your list with a matching email or phone.
            Review before creating a new record.
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
          <AlertDialogCancel autoFocus>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => pendingPayload && commitInsert(pendingPayload)}
            className="bg-amber-600 hover:bg-amber-600/90 text-white"
          >
            Create anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

// ── Building blocks ─────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 px-3">
      <div className="px-2 pb-2 text-[11px] uppercase tracking-[0.1em] text-muted-foreground/55 font-semibold">
        {title}
      </div>
      <div className="bg-card/70 border border-border/40 rounded-2xl overflow-hidden shadow-[0_1px_2px_hsl(var(--foreground)/0.03)]">
        {children}
      </div>
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-border/30 mx-4" />;
}

function TextField({
  label, required, error, value, onChange, placeholder, type = 'text',
  maxLength, autoFocus, onRemove, hint,
}: {
  label: string;
  required?: boolean;
  error?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: 'text' | 'tel' | 'email' | 'number';
  maxLength?: number;
  autoFocus?: boolean;
  onRemove?: () => void;
  hint?: React.ReactNode;
}) {
  return (
    <div className="px-4 py-3 border-b border-border/30 last:border-b-0">
      <div className="flex items-center justify-between mb-1.5">
        <Label className="block text-[11px] uppercase tracking-[0.06em] text-muted-foreground/80 font-medium">
          {label}{required && <span className="text-destructive ml-0.5">*</span>}
        </Label>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex items-center justify-center w-6 h-6 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            aria-label={`Remove ${label}`}
          >
            <X className="w-3.5 h-3.5" strokeWidth={2.4} />
          </button>
        )}
      </div>
      <Input
        className={`h-10 text-[15px] bg-background/60 border-border/50 rounded-lg focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:border-primary/50 transition-colors ${error ? 'border-destructive/50 focus-visible:border-destructive/60 focus-visible:ring-destructive/30' : ''}`}
        type={type}
        inputMode={type === 'tel' ? 'tel' : type === 'email' ? 'email' : type === 'number' ? 'numeric' : undefined}
        autoCapitalize={type === 'email' ? 'none' : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        autoFocus={autoFocus}
      />
      {error && <div className="mt-1.5 text-[12px] text-destructive">{error}</div>}
      {!error && hint && <div className="mt-1.5 text-[12px]">{hint}</div>}
    </div>
  );
}

function PickerRow({
  label, value, placeholder, onClick, error, required, last,
}: {
  label: string;
  value?: string;
  placeholder?: string;
  onClick: () => void;
  error?: string;
  required?: boolean;
  last?: boolean;
}) {
  const empty = !value;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 active:bg-muted/40 transition-colors text-left ${last ? '' : 'border-b border-border/30'}`}
    >
      <span className="text-[13px] text-muted-foreground shrink-0 min-w-[88px]">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </span>
      <div className="flex items-center gap-1 min-w-0 flex-1 justify-end">
        <div className={`text-[14px] truncate min-w-0 ${empty ? 'text-muted-foreground/55' : 'text-foreground font-medium'} ${error ? 'text-destructive' : ''}`}>
          {empty ? (placeholder ?? 'Select') : value}
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground/50 shrink-0" strokeWidth={2.2} />
      </div>
    </button>
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
