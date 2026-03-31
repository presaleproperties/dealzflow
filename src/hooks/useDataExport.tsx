import { useDeals } from './useDeals';
import { usePayouts } from './usePayouts';
import { useExpenses } from './useExpenses';
import { useProperties } from './useProperties';
import { usePipelineProspects } from './usePipelineProspects';
import { format } from 'date-fns';

export function useDataExport() {
  const { data: deals = [] } = useDeals();
  const { data: payouts = [] } = usePayouts();
  const { data: expenses = [] } = useExpenses();
  const { data: properties = [] } = useProperties();
  const { data: prospects = [] } = usePipelineProspects();

  const downloadCSV = (data: any[], filename: string) => {
    if (data.length === 0) return;

    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => 
        headers.map(h => {
          const val = row[h];
          if (val === null || val === undefined) return '';
          const str = String(val);
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
  };

  const exportDeals = () => {
    const exportData = deals.map(d => ({
      client_name: d.client_name,
      deal_type: d.deal_type,
      property_type: d.property_type,
      status: d.status,
      project_name: d.project_name || '',
      address: d.address || '',
      city: d.city || '',
      sale_price: d.sale_price || '',
      gross_commission_est: d.gross_commission_est || '',
      gross_commission_actual: d.gross_commission_actual || '',
      net_commission_est: d.net_commission_est || '',
      net_commission_actual: d.net_commission_actual || '',
      listing_date: d.listing_date || '',
      pending_date: d.pending_date || '',
      close_date_est: d.close_date_est || '',
      close_date_actual: d.close_date_actual || '',
      lead_source: d.lead_source || '',
      team_member: d.team_member || '',
      team_member_portion: d.team_member_portion || '',
      notes: d.notes || '',
      created_at: d.created_at,
    }));
    downloadCSV(exportData, 'deals');
  };

  const exportPayouts = () => {
    const exportData = payouts.map(p => ({
      client_name: p.deal?.client_name || '',
      payout_type: p.payout_type,
      custom_type_name: p.custom_type_name || '',
      amount: p.amount,
      status: p.status,
      due_date: p.due_date || '',
      paid_date: p.paid_date || '',
      notes: p.notes || '',
      created_at: p.created_at,
    }));
    downloadCSV(exportData, 'payouts');
  };

  const exportExpenses = () => {
    const exportData = expenses.map(e => ({
      category: e.category,
      amount: e.amount,
      month: e.month,
      recurrence: (e as any).recurrence || 'monthly',
      notes: e.notes || '',
      created_at: e.created_at,
    }));
    downloadCSV(exportData, 'expenses');
  };

  const exportProperties = () => {
    const exportData = properties.map(p => ({
      name: p.name,
      property_type: p.property_type,
      address: p.address || '',
      purchase_price: p.purchase_price || '',
      purchase_date: p.purchase_date || '',
      monthly_mortgage: p.monthly_mortgage || '',
      monthly_strata: p.monthly_strata || '',
      yearly_taxes: p.yearly_taxes || '',
      monthly_rent: p.monthly_rent || '',
      notes: p.notes || '',
      created_at: p.created_at,
    }));
    downloadCSV(exportData, 'properties');
  };

  const exportPipeline = () => {
    const exportData = prospects.map(p => ({
      client_name: p.client_name,
      deal_type: p.deal_type || '',
      home_type: p.home_type,
      status: p.status,
      temperature: p.temperature,
      potential_commission: p.potential_commission,
      budget: p.budget || '',
      source: p.source || '',
      notes: p.notes || '',
      created_at: p.created_at,
    }));
    downloadCSV(exportData, 'pipeline_prospects');
  };

  const exportAll = () => {
    exportDeals();
    setTimeout(() => exportPayouts(), 100);
    setTimeout(() => exportExpenses(), 200);
    setTimeout(() => exportProperties(), 300);
    setTimeout(() => exportPipeline(), 400);
  };

  return {
    exportDeals,
    exportPayouts,
    exportExpenses,
    exportProperties,
    exportPipeline,
    exportAll,
    counts: {
      deals: deals.length,
      payouts: payouts.length,
      expenses: expenses.length,
      properties: properties.length,
      pipeline: prospects.length,
    },
  };
}
