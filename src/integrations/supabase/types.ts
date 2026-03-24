export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_audit_logs: {
        Row: {
          action: string
          admin_user_id: string
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          admin_user_id: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          admin_user_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          target_user_id?: string | null
        }
        Relationships: []
      }
      ai_usage: {
        Row: {
          created_at: string
          date: string
          id: string
          request_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date?: string
          id?: string
          request_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          request_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      client_inventory: {
        Row: {
          buyer_name: string | null
          close_date: string | null
          close_date_est: string | null
          created_at: string
          id: string
          is_manual: boolean
          journey_id: string | null
          notes: string | null
          project_name: string | null
          property_address: string | null
          property_type: string | null
          purchase_date: string | null
          purchase_price: number | null
          synced_transaction_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          buyer_name?: string | null
          close_date?: string | null
          close_date_est?: string | null
          created_at?: string
          id?: string
          is_manual?: boolean
          journey_id?: string | null
          notes?: string | null
          project_name?: string | null
          property_address?: string | null
          property_type?: string | null
          purchase_date?: string | null
          purchase_price?: number | null
          synced_transaction_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          buyer_name?: string | null
          close_date?: string | null
          close_date_est?: string | null
          created_at?: string
          id?: string
          is_manual?: boolean
          journey_id?: string | null
          notes?: string | null
          project_name?: string | null
          property_address?: string | null
          property_type?: string | null
          purchase_date?: string | null
          purchase_price?: number | null
          synced_transaction_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_inventory_synced_transaction_id_fkey"
            columns: ["synced_transaction_id"]
            isOneToOne: false
            referencedRelation: "synced_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          address: string | null
          advance_commission: number | null
          advance_date: string | null
          buyer_type: string | null
          city: string | null
          client_name: string
          close_date_actual: string | null
          close_date_est: string | null
          completion_commission: number | null
          completion_date: string | null
          created_at: string
          deal_type: Database["public"]["Enums"]["deal_type"]
          gross_commission_actual: number | null
          gross_commission_est: number | null
          id: string
          lead_source: string | null
          listing_date: string | null
          net_commission_actual: number | null
          net_commission_est: number | null
          notes: string | null
          pending_date: string | null
          project_name: string | null
          property_type: Database["public"]["Enums"]["property_type"] | null
          sale_price: number | null
          status: Database["public"]["Enums"]["deal_status"]
          team_member: string | null
          team_member_portion: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          advance_commission?: number | null
          advance_date?: string | null
          buyer_type?: string | null
          city?: string | null
          client_name: string
          close_date_actual?: string | null
          close_date_est?: string | null
          completion_commission?: number | null
          completion_date?: string | null
          created_at?: string
          deal_type: Database["public"]["Enums"]["deal_type"]
          gross_commission_actual?: number | null
          gross_commission_est?: number | null
          id?: string
          lead_source?: string | null
          listing_date?: string | null
          net_commission_actual?: number | null
          net_commission_est?: number | null
          notes?: string | null
          pending_date?: string | null
          project_name?: string | null
          property_type?: Database["public"]["Enums"]["property_type"] | null
          sale_price?: number | null
          status?: Database["public"]["Enums"]["deal_status"]
          team_member?: string | null
          team_member_portion?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          advance_commission?: number | null
          advance_date?: string | null
          buyer_type?: string | null
          city?: string | null
          client_name?: string
          close_date_actual?: string | null
          close_date_est?: string | null
          completion_commission?: number | null
          completion_date?: string | null
          created_at?: string
          deal_type?: Database["public"]["Enums"]["deal_type"]
          gross_commission_actual?: number | null
          gross_commission_est?: number | null
          id?: string
          lead_source?: string | null
          listing_date?: string | null
          net_commission_actual?: number | null
          net_commission_est?: number | null
          notes?: string | null
          pending_date?: string | null
          project_name?: string | null
          property_type?: Database["public"]["Enums"]["property_type"] | null
          sale_price?: number | null
          status?: Database["public"]["Enums"]["deal_status"]
          team_member?: string | null
          team_member_portion?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      expense_budgets: {
        Row: {
          category: string
          created_at: string
          id: string
          monthly_limit: number
          updated_at: string
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          monthly_limit?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          monthly_limit?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          id: string
          is_fixed: boolean | null
          is_tax_deductible: boolean | null
          month: string
          notes: string | null
          recurrence: string | null
          rental_property_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          category: string
          created_at?: string
          id?: string
          is_fixed?: boolean | null
          is_tax_deductible?: boolean | null
          month: string
          notes?: string | null
          recurrence?: string | null
          rental_property_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          id?: string
          is_fixed?: boolean | null
          is_tax_deductible?: boolean | null
          month?: string
          notes?: string | null
          recurrence?: string | null
          rental_property_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_rental_property_id_fkey"
            columns: ["rental_property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      network_agents: {
        Row: {
          agent_name: string
          agent_yenta_id: string
          avatar_url: string | null
          created_at: string
          days_with_brokerage: number | null
          departure_date: string | null
          email: string | null
          id: string
          join_date: string | null
          network_size: number | null
          phone: string | null
          platform: string
          raw_data: Json | null
          sponsor_name: string | null
          status: string | null
          synced_at: string
          tier: number
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_name?: string
          agent_yenta_id: string
          avatar_url?: string | null
          created_at?: string
          days_with_brokerage?: number | null
          departure_date?: string | null
          email?: string | null
          id?: string
          join_date?: string | null
          network_size?: number | null
          phone?: string | null
          platform?: string
          raw_data?: Json | null
          sponsor_name?: string | null
          status?: string | null
          synced_at?: string
          tier?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_name?: string
          agent_yenta_id?: string
          avatar_url?: string | null
          created_at?: string
          days_with_brokerage?: number | null
          departure_date?: string | null
          email?: string | null
          id?: string
          join_date?: string | null
          network_size?: number | null
          phone?: string | null
          platform?: string
          raw_data?: Json | null
          sponsor_name?: string | null
          status?: string | null
          synced_at?: string
          tier?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      network_summary: {
        Row: {
          agent_cap_info: Json | null
          co_sponsored_agents: number | null
          created_at: string
          id: string
          network_size_by_tier: Json | null
          platform: string
          raw_data: Json | null
          revshare_by_tier: Json | null
          revshare_performance: Json | null
          synced_at: string
          total_network_agents: number | null
          total_revshare_income: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_cap_info?: Json | null
          co_sponsored_agents?: number | null
          created_at?: string
          id?: string
          network_size_by_tier?: Json | null
          platform?: string
          raw_data?: Json | null
          revshare_by_tier?: Json | null
          revshare_performance?: Json | null
          synced_at?: string
          total_network_agents?: number | null
          total_revshare_income?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_cap_info?: Json | null
          co_sponsored_agents?: number | null
          created_at?: string
          id?: string
          network_size_by_tier?: Json | null
          platform?: string
          raw_data?: Json | null
          revshare_by_tier?: Json | null
          revshare_performance?: Json | null
          synced_at?: string
          total_network_agents?: number | null
          total_revshare_income?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      other_income: {
        Row: {
          amount: number
          created_at: string
          end_month: string | null
          id: string
          name: string
          notes: string | null
          recurrence: string
          start_month: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          end_month?: string | null
          id?: string
          name: string
          notes?: string | null
          recurrence?: string
          start_month: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          end_month?: string | null
          id?: string
          name?: string
          notes?: string | null
          recurrence?: string
          start_month?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      payouts: {
        Row: {
          amount: number
          created_at: string
          custom_type_name: string | null
          deal_id: string
          due_date: string | null
          id: string
          notes: string | null
          paid_date: string | null
          payout_type: Database["public"]["Enums"]["payout_type"]
          status: Database["public"]["Enums"]["payout_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          custom_type_name?: string | null
          deal_id: string
          due_date?: string | null
          id?: string
          notes?: string | null
          paid_date?: string | null
          payout_type: Database["public"]["Enums"]["payout_type"]
          status?: Database["public"]["Enums"]["payout_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          custom_type_name?: string | null
          deal_id?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          paid_date?: string | null
          payout_type?: Database["public"]["Enums"]["payout_type"]
          status?: Database["public"]["Enums"]["payout_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payouts_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_prospects: {
        Row: {
          budget: number | null
          client_name: string
          created_at: string
          deal_type: string | null
          home_type: string
          id: string
          notes: string | null
          potential_commission: number
          source: string | null
          status: string
          temperature: string
          updated_at: string
          user_id: string
        }
        Insert: {
          budget?: number | null
          client_name: string
          created_at?: string
          deal_type?: string | null
          home_type?: string
          id?: string
          notes?: string | null
          potential_commission?: number
          source?: string | null
          status?: string
          temperature?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          budget?: number | null
          client_name?: string
          created_at?: string
          deal_type?: string | null
          home_type?: string
          id?: string
          notes?: string | null
          potential_commission?: number
          source?: string | null
          status?: string
          temperature?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_connections: {
        Row: {
          api_key: string | null
          api_secret: string | null
          base_url: string | null
          created_at: string
          id: string
          is_active: boolean
          last_synced_at: string | null
          platform: string
          sync_error: string | null
          sync_status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key?: string | null
          api_secret?: string | null
          base_url?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          platform: string
          sync_error?: string | null
          sync_status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key?: string | null
          api_secret?: string | null
          base_url?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          platform?: string
          sync_error?: string | null
          sync_status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ban_reason: string | null
          banned_at: string | null
          created_at: string
          full_name: string | null
          id: string
          is_banned: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          ban_reason?: string | null
          banned_at?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_banned?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          ban_reason?: string | null
          banned_at?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_banned?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      properties: {
        Row: {
          address: string | null
          created_at: string
          id: string
          monthly_mortgage: number | null
          monthly_rent: number | null
          monthly_strata: number | null
          name: string
          notes: string | null
          property_type: string
          purchase_date: string | null
          purchase_price: number | null
          updated_at: string
          user_id: string
          yearly_taxes: number | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          monthly_mortgage?: number | null
          monthly_rent?: number | null
          monthly_strata?: number | null
          name: string
          notes?: string | null
          property_type?: string
          purchase_date?: string | null
          purchase_price?: number | null
          updated_at?: string
          user_id: string
          yearly_taxes?: number | null
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          monthly_mortgage?: number | null
          monthly_rent?: number | null
          monthly_strata?: number | null
          name?: string
          notes?: string | null
          property_type?: string
          purchase_date?: string | null
          purchase_price?: number | null
          updated_at?: string
          user_id?: string
          yearly_taxes?: number | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      revenue_share: {
        Row: {
          agent_name: string
          amount: number
          cap_contribution: number | null
          created_at: string
          id: string
          notes: string | null
          period: string
          platform: string
          raw_data: Json | null
          status: string | null
          tier: number
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_name: string
          amount?: number
          cap_contribution?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          period: string
          platform?: string
          raw_data?: Json | null
          status?: string | null
          tier?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_name?: string
          amount?: number
          cap_contribution?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          period?: string
          platform?: string
          raw_data?: Json | null
          status?: string | null
          tier?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          apply_tax_to_forecasts: boolean
          brokerage_cap_amount: number | null
          brokerage_cap_enabled: boolean | null
          brokerage_cap_start_date: string | null
          brokerage_split_percent: number | null
          country: string | null
          created_at: string
          currency: string
          gst_rate: number | null
          gst_registered: boolean | null
          id: string
          monthly_income_goal: number | null
          notification_phone: string | null
          onboarding_completed: boolean | null
          presale_template: Json | null
          province: string | null
          resale_template: Json | null
          subscription_ends_at: string | null
          subscription_started_at: string | null
          subscription_tier: string
          tax_buffer_percent: number | null
          tax_calculation_method: string | null
          tax_saved_amount: number | null
          tax_set_aside_percent: number | null
          tax_type: string | null
          updated_at: string
          user_id: string
          yearly_gci_goal: number | null
          yearly_revshare_goal: number | null
          zapier_webhook_url: string | null
        }
        Insert: {
          apply_tax_to_forecasts?: boolean
          brokerage_cap_amount?: number | null
          brokerage_cap_enabled?: boolean | null
          brokerage_cap_start_date?: string | null
          brokerage_split_percent?: number | null
          country?: string | null
          created_at?: string
          currency?: string
          gst_rate?: number | null
          gst_registered?: boolean | null
          id?: string
          monthly_income_goal?: number | null
          notification_phone?: string | null
          onboarding_completed?: boolean | null
          presale_template?: Json | null
          province?: string | null
          resale_template?: Json | null
          subscription_ends_at?: string | null
          subscription_started_at?: string | null
          subscription_tier?: string
          tax_buffer_percent?: number | null
          tax_calculation_method?: string | null
          tax_saved_amount?: number | null
          tax_set_aside_percent?: number | null
          tax_type?: string | null
          updated_at?: string
          user_id: string
          yearly_gci_goal?: number | null
          yearly_revshare_goal?: number | null
          zapier_webhook_url?: string | null
        }
        Update: {
          apply_tax_to_forecasts?: boolean
          brokerage_cap_amount?: number | null
          brokerage_cap_enabled?: boolean | null
          brokerage_cap_start_date?: string | null
          brokerage_split_percent?: number | null
          country?: string | null
          created_at?: string
          currency?: string
          gst_rate?: number | null
          gst_registered?: boolean | null
          id?: string
          monthly_income_goal?: number | null
          notification_phone?: string | null
          onboarding_completed?: boolean | null
          presale_template?: Json | null
          province?: string | null
          resale_template?: Json | null
          subscription_ends_at?: string | null
          subscription_started_at?: string | null
          subscription_tier?: string
          tax_buffer_percent?: number | null
          tax_calculation_method?: string | null
          tax_saved_amount?: number | null
          tax_set_aside_percent?: number | null
          tax_type?: string | null
          updated_at?: string
          user_id?: string
          yearly_gci_goal?: number | null
          yearly_revshare_goal?: number | null
          zapier_webhook_url?: string | null
        }
        Relationships: []
      }
      sync_logs: {
        Row: {
          completed_at: string | null
          error_message: string | null
          id: string
          platform: string
          records_synced: number | null
          started_at: string
          status: string
          sync_type: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          error_message?: string | null
          id?: string
          platform: string
          records_synced?: number | null
          started_at?: string
          status?: string
          sync_type?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          error_message?: string | null
          id?: string
          platform?: string
          records_synced?: number | null
          started_at?: string
          status?: string
          sync_type?: string
          user_id?: string
        }
        Relationships: []
      }
      synced_transactions: {
        Row: {
          agent_name: string | null
          buyer_type: string | null
          city: string | null
          client_name: string | null
          close_date: string | null
          commission_amount: number | null
          compliance_status: string | null
          created_at: string
          currency: string | null
          external_id: string | null
          firm_date: string | null
          id: string
          is_listing: boolean | null
          journey_id: string | null
          lead_source: string | null
          lifecycle_state: string | null
          listing_date: string | null
          mls_number: string | null
          my_net_payout: number | null
          my_split_percent: number | null
          platform: string
          property_address: string | null
          raw_data: Json | null
          sale_price: number | null
          status: string | null
          synced_at: string
          transaction_code: string | null
          transaction_type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_name?: string | null
          buyer_type?: string | null
          city?: string | null
          client_name?: string | null
          close_date?: string | null
          commission_amount?: number | null
          compliance_status?: string | null
          created_at?: string
          currency?: string | null
          external_id?: string | null
          firm_date?: string | null
          id?: string
          is_listing?: boolean | null
          journey_id?: string | null
          lead_source?: string | null
          lifecycle_state?: string | null
          listing_date?: string | null
          mls_number?: string | null
          my_net_payout?: number | null
          my_split_percent?: number | null
          platform: string
          property_address?: string | null
          raw_data?: Json | null
          sale_price?: number | null
          status?: string | null
          synced_at?: string
          transaction_code?: string | null
          transaction_type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_name?: string | null
          buyer_type?: string | null
          city?: string | null
          client_name?: string | null
          close_date?: string | null
          commission_amount?: number | null
          compliance_status?: string | null
          created_at?: string
          currency?: string | null
          external_id?: string | null
          firm_date?: string | null
          id?: string
          is_listing?: boolean | null
          journey_id?: string | null
          lead_source?: string | null
          lifecycle_state?: string | null
          listing_date?: string | null
          mls_number?: string | null
          my_net_payout?: number | null
          my_split_percent?: number | null
          platform?: string
          property_address?: string | null
          raw_data?: Json | null
          sale_price?: number | null
          status?: string | null
          synced_at?: string
          transaction_code?: string | null
          transaction_type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      decrypt_api_credential: {
        Args: { ciphertext: string; passphrase: string }
        Returns: string
      }
      encrypt_api_credential: {
        Args: { passphrase: string; plaintext: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      deal_status: "PENDING" | "CLOSED"
      deal_type: "BUY" | "SELL"
      payout_status: "PROJECTED" | "INVOICED" | "PAID"
      payout_type:
        | "Advance"
        | "2nd Payment"
        | "3rd Deposit"
        | "4th Deposit"
        | "Completion"
        | "Custom"
      property_type: "PRESALE" | "RESALE"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
      deal_status: ["PENDING", "CLOSED"],
      deal_type: ["BUY", "SELL"],
      payout_status: ["PROJECTED", "INVOICED", "PAID"],
      payout_type: [
        "Advance",
        "2nd Payment",
        "3rd Deposit",
        "4th Deposit",
        "Completion",
        "Custom",
      ],
      property_type: ["PRESALE", "RESALE"],
    },
  },
} as const
