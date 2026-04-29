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
      api_keys: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          key: string
          label: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          key: string
          label?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          key?: string
          label?: string
        }
        Relationships: []
      }
      api_logs: {
        Row: {
          api_key_id: string | null
          created_at: string
          endpoint: string
          id: string
          ip_address: string | null
          method: string
          status_code: number
        }
        Insert: {
          api_key_id?: string | null
          created_at?: string
          endpoint: string
          id?: string
          ip_address?: string | null
          method: string
          status_code?: number
        }
        Update: {
          api_key_id?: string | null
          created_at?: string
          endpoint?: string
          id?: string
          ip_address?: string | null
          method?: string
          status_code?: number
        }
        Relationships: [
          {
            foreignKeyName: "api_logs_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_events: {
        Row: {
          created_at: string
          event_type: string | null
          id: string
          lead_email: string | null
          lead_name: string | null
          scheduled_at: string | null
          source: string | null
          status: string
        }
        Insert: {
          created_at?: string
          event_type?: string | null
          id?: string
          lead_email?: string | null
          lead_name?: string | null
          scheduled_at?: string | null
          source?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          event_type?: string | null
          id?: string
          lead_email?: string | null
          lead_name?: string | null
          scheduled_at?: string | null
          source?: string | null
          status?: string
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
      conversations: {
        Row: {
          assigned_to: string
          avatar_url: string | null
          channel: string
          created_at: string
          external_id: string | null
          heat: number | null
          id: string
          last_message_at: string | null
          lead_email: string | null
          lead_id: string | null
          lead_name: string
          lead_phone: string | null
          lofty_contact_id: string | null
          meta_window_expires_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_to?: string
          avatar_url?: string | null
          channel?: string
          created_at?: string
          external_id?: string | null
          heat?: number | null
          id?: string
          last_message_at?: string | null
          lead_email?: string | null
          lead_id?: string | null
          lead_name?: string
          lead_phone?: string | null
          lofty_contact_id?: string | null
          meta_window_expires_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_to?: string
          avatar_url?: string | null
          channel?: string
          created_at?: string
          external_id?: string | null
          heat?: number | null
          id?: string
          last_message_at?: string | null
          lead_email?: string | null
          lead_id?: string | null
          lead_name?: string
          lead_phone?: string | null
          lofty_contact_id?: string | null
          meta_window_expires_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      crm_activity_events: {
        Row: {
          agent_slug: string | null
          contact_id: string | null
          id: string
          lead_email: string | null
          lead_phone: string | null
          metadata: Json
          occurred_at: string
          project_slug: string | null
          received_at: string
          type: string
        }
        Insert: {
          agent_slug?: string | null
          contact_id?: string | null
          id?: string
          lead_email?: string | null
          lead_phone?: string | null
          metadata?: Json
          occurred_at?: string
          project_slug?: string | null
          received_at?: string
          type: string
        }
        Update: {
          agent_slug?: string | null
          contact_id?: string | null
          id?: string
          lead_email?: string | null
          lead_phone?: string | null
          metadata?: Json
          occurred_at?: string
          project_slug?: string | null
          received_at?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_activity_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_ad_spend: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          notes: string | null
          spend_date: string
          utm_campaign: string | null
          utm_source: string
        }
        Insert: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          notes?: string | null
          spend_date: string
          utm_campaign?: string | null
          utm_source: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          notes?: string | null
          spend_date?: string
          utm_campaign?: string | null
          utm_source?: string
        }
        Relationships: []
      }
      crm_automation_logs: {
        Row: {
          action_result: string
          automation_id: string
          contact_id: string | null
          created_at: string
          current_step_order: number
          enrolled_at: string
          error_message: string | null
          exit_reason: string | null
          exited_at: string | null
          id: string
          next_step_due_at: string | null
          project_slug: string | null
          status: string
          trigger_data: Json | null
        }
        Insert: {
          action_result?: string
          automation_id: string
          contact_id?: string | null
          created_at?: string
          current_step_order?: number
          enrolled_at?: string
          error_message?: string | null
          exit_reason?: string | null
          exited_at?: string | null
          id?: string
          next_step_due_at?: string | null
          project_slug?: string | null
          status?: string
          trigger_data?: Json | null
        }
        Update: {
          action_result?: string
          automation_id?: string
          contact_id?: string | null
          created_at?: string
          current_step_order?: number
          enrolled_at?: string
          error_message?: string | null
          exit_reason?: string | null
          exited_at?: string | null
          id?: string
          next_step_due_at?: string | null
          project_slug?: string | null
          status?: string
          trigger_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_automation_logs_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "crm_automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_automation_logs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_automation_steps: {
        Row: {
          action_config: Json | null
          action_type: string
          automation_id: string
          created_at: string | null
          delay_hours: number
          exit_condition: string | null
          id: string
          step_order: number
        }
        Insert: {
          action_config?: Json | null
          action_type: string
          automation_id: string
          created_at?: string | null
          delay_hours?: number
          exit_condition?: string | null
          id?: string
          step_order: number
        }
        Update: {
          action_config?: Json | null
          action_type?: string
          automation_id?: string
          created_at?: string | null
          delay_hours?: number
          exit_condition?: string | null
          id?: string
          step_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "crm_automation_steps_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "crm_automations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_automations: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          last_run_at: string | null
          name: string
          runs_count: number
          slug: string | null
          total_converted: number | null
          total_enrolled: number | null
          trigger_config: Json | null
          trigger_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_run_at?: string | null
          name: string
          runs_count?: number
          slug?: string | null
          total_converted?: number | null
          total_enrolled?: number | null
          trigger_config?: Json | null
          trigger_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_run_at?: string | null
          name?: string
          runs_count?: number
          slug?: string | null
          total_converted?: number | null
          total_enrolled?: number | null
          trigger_config?: Json | null
          trigger_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_cities: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          lead_count: number
          name: string
          name_lower: string | null
          project_count: number
          province: string | null
          region: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          lead_count?: number
          name: string
          name_lower?: string | null
          project_count?: number
          province?: string | null
          region?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          lead_count?: number
          name?: string
          name_lower?: string | null
          project_count?: number
          province?: string | null
          region?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      crm_contacts: {
        Row: {
          address: string | null
          ai_summary_stale: boolean
          ai_summary_updated_at: string | null
          assigned_to: string | null
          bedrooms_preferred: string | null
          birthday: string | null
          budget_max: number | null
          budget_min: number | null
          campaign_source: string | null
          city: string | null
          city_pref: string | null
          co_buyer_birthday: string | null
          co_buyer_email: string | null
          co_buyer_name: string | null
          co_buyer_phone: string | null
          contact_type: string
          created_at: string | null
          email: string | null
          email_secondary: string | null
          first_name: string
          home_type_pref: string | null
          id: string
          intent: string | null
          is_pre_approved: boolean | null
          language: string | null
          last_activity_at: string | null
          last_contact_at: string | null
          last_name: string
          last_touch_at: string | null
          last_touch_type: string | null
          lead_score: number | null
          lead_type: string | null
          lead_types: string[]
          lofty_id: string | null
          lofty_synced_at: string | null
          lofty_updated_at: string | null
          looking_to_buy_in: string[] | null
          marketing_consent: boolean | null
          next_followup_date: string | null
          notes: string | null
          phone: string | null
          phone_normalized: string | null
          phone_secondary: string | null
          postal_code: string | null
          presale_metadata: Json | null
          presale_user_id: string | null
          project: string | null
          projects: string[]
          property_type_pref: string | null
          province: string | null
          referral_source: string | null
          signup_completed_at: string | null
          source: string | null
          stage_changed_at: string | null
          status: string | null
          status_changed_at: string | null
          sync_source: string | null
          tags: string[] | null
          timeframe: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          ai_summary_stale?: boolean
          ai_summary_updated_at?: string | null
          assigned_to?: string | null
          bedrooms_preferred?: string | null
          birthday?: string | null
          budget_max?: number | null
          budget_min?: number | null
          campaign_source?: string | null
          city?: string | null
          city_pref?: string | null
          co_buyer_birthday?: string | null
          co_buyer_email?: string | null
          co_buyer_name?: string | null
          co_buyer_phone?: string | null
          contact_type?: string
          created_at?: string | null
          email?: string | null
          email_secondary?: string | null
          first_name: string
          home_type_pref?: string | null
          id?: string
          intent?: string | null
          is_pre_approved?: boolean | null
          language?: string | null
          last_activity_at?: string | null
          last_contact_at?: string | null
          last_name: string
          last_touch_at?: string | null
          last_touch_type?: string | null
          lead_score?: number | null
          lead_type?: string | null
          lead_types?: string[]
          lofty_id?: string | null
          lofty_synced_at?: string | null
          lofty_updated_at?: string | null
          looking_to_buy_in?: string[] | null
          marketing_consent?: boolean | null
          next_followup_date?: string | null
          notes?: string | null
          phone?: string | null
          phone_normalized?: string | null
          phone_secondary?: string | null
          postal_code?: string | null
          presale_metadata?: Json | null
          presale_user_id?: string | null
          project?: string | null
          projects?: string[]
          property_type_pref?: string | null
          province?: string | null
          referral_source?: string | null
          signup_completed_at?: string | null
          source?: string | null
          stage_changed_at?: string | null
          status?: string | null
          status_changed_at?: string | null
          sync_source?: string | null
          tags?: string[] | null
          timeframe?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          ai_summary_stale?: boolean
          ai_summary_updated_at?: string | null
          assigned_to?: string | null
          bedrooms_preferred?: string | null
          birthday?: string | null
          budget_max?: number | null
          budget_min?: number | null
          campaign_source?: string | null
          city?: string | null
          city_pref?: string | null
          co_buyer_birthday?: string | null
          co_buyer_email?: string | null
          co_buyer_name?: string | null
          co_buyer_phone?: string | null
          contact_type?: string
          created_at?: string | null
          email?: string | null
          email_secondary?: string | null
          first_name?: string
          home_type_pref?: string | null
          id?: string
          intent?: string | null
          is_pre_approved?: boolean | null
          language?: string | null
          last_activity_at?: string | null
          last_contact_at?: string | null
          last_name?: string
          last_touch_at?: string | null
          last_touch_type?: string | null
          lead_score?: number | null
          lead_type?: string | null
          lead_types?: string[]
          lofty_id?: string | null
          lofty_synced_at?: string | null
          lofty_updated_at?: string | null
          looking_to_buy_in?: string[] | null
          marketing_consent?: boolean | null
          next_followup_date?: string | null
          notes?: string | null
          phone?: string | null
          phone_normalized?: string | null
          phone_secondary?: string | null
          postal_code?: string | null
          presale_metadata?: Json | null
          presale_user_id?: string | null
          project?: string | null
          projects?: string[]
          property_type_pref?: string | null
          province?: string | null
          referral_source?: string | null
          signup_completed_at?: string | null
          source?: string | null
          stage_changed_at?: string | null
          status?: string | null
          status_changed_at?: string | null
          sync_source?: string | null
          tags?: string[] | null
          timeframe?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      crm_conversations: {
        Row: {
          assigned_agent: string | null
          channel: string
          contact_id: string
          created_at: string | null
          id: string
          last_message_at: string | null
          status: string | null
          unread_count: number | null
        }
        Insert: {
          assigned_agent?: string | null
          channel: string
          contact_id: string
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          status?: string | null
          unread_count?: number | null
        }
        Update: {
          assigned_agent?: string | null
          channel?: string
          contact_id?: string
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          status?: string | null
          unread_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_email_audit_runs: {
        Row: {
          duration_ms: number | null
          errors: Json | null
          id: string
          projects_sampled: number
          ran_at: string
          status: string
          template_key: string
          total_errors: number
          total_links: number
          trigger_source: string | null
        }
        Insert: {
          duration_ms?: number | null
          errors?: Json | null
          id?: string
          projects_sampled?: number
          ran_at?: string
          status: string
          template_key: string
          total_errors?: number
          total_links?: number
          trigger_source?: string | null
        }
        Update: {
          duration_ms?: number | null
          errors?: Json | null
          id?: string
          projects_sampled?: number
          ran_at?: string
          status?: string
          template_key?: string
          total_errors?: number
          total_links?: number
          trigger_source?: string | null
        }
        Relationships: []
      }
      crm_email_campaigns: {
        Row: {
          body_html: string | null
          clicks: number | null
          created_at: string | null
          created_by: string | null
          id: string
          opens: number | null
          recipients_count: number | null
          scheduled_for: string | null
          segment_filter: Json | null
          sent_at: string | null
          status: string | null
          subject: string
          template_id: string | null
        }
        Insert: {
          body_html?: string | null
          clicks?: number | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          opens?: number | null
          recipients_count?: number | null
          scheduled_for?: string | null
          segment_filter?: Json | null
          sent_at?: string | null
          status?: string | null
          subject: string
          template_id?: string | null
        }
        Update: {
          body_html?: string | null
          clicks?: number | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          opens?: number | null
          recipients_count?: number | null
          scheduled_for?: string | null
          segment_filter?: Json | null
          sent_at?: string | null
          status?: string | null
          subject?: string
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_email_campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "crm_email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_email_jobs: {
        Row: {
          contact_id: string | null
          created_at: string
          error_message: string | null
          id: string
          scheduled_at: string
          sent_at: string | null
          status: string
          step_id: string | null
          template_id: string | null
          to_email: string
          to_name: string | null
          workflow_id: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          step_id?: string | null
          template_id?: string | null
          to_email: string
          to_name?: string | null
          workflow_id?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          step_id?: string | null
          template_id?: string | null
          to_email?: string
          to_name?: string | null
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_email_jobs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_email_jobs_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "crm_email_workflow_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_email_jobs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "crm_email_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_email_log: {
        Row: {
          bcc: string | null
          body: string | null
          cc: string | null
          click_count: number
          clicked_at: string | null
          contact_id: string
          created_at: string
          direction: string
          gmail_message_id: string | null
          gmail_thread_id: string | null
          id: string
          in_reply_to: string | null
          last_clicked_at: string | null
          last_opened_at: string | null
          message_id_header: string | null
          open_count: number
          opened_at: string | null
          sent_at: string
          subject: string
          thread_id: string | null
          tracking_id: string | null
          user_id: string
        }
        Insert: {
          bcc?: string | null
          body?: string | null
          cc?: string | null
          click_count?: number
          clicked_at?: string | null
          contact_id: string
          created_at?: string
          direction?: string
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          in_reply_to?: string | null
          last_clicked_at?: string | null
          last_opened_at?: string | null
          message_id_header?: string | null
          open_count?: number
          opened_at?: string | null
          sent_at?: string
          subject: string
          thread_id?: string | null
          tracking_id?: string | null
          user_id: string
        }
        Update: {
          bcc?: string | null
          body?: string | null
          cc?: string | null
          click_count?: number
          clicked_at?: string | null
          contact_id?: string
          created_at?: string
          direction?: string
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          in_reply_to?: string | null
          last_clicked_at?: string | null
          last_opened_at?: string | null
          message_id_header?: string | null
          open_count?: number
          opened_at?: string | null
          sent_at?: string
          subject?: string
          thread_id?: string | null
          tracking_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_email_log_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_email_log_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "crm_email_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_email_schedule: {
        Row: {
          bcc: string | null
          body_html: string
          cc: string | null
          contact_id: string | null
          created_at: string
          created_by: string
          error_message: string | null
          id: string
          send_at: string
          sent_at: string | null
          status: string
          subject: string
          template_id: string | null
          to_emails: string[]
          updated_at: string
        }
        Insert: {
          bcc?: string | null
          body_html: string
          cc?: string | null
          contact_id?: string | null
          created_at?: string
          created_by: string
          error_message?: string | null
          id?: string
          send_at: string
          sent_at?: string | null
          status?: string
          subject: string
          template_id?: string | null
          to_emails: string[]
          updated_at?: string
        }
        Update: {
          bcc?: string | null
          body_html?: string
          cc?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string
          error_message?: string | null
          id?: string
          send_at?: string
          sent_at?: string | null
          status?: string
          subject?: string
          template_id?: string | null
          to_emails?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_email_schedule_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_email_send_jobs: {
        Row: {
          body_html: string | null
          body_text: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          error_message: string | null
          failed_count: number
          id: string
          recipient_ids: string[]
          results: Json
          sent_count: number
          started_at: string | null
          status: string
          subject: string
          template_id: string | null
          total_count: number
          updated_at: string
        }
        Insert: {
          body_html?: string | null
          body_text?: string | null
          completed_at?: string | null
          created_at?: string
          created_by: string
          error_message?: string | null
          failed_count?: number
          id?: string
          recipient_ids?: string[]
          results?: Json
          sent_count?: number
          started_at?: string | null
          status?: string
          subject: string
          template_id?: string | null
          total_count?: number
          updated_at?: string
        }
        Update: {
          body_html?: string | null
          body_text?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          error_message?: string | null
          failed_count?: number
          id?: string
          recipient_ids?: string[]
          results?: Json
          sent_count?: number
          started_at?: string | null
          status?: string
          subject?: string
          template_id?: string | null
          total_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      crm_email_send_log: {
        Row: {
          campaign_id: string | null
          click_count: number
          clicked_at: string | null
          clicked_url: string | null
          contact_id: string | null
          created_at: string
          email_to: string
          error_message: string | null
          id: string
          last_clicked_at: string | null
          last_opened_at: string | null
          metadata: Json | null
          open_count: number
          opened_at: string | null
          presale_message_id: string | null
          recipient_name: string | null
          sent_at: string
          status: string
          subject: string
          template_id: string | null
          template_type: string | null
          tracking_id: string | null
        }
        Insert: {
          campaign_id?: string | null
          click_count?: number
          clicked_at?: string | null
          clicked_url?: string | null
          contact_id?: string | null
          created_at?: string
          email_to: string
          error_message?: string | null
          id?: string
          last_clicked_at?: string | null
          last_opened_at?: string | null
          metadata?: Json | null
          open_count?: number
          opened_at?: string | null
          presale_message_id?: string | null
          recipient_name?: string | null
          sent_at?: string
          status?: string
          subject: string
          template_id?: string | null
          template_type?: string | null
          tracking_id?: string | null
        }
        Update: {
          campaign_id?: string | null
          click_count?: number
          clicked_at?: string | null
          clicked_url?: string | null
          contact_id?: string | null
          created_at?: string
          email_to?: string
          error_message?: string | null
          id?: string
          last_clicked_at?: string | null
          last_opened_at?: string | null
          metadata?: Json | null
          open_count?: number
          opened_at?: string | null
          presale_message_id?: string | null
          recipient_name?: string | null
          sent_at?: string
          status?: string
          subject?: string
          template_id?: string | null
          template_type?: string | null
          tracking_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_email_send_log_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_email_settings: {
        Row: {
          brand_logo_alt: string | null
          brand_logo_enabled: boolean
          brand_logo_url: string | null
          created_at: string
          id: string
          reply_to: string | null
          sender_name: string | null
          signature_builder_data: Json | null
          signature_html: string | null
          signature_mode: string
          twilio_from_number: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          brand_logo_alt?: string | null
          brand_logo_enabled?: boolean
          brand_logo_url?: string | null
          created_at?: string
          id?: string
          reply_to?: string | null
          sender_name?: string | null
          signature_builder_data?: Json | null
          signature_html?: string | null
          signature_mode?: string
          twilio_from_number?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          brand_logo_alt?: string | null
          brand_logo_enabled?: boolean
          brand_logo_url?: string | null
          created_at?: string
          id?: string
          reply_to?: string | null
          sender_name?: string | null
          signature_builder_data?: Json | null
          signature_html?: string | null
          signature_mode?: string
          twilio_from_number?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      crm_email_signatures: {
        Row: {
          created_at: string
          html: string
          id: string
          is_default: boolean
          name: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          html?: string
          id?: string
          is_default?: boolean
          name: string
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          html?: string
          id?: string
          is_default?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      crm_email_templates: {
        Row: {
          body_html: string | null
          category: string
          created_at: string | null
          external_id: string | null
          id: string
          is_active: boolean
          last_synced_at: string | null
          last_used_at: string | null
          merge_tags: string[] | null
          name: string
          project: string | null
          slug: string | null
          source: string
          subject: string
          sync_hash: string | null
          times_used: number | null
          updated_at: string | null
        }
        Insert: {
          body_html?: string | null
          category?: string
          created_at?: string | null
          external_id?: string | null
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          last_used_at?: string | null
          merge_tags?: string[] | null
          name: string
          project?: string | null
          slug?: string | null
          source?: string
          subject: string
          sync_hash?: string | null
          times_used?: number | null
          updated_at?: string | null
        }
        Update: {
          body_html?: string | null
          category?: string
          created_at?: string | null
          external_id?: string | null
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          last_used_at?: string | null
          merge_tags?: string[] | null
          name?: string
          project?: string | null
          slug?: string | null
          source?: string
          subject?: string
          sync_hash?: string | null
          times_used?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      crm_email_threads: {
        Row: {
          contact_id: string | null
          created_at: string
          gmail_thread_id: string | null
          id: string
          is_archived: boolean
          last_message_at: string
          last_message_from: string | null
          last_message_snippet: string | null
          message_count: number
          participants: string[]
          subject: string
          unread_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          gmail_thread_id?: string | null
          id?: string
          is_archived?: boolean
          last_message_at?: string
          last_message_from?: string | null
          last_message_snippet?: string | null
          message_count?: number
          participants?: string[]
          subject?: string
          unread_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          gmail_thread_id?: string | null
          id?: string
          is_archived?: boolean
          last_message_at?: string
          last_message_from?: string | null
          last_message_snippet?: string | null
          message_count?: number
          participants?: string[]
          subject?: string
          unread_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_email_threads_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_email_workflow_steps: {
        Row: {
          created_at: string
          delay_minutes: number
          id: string
          is_active: boolean
          step_order: number
          template_id: string | null
          workflow_id: string
        }
        Insert: {
          created_at?: string
          delay_minutes?: number
          id?: string
          is_active?: boolean
          step_order: number
          template_id?: string | null
          workflow_id: string
        }
        Update: {
          created_at?: string
          delay_minutes?: number
          id?: string
          is_active?: boolean
          step_order?: number
          template_id?: string | null
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_email_workflow_steps_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "crm_email_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_email_workflows: {
        Row: {
          audience_type: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          trigger_event: string
          updated_at: string
          workflow_key: string
        }
        Insert: {
          audience_type?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          trigger_event: string
          updated_at?: string
          workflow_key: string
        }
        Update: {
          audience_type?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          trigger_event?: string
          updated_at?: string
          workflow_key?: string
        }
        Relationships: []
      }
      crm_gmail_messages: {
        Row: {
          attachment_meta: Json | null
          bcc_emails: string[]
          body_html: string | null
          body_text: string | null
          cc_emails: string[]
          contact_id: string | null
          created_at: string
          direction: string
          from_email: string
          from_name: string | null
          gmail_message_id: string
          gmail_thread_id: string
          has_attachments: boolean
          id: string
          in_reply_to: string | null
          internal_date: string
          is_read: boolean
          is_starred: boolean
          labels: string[]
          message_id_header: string | null
          snippet: string | null
          subject: string | null
          thread_id: string | null
          to_emails: string[]
          user_id: string
        }
        Insert: {
          attachment_meta?: Json | null
          bcc_emails?: string[]
          body_html?: string | null
          body_text?: string | null
          cc_emails?: string[]
          contact_id?: string | null
          created_at?: string
          direction: string
          from_email: string
          from_name?: string | null
          gmail_message_id: string
          gmail_thread_id: string
          has_attachments?: boolean
          id?: string
          in_reply_to?: string | null
          internal_date: string
          is_read?: boolean
          is_starred?: boolean
          labels?: string[]
          message_id_header?: string | null
          snippet?: string | null
          subject?: string | null
          thread_id?: string | null
          to_emails?: string[]
          user_id: string
        }
        Update: {
          attachment_meta?: Json | null
          bcc_emails?: string[]
          body_html?: string | null
          body_text?: string | null
          cc_emails?: string[]
          contact_id?: string | null
          created_at?: string
          direction?: string
          from_email?: string
          from_name?: string | null
          gmail_message_id?: string
          gmail_thread_id?: string
          has_attachments?: boolean
          id?: string
          in_reply_to?: string | null
          internal_date?: string
          is_read?: boolean
          is_starred?: boolean
          labels?: string[]
          message_id_header?: string | null
          snippet?: string | null
          subject?: string | null
          thread_id?: string | null
          to_emails?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_gmail_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_gmail_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "crm_email_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_gmail_sync_state: {
        Row: {
          created_at: string
          initial_sync_completed: boolean
          initial_sync_started_at: string | null
          last_error: string | null
          last_error_at: string | null
          last_history_id: string | null
          last_sync_at: string | null
          total_messages_synced: number
          updated_at: string
          user_id: string
          watch_expires_at: string | null
          watch_history_id: string | null
        }
        Insert: {
          created_at?: string
          initial_sync_completed?: boolean
          initial_sync_started_at?: string | null
          last_error?: string | null
          last_error_at?: string | null
          last_history_id?: string | null
          last_sync_at?: string | null
          total_messages_synced?: number
          updated_at?: string
          user_id: string
          watch_expires_at?: string | null
          watch_history_id?: string | null
        }
        Update: {
          created_at?: string
          initial_sync_completed?: boolean
          initial_sync_started_at?: string | null
          last_error?: string | null
          last_error_at?: string | null
          last_history_id?: string | null
          last_sync_at?: string | null
          total_messages_synced?: number
          updated_at?: string
          user_id?: string
          watch_expires_at?: string | null
          watch_history_id?: string | null
        }
        Relationships: []
      }
      crm_lead_behavior_engagement: {
        Row: {
          campaign_id: string | null
          campaign_name: string | null
          contact_id: string | null
          created_at: string
          email: string | null
          event_id: string
          event_type: string
          id: string
          link_url: string | null
          metadata: Json | null
          occurred_at: string
          presale_user_id: string | null
          template_id: string | null
          template_name: string | null
        }
        Insert: {
          campaign_id?: string | null
          campaign_name?: string | null
          contact_id?: string | null
          created_at?: string
          email?: string | null
          event_id?: string
          event_type: string
          id?: string
          link_url?: string | null
          metadata?: Json | null
          occurred_at?: string
          presale_user_id?: string | null
          template_id?: string | null
          template_name?: string | null
        }
        Update: {
          campaign_id?: string | null
          campaign_name?: string | null
          contact_id?: string | null
          created_at?: string
          email?: string | null
          event_id?: string
          event_type?: string
          id?: string
          link_url?: string | null
          metadata?: Json | null
          occurred_at?: string
          presale_user_id?: string | null
          template_id?: string | null
          template_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_lead_behavior_engagement_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_lead_behavior_forms: {
        Row: {
          contact_id: string | null
          created_at: string
          email: string | null
          event_id: string
          form_name: string | null
          form_type: string
          funnel_step: number | null
          funnel_total_steps: number | null
          id: string
          payload: Json | null
          presale_user_id: string | null
          property_id: string | null
          property_name: string | null
          status: string | null
          submitted_at: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          email?: string | null
          event_id?: string
          form_name?: string | null
          form_type: string
          funnel_step?: number | null
          funnel_total_steps?: number | null
          id?: string
          payload?: Json | null
          presale_user_id?: string | null
          property_id?: string | null
          property_name?: string | null
          status?: string | null
          submitted_at?: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          email?: string | null
          event_id?: string
          form_name?: string | null
          form_type?: string
          funnel_step?: number | null
          funnel_total_steps?: number | null
          id?: string
          payload?: Json | null
          presale_user_id?: string | null
          property_id?: string | null
          property_name?: string | null
          status?: string | null
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_lead_behavior_forms_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_lead_behavior_sessions: {
        Row: {
          contact_id: string | null
          created_at: string
          device_type: string | null
          duration_seconds: number | null
          email: string | null
          ended_at: string | null
          event_id: string
          exit_page: string | null
          id: string
          landing_page: string | null
          pages_viewed: number | null
          presale_user_id: string | null
          referrer: string | null
          session_id: string | null
          started_at: string
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          device_type?: string | null
          duration_seconds?: number | null
          email?: string | null
          ended_at?: string | null
          event_id?: string
          exit_page?: string | null
          id?: string
          landing_page?: string | null
          pages_viewed?: number | null
          presale_user_id?: string | null
          referrer?: string | null
          session_id?: string | null
          started_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          device_type?: string | null
          duration_seconds?: number | null
          email?: string | null
          ended_at?: string | null
          event_id?: string
          exit_page?: string | null
          id?: string
          landing_page?: string | null
          pages_viewed?: number | null
          presale_user_id?: string | null
          referrer?: string | null
          session_id?: string | null
          started_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_lead_behavior_sessions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_lead_behavior_views: {
        Row: {
          action: string
          contact_id: string | null
          created_at: string
          duration_seconds: number | null
          email: string | null
          event_id: string
          id: string
          metadata: Json | null
          presale_user_id: string | null
          property_id: string | null
          property_name: string | null
          property_url: string | null
          viewed_at: string
        }
        Insert: {
          action?: string
          contact_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          email?: string | null
          event_id?: string
          id?: string
          metadata?: Json | null
          presale_user_id?: string | null
          property_id?: string | null
          property_name?: string | null
          property_url?: string | null
          viewed_at?: string
        }
        Update: {
          action?: string
          contact_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          email?: string | null
          event_id?: string
          id?: string
          metadata?: Json | null
          presale_user_id?: string | null
          property_id?: string | null
          property_name?: string | null
          property_url?: string | null
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_lead_behavior_views_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_lead_segments: {
        Row: {
          color: string
          created_at: string
          emoji: string | null
          filter_config: Json
          id: string
          is_default: boolean
          name: string
          sort_order: number
          user_id: string | null
        }
        Insert: {
          color?: string
          created_at?: string
          emoji?: string | null
          filter_config?: Json
          id?: string
          is_default?: boolean
          name: string
          sort_order?: number
          user_id?: string | null
        }
        Update: {
          color?: string
          created_at?: string
          emoji?: string | null
          filter_config?: Json
          id?: string
          is_default?: boolean
          name?: string
          sort_order?: number
          user_id?: string | null
        }
        Relationships: []
      }
      crm_lead_sources: {
        Row: {
          config: Json | null
          created_at: string
          default_assigned_to: string | null
          default_lead_type: string | null
          default_status: string | null
          default_tags: string[] | null
          description: string | null
          display_name: string
          id: string
          is_active: boolean
          last_error: string | null
          last_error_at: string | null
          last_event_at: string | null
          slug: string
          source_type: string
          total_leads_ingested: number
          updated_at: string
          webhook_url: string | null
        }
        Insert: {
          config?: Json | null
          created_at?: string
          default_assigned_to?: string | null
          default_lead_type?: string | null
          default_status?: string | null
          default_tags?: string[] | null
          description?: string | null
          display_name: string
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_error_at?: string | null
          last_event_at?: string | null
          slug: string
          source_type?: string
          total_leads_ingested?: number
          updated_at?: string
          webhook_url?: string | null
        }
        Update: {
          config?: Json | null
          created_at?: string
          default_assigned_to?: string | null
          default_lead_type?: string | null
          default_status?: string | null
          default_tags?: string[] | null
          description?: string | null
          display_name?: string
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_error_at?: string | null
          last_event_at?: string | null
          slug?: string
          source_type?: string
          total_leads_ingested?: number
          updated_at?: string
          webhook_url?: string | null
        }
        Relationships: []
      }
      crm_lead_types: {
        Row: {
          created_at: string
          id: string
          label: string | null
          name: string
          name_lower: string | null
          updated_at: string
          usage_count: number
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          name: string
          name_lower?: string | null
          updated_at?: string
          usage_count?: number
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          name?: string
          name_lower?: string | null
          updated_at?: string
          usage_count?: number
        }
        Relationships: []
      }
      crm_messages: {
        Row: {
          channel: string | null
          contact_id: string | null
          content: string | null
          conversation_id: string
          created_at: string | null
          delivered: boolean | null
          direction: string
          id: string
          message_type: string | null
          read: boolean | null
          sent_by: string | null
          source_id: string | null
          source_table: string | null
        }
        Insert: {
          channel?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id: string
          created_at?: string | null
          delivered?: boolean | null
          direction: string
          id?: string
          message_type?: string | null
          read?: boolean | null
          sent_by?: string | null
          source_id?: string | null
          source_table?: string | null
        }
        Update: {
          channel?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string
          created_at?: string | null
          delivered?: boolean | null
          direction?: string
          id?: string
          message_type?: string | null
          read?: boolean | null
          sent_by?: string | null
          source_id?: string | null
          source_table?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "crm_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_neighborhoods: {
        Row: {
          city_id: string | null
          city_name: string | null
          created_at: string
          id: string
          is_active: boolean
          lead_count: number
          name: string
          project_count: number
          updated_at: string
        }
        Insert: {
          city_id?: string | null
          city_name?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          lead_count?: number
          name: string
          project_count?: number
          updated_at?: string
        }
        Update: {
          city_id?: string | null
          city_name?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          lead_count?: number
          name?: string
          project_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_neighborhoods_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "crm_cities"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_notes: {
        Row: {
          contact_id: string
          content: string
          content_original: string | null
          created_at: string | null
          event_at: string | null
          id: string
          is_pinned: boolean | null
          note_type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          contact_id: string
          content: string
          content_original?: string | null
          created_at?: string | null
          event_at?: string | null
          id?: string
          is_pinned?: boolean | null
          note_type?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          contact_id?: string
          content?: string
          content_original?: string | null
          created_at?: string | null
          event_at?: string | null
          id?: string
          is_pinned?: boolean | null
          note_type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_notes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_notifications: {
        Row: {
          body: string | null
          created_at: string | null
          id: string
          is_read: boolean | null
          link_to: string | null
          title: string
          type: string | null
          user_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          link_to?: string | null
          title: string
          type?: string | null
          user_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          link_to?: string | null
          title?: string
          type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      crm_projects: {
        Row: {
          aliases: string[] | null
          bedrooms_offered: number[] | null
          brochure_filename: string | null
          brochure_url: string | null
          city: string | null
          color: string | null
          completion_date: string | null
          created_at: string
          developer: string | null
          floor_plans_filename: string | null
          floor_plans_url: string | null
          id: string
          is_active: boolean
          last_viewed_at: string | null
          lead_count: number
          marketing_url: string | null
          name: string
          name_lower: string | null
          neighborhood: string | null
          notes: string | null
          presale_slug: string | null
          price_from: number | null
          price_to: number | null
          pricing_filename: string | null
          pricing_url: string | null
          property_type: string | null
          province: string | null
          slug: string | null
          status: string | null
          updated_at: string
          usage_count: number
          view_count: number
          website_url: string | null
        }
        Insert: {
          aliases?: string[] | null
          bedrooms_offered?: number[] | null
          brochure_filename?: string | null
          brochure_url?: string | null
          city?: string | null
          color?: string | null
          completion_date?: string | null
          created_at?: string
          developer?: string | null
          floor_plans_filename?: string | null
          floor_plans_url?: string | null
          id?: string
          is_active?: boolean
          last_viewed_at?: string | null
          lead_count?: number
          marketing_url?: string | null
          name: string
          name_lower?: string | null
          neighborhood?: string | null
          notes?: string | null
          presale_slug?: string | null
          price_from?: number | null
          price_to?: number | null
          pricing_filename?: string | null
          pricing_url?: string | null
          property_type?: string | null
          province?: string | null
          slug?: string | null
          status?: string | null
          updated_at?: string
          usage_count?: number
          view_count?: number
          website_url?: string | null
        }
        Update: {
          aliases?: string[] | null
          bedrooms_offered?: number[] | null
          brochure_filename?: string | null
          brochure_url?: string | null
          city?: string | null
          color?: string | null
          completion_date?: string | null
          created_at?: string
          developer?: string | null
          floor_plans_filename?: string | null
          floor_plans_url?: string | null
          id?: string
          is_active?: boolean
          last_viewed_at?: string | null
          lead_count?: number
          marketing_url?: string | null
          name?: string
          name_lower?: string | null
          neighborhood?: string | null
          notes?: string | null
          presale_slug?: string | null
          price_from?: number | null
          price_to?: number | null
          pricing_filename?: string | null
          pricing_url?: string | null
          property_type?: string | null
          province?: string | null
          slug?: string | null
          status?: string | null
          updated_at?: string
          usage_count?: number
          view_count?: number
          website_url?: string | null
        }
        Relationships: []
      }
      crm_projects_presale_match_review: {
        Row: {
          candidates: Json | null
          created_at: string
          id: string
          project_id: string
          project_name: string
          reason: string | null
        }
        Insert: {
          candidates?: Json | null
          created_at?: string
          id?: string
          project_id: string
          project_name: string
          reason?: string | null
        }
        Update: {
          candidates?: Json | null
          created_at?: string
          id?: string
          project_id?: string
          project_name?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_projects_presale_match_review_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "crm_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_saved_views: {
        Row: {
          created_at: string
          filters: Json
          id: string
          is_default: boolean
          name: string
          sort_order: number
          user_id: string
        }
        Insert: {
          created_at?: string
          filters?: Json
          id?: string
          is_default?: boolean
          name: string
          sort_order?: number
          user_id: string
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          is_default?: boolean
          name?: string
          sort_order?: number
          user_id?: string
        }
        Relationships: []
      }
      crm_scheduler_availability: {
        Row: {
          agent_user_id: string
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          is_active: boolean
          start_time: string
        }
        Insert: {
          agent_user_id: string
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          is_active?: boolean
          start_time: string
        }
        Update: {
          agent_user_id?: string
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          is_active?: boolean
          start_time?: string
        }
        Relationships: []
      }
      crm_scheduler_availability_overrides: {
        Row: {
          agent_user_id: string
          created_at: string
          date: string
          end_time: string | null
          id: string
          is_unavailable: boolean
          reason: string | null
          start_time: string | null
        }
        Insert: {
          agent_user_id: string
          created_at?: string
          date: string
          end_time?: string | null
          id?: string
          is_unavailable?: boolean
          reason?: string | null
          start_time?: string | null
        }
        Update: {
          agent_user_id?: string
          created_at?: string
          date?: string
          end_time?: string | null
          id?: string
          is_unavailable?: boolean
          reason?: string | null
          start_time?: string | null
        }
        Relationships: []
      }
      crm_scheduler_booking_questions: {
        Row: {
          answer: string | null
          booking_id: string
          created_at: string
          id: string
          question_key: string
          question_text: string
        }
        Insert: {
          answer?: string | null
          booking_id: string
          created_at?: string
          id?: string
          question_key: string
          question_text: string
        }
        Update: {
          answer?: string | null
          booking_id?: string
          created_at?: string
          id?: string
          question_key?: string
          question_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_scheduler_booking_questions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "crm_scheduler_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_scheduler_bookings: {
        Row: {
          agent_user_id: string
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          contact_id: string | null
          created_at: string
          duration_min: number
          end_at: string
          event_type_id: string
          google_calendar_id: string | null
          google_event_id: string | null
          id: string
          invitee_email: string | null
          invitee_first_name: string
          invitee_last_name: string
          invitee_phone: string | null
          invitee_timezone: string
          ip_address: string | null
          location_type: string
          location_value: string | null
          meeting_link: string | null
          notes_for_agent: string | null
          payment_amount_cents: number | null
          payment_currency: string | null
          payment_required: boolean
          payment_status: string | null
          referrer: string | null
          rescheduled_from_id: string | null
          rescheduled_to_booking_id: string | null
          start_at: string
          status: string
          stripe_payment_id: string | null
          stripe_payment_intent: string | null
          stripe_session_id: string | null
          updated_at: string
          user_agent: string | null
          utm: Json | null
        }
        Insert: {
          agent_user_id: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          contact_id?: string | null
          created_at?: string
          duration_min: number
          end_at: string
          event_type_id: string
          google_calendar_id?: string | null
          google_event_id?: string | null
          id?: string
          invitee_email?: string | null
          invitee_first_name: string
          invitee_last_name?: string
          invitee_phone?: string | null
          invitee_timezone?: string
          ip_address?: string | null
          location_type: string
          location_value?: string | null
          meeting_link?: string | null
          notes_for_agent?: string | null
          payment_amount_cents?: number | null
          payment_currency?: string | null
          payment_required?: boolean
          payment_status?: string | null
          referrer?: string | null
          rescheduled_from_id?: string | null
          rescheduled_to_booking_id?: string | null
          start_at: string
          status?: string
          stripe_payment_id?: string | null
          stripe_payment_intent?: string | null
          stripe_session_id?: string | null
          updated_at?: string
          user_agent?: string | null
          utm?: Json | null
        }
        Update: {
          agent_user_id?: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          contact_id?: string | null
          created_at?: string
          duration_min?: number
          end_at?: string
          event_type_id?: string
          google_calendar_id?: string | null
          google_event_id?: string | null
          id?: string
          invitee_email?: string | null
          invitee_first_name?: string
          invitee_last_name?: string
          invitee_phone?: string | null
          invitee_timezone?: string
          ip_address?: string | null
          location_type?: string
          location_value?: string | null
          meeting_link?: string | null
          notes_for_agent?: string | null
          payment_amount_cents?: number | null
          payment_currency?: string | null
          payment_required?: boolean
          payment_status?: string | null
          referrer?: string | null
          rescheduled_from_id?: string | null
          rescheduled_to_booking_id?: string | null
          start_at?: string
          status?: string
          stripe_payment_id?: string | null
          stripe_payment_intent?: string | null
          stripe_session_id?: string | null
          updated_at?: string
          user_agent?: string | null
          utm?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_scheduler_bookings_event_type_id_fkey"
            columns: ["event_type_id"]
            isOneToOne: false
            referencedRelation: "crm_scheduler_event_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_scheduler_bookings_rescheduled_from_id_fkey"
            columns: ["rescheduled_from_id"]
            isOneToOne: false
            referencedRelation: "crm_scheduler_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_scheduler_bookings_rescheduled_to_booking_id_fkey"
            columns: ["rescheduled_to_booking_id"]
            isOneToOne: false
            referencedRelation: "crm_scheduler_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_scheduler_event_types: {
        Row: {
          agent_user_id: string
          buffer_after_min: number
          buffer_before_min: number
          color: string | null
          created_at: string
          creates_showing: boolean
          currency: string
          custom_questions: Json
          description: string | null
          duration_min: number
          id: string
          is_active: boolean
          is_template: boolean
          location_type: string
          location_value: string | null
          max_advance_days: number
          min_notice_min: number
          price_cents: number
          project_slug: string | null
          requires_payment: boolean
          slug: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          agent_user_id: string
          buffer_after_min?: number
          buffer_before_min?: number
          color?: string | null
          created_at?: string
          creates_showing?: boolean
          currency?: string
          custom_questions?: Json
          description?: string | null
          duration_min?: number
          id?: string
          is_active?: boolean
          is_template?: boolean
          location_type?: string
          location_value?: string | null
          max_advance_days?: number
          min_notice_min?: number
          price_cents?: number
          project_slug?: string | null
          requires_payment?: boolean
          slug: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          agent_user_id?: string
          buffer_after_min?: number
          buffer_before_min?: number
          color?: string | null
          created_at?: string
          creates_showing?: boolean
          currency?: string
          custom_questions?: Json
          description?: string | null
          duration_min?: number
          id?: string
          is_active?: boolean
          is_template?: boolean
          location_type?: string
          location_value?: string | null
          max_advance_days?: number
          min_notice_min?: number
          price_cents?: number
          project_slug?: string | null
          requires_payment?: boolean
          slug?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_scheduler_payment_intents: {
        Row: {
          amount_cents: number
          answers_payload: Json
          booking_id: string | null
          created_at: string
          currency: string
          event_slug: string
          id: string
          invitee_payload: Json
          last_error: string | null
          referrer: string | null
          start_at: string
          status: string
          stripe_session_id: string | null
          team_slug: string
          timezone: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          answers_payload?: Json
          booking_id?: string | null
          created_at?: string
          currency?: string
          event_slug: string
          id?: string
          invitee_payload: Json
          last_error?: string | null
          referrer?: string | null
          start_at: string
          status?: string
          stripe_session_id?: string | null
          team_slug: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          answers_payload?: Json
          booking_id?: string | null
          created_at?: string
          currency?: string
          event_slug?: string
          id?: string
          invitee_payload?: Json
          last_error?: string | null
          referrer?: string | null
          start_at?: string
          status?: string
          stripe_session_id?: string | null
          team_slug?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_scheduler_payment_intents_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "crm_scheduler_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_scheduler_reminder_log: {
        Row: {
          booking_id: string
          channel: string
          error: string | null
          id: string
          recipient: string
          reminder_kind: string
          sent_at: string
          status: string
        }
        Insert: {
          booking_id: string
          channel: string
          error?: string | null
          id?: string
          recipient: string
          reminder_kind: string
          sent_at?: string
          status?: string
        }
        Update: {
          booking_id?: string
          channel?: string
          error?: string | null
          id?: string
          recipient?: string
          reminder_kind?: string
          sent_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_scheduler_reminder_log_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "crm_scheduler_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_showings: {
        Row: {
          assigned_agent: string | null
          contact_id: string
          created_at: string | null
          id: string
          notes: string | null
          project: string
          showing_date: string
          showing_time: string
          status: string | null
          unit: string | null
        }
        Insert: {
          assigned_agent?: string | null
          contact_id: string
          created_at?: string | null
          id?: string
          notes?: string | null
          project: string
          showing_date: string
          showing_time: string
          status?: string | null
          unit?: string | null
        }
        Update: {
          assigned_agent?: string | null
          contact_id?: string
          created_at?: string | null
          id?: string
          notes?: string | null
          project?: string
          showing_date?: string
          showing_time?: string
          status?: string | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_showings_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_sms_campaign_recipients: {
        Row: {
          campaign_id: string
          contact_id: string | null
          created_at: string
          delivered_at: string | null
          error_message: string | null
          id: string
          phone: string
          replied_at: string | null
          sent_at: string | null
          sms_log_id: string | null
          status: string
        }
        Insert: {
          campaign_id: string
          contact_id?: string | null
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          phone: string
          replied_at?: string | null
          sent_at?: string | null
          sms_log_id?: string | null
          status?: string
        }
        Update: {
          campaign_id?: string
          contact_id?: string | null
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          phone?: string
          replied_at?: string | null
          sent_at?: string | null
          sms_log_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_sms_campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "crm_sms_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_sms_campaign_recipients_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_sms_campaign_recipients_sms_log_id_fkey"
            columns: ["sms_log_id"]
            isOneToOne: false
            referencedRelation: "crm_sms_log"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_sms_campaigns: {
        Row: {
          body: string
          channel: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          delivered_count: number
          failed_count: number
          from_number: string | null
          id: string
          media_urls: string[]
          messaging_service_sid: string | null
          name: string
          optout_count: number
          recipients_count: number
          reply_count: number
          scheduled_for: string | null
          segment_filter: Json | null
          sent_count: number
          started_at: string | null
          status: string
          template_id: string | null
          throttle_per_min: number
          updated_at: string
        }
        Insert: {
          body: string
          channel?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          delivered_count?: number
          failed_count?: number
          from_number?: string | null
          id?: string
          media_urls?: string[]
          messaging_service_sid?: string | null
          name: string
          optout_count?: number
          recipients_count?: number
          reply_count?: number
          scheduled_for?: string | null
          segment_filter?: Json | null
          sent_count?: number
          started_at?: string | null
          status?: string
          template_id?: string | null
          throttle_per_min?: number
          updated_at?: string
        }
        Update: {
          body?: string
          channel?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          delivered_count?: number
          failed_count?: number
          from_number?: string | null
          id?: string
          media_urls?: string[]
          messaging_service_sid?: string | null
          name?: string
          optout_count?: number
          recipients_count?: number
          reply_count?: number
          scheduled_for?: string | null
          segment_filter?: Json | null
          sent_count?: number
          started_at?: string | null
          status?: string
          template_id?: string | null
          throttle_per_min?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_sms_campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "crm_sms_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_sms_log: {
        Row: {
          body: string
          campaign_id: string | null
          channel: string
          client_dedupe_id: string | null
          contact_id: string | null
          created_at: string
          delivered_at: string | null
          direction: string
          error_code: string | null
          error_message: string | null
          from_number: string | null
          id: string
          media_urls: string[]
          message_type: string
          num_segments: number | null
          price: number | null
          price_unit: string | null
          scheduled_for: string | null
          sent_at: string
          status: string
          to_number: string
          twilio_message_sid: string | null
          user_id: string | null
        }
        Insert: {
          body: string
          campaign_id?: string | null
          channel?: string
          client_dedupe_id?: string | null
          contact_id?: string | null
          created_at?: string
          delivered_at?: string | null
          direction?: string
          error_code?: string | null
          error_message?: string | null
          from_number?: string | null
          id?: string
          media_urls?: string[]
          message_type?: string
          num_segments?: number | null
          price?: number | null
          price_unit?: string | null
          scheduled_for?: string | null
          sent_at?: string
          status?: string
          to_number: string
          twilio_message_sid?: string | null
          user_id?: string | null
        }
        Update: {
          body?: string
          campaign_id?: string | null
          channel?: string
          client_dedupe_id?: string | null
          contact_id?: string | null
          created_at?: string
          delivered_at?: string | null
          direction?: string
          error_code?: string | null
          error_message?: string | null
          from_number?: string | null
          id?: string
          media_urls?: string[]
          message_type?: string
          num_segments?: number | null
          price?: number | null
          price_unit?: string | null
          scheduled_for?: string | null
          sent_at?: string
          status?: string
          to_number?: string
          twilio_message_sid?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_sms_log_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "crm_sms_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_sms_log_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_sms_numbers: {
        Row: {
          channel: string
          created_at: string
          id: string
          is_active: boolean
          is_company: boolean
          label: string | null
          phone: string
          twilio_sid: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          channel?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_company?: boolean
          label?: string | null
          phone: string
          twilio_sid?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_company?: boolean
          label?: string | null
          phone?: string
          twilio_sid?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      crm_sms_opt_outs: {
        Row: {
          contact_id: string | null
          created_at: string
          id: string
          opted_out_at: string
          phone: string
          re_opted_in_at: string | null
          reason: string | null
          source: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          id?: string
          opted_out_at?: string
          phone: string
          re_opted_in_at?: string | null
          reason?: string | null
          source?: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          id?: string
          opted_out_at?: string
          phone?: string
          re_opted_in_at?: string | null
          reason?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_sms_opt_outs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_sms_settings: {
        Row: {
          append_optout_first_msg: boolean
          created_at: string
          default_throttle_per_min: number
          enforce_quiet_hours: boolean
          id: string
          messaging_service_sid: string | null
          optout_footer: string
          quiet_hours_end: number
          quiet_hours_start: number
          quiet_hours_timezone: string
          updated_at: string
          whatsapp_enabled: boolean
          whatsapp_from: string | null
          whatsapp_messaging_service_sid: string | null
        }
        Insert: {
          append_optout_first_msg?: boolean
          created_at?: string
          default_throttle_per_min?: number
          enforce_quiet_hours?: boolean
          id?: string
          messaging_service_sid?: string | null
          optout_footer?: string
          quiet_hours_end?: number
          quiet_hours_start?: number
          quiet_hours_timezone?: string
          updated_at?: string
          whatsapp_enabled?: boolean
          whatsapp_from?: string | null
          whatsapp_messaging_service_sid?: string | null
        }
        Update: {
          append_optout_first_msg?: boolean
          created_at?: string
          default_throttle_per_min?: number
          enforce_quiet_hours?: boolean
          id?: string
          messaging_service_sid?: string | null
          optout_footer?: string
          quiet_hours_end?: number
          quiet_hours_start?: number
          quiet_hours_timezone?: string
          updated_at?: string
          whatsapp_enabled?: boolean
          whatsapp_from?: string | null
          whatsapp_messaging_service_sid?: string | null
        }
        Relationships: []
      }
      crm_sms_templates: {
        Row: {
          body: string
          category: string
          channel: string
          created_at: string
          created_by: string | null
          default_media_urls: string[]
          id: string
          is_active: boolean
          last_used_at: string | null
          merge_tags: string[]
          name: string
          times_used: number
          updated_at: string
        }
        Insert: {
          body: string
          category?: string
          channel?: string
          created_at?: string
          created_by?: string | null
          default_media_urls?: string[]
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          merge_tags?: string[]
          name: string
          times_used?: number
          updated_at?: string
        }
        Update: {
          body?: string
          category?: string
          channel?: string
          created_at?: string
          created_by?: string | null
          default_media_urls?: string[]
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          merge_tags?: string[]
          name?: string
          times_used?: number
          updated_at?: string
        }
        Relationships: []
      }
      crm_source_events: {
        Row: {
          contact_id: string | null
          created_at: string
          email: string | null
          error_message: string | null
          event_type: string
          external_id: string | null
          id: string
          occurred_at: string
          phone: string | null
          processed_at: string | null
          raw_payload: Json
          source_id: string | null
          source_slug: string
          status: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          email?: string | null
          error_message?: string | null
          event_type?: string
          external_id?: string | null
          id?: string
          occurred_at?: string
          phone?: string | null
          processed_at?: string | null
          raw_payload: Json
          source_id?: string | null
          source_slug: string
          status?: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          email?: string | null
          error_message?: string | null
          event_type?: string
          external_id?: string | null
          id?: string
          occurred_at?: string
          phone?: string | null
          processed_at?: string | null
          raw_payload?: Json
          source_id?: string | null
          source_slug?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_source_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_source_events_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "crm_lead_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_sources: {
        Row: {
          created_at: string
          id: string
          name: string
          name_lower: string | null
          updated_at: string
          usage_count: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          name_lower?: string | null
          updated_at?: string
          usage_count?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          name_lower?: string | null
          updated_at?: string
          usage_count?: number
        }
        Relationships: []
      }
      crm_sync_log: {
        Row: {
          contact_email: string | null
          contact_name: string | null
          created_at: string | null
          error_message: string | null
          event_type: string | null
          id: string
          lofty_lead_id: string | null
          payload_preview: string | null
          source: string
          status: string | null
        }
        Insert: {
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          id?: string
          lofty_lead_id?: string | null
          payload_preview?: string | null
          source?: string
          status?: string | null
        }
        Update: {
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          id?: string
          lofty_lead_id?: string | null
          payload_preview?: string | null
          source?: string
          status?: string | null
        }
        Relationships: []
      }
      crm_tags: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          name_lower: string | null
          updated_at: string
          usage_count: number
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          name_lower?: string | null
          updated_at?: string
          usage_count?: number
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          name_lower?: string | null
          updated_at?: string
          usage_count?: number
        }
        Relationships: []
      }
      crm_tasks: {
        Row: {
          assigned_to: string | null
          contact_id: string | null
          created_at: string | null
          description: string | null
          due_date: string | null
          id: string
          priority: string | null
          status: string | null
          task_type: string | null
          title: string
        }
        Insert: {
          assigned_to?: string | null
          contact_id?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string | null
          status?: string | null
          task_type?: string | null
          title: string
        }
        Update: {
          assigned_to?: string | null
          contact_id?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string | null
          status?: string | null
          task_type?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_tasks_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_team: {
        Row: {
          agent_onboarded_at: string | null
          bio: string | null
          brokerage: string | null
          created_at: string
          default_buffer_min: number | null
          default_min_notice_min: number | null
          display_name: string | null
          email: string | null
          gmail_address: string | null
          headshot_focal_y: number | null
          headshot_url: string | null
          id: string
          invited_at: string | null
          invited_by: string | null
          is_active: boolean
          license_no: string | null
          name_aliases: string[]
          permissions: Json
          phone: string | null
          presale_email: string | null
          presale_snapshot: Json | null
          presale_synced_at: string | null
          role: string
          scheduler_onboarded_at: string | null
          slug: string | null
          timezone: string | null
          title: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          agent_onboarded_at?: string | null
          bio?: string | null
          brokerage?: string | null
          created_at?: string
          default_buffer_min?: number | null
          default_min_notice_min?: number | null
          display_name?: string | null
          email?: string | null
          gmail_address?: string | null
          headshot_focal_y?: number | null
          headshot_url?: string | null
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          is_active?: boolean
          license_no?: string | null
          name_aliases?: string[]
          permissions?: Json
          phone?: string | null
          presale_email?: string | null
          presale_snapshot?: Json | null
          presale_synced_at?: string | null
          role?: string
          scheduler_onboarded_at?: string | null
          slug?: string | null
          timezone?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          agent_onboarded_at?: string | null
          bio?: string | null
          brokerage?: string | null
          created_at?: string
          default_buffer_min?: number | null
          default_min_notice_min?: number | null
          display_name?: string | null
          email?: string | null
          gmail_address?: string | null
          headshot_focal_y?: number | null
          headshot_url?: string | null
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          is_active?: boolean
          license_no?: string | null
          name_aliases?: string[]
          permissions?: Json
          phone?: string | null
          presale_email?: string | null
          presale_snapshot?: Json | null
          presale_synced_at?: string | null
          role?: string
          scheduler_onboarded_at?: string | null
          slug?: string | null
          timezone?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      crm_team_invites: {
        Row: {
          accepted_at: string | null
          accepted_user_id: string | null
          created_at: string
          display_name: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          role: string
          status: Database["public"]["Enums"]["crm_invite_status"]
          team_id: string | null
          token_hash: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          display_name: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: string
          status?: Database["public"]["Enums"]["crm_invite_status"]
          team_id?: string | null
          token_hash: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          display_name?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: string
          status?: Database["public"]["Enums"]["crm_invite_status"]
          team_id?: string | null
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_team_invites_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "crm_team"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_timeline_link_clicks: {
        Row: {
          clicked_at: string
          clicked_by: string | null
          contact_id: string | null
          host: string | null
          id: string
          note_id: string | null
          path: string | null
          source: string | null
          url: string
        }
        Insert: {
          clicked_at?: string
          clicked_by?: string | null
          contact_id?: string | null
          host?: string | null
          id?: string
          note_id?: string | null
          path?: string | null
          source?: string | null
          url: string
        }
        Update: {
          clicked_at?: string
          clicked_by?: string | null
          contact_id?: string | null
          host?: string | null
          id?: string
          note_id?: string | null
          path?: string | null
          source?: string | null
          url?: string
        }
        Relationships: []
      }
      crm_whatsapp_conversations: {
        Row: {
          contact_id: string
          created_at: string
          id: string
          last_message_at: string | null
          last_message_preview: string | null
          phone_number: string
          status: string
          unread_count: number
          user_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          phone_number: string
          status?: string
          unread_count?: number
          user_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          phone_number?: string
          status?: string
          unread_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_whatsapp_conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_whatsapp_messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          direction: string
          id: string
          message_type: string
          status: string
          template_name: string | null
          user_id: string
          whatsapp_message_id: string | null
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          direction?: string
          id?: string
          message_type?: string
          status?: string
          template_name?: string | null
          user_id: string
          whatsapp_message_id?: string | null
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          direction?: string
          id?: string
          message_type?: string
          status?: string
          template_name?: string | null
          user_id?: string
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_whatsapp_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "crm_whatsapp_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_whatsapp_templates: {
        Row: {
          body_text: string
          category: string
          created_at: string
          id: string
          language: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          body_text: string
          category?: string
          created_at?: string
          id?: string
          language?: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          body_text?: string
          category?: string
          created_at?: string
          id?: string
          language?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      daily_focus: {
        Row: {
          completed: boolean
          created_at: string
          date: string
          id: string
          position: number
          text: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed?: boolean
          created_at?: string
          date?: string
          id?: string
          position?: number
          text?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed?: boolean
          created_at?: string
          date?: string
          id?: string
          position?: number
          text?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      email_template_versions: {
        Row: {
          area_tags: string[] | null
          category: string | null
          change_note: string | null
          created_at: string
          created_by: string | null
          detected_variables: string[] | null
          html_content: string
          id: string
          name: string
          preview_text: string | null
          project_tags: string[] | null
          subject: string | null
          template_id: string
          version_number: number
        }
        Insert: {
          area_tags?: string[] | null
          category?: string | null
          change_note?: string | null
          created_at?: string
          created_by?: string | null
          detected_variables?: string[] | null
          html_content?: string
          id?: string
          name: string
          preview_text?: string | null
          project_tags?: string[] | null
          subject?: string | null
          template_id: string
          version_number: number
        }
        Update: {
          area_tags?: string[] | null
          category?: string | null
          change_note?: string | null
          created_at?: string
          created_by?: string | null
          detected_variables?: string[] | null
          html_content?: string
          id?: string
          name?: string
          preview_text?: string | null
          project_tags?: string[] | null
          subject?: string | null
          template_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "email_template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          area_tags: string[]
          category: string
          created_at: string
          created_by: string | null
          html_content: string
          id: string
          is_active: boolean
          is_favorite: boolean
          last_used_at: string | null
          name: string
          preview_text: string | null
          project_tags: string[]
          source: string
          subject: string | null
          synced_at: string
          thumbnail_url: string | null
          times_used: number
          updated_at: string
        }
        Insert: {
          area_tags?: string[]
          category?: string
          created_at?: string
          created_by?: string | null
          html_content?: string
          id?: string
          is_active?: boolean
          is_favorite?: boolean
          last_used_at?: string | null
          name: string
          preview_text?: string | null
          project_tags?: string[]
          source?: string
          subject?: string | null
          synced_at?: string
          thumbnail_url?: string | null
          times_used?: number
          updated_at?: string
        }
        Update: {
          area_tags?: string[]
          category?: string
          created_at?: string
          created_by?: string | null
          html_content?: string
          id?: string
          is_active?: boolean
          is_favorite?: boolean
          last_used_at?: string | null
          name?: string
          preview_text?: string | null
          project_tags?: string[]
          source?: string
          subject?: string | null
          synced_at?: string
          thumbnail_url?: string | null
          times_used?: number
          updated_at?: string
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
      gmail_tokens: {
        Row: {
          access_token: string
          created_at: string
          gmail_email: string | null
          id: string
          refresh_token: string
          token_expires_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          gmail_email?: string | null
          id?: string
          refresh_token: string
          token_expires_at: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          gmail_email?: string | null
          id?: string
          refresh_token?: string
          token_expires_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      google_calendar_tokens: {
        Row: {
          access_token: string
          calendar_email: string | null
          created_at: string | null
          id: string
          refresh_token: string
          token_expires_at: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token: string
          calendar_email?: string | null
          created_at?: string | null
          id?: string
          refresh_token: string
          token_expires_at: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token?: string
          calendar_email?: string | null
          created_at?: string | null
          id?: string
          refresh_token?: string
          token_expires_at?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      lead_notes: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          created_by: string | null
          id: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          created_by?: string | null
          id?: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_notes_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          direction: string
          id: string
          media_url: string | null
          metadata: Json | null
          sender: string
          status: string | null
          twilio_message_sid: string | null
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          direction: string
          id?: string
          media_url?: string | null
          metadata?: Json | null
          sender: string
          status?: string | null
          twilio_message_sid?: string | null
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          direction?: string
          id?: string
          media_url?: string | null
          metadata?: Json | null
          sender?: string
          status?: string | null
          twilio_message_sid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
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
          approved_at: string | null
          approved_by: string | null
          avatar_position: string
          avatar_url: string | null
          ban_reason: string | null
          banned_at: string | null
          brokerage: string | null
          created_at: string
          denial_reason: string | null
          full_name: string | null
          id: string
          is_banned: boolean
          license_no: string | null
          must_change_password: boolean
          onboarding_completed_at: string | null
          onboarding_started_at: string | null
          onboarding_steps: Json
          phone: string | null
          province: string | null
          requested_at: string
          title: string | null
          updated_at: string
          user_id: string
          workspace_status: Database["public"]["Enums"]["workspace_status"]
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          avatar_position?: string
          avatar_url?: string | null
          ban_reason?: string | null
          banned_at?: string | null
          brokerage?: string | null
          created_at?: string
          denial_reason?: string | null
          full_name?: string | null
          id?: string
          is_banned?: boolean
          license_no?: string | null
          must_change_password?: boolean
          onboarding_completed_at?: string | null
          onboarding_started_at?: string | null
          onboarding_steps?: Json
          phone?: string | null
          province?: string | null
          requested_at?: string
          title?: string | null
          updated_at?: string
          user_id: string
          workspace_status?: Database["public"]["Enums"]["workspace_status"]
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          avatar_position?: string
          avatar_url?: string | null
          ban_reason?: string | null
          banned_at?: string | null
          brokerage?: string | null
          created_at?: string
          denial_reason?: string | null
          full_name?: string | null
          id?: string
          is_banned?: boolean
          license_no?: string | null
          must_change_password?: boolean
          onboarding_completed_at?: string | null
          onboarding_started_at?: string | null
          onboarding_steps?: Json
          phone?: string | null
          province?: string | null
          requested_at?: string
          title?: string | null
          updated_at?: string
          user_id?: string
          workspace_status?: Database["public"]["Enums"]["workspace_status"]
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
          theme: string | null
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
          theme?: string | null
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
          theme?: string | null
          updated_at?: string
          user_id?: string
          yearly_gci_goal?: number | null
          yearly_revshare_goal?: number | null
          zapier_webhook_url?: string | null
        }
        Relationships: []
      }
      sync_log: {
        Row: {
          created_at: string
          duration_ms: number | null
          error_count: number
          error_message: string | null
          id: string
          records_created: number
          records_processed: number
          records_updated: number
          started_at: string
          status: string
          sync_type: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error_count?: number
          error_message?: string | null
          id?: string
          records_created?: number
          records_processed?: number
          records_updated?: number
          started_at?: string
          status?: string
          sync_type: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error_count?: number
          error_message?: string | null
          id?: string
          records_created?: number
          records_processed?: number
          records_updated?: number
          started_at?: string
          status?: string
          sync_type?: string
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
          client_email: string | null
          client_name: string | null
          client_phone: string | null
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
          client_email?: string | null
          client_name?: string | null
          client_phone?: string | null
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
          client_email?: string | null
          client_name?: string | null
          client_phone?: string | null
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
      zara_activity: {
        Row: {
          action_type: string
          conversation_id: string
          created_at: string
          description: string | null
          id: string
          payload: Json | null
        }
        Insert: {
          action_type: string
          conversation_id: string
          created_at?: string
          description?: string | null
          id?: string
          payload?: Json | null
        }
        Update: {
          action_type?: string
          conversation_id?: string
          created_at?: string
          description?: string | null
          id?: string
          payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "zara_activity_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      crm_potential_duplicates: {
        Row: {
          contact_ids: string[] | null
          dup_count: number | null
          match_key: string | null
          match_type: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _backfill_behavior_notes_internal: { Args: never; Returns: Json }
      _touch_skip_enabled: { Args: never; Returns: boolean }
      admin_link_crm_team_to_user: {
        Args: { _email: string; _team_id: string }
        Returns: Json
      }
      admin_set_user_password: {
        Args: { _new_password: string; _target_user_id: string }
        Returns: Json
      }
      admin_set_workspace_status: {
        Args: {
          _reason?: string
          _status: Database["public"]["Enums"]["workspace_status"]
          _target_user_id: string
        }
        Returns: Json
      }
      backfill_behavior_notes: { Args: never; Returns: Json }
      bulk_reformat_crm_notes: { Args: never; Returns: Json }
      contact_related_counts: {
        Args: { _contact_ids: string[] }
        Returns: {
          contact_id: string
          emails_count: number
          messages_count: number
          notes_count: number
          showings_count: number
          tasks_count: number
          total_count: number
        }[]
      }
      count_potential_duplicates: {
        Args: never
        Returns: {
          extra_records: number
          groups_count: number
          records_count: number
        }[]
      }
      crm_behavior_overview: { Args: { _days?: number }; Returns: Json }
      crm_can_see_contact: {
        Args: { _assigned_to: string; _user_id: string }
        Returns: boolean
      }
      crm_can_see_contact_id: {
        Args: { _contact_id: string; _user_id: string }
        Returns: boolean
      }
      crm_distinct_sources: {
        Args: never
        Returns: {
          source: string
          usage_count: number
        }[]
      }
      crm_funnel_snapshot: { Args: never; Returns: Json }
      crm_get_or_create_conversation: {
        Args: { _channel: string; _contact_id: string; _message_at?: string }
        Returns: string
      }
      crm_has_perm: {
        Args: { _perm: string; _user_id: string }
        Returns: boolean
      }
      crm_recipients_for_contact: {
        Args: { _assigned_to: string }
        Returns: string[]
      }
      crm_scheduler_resolve_slug: {
        Args: { _event_slug: string; _team_slug: string }
        Returns: Json
      }
      crm_scheduler_seed_defaults: {
        Args: { _agent_user_id: string }
        Returns: undefined
      }
      crm_team_admin_update_member: {
        Args: {
          _display_name?: string
          _email?: string
          _headshot_focal_y?: number
          _headshot_url?: string
          _is_active?: boolean
          _phone?: string
          _role?: string
          _team_id: string
          _title?: string
        }
        Returns: Json
      }
      crm_team_create_invite: {
        Args: { _display_name: string; _email: string; _role?: string }
        Returns: Json
      }
      crm_team_invite: {
        Args: {
          _display_name: string
          _email: string
          _permissions?: Json
          _role?: string
        }
        Returns: Json
      }
      crm_team_list_invites: {
        Args: never
        Returns: {
          accepted_at: string
          created_at: string
          display_name: string
          email: string
          expires_at: string
          id: string
          role: string
          status: Database["public"]["Enums"]["crm_invite_status"]
        }[]
      }
      crm_team_list_workspace_candidates: {
        Args: never
        Returns: {
          avatar_url: string
          crm_role: string
          crm_status: string
          crm_team_id: string
          email: string
          full_name: string
          user_id: string
          workspace_status: string
        }[]
      }
      crm_team_member_signin_info: {
        Args: never
        Returns: {
          created_at: string
          email_confirmed_at: string
          last_sign_in_at: string
          user_id: string
        }[]
      }
      crm_team_recent_audit: {
        Args: { _limit?: number }
        Returns: {
          action: string
          admin_name: string
          admin_user_id: string
          created_at: string
          details: Json
          id: string
          target_name: string
          target_user_id: string
        }[]
      }
      crm_team_redeem_invite: { Args: { _token: string }; Returns: Json }
      crm_team_revoke_invite: {
        Args: { _invite_id: string }
        Returns: undefined
      }
      crm_team_update: {
        Args: {
          _is_active: boolean
          _name_aliases: string[]
          _permissions: Json
          _role: string
          _team_id: string
        }
        Returns: undefined
      }
      crm_team_update_member: {
        Args: {
          _display_name?: string
          _is_active?: boolean
          _role?: string
          _user_id: string
        }
        Returns: Json
      }
      crm_team_validate_invite: { Args: { _token: string }; Returns: Json }
      decrypt_api_credential: {
        Args: { ciphertext: string; passphrase: string }
        Returns: string
      }
      encrypt_api_credential: {
        Args: { passphrase: string; plaintext: string }
        Returns: string
      }
      find_potential_duplicate: {
        Args: {
          _email: string
          _first_name?: string
          _last_name?: string
          _phone: string
        }
        Returns: {
          confidence: string
          email: string
          first_name: string
          id: string
          last_name: string
          match_type: string
          phone: string
        }[]
      }
      format_note_content: { Args: { _raw: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_crm_email_template_usage: {
        Args: { _template_id: string }
        Returns: undefined
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_crm_admin: { Args: { _user_id: string }; Returns: boolean }
      is_crm_agent_or_above: { Args: { _user_id: string }; Returns: boolean }
      is_crm_member: { Args: { _user_id: string }; Returns: boolean }
      is_crm_owner: { Args: { _user_id: string }; Returns: boolean }
      is_phone_opted_out: { Args: { _phone: string }; Returns: boolean }
      is_workspace_approved: { Args: { _user_id: string }; Returns: boolean }
      list_potential_duplicates: {
        Args: { _limit?: number }
        Returns: {
          contacts: Json
          dup_count: number
          match_key: string
          match_type: string
        }[]
      }
      log_source_event: {
        Args: {
          _email: string
          _event_type: string
          _external_id: string
          _payload: Json
          _phone: string
          _source_slug: string
        }
        Returns: string
      }
      log_timeline_link_click: {
        Args: {
          _contact_id?: string
          _note_id?: string
          _source?: string
          _url: string
        }
        Returns: string
      }
      mark_ai_summary_stale: {
        Args: { _contact_id: string }
        Returns: undefined
      }
      mark_password_changed: { Args: never; Returns: undefined }
      mark_source_event_processed: {
        Args: {
          _contact_id: string
          _error?: string
          _event_id: string
          _status?: string
        }
        Returns: undefined
      }
      merge_crm_contacts: {
        Args: { _loser_ids: string[]; _winner_id: string }
        Returns: Json
      }
      merge_crm_sources: {
        Args: { _from_names: string[]; _to_name: string }
        Returns: Json
      }
      normalize_crm_multi_array: {
        Args: { input: string[] }
        Returns: string[]
      }
      notify_crm: {
        Args: {
          _body: string
          _link_to: string
          _title: string
          _type: string
          _user_ids: string[]
        }
        Returns: undefined
      }
      notify_overdue_followups: { Args: never; Returns: number }
      parse_note_event_ts: {
        Args: { _date: string; _time: string }
        Returns: string
      }
      profile_onboarding_progress: {
        Args: { _user_id: string }
        Returns: number
      }
      recalc_all_lead_scores: { Args: never; Returns: number }
      recalc_lead_score: { Args: { _contact_id: string }; Returns: undefined }
      rename_crm_source: {
        Args: { _from_name: string; _to_name: string }
        Returns: Json
      }
      set_my_presale_email: { Args: { _email: string }; Returns: undefined }
      split_crm_multi_value: { Args: { input: string }; Returns: string[] }
      split_imported_note: {
        Args: { _fallback_ts: string; _raw: string }
        Returns: {
          body: string
          event_at: string
          kind: string
        }[]
      }
      write_behavior_note: {
        Args: {
          _body: string
          _contact_id: string
          _event_at: string
          _kind: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      crm_invite_status: "pending" | "accepted" | "revoked" | "expired"
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
      workspace_status: "pending" | "approved" | "suspended"
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
      crm_invite_status: ["pending", "accepted", "revoked", "expired"],
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
      workspace_status: ["pending", "approved", "suspended"],
    },
  },
} as const
