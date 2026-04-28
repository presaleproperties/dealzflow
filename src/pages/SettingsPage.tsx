import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Save, MapPin, Building2, User, Info, Moon, Sun, Monitor,
  Download, Trash2, AlertTriangle, Crown, Check, Sparkles,
  Target, Palette, Database, DollarSign, Percent, Calendar, Shield,
  TrendingUp, Plug, BellRing, ExternalLink, CheckCircle2, Circle,
  ChevronRight, ArrowRight, Inbox, UserCircle2, CreditCard, FileText,
  Settings2,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { AppLayout } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';
import { useRefreshData } from '@/hooks/useRefreshData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { useDataExport } from '@/hooks/useDataExport';
import { useSubscription } from '@/hooks/useSubscription';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useSettings, useUpdateSettings } from '@/hooks/useSettings';
import { useProfile } from '@/hooks/useProfile';
import { PROVINCES, PROVINCE_NAMES, Province, TaxType, getTaxBrackets } from '@/lib/taxCalculator';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/format';
import { PlatformConnectionsManager } from '@/components/settings/PlatformConnectionsManager';
import { PushNotificationSetup } from '@/components/settings/PushNotificationSetup';
import ProfileSection from '@/components/settings/ProfileSection';

const springConfig = { type: 'spring' as const, stiffness: 120, damping: 20 };

/* ─────────────────────────────────────────────────────────────
   Tab definitions — grouped by topic
   ───────────────────────────────────────────────────────────── */
type TabId =
  | 'setup'
  | 'profile' | 'appearance' | 'notifications'
  | 'goals' | 'tax' | 'plan'
  | 'integrations' | 'data';

interface TabDef {
  id: TabId;
  label: string;
  icon: typeof User;
  group: 'account' | 'money' | 'workspace';
  description?: string;
}

const TABS: TabDef[] = [
  // Account — about you
  { id: 'setup',         label: 'Setup',          icon: Sparkles,     group: 'account',   description: 'Get started checklist' },
  { id: 'profile',       label: 'Profile',        icon: UserCircle2,  group: 'account',   description: 'Name, headshot, contact' },
  { id: 'appearance',    label: 'Appearance',     icon: Palette,      group: 'account',   description: 'Light, dark, system' },
  { id: 'notifications', label: 'Notifications',  icon: BellRing,     group: 'account',   description: 'Push alerts to your phone' },
  // Money — finances
  { id: 'goals',         label: 'Goals',          icon: Target,       group: 'money',     description: 'Income, GCI, RevShare targets' },
  { id: 'tax',           label: 'Tax & Finance',  icon: Shield,       group: 'money',     description: 'Province, brackets, GST, buffer' },
  { id: 'plan',          label: 'Plan',           icon: Crown,        group: 'money',     description: 'Subscription & billing' },
  // Workspace — connections + data
  { id: 'integrations',  label: 'Integrations',   icon: Plug,         group: 'workspace', description: 'ReZen, brokerage, transactions' },
  { id: 'data',          label: 'Data',           icon: Database,     group: 'workspace', description: 'Export & danger zone' },
];

/* Legacy ?tab=… aliases from older deep links */
const TAB_ALIASES: Record<string, TabId> = {
  general:       'goals',
  subscription:  'plan',
};

/* ─────────────────────────────────────────────────────────────
   Page shell
   ───────────────────────────────────────────────────────────── */
export default function SettingsPage() {
  const refreshData = useRefreshData();
  const [searchParams, setSearchParams] = useSearchParams();

  const requestedRaw = searchParams.get('tab') ?? 'setup';
  const requested = (TAB_ALIASES[requestedRaw] ?? requestedRaw) as TabId;
  const activeTab: TabId = TABS.some((t) => t.id === requested) ? requested : 'setup';

  // Snap query string back if alias was used / unknown tab requested
  useEffect(() => {
    if (requestedRaw !== activeTab) {
      const next = new URLSearchParams(searchParams);
      next.set('tab', activeTab);
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedRaw, activeTab]);

  const setTab = (id: TabId) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', id);
    setSearchParams(next);
    document.getElementById('account-settings-content')?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const accountTabs   = TABS.filter((t) => t.group === 'account');
  const moneyTabs     = TABS.filter((t) => t.group === 'money');
  const workspaceTabs = TABS.filter((t) => t.group === 'workspace');
  const activeMeta = TABS.find((t) => t.id === activeTab)!;

  return (
    <AppLayout>
      <Header
        title="Settings"
        subtitle="Your account · the dealzflow workspace"
        showAddDeal={false}
      />

      <PullToRefresh onRefresh={refreshData} className="min-h-[calc(100dvh-56px)]">
        <motion.div
          className="p-3 sm:p-4 md:p-6 max-w-6xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springConfig}
        >
          <div className="flex flex-col lg:flex-row gap-0 lg:gap-6">
            {/* Mobile/Tablet — horizontal pill bar */}
            <div className="lg:hidden overflow-x-auto border-b border-border bg-background sticky top-0 z-10 -mx-3 sm:-mx-4 px-3 sm:px-4 mb-4">
              <div className="flex gap-1 py-2 min-w-max">
                {TABS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setTab(id)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors',
                      activeTab === id
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/50 text-muted-foreground hover:bg-muted',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Desktop — sticky grouped sidebar */}
            <nav className="hidden lg:flex flex-col w-56 shrink-0 sticky top-4 self-start pt-1">
              <h2 className="text-lg font-bold text-foreground mb-1 tracking-[-0.01em]">Account Settings</h2>
              <p className="text-[11.5px] text-muted-foreground mb-5">
                Personal preferences. CRM workspace settings live in <a href="/crm/settings" className="text-primary hover:underline">CRM Settings</a>.
              </p>

              <SidebarGroup label="Account"   tabs={accountTabs}   activeTab={activeTab} onSelect={setTab} />
              <SidebarGroup label="Money"     tabs={moneyTabs}     activeTab={activeTab} onSelect={setTab} className="mt-5" />
              <SidebarGroup label="Workspace" tabs={workspaceTabs} activeTab={activeTab} onSelect={setTab} className="mt-5" />
            </nav>

            {/* Main content */}
            <div
              id="account-settings-content"
              className="flex-1 min-w-0 space-y-5 max-w-3xl pb-12"
            >
              <div className="hidden lg:flex items-baseline gap-2.5">
                <activeMeta.icon className="h-4.5 w-4.5 text-primary self-center" />
                <h2 className="text-[20px] font-bold text-foreground tracking-[-0.02em]">{activeMeta.label}</h2>
                {activeMeta.description && (
                  <span className="text-[12.5px] text-muted-foreground">· {activeMeta.description}</span>
                )}
              </div>

              {activeTab === 'setup'         && <SetupChecklistTab onJump={setTab} />}
              {activeTab === 'profile'       && <ProfileSection />}
              {activeTab === 'appearance'    && <AppearanceSection />}
              {activeTab === 'notifications' && <NotificationsTab />}
              {activeTab === 'goals'         && <GoalsTab />}
              {activeTab === 'tax'           && <TaxTab />}
              {activeTab === 'plan'          && <SubscriptionSection />}
              {activeTab === 'integrations'  && <PlatformConnectionsManager />}
              {activeTab === 'data'          && <DataTab />}
            </div>
          </div>
        </motion.div>
      </PullToRefresh>
    </AppLayout>
  );
}

/* ─────────────────────────────────────────────────────────────
   Sidebar group
   ───────────────────────────────────────────────────────────── */
function SidebarGroup({
  label, tabs, activeTab, onSelect, className,
}: {
  label: string;
  tabs: TabDef[];
  activeTab: TabId;
  onSelect: (id: TabId) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="px-2.5 mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/80">
        {label}
      </div>
      <div className="space-y-0.5">
        {tabs.map(({ id, label: tabLabel, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => onSelect(id)}
              className={cn(
                'flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-[13px] font-medium transition-all text-left',
                active
                  ? 'bg-primary/10 text-primary shadow-[inset_2px_0_0_hsl(var(--primary))]'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{tabLabel}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Setup checklist landing
   ───────────────────────────────────────────────────────────── */
function SetupChecklistTab({ onJump }: { onJump: (id: TabId) => void }) {
  const { data: profile } = useProfile();
  const { data: settings } = useSettings();
  const { tier } = useSubscription();

  const items = [
    {
      done: !!profile?.avatar_url,
      title: 'Add your headshot',
      desc: 'Used in nav, signatures, and lead headers.',
      tab: 'profile' as TabId,
    },
    {
      done: !!profile?.full_name && !!profile?.title && !!profile?.phone,
      title: 'Complete your profile',
      desc: 'Full name, title, and phone for everywhere you appear.',
      tab: 'profile' as TabId,
    },
    {
      done: !!(settings as any)?.province,
      title: 'Confirm your tax province',
      desc: 'Drives accurate tax brackets and GST/HST.',
      tab: 'tax' as TabId,
    },
    {
      done: ((settings as any)?.yearly_gci_goal ?? 0) > 0,
      title: 'Set your yearly GCI goal',
      desc: 'Powers progress tracking on the dashboard.',
      tab: 'goals' as TabId,
    },
    {
      done: tier === 'pro',
      title: 'Pick your plan',
      desc: 'Upgrade or stay on Free — your choice.',
      tab: 'plan' as TabId,
    },
  ];

  const doneCount = items.filter((i) => i.done).length;
  const pct = Math.round((doneCount / items.length) * 100);

  return (
    <div className="space-y-5">
      <Card className="rounded-xl overflow-hidden border-primary/20">
        <div className="relative bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-[10.5px] uppercase tracking-[0.16em] font-semibold text-primary">Welcome</span>
              </div>
              <h3 className="text-[22px] font-bold text-foreground tracking-[-0.02em]">
                {profile?.full_name ? `Hey ${profile.full_name.split(' ')[0]}` : 'Get set up'}
              </h3>
              <p className="text-[13px] text-muted-foreground mt-1 max-w-md">
                {pct === 100
                  ? 'Your account is fully configured. Nice work.'
                  : 'A few quick steps to get the most out of dealzflow.'}
              </p>
            </div>
            <div className="text-right">
              <div className="text-[28px] font-bold text-primary tabular-nums leading-none tracking-tight">{pct}%</div>
              <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground mt-1 font-semibold">
                {doneCount}/{items.length} complete
              </div>
            </div>
          </div>
          <div className="mt-4 h-1.5 rounded-full bg-muted/60 overflow-hidden">
            <div className="h-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </Card>

      <Card className="rounded-xl divide-y divide-border/60">
        {items.map((item, i) => (
          <button
            key={i}
            onClick={() => onJump(item.tab)}
            className="w-full text-left p-4 flex items-start gap-3 hover:bg-muted/30 transition-colors group first:rounded-t-xl last:rounded-b-xl"
          >
            <div className="shrink-0 mt-0.5">
              {item.done ? (
                <div className="w-5 h-5 rounded-full bg-emerald-500/15 flex items-center justify-center">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                </div>
              ) : (
                <Circle className="w-5 h-5 text-muted-foreground/40" strokeWidth={1.5} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className={cn(
                'text-[13.5px] font-semibold leading-tight',
                item.done ? 'text-muted-foreground line-through decoration-muted-foreground/40' : 'text-foreground',
              )}>
                {item.title}
              </div>
              <div className="text-[12px] text-muted-foreground mt-0.5">{item.desc}</div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-1 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
          </button>
        ))}
      </Card>

      <Card className="rounded-xl">
        <CardContent className="p-4 sm:p-5 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <Inbox className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <div className="text-[13.5px] font-semibold text-foreground">Looking for CRM settings?</div>
              <div className="text-[12px] text-muted-foreground">
                Team, lead flow, integrations, signatures — all live in the CRM.
              </div>
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <a href="/crm/settings">
              Open CRM Settings <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   SECTION: Appearance
   ───────────────────────────────────────────────────────────── */
function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const updateSettings = useUpdateSettings({ silent: true });
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  if (!mounted) {
    return <div className="h-20 animate-pulse bg-muted rounded-xl" />;
  }

  const themes = [
    { value: 'light', icon: Sun, label: 'Light' },
    { value: 'dark', icon: Moon, label: 'Dark' },
    { value: 'system', icon: Monitor, label: 'System' },
  ];

  function handleTheme(value: string) {
    setTheme(value);
    updateSettings.mutate({ theme: value as 'light' | 'dark' | 'system' });
  }

  return (
    <Card className="rounded-xl">
      <CardContent className="p-5 sm:p-6 space-y-3">
        <div>
          <div className="text-[14px] font-semibold text-foreground">Theme</div>
          <p className="text-[12px] text-muted-foreground mt-0.5">Choose how the app looks. System follows your device.</p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {themes.map(({ value, icon: ThemeIcon, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => handleTheme(value)}
              className={cn(
                'p-4 rounded-xl border-2 transition-all duration-200 text-center group',
                theme === value
                  ? 'border-primary/70 bg-primary/[0.08] shadow-[0_0_0_3px_hsl(var(--primary)/0.12)]'
                  : 'border-border/50 bg-muted/20 hover:border-border/80 hover:bg-muted/40',
              )}
            >
              <ThemeIcon className={cn(
                'w-5 h-5 mx-auto mb-2 transition-colors',
                theme === value ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
              )} />
              <span className={cn(
                'text-[12px] font-semibold tracking-[-0.01em]',
                theme === value ? 'text-primary' : 'text-foreground/70',
              )}>
                {label}
              </span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────────
   SECTION: Notifications
   ───────────────────────────────────────────────────────────── */
function NotificationsTab() {
  return (
    <Card className="rounded-xl">
      <CardContent className="p-5 sm:p-6">
        <PushNotificationSetup />
      </CardContent>
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────────
   SECTION: Goals — owns its own state + Save button
   ───────────────────────────────────────────────────────────── */
function GoalsTab() {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();

  const [monthlyIncomeGoal, setMonthlyIncomeGoal] = useState(0);
  const [yearlyGciGoal, setYearlyGciGoal] = useState(0);
  const [yearlyRevshareGoal, setYearlyRevshareGoal] = useState(0);

  useEffect(() => {
    if (!settings) return;
    setMonthlyIncomeGoal((settings as any).monthly_income_goal || 0);
    setYearlyGciGoal((settings as any).yearly_gci_goal || 0);
    setYearlyRevshareGoal((settings as any).yearly_revshare_goal || 0);
  }, [settings]);

  const dirty = useMemo(() => {
    if (!settings) return false;
    return (
      monthlyIncomeGoal !== ((settings as any).monthly_income_goal || 0) ||
      yearlyGciGoal !== ((settings as any).yearly_gci_goal || 0) ||
      yearlyRevshareGoal !== ((settings as any).yearly_revshare_goal || 0)
    );
  }, [settings, monthlyIncomeGoal, yearlyGciGoal, yearlyRevshareGoal]);

  const save = () =>
    updateSettings.mutate({
      monthly_income_goal: monthlyIncomeGoal,
      yearly_gci_goal: yearlyGciGoal,
      yearly_revshare_goal: yearlyRevshareGoal,
    } as any);

  return (
    <div className="space-y-5">
      <Card className="rounded-xl">
        <CardContent className="p-5 sm:p-6 space-y-6">
          <GoalRow
            label="Monthly Income Goal"
            help="Set a target to track against your actual income."
            suffix="/month"
            value={monthlyIncomeGoal}
            onChange={setMonthlyIncomeGoal}
            extra={monthlyIncomeGoal > 0 && (
              <p className="text-xs text-muted-foreground">Annual target: {formatCurrency(monthlyIncomeGoal * 12)}</p>
            )}
            step={1000}
          />
          <div className="border-t border-border/50 pt-5">
            <GoalRow
              label="Yearly GCI Goal"
              help="Gross Commission Income target for the current year."
              suffix="/year"
              value={yearlyGciGoal}
              onChange={setYearlyGciGoal}
              step={5000}
            />
          </div>
          <div className="border-t border-border/50 pt-5">
            <GoalRow
              label="Yearly RevShare Goal"
              help="Revenue Share income target for the current year."
              suffix="/year"
              value={yearlyRevshareGoal}
              onChange={setYearlyRevshareGoal}
              step={1000}
            />
          </div>
        </CardContent>
      </Card>

      <SaveBar dirty={dirty} pending={updateSettings.isPending} onSave={save} />
    </div>
  );
}

function GoalRow({
  label, help, suffix, value, onChange, step, extra,
}: {
  label: string; help: string; suffix: string;
  value: number; onChange: (n: number) => void; step: number;
  extra?: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-[13px] font-semibold">{label}</Label>
      <p className="text-[12px] text-muted-foreground">{help}</p>
      <div className="flex items-center gap-3">
        <Input
          type="number" min="0" step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="flex-1 max-w-[200px]"
        />
        <span className="text-sm text-muted-foreground shrink-0">{suffix}</span>
      </div>
      {extra}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   SECTION: Tax — owns its own state + Save button
   ───────────────────────────────────────────────────────────── */
function TaxTab() {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();

  const [country, setCountry] = useState('CA');
  const [province, setProvince] = useState<Province>('BC');
  const [taxType, setTaxType] = useState<TaxType>('self-employed');
  const [taxPercent, setTaxPercent] = useState(0);
  const [applyTaxToForecasts, setApplyTaxToForecasts] = useState(false);
  const [gstRegistered, setGstRegistered] = useState(false);
  const [gstRate, setGstRate] = useState(5);
  const [taxBuffer, setTaxBuffer] = useState(5);
  const [taxCalculationMethod, setTaxCalculationMethod] = useState<'progressive' | 'flat'>('progressive');
  const [taxSavedAmount, setTaxSavedAmount] = useState(0);

  useEffect(() => {
    if (!settings) return;
    setCountry((settings as any).country || 'CA');
    setProvince(((settings as any).province || 'BC') as Province);
    setTaxType(((settings as any).tax_type || 'self-employed') as TaxType);
    setTaxPercent((settings as any).tax_set_aside_percent || 0);
    setApplyTaxToForecasts((settings as any).apply_tax_to_forecasts || false);
    setGstRegistered((settings as any).gst_registered || false);
    setGstRate(((settings as any).gst_rate || 0.05) * 100);
    setTaxBuffer((settings as any).tax_buffer_percent || 5);
    setTaxCalculationMethod((settings as any).tax_calculation_method || 'progressive');
    setTaxSavedAmount((settings as any).tax_saved_amount || 0);
  }, [settings]);

  const dirty = useMemo(() => {
    if (!settings) return false;
    return (
      country !== ((settings as any).country || 'CA') ||
      province !== (((settings as any).province || 'BC') as Province) ||
      taxType !== (((settings as any).tax_type || 'self-employed') as TaxType) ||
      taxPercent !== ((settings as any).tax_set_aside_percent || 0) ||
      applyTaxToForecasts !== ((settings as any).apply_tax_to_forecasts || false) ||
      gstRegistered !== ((settings as any).gst_registered || false) ||
      gstRate !== (((settings as any).gst_rate || 0.05) * 100) ||
      taxBuffer !== ((settings as any).tax_buffer_percent || 5) ||
      taxCalculationMethod !== ((settings as any).tax_calculation_method || 'progressive') ||
      taxSavedAmount !== ((settings as any).tax_saved_amount || 0)
    );
  }, [settings, country, province, taxType, taxPercent, applyTaxToForecasts,
      gstRegistered, gstRate, taxBuffer, taxCalculationMethod, taxSavedAmount]);

  const save = () =>
    updateSettings.mutate({
      country, province, tax_type: taxType,
      tax_set_aside_percent: taxPercent,
      apply_tax_to_forecasts: applyTaxToForecasts,
      gst_registered: gstRegistered,
      gst_rate: gstRate / 100,
      tax_buffer_percent: taxBuffer,
      tax_calculation_method: taxCalculationMethod,
      tax_saved_amount: taxSavedAmount,
    } as any);

  const taxBrackets = getTaxBrackets(province, taxType);

  return (
    <div className="space-y-5">
      {/* Jurisdiction */}
      <Card className="rounded-xl">
        <CardContent className="p-5 sm:p-6 space-y-5">
          <div>
            <div className="text-[14px] font-semibold text-foreground">Jurisdiction</div>
            <p className="text-[12px] text-muted-foreground mt-0.5">Where you file. Drives tax brackets.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[12px]">Country</Label>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="CA">🇨🇦 Canada</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">Province / Territory</Label>
              <Select value={province} onValueChange={(v) => setProvince(v as Province)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROVINCES.map((p) => <SelectItem key={p} value={p}>{PROVINCE_NAMES[p]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <Label className="text-[12px]">Filing type</Label>
            <div className="grid grid-cols-2 gap-3">
              <ChoiceCard active={taxType === 'self-employed'} onClick={() => setTaxType('self-employed')}
                icon={User} title="Self-Employed" desc="Personal income tax + CPP" />
              <ChoiceCard active={taxType === 'corporation'} onClick={() => setTaxType('corporation')}
                icon={Building2} title="Corporation" desc="Small business & general rates" />
            </div>
          </div>

          <div className="p-3 rounded-lg bg-muted/40 border border-border/60">
            <div className="flex items-center gap-2 mb-2">
              <Info className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[12px] font-medium">
                {taxType === 'corporation' ? 'Corporate rates' : 'Brackets'} · {PROVINCE_NAMES[province]}
              </span>
            </div>
            {taxType === 'corporation' && taxBrackets.corporateRates ? (
              <div className="space-y-1 text-[12px]">
                <div className="flex justify-between"><span className="text-muted-foreground">Small Business (≤$500K)</span><span className="font-semibold text-emerald-600">{(taxBrackets.corporateRates.small * 100).toFixed(1)}%</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">General (&gt;$500K)</span><span className="font-semibold">{(taxBrackets.corporateRates.general * 100).toFixed(1)}%</span></div>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-4 text-[11.5px]">
                <div>
                  <p className="text-muted-foreground mb-1 font-medium">Federal</p>
                  {taxBrackets.federal.slice(0, 3).map((b, i) => (
                    <div key={i} className="flex justify-between py-0.5">
                      <span className="text-muted-foreground">
                        {b.max === Infinity ? `$${(b.min / 1000).toFixed(0)}K+` : `$${(b.min / 1000).toFixed(0)}K – $${(b.max / 1000).toFixed(0)}K`}
                      </span>
                      <span className="font-medium">{(b.rate * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="text-muted-foreground mb-1 font-medium">Provincial ({province})</p>
                  {taxBrackets.provincial.slice(0, 3).map((b, i) => (
                    <div key={i} className="flex justify-between py-0.5">
                      <span className="text-muted-foreground">
                        {b.max === Infinity ? `$${(b.min / 1000).toFixed(0)}K+` : `$${(b.min / 1000).toFixed(0)}K – $${(b.max / 1000).toFixed(0)}K`}
                      </span>
                      <span className="font-medium">{(b.rate * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Calculation & buffer */}
      <Card className="rounded-xl">
        <CardContent className="p-5 sm:p-6 space-y-5">
          <div>
            <div className="text-[14px] font-semibold text-foreground">Calculation</div>
            <p className="text-[12px] text-muted-foreground mt-0.5">How taxes are estimated and your safety buffer.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ChoiceCard active={taxCalculationMethod === 'progressive'} onClick={() => setTaxCalculationMethod('progressive')}
              icon={TrendingUp} title="Progressive" desc="CRA tax brackets (recommended)" />
            <ChoiceCard active={taxCalculationMethod === 'flat'} onClick={() => setTaxCalculationMethod('flat')}
              icon={Percent} title="Flat Rate" desc="Single percentage" />
          </div>

          <AnimatePresence>
            {taxCalculationMethod === 'flat' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-2"
              >
                <div className="flex items-center justify-between">
                  <Label className="text-[12px]">Set-aside percentage</Label>
                  <span className="text-lg font-bold tabular-nums">{taxPercent}<span className="text-sm text-muted-foreground ml-0.5">%</span></span>
                </div>
                <Slider value={[taxPercent]} onValueChange={([v]) => setTaxPercent(v)} max={50} step={0.5} />
              </motion.div>
            )}
          </AnimatePresence>

          <div className="border-t border-border/50 pt-4 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-[12px]">Conservative buffer</Label>
              <span className="text-sm font-bold tabular-nums">{taxBuffer}%</span>
            </div>
            <p className="text-[11.5px] text-muted-foreground">Extra safety margin on top of calculated tax.</p>
            <Slider value={[taxBuffer]} onValueChange={([v]) => setTaxBuffer(v)} max={25} step={1} />
          </div>

          <div className="border-t border-border/50 pt-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <Label className="text-[12px]">GST/HST registered</Label>
                <p className="text-[11.5px] text-muted-foreground">Collect and remit GST/HST?</p>
              </div>
              <Switch checked={gstRegistered} onCheckedChange={setGstRegistered} />
            </div>
            <AnimatePresence>
              {gstRegistered && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="pl-3 border-l-2 border-primary/30 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <Label className="text-[12px]">Rate</Label>
                    <p className="text-[11px] text-muted-foreground">BC: 5% GST · ON: 13% HST</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number" min="0" max="15" step="0.5"
                      value={gstRate}
                      onChange={(e) => setGstRate(parseFloat(e.target.value) || 5)}
                      className="w-20 text-center"
                    />
                    <span className="text-muted-foreground text-sm">%</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="border-t border-border/50 pt-4 space-y-2">
            <Label className="text-[12px]">Tax already saved (YTD)</Label>
            <p className="text-[11.5px] text-muted-foreground">How much have you set aside this year?</p>
            <Input
              type="number" min="0" step="100"
              value={taxSavedAmount}
              onChange={(e) => setTaxSavedAmount(parseFloat(e.target.value) || 0)}
              className="w-full max-w-[200px]"
            />
          </div>

          <div className="border-t border-border/50 pt-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Label className="text-[12px]">Apply tax to forecasts</Label>
              <p className="text-[11.5px] text-muted-foreground">Show net amounts after tax</p>
            </div>
            <Switch checked={applyTaxToForecasts} onCheckedChange={setApplyTaxToForecasts} />
          </div>
        </CardContent>
      </Card>

      <SaveBar dirty={dirty} pending={updateSettings.isPending} onSave={save} />
    </div>
  );
}

function ChoiceCard({
  active, onClick, icon: Icon, title, desc,
}: {
  active: boolean; onClick: () => void; icon: typeof User; title: string; desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'p-3.5 rounded-xl border-2 transition-all text-left',
        active
          ? 'border-primary/70 bg-primary/[0.08] shadow-[0_0_0_3px_hsl(var(--primary)/0.10)]'
          : 'border-border/50 bg-muted/20 hover:border-border/80 hover:bg-muted/40',
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon className={cn('w-3.5 h-3.5', active ? 'text-primary' : 'text-muted-foreground')} />
        <span className={cn('text-[12.5px] font-semibold tracking-[-0.01em]', active ? 'text-primary' : 'text-foreground/80')}>{title}</span>
      </div>
      <p className="text-[11px] text-muted-foreground/80 leading-tight">{desc}</p>
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────
   Sticky Save bar — only renders when there are changes
   ───────────────────────────────────────────────────────────── */
function SaveBar({ dirty, pending, onSave }: { dirty: boolean; pending: boolean; onSave: () => void }) {
  return (
    <AnimatePresence>
      {dirty && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          className="sticky bottom-3 z-20"
        >
          <Card className="rounded-xl border-primary/30 shadow-lg">
            <CardContent className="p-3 flex items-center justify-between gap-3">
              <div className="text-[12.5px] text-foreground">
                <span className="font-semibold">Unsaved changes.</span>{' '}
                <span className="text-muted-foreground">Save to apply.</span>
              </div>
              <Button onClick={onSave} disabled={pending}>
                <Save className="w-4 h-4 mr-2" />
                {pending ? 'Saving…' : 'Save Changes'}
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ─────────────────────────────────────────────────────────────
   SECTION: Subscription / Plan
   ───────────────────────────────────────────────────────────── */
function SubscriptionSection() {
  const { limits, usage, isPro, isFree } = useSubscription();
  const [loading, setLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  const PRO_FEATURES = [
    'Unlimited deals', 'Full expense tracking', '12-month projections',
    'Tax set-aside calculator', 'Safe-to-spend tracking', 'Data export', 'Priority support',
  ];

  const handleUpgrade = async () => {
    setLoading(true);
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Please sign in to upgrade');
      const response = await supabase.functions.invoke('create-checkout', {
        body: { returnUrl: window.location.origin },
      });
      if (response.error) throw new Error(response.error.message);
      if (response.data?.url) window.location.href = response.data.url;
    } catch (error) {
      console.error('Error:', error);
    } finally { setLoading(false); }
  };

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const { toast } = await import('sonner');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error('Please sign in to manage your subscription'); return; }
      const response = await supabase.functions.invoke('create-portal-session', {
        body: { returnUrl: window.location.origin },
      });
      if (response.error) throw new Error(response.error.message);
      if (response.data?.noStripeCustomer) { toast.info('Your subscription was set up by an administrator. No billing to manage.'); return; }
      if (response.data?.noActiveSubscription) { toast.info("You don't have an active subscription to manage."); return; }
      if (response.data?.url) window.location.href = response.data.url;
    } catch (error: any) {
      const { toast } = await import('sonner');
      toast.error(error?.message || 'Failed to open subscription portal');
    } finally { setPortalLoading(false); }
  };

  if (isFree) {
    return (
      <div className="space-y-5">
        <Card className="rounded-xl">
          <CardContent className="p-5 sm:p-6 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold">Deals used</span>
              <span className="text-[13px] font-bold tabular-nums">{usage.dealsUsed} / {limits.maxDeals}</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${Math.min(100, usage.percentUsed)}%` }} />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-primary/30 overflow-hidden">
          <div className="bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-5 sm:p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                <Crown className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-bold text-[17px] tracking-[-0.02em]">Upgrade to Pro</p>
                <p className="text-[12.5px] text-muted-foreground">Unlock unlimited deals & all features</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mb-5">
              {PRO_FEATURES.map((f) => (
                <div key={f} className="flex items-center gap-2 text-[12.5px]">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>{f}</span>
                </div>
              ))}
            </div>
            <div className="flex items-baseline gap-2 mb-4">
              <span className="text-[28px] font-bold tabular-nums tracking-tight">$29</span>
              <span className="text-muted-foreground text-sm">CAD/month</span>
            </div>
            <Button className="w-full h-11" onClick={handleUpgrade} disabled={loading}>
              {loading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                       : <><Sparkles className="w-4 h-4 mr-2" /> Start 14-Day Free Trial</>}
            </Button>
            <p className="text-[11px] text-center text-muted-foreground mt-2">14-day free trial · Cancel anytime</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Card className="rounded-xl border-primary/30">
        <CardContent className="p-5 sm:p-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
            <Crown className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-[15px] tracking-[-0.01em]">Pro Plan Active</p>
            <p className="text-[12px] text-muted-foreground">All features unlocked</p>
          </div>
        </CardContent>
      </Card>
      <Card className="rounded-xl">
        <CardContent className="p-5 sm:p-6 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {PRO_FEATURES.map((f) => (
              <div key={f} className="flex items-center gap-2 text-[12.5px] p-2 rounded-lg bg-muted/40">
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>{f}</span>
              </div>
            ))}
          </div>
          <Button variant="outline" className="w-full" onClick={handleManageSubscription} disabled={portalLoading}>
            {portalLoading ? 'Loading…' : 'Manage Subscription'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   SECTION: Data — Export + Danger
   ───────────────────────────────────────────────────────────── */
function DataTab() {
  return (
    <div className="space-y-5">
      <DataExportSection />
      <DeleteAccountSection />
    </div>
  );
}

function DataExportSection() {
  const { exportDeals, exportPayouts, exportExpenses, exportPipeline, exportAll, counts } = useDataExport();
  const exports = [
    { label: 'Deals',              count: counts.deals,    action: exportDeals },
    { label: 'Pipeline Prospects', count: counts.pipeline, action: exportPipeline },
    { label: 'Payouts',            count: counts.payouts,  action: exportPayouts },
    { label: 'Expenses',           count: counts.expenses, action: exportExpenses },
  ];

  return (
    <Card className="rounded-xl">
      <CardContent className="p-5 sm:p-6 space-y-3">
        <div>
          <div className="text-[14px] font-semibold text-foreground flex items-center gap-2">
            <Download className="w-4 h-4 text-primary" /> Export Data
          </div>
          <p className="text-[12px] text-muted-foreground mt-0.5">Download your records as CSV files.</p>
        </div>
        <div className="space-y-2">
          {exports.map(({ label, count, action }) => (
            <div key={label} className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border/50">
              <div>
                <p className="text-[13px] font-medium">{label}</p>
                <p className="text-[11.5px] text-muted-foreground">{count} records</p>
              </div>
              <Button variant="outline" size="sm" onClick={action} disabled={count === 0}>
                <Download className="w-3.5 h-3.5 mr-1.5" /> Export
              </Button>
            </div>
          ))}
          <Button onClick={exportAll} className="w-full">
            <Download className="w-4 h-4 mr-2" /> Export All Data
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DeleteAccountSection() {
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const { deleteAccount } = useAuth();
  const navigate = useNavigate();

  const handleDelete = async () => {
    if (confirmText !== 'DELETE') return;
    setLoading(true);
    const { error } = await deleteAccount();
    if (error) {
      const { toast } = await import('sonner');
      toast.error(error.message || 'Failed to delete account');
      setLoading(false);
    } else {
      navigate('/auth');
    }
  };

  return (
    <Card className="rounded-xl border-destructive/30 overflow-hidden">
      <div className="p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-destructive/10 border border-destructive/30 flex items-center justify-center text-destructive">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-[14px] font-bold text-destructive">Danger Zone</h3>
            <p className="text-[11.5px] text-muted-foreground">Irreversible actions</p>
          </div>
        </div>

        {!showConfirm ? (
          <div className="space-y-3">
            <p className="text-[12.5px] text-muted-foreground">
              Permanently delete your account and all data. This cannot be undone.
            </p>
            <Button variant="destructive" onClick={() => setShowConfirm(true)}>
              <Trash2 className="w-4 h-4 mr-2" /> Delete Account
            </Button>
          </div>
        ) : (
          <motion.div className="space-y-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <p className="text-[12.5px] font-semibold text-destructive mb-1.5">⚠️ This will permanently delete:</p>
              <ul className="text-[12px] text-muted-foreground list-disc list-inside space-y-0.5">
                <li>All deals and payouts</li>
                <li>All expense records</li>
                <li>All properties and settings</li>
                <li>Your account and profile</li>
              </ul>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">Type DELETE to confirm</Label>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE"
                className="font-mono"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setShowConfirm(false); setConfirmText(''); }} className="flex-1">
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDelete}
                disabled={confirmText !== 'DELETE' || loading} className="flex-1">
                {loading ? 'Deleting…' : 'Confirm Delete'}
              </Button>
            </div>
          </motion.div>
        )}
      </div>
    </Card>
  );
}
