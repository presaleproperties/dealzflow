// Database types for dealzflow

export type DealStatus = 'PENDING' | 'CLOSED';
export type DealType = 'BUY' | 'SELL';
export type PropertyType = 'PRESALE' | 'RESALE';
export type PayoutStatus = 'PROJECTED' | 'INVOICED' | 'PAID';
export type PayoutType = 'Advance' | '2nd Payment' | '3rd Deposit' | '4th Deposit' | 'Completion' | 'Custom';

export interface Deal {
  id: string;
  user_id: string;
  client_name: string;
  deal_type: DealType;
  property_type: PropertyType | null;
  address: string | null;
  project_name: string | null;
  city: string | null;
  listing_date: string | null;
  pending_date: string | null;
  close_date_est: string | null;
  close_date_actual: string | null;
  sale_price: number | null;
  gross_commission_est: number | null;
  net_commission_est: number | null;
  gross_commission_actual: number | null;
  net_commission_actual: number | null;
  team_member: string | null;
  team_member_portion: number | null;
  lead_source: string | null;
  notes: string | null;
  status: DealStatus;
  created_at: string;
  updated_at: string;
  // Presale-specific fields
  buyer_type: string | null;
  advance_commission: number | null;
  completion_commission: number | null;
  advance_date: string | null;
  completion_date: string | null;
}

export interface Payout {
  id: string;
  user_id: string;
  deal_id: string;
  payout_type: PayoutType;
  custom_type_name: string | null;
  amount: number;
  due_date: string | null;
  status: PayoutStatus;
  paid_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  deal?: Deal;
}

export interface Expense {
  id: string;
  user_id: string;
  category: string;
  month: string;
  amount: number;
  recurrence: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Settings {
  id: string;
  user_id: string;
  currency: string;
  tax_set_aside_percent: number | null;
  brokerage_split_percent: number | null;
  apply_tax_to_forecasts: boolean;
  onboarding_completed?: boolean;
  theme?: 'light' | 'dark' | 'system';
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  user_id: string;
  full_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface OtherIncome {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  recurrence: 'monthly' | 'weekly' | 'one-time';
  start_month: string;
  end_month: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// Form types
export interface DealFormData {
  client_name: string;
  deal_type: DealType;
  property_type?: PropertyType;
  address?: string;
  project_name?: string;
  city?: string;
  listing_date?: string;
  pending_date?: string;
  close_date_est?: string;
  close_date_actual?: string;
  sale_price?: number;
  gross_commission_est?: number;
  net_commission_est?: number;
  gross_commission_actual?: number;
  net_commission_actual?: number;
  team_member?: string;
  team_member_portion?: number;
  lead_source?: string;
  notes?: string;
  status: DealStatus;
  // Presale-specific fields
  buyer_type?: string;
  advance_commission?: number;
  completion_commission?: number;
  advance_date?: string;
  completion_date?: string;
}

export interface PayoutFormData {
  deal_id: string;
  payout_type: PayoutType;
  custom_type_name?: string;
  amount: number;
  due_date?: string;
  status: PayoutStatus;
  paid_date?: string;
  notes?: string;
}

export interface ExpenseFormData {
  category: string;
  month: string;
  amount: number;
  recurrence?: string;
  notes?: string;
}
