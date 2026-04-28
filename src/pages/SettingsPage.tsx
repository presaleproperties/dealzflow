import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Save, MapPin, Building2, User, Info, Moon, Sun, Monitor,
  Download, Trash2, AlertTriangle, PiggyBank, Crown, Check, Sparkles,
  Target, Palette, CreditCard, Database, Settings2,
  DollarSign, Percent, Calendar, Shield, TrendingUp, Wallet, Plug, Bell, BellRing,
  ExternalLink, Send, CheckCircle2, Phone, UserCircle2,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';
import { useRefreshData } from '@/hooks/useRefreshData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/hooks/useAuth';
import { useDataExport } from '@/hooks/useDataExport';
import { useSubscription } from '@/hooks/useSubscription';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSettings, useUpdateSettings } from '@/hooks/useSettings';
import { PROVINCES, PROVINCE_NAMES, Province, TaxType, getTaxBrackets } from '@/lib/taxCalculator';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/format';
import { PlatformConnectionsManager } from '@/components/settings/PlatformConnectionsManager';
import { PushNotificationSetup } from '@/components/settings/PushNotificationSetup';
import ProfileSection from '@/components/settings/ProfileSection';


const springConfig = { type: "spring" as const, stiffness: 120, damping: 20 };

// Sticky left-nav sections — same pattern as CrmSettingsPage
const SETTINGS_SECTIONS = [
  { id: 'settings-profile',       label: 'Profile',       icon: UserCircle2 },
  { id: 'settings-goals',         label: 'Goals',         icon: Target },
  { id: 'settings-tax',           label: 'Tax & Finance', icon: Shield },
  { id: 'settings-subscription',  label: 'Plan',          icon: Crown },
  { id: 'settings-integrations',  label: 'Integrations',  icon: Plug },
  { id: 'settings-notifications', label: 'Notifications', icon: BellRing },
  { id: 'settings-data',          label: 'Data',          icon: Database },
] as const;

export default function SettingsPage() {
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const refreshData = useRefreshData();
  const [searchParams] = useSearchParams();
  const initialSection = (() => {
    const tab = searchParams.get('tab');
    const map: Record<string, string> = {
      profile: 'settings-profile',
      general: 'settings-goals',
      tax: 'settings-tax',
      subscription: 'settings-subscription',
      integrations: 'settings-integrations',
      notifications: 'settings-notifications',
      data: 'settings-data',
    };
    return (tab && map[tab]) || 'settings-profile';
  })();
  const [hasChanges, setHasChanges] = useState(false);


  // All settings state
  const [taxPercent, setTaxPercent] = useState(0);
  
  const [applyTaxToForecasts, setApplyTaxToForecasts] = useState(false);
  const [country, setCountry] = useState('CA');
  const [province, setProvince] = useState<Province>('BC');
  const [taxType, setTaxType] = useState<TaxType>('self-employed');
  
  // Tax safety settings
  const [gstRegistered, setGstRegistered] = useState(false);
  const [gstRate, setGstRate] = useState(5);
  const [taxBuffer, setTaxBuffer] = useState(5);
  const [taxCalculationMethod, setTaxCalculationMethod] = useState<'progressive' | 'flat'>('progressive');
  const [taxSavedAmount, setTaxSavedAmount] = useState(0);
  
  
  // Goals
  const [monthlyIncomeGoal, setMonthlyIncomeGoal] = useState(0);
  const [yearlyGciGoal, setYearlyGciGoal] = useState(0);
  const [yearlyRevshareGoal, setYearlyRevshareGoal] = useState(0);

  useEffect(() => {
    if (settings) {
      setTaxPercent(settings.tax_set_aside_percent || 0);
      setApplyTaxToForecasts(settings.apply_tax_to_forecasts || false);
      setCountry((settings as any).country || 'CA');
      setProvince(((settings as any).province || 'BC') as Province);
      setTaxType(((settings as any).tax_type || 'self-employed') as TaxType);
      setGstRegistered((settings as any).gst_registered || false);
      setGstRate(((settings as any).gst_rate || 0.05) * 100);
      setTaxBuffer((settings as any).tax_buffer_percent || 5);
      setTaxCalculationMethod((settings as any).tax_calculation_method || 'progressive');
      setTaxSavedAmount((settings as any).tax_saved_amount || 0);
      setMonthlyIncomeGoal((settings as any).monthly_income_goal || 0);
      setYearlyGciGoal((settings as any).yearly_gci_goal || 0);
      setYearlyRevshareGoal((settings as any).yearly_revshare_goal || 0);
    }
  }, [settings]);

  // Track changes
  useEffect(() => {
    if (settings) {
      const changed =
        taxPercent !== (settings.tax_set_aside_percent || 0) ||
        applyTaxToForecasts !== (settings.apply_tax_to_forecasts || false) ||
        country !== ((settings as any).country || 'CA') ||
        province !== (((settings as any).province || 'BC') as Province) ||
        taxType !== (((settings as any).tax_type || 'self-employed') as TaxType) ||
        gstRegistered !== ((settings as any).gst_registered || false) ||
        gstRate !== (((settings as any).gst_rate || 0.05) * 100) ||
        taxBuffer !== ((settings as any).tax_buffer_percent || 5) ||
        taxCalculationMethod !== ((settings as any).tax_calculation_method || 'progressive') ||
        taxSavedAmount !== ((settings as any).tax_saved_amount || 0) ||
        monthlyIncomeGoal !== ((settings as any).monthly_income_goal || 0) ||
        yearlyGciGoal !== ((settings as any).yearly_gci_goal || 0) ||
        yearlyRevshareGoal !== ((settings as any).yearly_revshare_goal || 0);
      setHasChanges(changed);
    }
  }, [settings, taxPercent, applyTaxToForecasts, country, province, taxType,
      gstRegistered, gstRate, taxBuffer, taxCalculationMethod, taxSavedAmount,
      monthlyIncomeGoal, yearlyGciGoal, yearlyRevshareGoal]);

  const handleSave = async () => {
    await updateSettings.mutateAsync({
      tax_set_aside_percent: taxPercent,
      apply_tax_to_forecasts: applyTaxToForecasts,
      country,
      province,
      tax_type: taxType,
      gst_registered: gstRegistered,
      gst_rate: gstRate / 100,
      tax_buffer_percent: taxBuffer,
      tax_calculation_method: taxCalculationMethod,
      tax_saved_amount: taxSavedAmount,
      monthly_income_goal: monthlyIncomeGoal,
      yearly_gci_goal: yearlyGciGoal,
      yearly_revshare_goal: yearlyRevshareGoal,
    } as any);
    setHasChanges(false);
  };


  const taxBrackets = getTaxBrackets(province, taxType);

  if (isLoading) {
    return (
      <AppLayout>
        <Header title="Settings" showAddDeal={false} />
        <div className="p-6 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Header 
        title="Settings" 
        subtitle="Configure your dealzflow experience"
        showAddDeal={false}
        action={
          <Button 
            onClick={handleSave} 
            className={cn("btn-premium transition-all", !hasChanges && "opacity-50")} 
            disabled={updateSettings.isPending || !hasChanges}
          >
            <Save className="w-4 h-4 mr-2" />
            {updateSettings.isPending ? 'Saving...' : hasChanges ? 'Save Changes' : 'Saved'}
          </Button>
        }
      />

      <PullToRefresh onRefresh={refreshData} className="min-h-[calc(100dvh-56px)]">
      <motion.div
        className="p-4 md:p-6 lg:p-6 max-w-6xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springConfig}
      >
        <SettingsLayout sections={SETTINGS_SECTIONS}>
          {/* Profile */}
          <SettingsSectionAnchor id="settings-profile">
            <ProfileSection />
          </SettingsSectionAnchor>
          <Separator />

          {/* Goals */}
          <SettingsSectionAnchor id="settings-goals">
            <SettingsCard
              icon={Target}
              title="Goals"
              description="Set your financial targets"
              iconColor="text-primary"
              gradient="from-primary/10 to-primary/5"
            >
              <div className="space-y-6">
                <div className="space-y-3">
                  <Label>Monthly Income Goal</Label>
                  <p className="text-sm text-muted-foreground">Set a target to track against your actual income</p>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      min="0"
                      step="1000"
                      value={monthlyIncomeGoal}
                      onChange={(e) => setMonthlyIncomeGoal(parseFloat(e.target.value) || 0)}
                      className="flex-1 max-w-[200px]"
                      placeholder="e.g., 15000"
                    />
                    <span className="text-sm text-muted-foreground shrink-0">/month</span>
                  </div>
                  {monthlyIncomeGoal > 0 && (
                    <p className="text-xs text-muted-foreground">Annual target: {formatCurrency(monthlyIncomeGoal * 12)}</p>
                  )}
                </div>

                <div className="border-t border-border/50 pt-4 space-y-3">
                  <Label>Yearly GCI Goal</Label>
                  <p className="text-sm text-muted-foreground">Gross Commission Income target for the current year</p>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      min="0"
                      step="5000"
                      value={yearlyGciGoal}
                      onChange={(e) => setYearlyGciGoal(parseFloat(e.target.value) || 0)}
                      className="flex-1 max-w-[200px]"
                      placeholder="e.g., 200000"
                    />
                    <span className="text-sm text-muted-foreground shrink-0">/year</span>
                  </div>
                </div>

                <div className="border-t border-border/50 pt-4 space-y-3">
                  <Label>Yearly RevShare Goal</Label>
                  <p className="text-sm text-muted-foreground">Revenue Share income target for the current year</p>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      min="0"
                      step="1000"
                      value={yearlyRevshareGoal}
                      onChange={(e) => setYearlyRevshareGoal(parseFloat(e.target.value) || 0)}
                      className="flex-1 max-w-[200px]"
                      placeholder="e.g., 50000"
                    />
                    <span className="text-sm text-muted-foreground shrink-0">/year</span>
                  </div>
                </div>
              </div>
            </SettingsCard>
          </SettingsSectionAnchor>
          <Separator />

          {/* Tax & Finance */}
          <SettingsSectionAnchor id="settings-tax">
            <SettingsCard
              icon={MapPin}
              title="Tax Jurisdiction"
              description="Select your location for accurate CRA tax brackets"
              iconColor="text-accent"
              gradient="from-accent/10 to-accent/5"
            >
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Country</Label>
                  <Select value={country} onValueChange={setCountry}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CA">🇨🇦 Canada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Province / Territory</Label>
                  <Select value={province} onValueChange={(v) => setProvince(v as Province)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PROVINCES.map((prov) => (
                        <SelectItem key={prov} value={prov}>{PROVINCE_NAMES[prov]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t border-border/50 mt-4">
                <Label>Tax Filing Type</Label>
                <div className="grid grid-cols-2 gap-3">
                  <ToggleCard
                    active={taxType === 'self-employed'}
                    onClick={() => setTaxType('self-employed')}
                    icon={User}
                    title="Self-Employed"
                    description="Personal income tax + CPP"
                    activeColor="accent"
                  />
                  <ToggleCard
                    active={taxType === 'corporation'}
                    onClick={() => setTaxType('corporation')}
                    icon={Building2}
                    title="Corporation"
                    description="Small business & general rates"
                    activeColor="violet-500"
                  />
                </div>
              </div>

              <div className="p-4 rounded-xl bg-muted/50 border border-border mt-4">
                <div className="flex items-center gap-2 mb-3">
                  <Info className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    {taxType === 'corporation' ? 'Corporate Tax Rates' : 'Tax Brackets'} - {PROVINCE_NAMES[province]}
                  </span>
                </div>
                {taxType === 'corporation' && taxBrackets.corporateRates ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Small Business (≤$500K)</span>
                      <span className="font-semibold text-success">{(taxBrackets.corporateRates.small * 100).toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">General (&gt;$500K)</span>
                      <span className="font-semibold">{(taxBrackets.corporateRates.general * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground mb-2 font-medium">Federal Brackets</p>
                      {taxBrackets.federal.slice(0, 3).map((bracket, i) => (
                        <div key={i} className="flex justify-between text-xs py-1">
                          <span className="text-muted-foreground">
                            {bracket.max === Infinity ? `$${(bracket.min / 1000).toFixed(0)}K+` : `$${(bracket.min / 1000).toFixed(0)}K - $${(bracket.max / 1000).toFixed(0)}K`}
                          </span>
                          <span className="font-medium">{(bracket.rate * 100).toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-2 font-medium">Provincial ({province})</p>
                      {taxBrackets.provincial.slice(0, 3).map((bracket, i) => (
                        <div key={i} className="flex justify-between text-xs py-1">
                          <span className="text-muted-foreground">
                            {bracket.max === Infinity ? `$${(bracket.min / 1000).toFixed(0)}K+` : `$${(bracket.min / 1000).toFixed(0)}K - $${(bracket.max / 1000).toFixed(0)}K`}
                          </span>
                          <span className="font-medium">{(bracket.rate * 100).toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </SettingsCard>

            <SettingsCard
              icon={Shield}
              title="Tax Safety Configuration"
              description="Configure how taxes are calculated and tracked"
              iconColor="text-warning"
              gradient="from-warning/10 to-warning/5"
            >
              <div className="space-y-3">
                <Label>Calculation Method</Label>
                <div className="grid grid-cols-2 gap-3">
                  <ToggleCard
                    active={taxCalculationMethod === 'progressive'}
                    onClick={() => setTaxCalculationMethod('progressive')}
                    icon={TrendingUp}
                    title="Progressive"
                    description="CRA tax brackets (recommended)"
                    activeColor="accent"
                  />
                  <ToggleCard
                    active={taxCalculationMethod === 'flat'}
                    onClick={() => setTaxCalculationMethod('flat')}
                    icon={Percent}
                    title="Flat Rate"
                    description="Simple percentage"
                    activeColor="primary"
                  />
                </div>
              </div>

              <AnimatePresence>
                {taxCalculationMethod === 'flat' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-3 pt-4"
                  >
                    <Label>Flat Tax Rate</Label>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Set-aside percentage</span>
                        <span className="text-xl font-bold">{taxPercent}<span className="text-sm text-muted-foreground ml-0.5">%</span></span>
                      </div>
                      <Slider value={[taxPercent]} onValueChange={([v]) => setTaxPercent(v)} max={50} step={0.5} className="w-full" />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="space-y-3 pt-4 border-t border-border/50">
                <div className="flex items-center justify-between">
                  <Label>Conservative Buffer</Label>
                  <span className="text-sm font-bold">{taxBuffer}%</span>
                </div>
                <p className="text-sm text-muted-foreground">Extra safety margin on top of calculated tax</p>
                <Slider value={[taxBuffer]} onValueChange={([v]) => setTaxBuffer(v)} max={25} step={1} className="w-full" />
              </div>

              <div className="space-y-4 pt-4 border-t border-border/50">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>GST/HST Registered</Label>
                    <p className="text-sm text-muted-foreground">Collect and remit GST/HST?</p>
                  </div>
                  <Switch checked={gstRegistered} onCheckedChange={setGstRegistered} />
                </div>

                <AnimatePresence>
                  {gstRegistered && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="pl-4 border-l-2 border-warning/30 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <Label>GST/HST Rate</Label>
                          <p className="text-xs text-muted-foreground">BC: 5% GST, ON: 13% HST</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min="0"
                            max="15"
                            step="0.5"
                            value={gstRate}
                            onChange={(e) => setGstRate(parseFloat(e.target.value) || 5)}
                            className="w-20 text-center"
                          />
                          <span className="text-muted-foreground">%</span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="space-y-3 pt-4 border-t border-border/50">
                <Label>Tax Already Saved (YTD)</Label>
                <p className="text-sm text-muted-foreground">How much have you set aside for taxes this year?</p>
                <Input
                  type="number"
                  min="0"
                  step="100"
                  value={taxSavedAmount}
                  onChange={(e) => setTaxSavedAmount(parseFloat(e.target.value) || 0)}
                  className="w-full max-w-[200px]"
                  placeholder="0"
                />
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-border/50">
                <div>
                  <Label>Apply Tax to Forecasts</Label>
                  <p className="text-sm text-muted-foreground">Show net amounts after tax</p>
                </div>
                <Switch checked={applyTaxToForecasts} onCheckedChange={setApplyTaxToForecasts} />
              </div>
            </SettingsCard>
          </SettingsSectionAnchor>
          <Separator />

          {/* Subscription / Plan */}
          <SettingsSectionAnchor id="settings-subscription">
            <SubscriptionSection />
          </SettingsSectionAnchor>
          <Separator />

          {/* Integrations */}
          <SettingsSectionAnchor id="settings-integrations">
            <SettingsCard
              icon={Plug}
              title="Platform Integrations"
              description="Connect ReZen, brokerage, and transaction-management platforms"
              iconColor="text-primary"
              gradient="from-primary/10 to-primary/5"
            >
              <PlatformConnectionsManager />
            </SettingsCard>
          </SettingsSectionAnchor>
          <Separator />

          {/* Notifications */}
          <SettingsSectionAnchor id="settings-notifications">
            <SettingsCard
              icon={BellRing}
              title="Push Notifications"
              description="Get alerts on your phone — works when the app is installed"
              iconColor="text-primary"
              gradient="from-primary/10 to-primary/5"
            >
              <PushNotificationSetup />
            </SettingsCard>
          </SettingsSectionAnchor>
          <Separator />

          {/* Data */}
          <SettingsSectionAnchor id="settings-data">
            <DataExportSection />
            <DeleteAccountSection />
          </SettingsSectionAnchor>
        </SettingsLayout>
      </motion.div>
      </PullToRefresh>
    </AppLayout>
  );
}

// ──────────────────────────────────────────────
// SettingsLayout — sticky left-nav + scroll-spy
// (mirrors CrmSettingsPage pattern)
// ──────────────────────────────────────────────
function SettingsLayout({
  sections,
  initialActive,
  children,
}: {
  sections: ReadonlyArray<{ id: string; label: string; icon: React.ComponentType<{ className?: string }> }>;
  initialActive?: string;
  children: React.ReactNode;
}) {
  const [activeSection, setActiveSection] = useState<string>(initialActive ?? sections[0].id);

  // Initial scroll if linked with ?tab=
  useEffect(() => {
    if (initialActive && initialActive !== sections[0].id) {
      const el = document.getElementById(initialActive);
      if (el) setTimeout(() => el.scrollIntoView({ behavior: 'auto', block: 'start' }), 50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll-spy
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        }
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: 0 }
    );
    sections.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [sections]);

  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  return (
    <div className="flex flex-col lg:flex-row gap-0 lg:gap-8">
      {/* Mobile/Tablet — horizontal pill bar */}
      <div className="lg:hidden overflow-x-auto border-b border-border bg-background/95 backdrop-blur sticky top-0 z-10 -mx-4 px-4 mb-4">
        <div className="flex gap-1 py-2 min-w-max">
          {sections.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => scrollTo(id)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors',
                activeSection === id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Desktop — sticky sidebar */}
      <nav className="hidden lg:flex flex-col w-44 shrink-0 sticky top-4 self-start pt-1">
        <div className="space-y-0.5">
          {sections.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => scrollTo(id)}
              className={cn(
                'flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-[13px] font-medium transition-colors text-left',
                activeSection === id
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-6 sm:space-y-8 max-w-3xl">
        {children}
      </div>
    </div>
  );
}

function SettingsSectionAnchor({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <div id={id} className="scroll-mt-20 space-y-6">
      {children}
    </div>
  );
}

// Reusable Settings Card
function SettingsCard({ 
  icon: Icon, 
  title, 
  description, 
  children, 
  iconColor = "text-primary",
  gradient = "from-primary/10 to-primary/5"
}: { 
  icon: typeof Settings2; 
  title: string; 
  description: string; 
  children: React.ReactNode;
  iconColor?: string;
  gradient?: string;
}) {
  return (
    <motion.div 
      className="landing-card overflow-hidden"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springConfig}
    >
      <div className={cn("px-4 sm:px-6 py-3.5 sm:py-4 border-b border-border/50 bg-gradient-to-r", gradient, "to-transparent relative overflow-hidden")}>
        {/* Top shine */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
        <div className="flex items-center gap-3">
          <div
            className={cn("w-9 h-9 sm:w-10 sm:h-10 rounded-[12px] flex items-center justify-center shrink-0", iconColor)}
            style={{
              background: 'hsl(var(--background) / 0.85)',
              border: '1px solid hsl(var(--border) / 0.6)',
              boxShadow: 'inset 0 1px 0 hsl(0 0% 100% / 0.08), 0 1px 4px hsl(0 0% 0% / 0.12)',
            }}
          >
            <Icon className="w-4 h-4 sm:w-[17px] sm:h-[17px]" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-sm sm:text-[15px] tracking-[-0.02em]">{title}</h3>
            <p className="text-[11px] text-muted-foreground/70 truncate mt-0.5">{description}</p>
          </div>
        </div>
      </div>
      <div className="p-4 sm:p-6 space-y-4">
        {children}
      </div>
    </motion.div>
  );
}

// Toggle Card Component
function ToggleCard({ 
  active, 
  onClick, 
  icon: Icon, 
  title, 
  description, 
  activeColor = "accent" 
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof User;
  title: string;
  description: string;
  activeColor?: string;
}) {
  const colorMap: Record<string, { border: string; bg: string; text: string; glow: string }> = {
    'accent': { border: 'border-accent/70', bg: 'bg-accent/[0.08]', text: 'text-accent', glow: 'shadow-[0_0_0_3px_hsl(var(--accent)/0.12)]' },
    'primary': { border: 'border-primary/70', bg: 'bg-primary/[0.08]', text: 'text-primary', glow: 'shadow-[0_0_0_3px_hsl(var(--primary)/0.12)]' },
    'violet-500': { border: 'border-violet-500/70', bg: 'bg-violet-500/[0.08]', text: 'text-violet-400', glow: 'shadow-[0_0_0_3px_hsl(263_70%_50%/0.12)]' },
    'success': { border: 'border-success/70', bg: 'bg-success/[0.08]', text: 'text-success', glow: 'shadow-[0_0_0_3px_hsl(var(--success)/0.12)]' },
  };
  
  const colors = colorMap[activeColor] || colorMap.accent;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative p-3.5 rounded-xl border-2 transition-all duration-200 text-left overflow-hidden',
        active
          ? `${colors.border} ${colors.bg} ${colors.glow}`
          : 'border-border/50 bg-muted/20 hover:border-border/80 hover:bg-muted/40',
      )}
    >
      {/* Active top shine */}
      {active && (
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
      )}
      <div className="flex items-center gap-2 mb-1">
        <Icon className={cn('w-3.5 h-3.5', active ? colors.text : 'text-muted-foreground')} />
        <span className={cn('text-[12.5px] font-semibold tracking-[-0.01em]', active ? colors.text : 'text-foreground/80')}>{title}</span>
      </div>
      <p className="text-[11px] text-muted-foreground/65 leading-tight">{description}</p>
    </button>
  );
}

// Appearance Section
function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const updateSettings = useUpdateSettings({ silent: true });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <SettingsCard icon={Palette} title="Appearance" description="Choose your theme" iconColor="text-accent" gradient="from-accent/10 to-accent/5">
        <div className="h-20 animate-pulse bg-muted rounded-xl" />
      </SettingsCard>
    );
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
    <SettingsCard icon={Palette} title="Appearance" description="Choose your preferred theme" iconColor="text-accent" gradient="from-accent/10 to-accent/5">
      <div className="grid grid-cols-3 gap-3">
        {themes.map(({ value, icon: ThemeIcon, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => handleTheme(value)}
            className={cn(
              'relative p-4 rounded-xl border-2 transition-all duration-200 text-center group overflow-hidden',
              theme === value
                ? 'border-accent/70 bg-accent/[0.08] shadow-[0_0_0_3px_hsl(var(--accent)/0.12)]'
                : 'border-border/50 bg-muted/20 hover:border-border/80 hover:bg-muted/40',
            )}
          >
            {theme === value && (
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
            )}
            <ThemeIcon className={cn(
              'w-5 h-5 mx-auto mb-2 transition-colors',
              theme === value ? 'text-accent' : 'text-muted-foreground group-hover:text-foreground'
            )} />
            <span className={cn(
              'text-[12px] font-semibold tracking-[-0.01em]',
              theme === value ? 'text-accent' : 'text-foreground/70'
            )}>
              {label}
            </span>
          </button>
        ))}
      </div>
    </SettingsCard>
  );
}

// Subscription Section
function SubscriptionSection() {
  const { tier, limits, usage, isPro, isFree } = useSubscription();
  const [loading, setLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  const PRO_FEATURES = [
    'Unlimited deals',
    'Full expense tracking',
    '12-month projections',
    'Tax set-aside calculator',
    'Safe-to-spend tracking',
    'Data export',
    'Priority support',
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
    } finally {
      setLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const { toast } = await import('sonner');
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error('Please sign in to manage your subscription');
        return;
      }

      const response = await supabase.functions.invoke('create-portal-session', {
        body: { returnUrl: window.location.origin },
      });

      if (response.error) throw new Error(response.error.message);
      if (response.data?.noStripeCustomer) {
        toast.info('Your subscription was set up by an administrator. No billing to manage.');
        return;
      }
      if (response.data?.noActiveSubscription) {
        toast.info("You don't have an active subscription to manage.");
        return;
      }
      if (response.data?.url) window.location.href = response.data.url;
    } catch (error: any) {
      const { toast } = await import('sonner');
      toast.error(error?.message || 'Failed to open subscription portal');
      console.error('Error:', error);
    } finally {
      setPortalLoading(false);
    }
  };

  return (
    <SettingsCard 
      icon={Crown} 
      title="Subscription" 
      description={isPro ? 'Pro Plan Active' : 'Free Plan'} 
      iconColor={isPro ? "text-amber-500" : "text-muted-foreground"}
      gradient={isPro ? "from-amber-500/10 to-orange-500/5" : "from-muted/50 to-muted/20"}
    >
      {isFree ? (
        <div className="space-y-6">
          {/* Usage */}
          <div className="p-4 rounded-xl bg-muted/50 border border-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Deals Used</span>
              <span className="text-sm font-bold">{usage.dealsUsed} / {limits.maxDeals}</span>
            </div>
            <div className="h-2.5 bg-muted rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-gradient-to-r from-primary to-accent rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, usage.percentUsed)}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
            </div>
          </div>

          {/* Upgrade CTA */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-amber-500/15 via-orange-500/10 to-rose-500/5 border border-amber-500/30">
            <div className="flex items-start gap-4 mb-5">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/25">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="font-bold text-lg">Upgrade to Pro</p>
                <p className="text-sm text-muted-foreground">Unlock unlimited deals & all features</p>
              </div>
            </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mb-5">
              {PRO_FEATURES.map((f) => (
                <div key={f} className="flex items-center gap-2 text-sm">
                  <Check className="w-4 h-4 text-success shrink-0" />
                  <span>{f}</span>
                </div>
              ))}
            </div>

            <div className="flex items-baseline gap-2 mb-4">
              <span className="text-3xl font-bold">$29</span>
              <span className="text-muted-foreground">CAD/month</span>
            </div>

            <Button className="w-full btn-premium h-12 text-base" onClick={handleUpgrade} disabled={loading}>
              {loading ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Sparkles className="w-5 h-5 mr-2" />
                  Start 14-Day Free Trial
                </>
              )}
            </Button>
            <p className="text-xs text-center text-muted-foreground mt-3">
              14-day free trial • Cancel anytime
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="p-5 rounded-2xl bg-gradient-to-br from-amber-500/15 to-orange-500/5 border border-amber-500/30">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/25">
                <Crown className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="font-bold text-lg">Pro Plan Active</p>
                <p className="text-sm text-muted-foreground">All features unlocked</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {PRO_FEATURES.map((f) => (
              <div key={f} className="flex items-center gap-2 text-sm p-2.5 rounded-xl bg-muted/50">
                <Check className="w-4 h-4 text-success shrink-0" />
                <span>{f}</span>
              </div>
            ))}
          </div>

          <Button variant="outline" className="w-full" onClick={handleManageSubscription} disabled={portalLoading}>
            {portalLoading ? 'Loading...' : 'Manage Subscription'}
          </Button>
        </div>
      )}
    </SettingsCard>
  );
}

// Data Export Section
function DataExportSection() {
  const { exportDeals, exportPayouts, exportExpenses, exportPipeline, exportAll, counts } = useDataExport();

  const exports = [
    { label: 'Deals', count: counts.deals, action: exportDeals },
    { label: 'Pipeline Prospects', count: counts.pipeline, action: exportPipeline },
    { label: 'Payouts', count: counts.payouts, action: exportPayouts },
    { label: 'Expenses', count: counts.expenses, action: exportExpenses },
  ];

  return (
    <SettingsCard 
      icon={Download} 
      title="Export Data" 
      description="Download your data as CSV files"
      iconColor="text-blue-500"
      gradient="from-blue-500/10 to-blue-500/5"
    >
      <div className="space-y-3">
        {exports.map(({ label, count, action }) => (
          <div key={label} className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border border-border/50">
            <div>
              <p className="font-medium text-sm">{label}</p>
              <p className="text-xs text-muted-foreground">{count} records</p>
            </div>
            <Button variant="outline" size="sm" onClick={action} disabled={count === 0}>
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>
        ))}

        <div className="pt-3 border-t border-border/50">
          <Button onClick={exportAll} className="w-full">
            <Download className="w-4 h-4 mr-2" />
            Export All Data
          </Button>
        </div>
      </div>
    </SettingsCard>
  );
}

// Delete Account Section
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
    <motion.div 
      className="landing-card overflow-hidden border-destructive/30"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springConfig}
    >
      <div className="px-6 py-4 border-b border-destructive/30 bg-gradient-to-r from-destructive/10 to-transparent">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-destructive/10 border border-destructive/30 flex items-center justify-center text-destructive">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-destructive">Danger Zone</h3>
            <p className="text-xs text-muted-foreground">Irreversible actions</p>
          </div>
        </div>
      </div>
      <div className="p-6">
        {!showConfirm ? (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              Permanently delete your account and all data. This cannot be undone.
            </p>
            <Button variant="destructive" onClick={() => setShowConfirm(true)}>
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Account
            </Button>
          </>
        ) : (
          <motion.div 
            className="space-y-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20">
              <p className="text-sm font-medium text-destructive mb-2">⚠️ This will permanently delete:</p>
              <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                <li>All deals and payouts</li>
                <li>All expense records</li>
                <li>All properties and settings</li>
                <li>Your account and profile</li>
              </ul>
            </div>

            <div className="space-y-2">
              <Label>Type DELETE to confirm</Label>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE"
                className="font-mono"
              />
            </div>

            <div className="flex gap-3">
              <Button 
                variant="outline" 
                onClick={() => { setShowConfirm(false); setConfirmText(''); }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleDelete}
                disabled={confirmText !== 'DELETE' || loading}
                className="flex-1"
              >
                {loading ? 'Deleting...' : 'Confirm Delete'}
              </Button>
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
