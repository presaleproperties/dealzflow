import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Info } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { DatePicker } from '@/components/DatePicker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateDeal } from '@/hooks/useDeals';
import { useSettings } from '@/hooks/useSettings';
import { usePayouts } from '@/hooks/usePayouts';
import { useSubscription } from '@/hooks/useSubscription';
import { UpgradePrompt, UsageLimitIndicator } from '@/components/UpgradePrompt';
import { DealFormData, DealType, DealStatus, PropertyType } from '@/lib/types';
import { calculateNetCommission, formatCommissionBreakdown } from '@/lib/commissionCalculations';
import { useDealDraft } from '@/contexts/DealDraftContext';
import { useAuth } from '@/hooks/useAuth';
import { ScreenshotExtractor } from '@/components/deals/ScreenshotExtractor';
import { toast } from 'sonner';

// Format number with commas
const formatCurrency = (value: number | undefined | null): string => {
  if (value === undefined || value === null || isNaN(value)) return '';
  return value.toLocaleString('en-US');
};

// Parse formatted string back to number
const parseCurrency = (value: string): number | null => {
  const cleaned = value.replace(/,/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
};

export default function NewDealPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const createDeal = useCreateDeal();
  const { data: settings } = useSettings();
  const { data: paidPayouts = [] } = usePayouts();
  
  const { canAddDeal, usage, isFree } = useSubscription();
  const { dealDraft, clearDraft } = useDealDraft();
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);

  // Handle screenshot extraction
  const handleScreenshotExtract = (extractedData: Partial<DealFormData>) => {
    setFormData(prev => ({
      ...prev,
      ...extractedData,
      city: extractedData.city || prev.city,
    }));
    
    // Set advance commission toggle based on extracted data
    if (extractedData.property_type === 'PRESALE') {
      setHasAdvanceCommission(!!(extractedData.advance_commission || extractedData.advance_date));
    }
  };

  const [formData, setFormData] = useState<Partial<DealFormData>>({
    client_name: '',
    deal_type: 'BUY',
    status: 'PENDING',
    city: 'Vancouver',
  });
  const [isTeamDeal, setIsTeamDeal] = useState(false);
  const [hasAdvanceCommission, setHasAdvanceCommission] = useState(true);
  const [draftApplied, setDraftApplied] = useState(false);

  // Pre-fill form from AI-extracted deal draft
  useEffect(() => {
    if (dealDraft && !draftApplied) {
      setFormData(prev => ({
        ...prev,
        ...dealDraft,
        city: dealDraft.city || prev.city,
      }));
      
      // Set advance commission toggle based on whether advance values exist
      if (dealDraft.property_type === 'PRESALE') {
        setHasAdvanceCommission(!!(dealDraft.advance_commission || dealDraft.advance_date));
      }
      
      setDraftApplied(true);
      clearDraft();
      toast.success('Form pre-filled with extracted deal details');
    }
  }, [dealDraft, clearDraft, draftApplied]);

  const isPresale = formData.property_type === 'PRESALE';
  const isResale = formData.property_type === 'RESALE';

  // Auto-calculate net commission when gross changes
  const netCommissionResult = useMemo(() => {
    return calculateNetCommission(
      formData.gross_commission_est || 0,
      settings as any,
      paidPayouts,
      isTeamDeal ? formData.team_member_portion : undefined
    );
  }, [formData.gross_commission_est, formData.team_member_portion, settings, paidPayouts, isTeamDeal]);

  // Update net commission in form when calculation changes
  useEffect(() => {
    if (formData.gross_commission_est && formData.gross_commission_est > 0) {
      setFormData(prev => ({ ...prev, net_commission_est: netCommissionResult.netAmount }));
    }
  }, [netCommissionResult.netAmount, formData.gross_commission_est]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Check subscription limit
    if (!canAddDeal) {
      setShowUpgradePrompt(true);
      return;
    }

    if (!formData.client_name || !formData.deal_type || !formData.property_type) return;

    // Money-loss guard: a team deal with 0% team portion silently gives the
    // user 100% of the commission. Force the agent to enter the split.
    if (isTeamDeal) {
      const portion = Number(formData.team_member_portion ?? 0);
      if (!portion || portion <= 0) {
        toast.error('Team member detected — please enter their commission split percentage.');
        return;
      }
      if (portion >= 100) {
        toast.error('Team member portion must be less than 100%.');
        return;
      }
    }

    try {
      const deal = await createDeal.mutateAsync(formData as DealFormData);
      navigate(`/deals/${deal.id}`, { state: { fromNewDeal: true } });
    } catch (error) {
      // Error handled by mutation
    }
  };

  const updateField = (field: keyof DealFormData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handlePropertyTypeChange = (value: PropertyType) => {
    updateField('property_type', value);
    if (value === 'PRESALE') {
      updateField('address', undefined);
      updateField('close_date_actual', undefined);
    } else {
      updateField('project_name', undefined);
      updateField('pending_date', undefined);
    }
  };

  return (
    <AppLayout>
      <Header 
        title="New Deal" 
        showAddDeal={false}
        action={
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
        }
      />

      <form onSubmit={handleSubmit} className="p-3 sm:p-4 lg:p-6 max-w-3xl animate-fade-in">
        {/* Subscription limit indicator for free users */}
        {isFree && (
          <div className="mb-3 sm:mb-4">
            <UsageLimitIndicator />
          </div>
        )}

        <UpgradePrompt 
          open={showUpgradePrompt} 
          onOpenChange={setShowUpgradePrompt}
          reason={`You've reached the limit of ${usage.dealsUsed} deals on the free plan.`}
        />

        {/* Screenshot Extractor */}
        {user?.id && (
          <div className="mb-3 sm:mb-4">
            <ScreenshotExtractor 
              onExtract={handleScreenshotExtract}
              userId={user.id}
            />
          </div>
        )}

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {/* Step 1: Essential Info */}
          <div className="p-3 sm:p-4 border-b border-border bg-muted/30">
            <h2 className="font-semibold text-xs sm:text-sm text-muted-foreground uppercase tracking-wide">1. Client & Deal Type</h2>
          </div>
          <div className="p-3 sm:p-4 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            <div className="col-span-2 space-y-1">
              <Label htmlFor="client_name" className="text-[11px] sm:text-xs">Client Name *</Label>
              <Input
                id="client_name"
                value={formData.client_name || ''}
                onChange={(e) => updateField('client_name', e.target.value)}
                placeholder="John Smith"
                required
                className="h-8 sm:h-9 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] sm:text-xs">Deal Type *</Label>
              <Select
                value={formData.deal_type}
                onValueChange={(v) => updateField('deal_type', v as DealType)}
              >
                <SelectTrigger className="h-8 sm:h-9 text-sm">
                  <SelectValue placeholder="Buy / Sell" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BUY">Buy</SelectItem>
                  <SelectItem value="SELL">Sell</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] sm:text-xs">Property Type *</Label>
              <Select
                value={formData.property_type || ''}
                onValueChange={(v) => handlePropertyTypeChange(v as PropertyType)}
              >
                <SelectTrigger className="h-8 sm:h-9 text-sm">
                  <SelectValue placeholder="Presale / Resale" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRESALE">Presale</SelectItem>
                  <SelectItem value="RESALE">Resale</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Step 2: Property & Location (shows after property type selected) */}
          {formData.property_type && (
            <>
              <div className="p-3 sm:p-4 border-t border-b border-border bg-muted/30">
                <h2 className="font-semibold text-xs sm:text-sm text-muted-foreground uppercase tracking-wide">2. Property Details</h2>
              </div>
              <div className="p-3 sm:p-4 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                <div className="col-span-2 space-y-1">
                  <Label className="text-[11px] sm:text-xs">{isPresale ? 'Project Name' : 'Address'}</Label>
                  <Input
                    value={isPresale ? (formData.project_name || '') : (formData.address || '')}
                    onChange={(e) => updateField(isPresale ? 'project_name' : 'address', e.target.value)}
                    placeholder={isPresale ? 'The Palisades' : '123 Main St, Unit 1001'}
                    className="h-8 sm:h-9 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] sm:text-xs">City</Label>
                  <Select
                    value={formData.city || ''}
                    onValueChange={(v) => updateField('city', v)}
                  >
                    <SelectTrigger className="h-8 sm:h-9 text-sm">
                      <SelectValue placeholder="Select city" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover">
                      <SelectItem value="Vancouver">Vancouver</SelectItem>
                      <SelectItem value="Burnaby">Burnaby</SelectItem>
                      <SelectItem value="Surrey">Surrey</SelectItem>
                      <SelectItem value="Langley">Langley</SelectItem>
                      <SelectItem value="Delta">Delta</SelectItem>
                      <SelectItem value="Coquitlam">Coquitlam</SelectItem>
                      <SelectItem value="Abbotsford">Abbotsford</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] sm:text-xs">Sale Price</Label>
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs sm:text-sm">$</span>
                    <Input
                      className="pl-5 h-8 sm:h-9 text-sm"
                      value={formatCurrency(formData.sale_price)}
                      onChange={(e) => updateField('sale_price', parseCurrency(e.target.value))}
                      placeholder="1,250,000"
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Step 3: Dates & Commission */}
          {formData.property_type && (
            <>
              <div className="p-4 border-t border-b border-border bg-muted/30">
                <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">3. Dates & Commission</h2>
              </div>
              <div className="p-4 space-y-4">
                {/* Presale: Advance toggle */}
                {isPresale && (
                  <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-lg">
                    <Switch 
                      id="has_advance"
                      checked={hasAdvanceCommission}
                      onCheckedChange={(checked) => {
                        setHasAdvanceCommission(checked);
                        if (!checked) {
                          updateField('advance_commission' as any, null);
                          updateField('advance_date' as any, null);
                        }
                      }}
                    />
                    <Label htmlFor="has_advance" className="cursor-pointer text-sm">
                      Has Advance Commission
                      <span className="text-xs text-muted-foreground ml-2">
                        {hasAdvanceCommission ? '(2 payouts)' : '(All on completion)'}
                      </span>
                    </Label>
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {/* Firm Date - always show */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Firm Date</Label>
                    <DatePicker
                      value={formData.pending_date}
                      onChange={(val) => updateField('pending_date', val)}
                      placeholder="Select date"
                    />
                  </div>

                  {/* Presale with advance: show advance date + amount */}
                  {isPresale && hasAdvanceCommission && (
                    <>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Advance Date</Label>
                        <DatePicker
                          value={(formData as any).advance_date}
                          onChange={(val) => updateField('advance_date' as any, val)}
                          placeholder="Select date"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Advance $</Label>
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                          <Input
                            className="pl-6 h-9"
                            value={formatCurrency((formData as any).advance_commission)}
                            onChange={(e) => {
                              const val = parseCurrency(e.target.value);
                              updateField('advance_commission' as any, val);
                              const completion = (formData as any).completion_commission || 0;
                              updateField('gross_commission_est', (val || 0) + completion);
                            }}
                            placeholder="5,000"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {/* Presale: Completion date + amount */}
                  {isPresale && (
                    <>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Completion Date</Label>
                        <DatePicker
                          value={(formData as any).completion_date}
                          onChange={(val) => updateField('completion_date' as any, val)}
                          placeholder="Select date"
                        />
                      </div>
                      {hasAdvanceCommission && (
                        <div className="space-y-1.5">
                          <Label className="text-xs">Completion $</Label>
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                            <Input
                              className="pl-6 h-9"
                              value={formatCurrency((formData as any).completion_commission)}
                              onChange={(e) => {
                                const val = parseCurrency(e.target.value);
                                updateField('completion_commission' as any, val);
                                const advance = (formData as any).advance_commission || 0;
                                updateField('gross_commission_est', advance + (val || 0));
                              }}
                              placeholder="26,250"
                            />
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* Resale: Closing date */}
                  {isResale && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Closing Date</Label>
                      <DatePicker
                        value={formData.close_date_est}
                        onChange={(val) => updateField('close_date_est', val)}
                        placeholder="Select date"
                      />
                    </div>
                  )}

                  {/* Gross Commission - always show */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">
                      Gross Commission {isPresale && hasAdvanceCommission && <span className="text-muted-foreground">(auto)</span>}
                    </Label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                      <Input
                        className="pl-6 h-9"
                        value={formatCurrency(formData.gross_commission_est)}
                        onChange={(e) => updateField('gross_commission_est', parseCurrency(e.target.value))}
                        placeholder="31,250"
                        readOnly={isPresale && hasAdvanceCommission}
                      />
                    </div>
                  </div>

                  {/* Net Commission - auto-calculated */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">
                      Net Commission <span className="text-muted-foreground">(auto)</span>
                    </Label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                      <Input
                        className="pl-6 h-9 bg-muted/50"
                        value={formatCurrency(formData.net_commission_est)}
                        readOnly
                        placeholder="Auto-calculated"
                      />
                    </div>
                  </div>
                </div>

                {/* Commission breakdown */}
                {formData.gross_commission_est && formData.gross_commission_est > 0 && (
                  <div className="flex items-start gap-2 p-3 bg-muted/40 rounded-lg">
                    <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p>
                        <span className="font-medium text-foreground">Gross:</span> ${formatCurrency(formData.gross_commission_est)}
                        {netCommissionResult.brokeragePortion > 0 && (
                          <> → <span className="text-destructive">-${formatCurrency(netCommissionResult.brokeragePortion)}</span> brokerage ({netCommissionResult.splitPercent}%)</>
                        )}
                        {netCommissionResult.teamPortion > 0 && (
                          <> → <span className="text-destructive">-${formatCurrency(netCommissionResult.teamPortion)}</span> team</>
                        )}
                        {' '}= <span className="font-semibold text-success">${formatCurrency(netCommissionResult.netAmount)}</span> net
                      </p>
                      {netCommissionResult.capReached && (
                        <p className="text-success font-medium">✓ Brokerage cap reached - keeping 100%!</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Payout preview */}
                <p className="text-xs text-muted-foreground bg-muted/30 rounded px-3 py-2">
                  {isPresale 
                    ? hasAdvanceCommission
                      ? '✓ 2 payouts: Advance + Completion'
                      : '✓ 1 payout: All commission on completion'
                    : '✓ 1 payout: Commission on closing date'
                  }
                </p>
              </div>
            </>
          )}

          {/* Step 4: Additional Info */}
          <div className="p-4 border-t border-b border-border bg-muted/30">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">4. Additional Info</h2>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Buyer Type</Label>
                <Select
                  value={(formData as any).buyer_type || ''}
                  onValueChange={(v) => updateField('buyer_type' as any, v)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover">
                    <SelectItem value="First Time Homebuyer">First Time Homebuyer</SelectItem>
                    <SelectItem value="Investor">Investor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Lead Source</Label>
                <Select
                  value={formData.lead_source || ''}
                  onValueChange={(v) => updateField('lead_source', v)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select source" />
                  </SelectTrigger>
                   <SelectContent className="bg-popover">
                     <SelectItem value="Instagram">Instagram</SelectItem>
                     <SelectItem value="Tiktok">Tiktok</SelectItem>
                     <SelectItem value="Facebook Ads">Facebook Ads</SelectItem>
                     <SelectItem value="YouTube">YouTube</SelectItem>
                     <SelectItem value="Referral">Referral</SelectItem>
                     <SelectItem value="Team">Team</SelectItem>
                   </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(v) => updateField('status', v as DealStatus)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PENDING">Pending</SelectItem>
                    <SelectItem value="CLOSED">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Team Deal?</Label>
                <div className="flex items-center h-9 px-3 border rounded-md bg-background">
                  <Switch 
                    id="is_team_deal"
                    checked={isTeamDeal}
                    onCheckedChange={(checked) => {
                      setIsTeamDeal(checked);
                      if (checked) {
                        // Default team member gets 70%, user gets 30%
                        updateField('team_member_portion', 70);
                      } else {
                        updateField('team_member', undefined);
                        updateField('team_member_portion', undefined);
                      }
                    }}
                  />
                  <Label htmlFor="is_team_deal" className="ml-2 text-xs cursor-pointer">
                    {isTeamDeal ? 'Yes' : 'No'}
                  </Label>
                </div>
              </div>
            </div>

            {/* Team split details */}
            {isTeamDeal && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Team Member</Label>
                  <Select
                    value={formData.team_member || ''}
                    onValueChange={(v) => updateField('team_member', v)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select member" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Sarb">Sarb</SelectItem>
                      <SelectItem value="Ravish">Ravish</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Their Portion (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    className="h-9"
                    value={formData.team_member_portion ?? ''}
                    onChange={(e) => updateField('team_member_portion', parseFloat(e.target.value) || null)}
                    placeholder="70"
                  />
                  <p className="text-[10px] text-muted-foreground">Your portion: {100 - (formData.team_member_portion || 70)}%</p>
                </div>
              </div>
            )}

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea
                value={formData.notes || ''}
                onChange={(e) => updateField('notes', e.target.value)}
                placeholder="Additional notes..."
                rows={2}
                className="resize-none"
              />
            </div>
          </div>

          {/* Submit */}
          <div className="p-4 border-t border-border bg-muted/20 flex justify-between items-center">
            <Button type="button" variant="ghost" size="sm" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              className="btn-premium" 
              disabled={createDeal.isPending || !formData.property_type || !formData.client_name}
            >
              <Save className="w-4 h-4 mr-2" />
              {createDeal.isPending ? 'Creating...' : 'Create Deal'}
            </Button>
          </div>
        </div>
      </form>
    </AppLayout>
  );
}
