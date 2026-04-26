import { useState } from 'react';
import { ResponsiveDialog, ResponsiveDialogContent, ResponsiveDialogHeader, ResponsiveDialogTitle } from '@/components/ui/responsive-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { X, AlertTriangle } from 'lucide-react';
import { useAddCrmContact, LEAD_STATUSES, LEAD_SOURCES, AGENTS, PROJECTS } from '@/hooks/useCrmContacts';
import { useCrmTags, useCreateCrmTag } from '@/hooks/useCrmTags';
import { validateEmail, type EmailValidation } from '@/lib/emailValidation';
import { InlineLibraryPicker } from './InlineLibraryPicker';

import { FRASER_VALLEY_CITIES, CRM_LANGUAGES } from '@/lib/crmConstants';
import { CheckboxDropdown } from './CheckboxDropdown';

const PROPERTY_TYPE_OPTIONS = [
  { value: 'condo', label: 'Condo' },
  { value: 'townhome', label: 'Townhome' },
  { value: 'both', label: 'Both' },
];

interface AddLeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function EmailWarning({ validation, onFix }: { validation: EmailValidation; onFix: () => void }) {
  if (!validation.suggestion) return null;
  return (
    <div className="flex items-center gap-1.5 mt-1">
      <AlertTriangle className="w-3 h-3 flex-shrink-0" style={{ color: 'hsl(38 92% 50%)' }} />
      <span className="text-xs" style={{ color: 'hsl(38 92% 50%)' }}>{validation.suggestion}</span>
      <button
        type="button"
        onClick={onFix}
        className="text-xs font-semibold underline ml-0.5"
        style={{ color: 'hsl(38 92% 50%)' }}
      >
        Fix it
      </button>
    </div>
  );
}

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
    city_pref: '' as string,
    language: '' as string,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [emailValidation, setEmailValidation] = useState<EmailValidation>({ isValid: true, suggestion: null, correctedEmail: null });

  const handleEmailChange = (email: string) => {
    setForm({ ...form, email });
    if (email.trim()) {
      setEmailValidation(validateEmail(email));
    } else {
      setEmailValidation({ isValid: true, suggestion: null, correctedEmail: null });
    }
  };

  const fixEmail = () => {
    if (emailValidation.correctedEmail) {
      setForm({ ...form, email: emailValidation.correctedEmail });
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
    if (form.first_name.length > 100) errs.first_name = 'Max 100 characters';
    if (form.last_name.length > 100) errs.last_name = 'Max 100 characters';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
    setForm({ first_name: '', last_name: '', phone: '', email: '', project: '', source: '', status: 'New Lead', assigned_to: '', tags: [], campaign_source: '', property_type_pref: '', is_pre_approved: false, referral_source: '', city_pref: '', language: '' });
    setErrors({});
    setEmailValidation({ isValid: true, suggestion: null, correctedEmail: null });
    onOpenChange(false);
  };

  const toggleTag = (tag: string) => {
    setForm((prev) => ({
      ...prev,
      tags: prev.tags.includes(tag) ? prev.tags.filter((t) => t !== tag) : [...prev.tags, tag],
    }));
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto p-0 sm:p-6">
        <ResponsiveDialogHeader className="px-4 pt-4 sm:p-0 sm:pb-2">
          <ResponsiveDialogTitle>Add New Lead</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+88px)] sm:px-0 sm:pb-0 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="first_name">First Name *</Label>
              <Input
                id="first_name"
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                maxLength={100}
                className={errors.first_name ? 'border-destructive' : ''}
              />
              {errors.first_name && <p className="text-xs text-destructive mt-1">{errors.first_name}</p>}
            </div>
            <div>
              <Label htmlFor="last_name">Last Name *</Label>
              <Input
                id="last_name"
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                maxLength={100}
                className={errors.last_name ? 'border-destructive' : ''}
              />
              {errors.last_name && <p className="text-xs text-destructive mt-1">{errors.last_name}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={20} />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => handleEmailChange(e.target.value)}
                maxLength={255}
                className={errors.email ? 'border-destructive' : emailValidation.suggestion ? 'border-warning' : ''}
              />
              {errors.email && <p className="text-xs text-destructive mt-1">{errors.email}</p>}
              <EmailWarning validation={emailValidation} onFix={fixEmail} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Project</Label>
              <Select value={form.project} onValueChange={(v) => setForm({ ...form, project: v })}>
                <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                <SelectContent>
                  {PROJECTS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Source</Label>
              <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
                <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                <SelectContent>
                  {LEAD_SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Assigned To</Label>
              <Select value={form.assigned_to} onValueChange={(v) => setForm({ ...form, assigned_to: v })}>
                <SelectTrigger><SelectValue placeholder="Select agent" /></SelectTrigger>
                <SelectContent>
                  {AGENTS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* New fields: Campaign, Property Type, Pre-Approved, Referral, City */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Campaign Source</Label>
              <Input placeholder="e.g. FB_Surrey_Condos_Apr2026" value={form.campaign_source} onChange={e => setForm({ ...form, campaign_source: e.target.value })} />
            </div>
            <div>
              <Label>Referral Source</Label>
              <Input placeholder="e.g. Parm Heer, Google" value={form.referral_source} onChange={e => setForm({ ...form, referral_source: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Property Type Preference</Label>
              <Select value={form.property_type_pref} onValueChange={v => setForm({ ...form, property_type_pref: v })}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {PROPERTY_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Preferred City</Label>
              <CheckboxDropdown
                options={FRASER_VALLEY_CITIES}
                selected={form.city_pref ? form.city_pref.split(', ').filter(Boolean) : []}
                onChange={v => setForm({ ...form, city_pref: v.join(', ') })}
                placeholder="Select cities"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Language</Label>
              <CheckboxDropdown
                options={CRM_LANGUAGES}
                selected={form.language ? form.language.split(', ').filter(Boolean) : []}
                onChange={v => setForm({ ...form, language: v.join(', ') })}
                placeholder="Select languages"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={form.is_pre_approved} onCheckedChange={v => setForm({ ...form, is_pre_approved: v })} />
            <Label>Pre-Approved?</Label>
          </div>
          <div>
            <Label>Tags</Label>
            <div className="mt-1.5">
              <InlineLibraryPicker
                selected={form.tags}
                library={tagLib.map(t => ({ label: t.name, count: t.usage_count ?? 0 }))}
                onChange={(next) => setForm({ ...form, tags: next })}
                onCreate={(name) => createTag.mutate(name)}
                placeholder="Search or add tag…"
                emptyText="No tags yet"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={addContact.isPending} className="bg-primary text-primary-foreground">
              {addContact.isPending ? 'Adding...' : 'Add Lead'}
            </Button>
          </div>
        </form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
