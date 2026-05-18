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
      app_secrets: {
        Row: {
          created_at: string
          key: string
          value: string
        }
        Insert: {
          created_at?: string
          key: string
          value: string
        }
        Update: {
          created_at?: string
          key?: string
          value?: string
        }
        Relationships: []
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
      crm_audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          actor_label: string | null
          affected_count: number | null
          after: Json | null
          before: Json | null
          bulk_job_id: string | null
          bulk_op: string | null
          changed_fields: string[] | null
          filter_snapshot: Json | null
          id: string
          meta: Json
          occurred_at: string
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          actor_label?: string | null
          affected_count?: number | null
          after?: Json | null
          before?: Json | null
          bulk_job_id?: string | null
          bulk_op?: string | null
          changed_fields?: string[] | null
          filter_snapshot?: Json | null
          id?: string
          meta?: Json
          occurred_at?: string
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          actor_label?: string | null
          affected_count?: number | null
          after?: Json | null
          before?: Json | null
          bulk_job_id?: string | null
          bulk_op?: string | null
          changed_fields?: string[] | null
          filter_snapshot?: Json | null
          id?: string
          meta?: Json
          occurred_at?: string
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      crm_automation_enrollments: {
        Row: {
          automation_id: string
          contact_id: string
          created_at: string
          current_step_order: number
          enrolled_at: string
          exit_reason: string | null
          exited_at: string | null
          id: string
          next_step_due_at: string | null
          project_slug: string | null
          status: string
          trigger_data: Json | null
          updated_at: string
        }
        Insert: {
          automation_id: string
          contact_id: string
          created_at?: string
          current_step_order?: number
          enrolled_at?: string
          exit_reason?: string | null
          exited_at?: string | null
          id?: string
          next_step_due_at?: string | null
          project_slug?: string | null
          status?: string
          trigger_data?: Json | null
          updated_at?: string
        }
        Update: {
          automation_id?: string
          contact_id?: string
          created_at?: string
          current_step_order?: number
          enrolled_at?: string
          exit_reason?: string | null
          exited_at?: string | null
          id?: string
          next_step_due_at?: string | null
          project_slug?: string | null
          status?: string
          trigger_data?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_automation_enrollments_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "crm_automations"
            referencedColumns: ["id"]
          },
        ]
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
      crm_automation_run_log: {
        Row: {
          action_result: string
          action_type: string
          automation_id: string
          contact_id: string | null
          created_at: string
          enrollment_id: string | null
          error_message: string | null
          id: string
          payload: Json | null
          step_order: number
        }
        Insert: {
          action_result?: string
          action_type: string
          automation_id: string
          contact_id?: string | null
          created_at?: string
          enrollment_id?: string | null
          error_message?: string | null
          id?: string
          payload?: Json | null
          step_order: number
        }
        Update: {
          action_result?: string
          action_type?: string
          automation_id?: string
          contact_id?: string | null
          created_at?: string
          enrollment_id?: string | null
          error_message?: string | null
          id?: string
          payload?: Json | null
          step_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "crm_automation_run_log_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "crm_automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_automation_run_log_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "crm_automation_enrollments"
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
      crm_call_log: {
        Row: {
          agent_user_id: string | null
          answered_at: string | null
          contact_id: string | null
          created_at: string
          direction: string
          duration_sec: number | null
          ended_at: string | null
          error_code: string | null
          error_message: string | null
          from_number: string | null
          id: string
          notes: string | null
          parent_call_sid: string | null
          recording_duration_sec: number | null
          recording_sid: string | null
          recording_url: string | null
          started_at: string
          status: string
          to_number: string | null
          twilio_call_sid: string | null
          updated_at: string
          voicemail_dropped_id: string | null
        }
        Insert: {
          agent_user_id?: string | null
          answered_at?: string | null
          contact_id?: string | null
          created_at?: string
          direction: string
          duration_sec?: number | null
          ended_at?: string | null
          error_code?: string | null
          error_message?: string | null
          from_number?: string | null
          id?: string
          notes?: string | null
          parent_call_sid?: string | null
          recording_duration_sec?: number | null
          recording_sid?: string | null
          recording_url?: string | null
          started_at?: string
          status?: string
          to_number?: string | null
          twilio_call_sid?: string | null
          updated_at?: string
          voicemail_dropped_id?: string | null
        }
        Update: {
          agent_user_id?: string | null
          answered_at?: string | null
          contact_id?: string | null
          created_at?: string
          direction?: string
          duration_sec?: number | null
          ended_at?: string | null
          error_code?: string | null
          error_message?: string | null
          from_number?: string | null
          id?: string
          notes?: string | null
          parent_call_sid?: string | null
          recording_duration_sec?: number | null
          recording_sid?: string | null
          recording_url?: string | null
          started_at?: string
          status?: string
          to_number?: string | null
          twilio_call_sid?: string | null
          updated_at?: string
          voicemail_dropped_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_call_log_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_call_log_voicemail_dropped_fk"
            columns: ["voicemail_dropped_id"]
            isOneToOne: false
            referencedRelation: "crm_voicemail_drops"
            referencedColumns: ["id"]
          },
        ]
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
      crm_contact_identities: {
        Row: {
          contact_id: string
          first_seen_at: string
          id: string
          is_primary: boolean
          kind: string
          last_seen_at: string
          metadata: Json
          raw_value: string | null
          source: string | null
          value: string
        }
        Insert: {
          contact_id: string
          first_seen_at?: string
          id?: string
          is_primary?: boolean
          kind: string
          last_seen_at?: string
          metadata?: Json
          raw_value?: string | null
          source?: string | null
          value: string
        }
        Update: {
          contact_id?: string
          first_seen_at?: string
          id?: string
          is_primary?: boolean
          kind?: string
          last_seen_at?: string
          metadata?: Json
          raw_value?: string | null
          source?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_contact_identities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
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
          deleted_at: string | null
          deleted_by: string | null
          email: string | null
          email_secondary: string | null
          engagement_score: number
          engagement_score_at: string | null
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
          last_visit_at: string | null
          lead_currency: string | null
          lead_score: number | null
          lead_tier: string | null
          lead_type: string | null
          lead_types: string[]
          lead_value: number | null
          lofty_id: string | null
          lofty_synced_at: string | null
          lofty_updated_at: string | null
          looking_to_buy_in: string[] | null
          marketing_consent: boolean | null
          metadata: Json
          next_followup_date: string | null
          notes: string | null
          phone: string | null
          phone_normalized: string | null
          phone_secondary: string | null
          pipeline_segment_id: string | null
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
          visit_count: number
          won_at: string | null
          zara_enabled: boolean
          zara_enabled_at: string | null
          zara_enabled_by: string | null
          zara_state: string | null
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
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          email_secondary?: string | null
          engagement_score?: number
          engagement_score_at?: string | null
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
          last_visit_at?: string | null
          lead_currency?: string | null
          lead_score?: number | null
          lead_tier?: string | null
          lead_type?: string | null
          lead_types?: string[]
          lead_value?: number | null
          lofty_id?: string | null
          lofty_synced_at?: string | null
          lofty_updated_at?: string | null
          looking_to_buy_in?: string[] | null
          marketing_consent?: boolean | null
          metadata?: Json
          next_followup_date?: string | null
          notes?: string | null
          phone?: string | null
          phone_normalized?: string | null
          phone_secondary?: string | null
          pipeline_segment_id?: string | null
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
          visit_count?: number
          won_at?: string | null
          zara_enabled?: boolean
          zara_enabled_at?: string | null
          zara_enabled_by?: string | null
          zara_state?: string | null
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
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          email_secondary?: string | null
          engagement_score?: number
          engagement_score_at?: string | null
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
          last_visit_at?: string | null
          lead_currency?: string | null
          lead_score?: number | null
          lead_tier?: string | null
          lead_type?: string | null
          lead_types?: string[]
          lead_value?: number | null
          lofty_id?: string | null
          lofty_synced_at?: string | null
          lofty_updated_at?: string | null
          looking_to_buy_in?: string[] | null
          marketing_consent?: boolean | null
          metadata?: Json
          next_followup_date?: string | null
          notes?: string | null
          phone?: string | null
          phone_normalized?: string | null
          phone_secondary?: string | null
          pipeline_segment_id?: string | null
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
          visit_count?: number
          won_at?: string | null
          zara_enabled?: boolean
          zara_enabled_at?: string | null
          zara_enabled_by?: string | null
          zara_state?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_contacts_pipeline_segment_id_fkey"
            columns: ["pipeline_segment_id"]
            isOneToOne: false
            referencedRelation: "crm_lead_segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contacts_zara_enabled_by_fkey"
            columns: ["zara_enabled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      crm_conversations: {
        Row: {
          assigned_agent: string | null
          channel: string
          contact_id: string
          created_at: string | null
          first_reply_at: string | null
          id: string
          is_archived: boolean
          is_campaign: boolean
          is_starred: boolean
          last_message_at: string | null
          snoozed_until: string | null
          started_by_campaign_id: string | null
          status: string | null
          unread_count: number | null
        }
        Insert: {
          assigned_agent?: string | null
          channel: string
          contact_id: string
          created_at?: string | null
          first_reply_at?: string | null
          id?: string
          is_archived?: boolean
          is_campaign?: boolean
          is_starred?: boolean
          last_message_at?: string | null
          snoozed_until?: string | null
          started_by_campaign_id?: string | null
          status?: string | null
          unread_count?: number | null
        }
        Update: {
          assigned_agent?: string | null
          channel?: string
          contact_id?: string
          created_at?: string | null
          first_reply_at?: string | null
          id?: string
          is_archived?: boolean
          is_campaign?: boolean
          is_starred?: boolean
          last_message_at?: string | null
          snoozed_until?: string | null
          started_by_campaign_id?: string | null
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
      crm_email_log: {
        Row: {
          bcc: string | null
          body: string | null
          bot_open_count: number
          campaign_id: string | null
          cc: string | null
          click_count: number
          clicked_at: string | null
          contact_id: string
          created_at: string
          direction: string
          error_message: string | null
          failed_at: string | null
          first_human_opened_at: string | null
          gmail_message_id: string | null
          gmail_thread_id: string | null
          human_open_count: number
          id: string
          in_reply_to: string | null
          last_clicked_at: string | null
          last_opened_at: string | null
          message_id_header: string | null
          open_count: number
          opened_at: string | null
          sent_at: string
          status: string
          subject: string
          thread_id: string | null
          tracking_id: string | null
          user_id: string
        }
        Insert: {
          bcc?: string | null
          body?: string | null
          bot_open_count?: number
          campaign_id?: string | null
          cc?: string | null
          click_count?: number
          clicked_at?: string | null
          contact_id: string
          created_at?: string
          direction?: string
          error_message?: string | null
          failed_at?: string | null
          first_human_opened_at?: string | null
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          human_open_count?: number
          id?: string
          in_reply_to?: string | null
          last_clicked_at?: string | null
          last_opened_at?: string | null
          message_id_header?: string | null
          open_count?: number
          opened_at?: string | null
          sent_at?: string
          status?: string
          subject: string
          thread_id?: string | null
          tracking_id?: string | null
          user_id: string
        }
        Update: {
          bcc?: string | null
          body?: string | null
          bot_open_count?: number
          campaign_id?: string | null
          cc?: string | null
          click_count?: number
          clicked_at?: string | null
          contact_id?: string
          created_at?: string
          direction?: string
          error_message?: string | null
          failed_at?: string | null
          first_human_opened_at?: string | null
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          human_open_count?: number
          id?: string
          in_reply_to?: string | null
          last_clicked_at?: string | null
          last_opened_at?: string | null
          message_id_header?: string | null
          open_count?: number
          opened_at?: string | null
          sent_at?: string
          status?: string
          subject?: string
          thread_id?: string | null
          tracking_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_email_log_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "crm_email_campaigns"
            referencedColumns: ["id"]
          },
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
          attempt_count: number
          bcc: string | null
          body_html: string
          cc: string | null
          contact_id: string | null
          created_at: string
          created_by: string
          error_message: string | null
          id: string
          last_attempt_at: string | null
          max_attempts: number
          needs_review: boolean
          review_reason: string | null
          send_at: string
          sent_at: string | null
          status: string
          subject: string
          template_id: string | null
          to_emails: string[]
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          bcc?: string | null
          body_html: string
          cc?: string | null
          contact_id?: string | null
          created_at?: string
          created_by: string
          error_message?: string | null
          id?: string
          last_attempt_at?: string | null
          max_attempts?: number
          needs_review?: boolean
          review_reason?: string | null
          send_at: string
          sent_at?: string | null
          status?: string
          subject: string
          template_id?: string | null
          to_emails: string[]
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          bcc?: string | null
          body_html?: string
          cc?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string
          error_message?: string | null
          id?: string
          last_attempt_at?: string | null
          max_attempts?: number
          needs_review?: boolean
          review_reason?: string | null
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
          bot_open_count: number
          campaign_id: string | null
          click_count: number
          clicked_at: string | null
          clicked_url: string | null
          contact_id: string | null
          created_at: string
          email_to: string
          error_message: string | null
          first_human_opened_at: string | null
          human_open_count: number
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
          bot_open_count?: number
          campaign_id?: string | null
          click_count?: number
          clicked_at?: string | null
          clicked_url?: string | null
          contact_id?: string | null
          created_at?: string
          email_to: string
          error_message?: string | null
          first_human_opened_at?: string | null
          human_open_count?: number
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
          bot_open_count?: number
          campaign_id?: string | null
          click_count?: number
          clicked_at?: string | null
          clicked_url?: string | null
          contact_id?: string | null
          created_at?: string
          email_to?: string
          error_message?: string | null
          first_human_opened_at?: string | null
          human_open_count?: number
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
          kind: string
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
          kind?: string
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
          kind?: string
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
          created_by_agent_slug: string | null
          external_id: string | null
          id: string
          is_active: boolean
          is_favorite: boolean
          is_featured: boolean
          is_locked: boolean
          last_synced_at: string | null
          last_used_at: string | null
          merge_tags: string[] | null
          name: string
          owner_agent_slug: string | null
          owner_scope: string
          preview_text: string | null
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
          created_by_agent_slug?: string | null
          external_id?: string | null
          id?: string
          is_active?: boolean
          is_favorite?: boolean
          is_featured?: boolean
          is_locked?: boolean
          last_synced_at?: string | null
          last_used_at?: string | null
          merge_tags?: string[] | null
          name: string
          owner_agent_slug?: string | null
          owner_scope?: string
          preview_text?: string | null
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
          created_by_agent_slug?: string | null
          external_id?: string | null
          id?: string
          is_active?: boolean
          is_favorite?: boolean
          is_featured?: boolean
          is_locked?: boolean
          last_synced_at?: string | null
          last_used_at?: string | null
          merge_tags?: string[] | null
          name?: string
          owner_agent_slug?: string | null
          owner_scope?: string
          preview_text?: string | null
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
          campaign_id: string | null
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
          campaign_id?: string | null
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
          campaign_id?: string | null
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
            foreignKeyName: "crm_email_threads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "crm_email_campaigns"
            referencedColumns: ["id"]
          },
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
      crm_engagement_events: {
        Row: {
          actor_id: string | null
          campaign_id: string | null
          contact_id: string
          created_at: string
          direction: string | null
          event_type: string
          id: string
          metadata: Json
          occurred_at: string
          source: string
          thread_id: string | null
        }
        Insert: {
          actor_id?: string | null
          campaign_id?: string | null
          contact_id: string
          created_at?: string
          direction?: string | null
          event_type: string
          id?: string
          metadata?: Json
          occurred_at?: string
          source: string
          thread_id?: string | null
        }
        Update: {
          actor_id?: string | null
          campaign_id?: string | null
          contact_id?: string
          created_at?: string
          direction?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          occurred_at?: string
          source?: string
          thread_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_engagement_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "crm_engagement_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
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
      crm_inbound_events: {
        Row: {
          contact_id: string | null
          error: string | null
          event_type: string
          idempotency_key: string
          occurred_at: string | null
          payload: Json
          processed_at: string | null
          received_at: string
          signature: string | null
          signature_valid: boolean | null
          status: string
        }
        Insert: {
          contact_id?: string | null
          error?: string | null
          event_type: string
          idempotency_key: string
          occurred_at?: string | null
          payload: Json
          processed_at?: string | null
          received_at?: string
          signature?: string | null
          signature_valid?: boolean | null
          status?: string
        }
        Update: {
          contact_id?: string | null
          error?: string | null
          event_type?: string
          idempotency_key?: string
          occurred_at?: string | null
          payload?: Json
          processed_at?: string | null
          received_at?: string
          signature?: string | null
          signature_valid?: boolean | null
          status?: string
        }
        Relationships: []
      }
      crm_inbox_views: {
        Row: {
          channel: string
          created_at: string
          filters: Json
          id: string
          name: string
          pinned: boolean
          query: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          channel?: string
          created_at?: string
          filters?: Json
          id?: string
          name: string
          pinned?: boolean
          query?: string
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          filters?: Json
          id?: string
          name?: string
          pinned?: boolean
          query?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      crm_internal_config: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
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
      crm_merged_contacts: {
        Row: {
          field_choices: Json
          id: string
          loser_id: string
          loser_snapshot: Json
          merged_at: string
          merged_by: string | null
          winner_id: string
        }
        Insert: {
          field_choices?: Json
          id?: string
          loser_id: string
          loser_snapshot: Json
          merged_at?: string
          merged_by?: string | null
          winner_id: string
        }
        Update: {
          field_choices?: Json
          id?: string
          loser_id?: string
          loser_snapshot?: Json
          merged_at?: string
          merged_by?: string | null
          winner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_merged_contacts_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
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
      crm_notification_dedupe: {
        Row: {
          dedupe_key: string
          expires_at: string
          user_id: string
        }
        Insert: {
          dedupe_key: string
          expires_at: string
          user_id: string
        }
        Update: {
          dedupe_key?: string
          expires_at?: string
          user_id?: string
        }
        Relationships: []
      }
      crm_notifications: {
        Row: {
          body: string | null
          created_at: string | null
          dedupe_key: string | null
          id: string
          is_read: boolean | null
          link_to: string | null
          meta: Json
          severity: string
          title: string
          type: string | null
          user_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          dedupe_key?: string | null
          id?: string
          is_read?: boolean | null
          link_to?: string | null
          meta?: Json
          severity?: string
          title: string
          type?: string | null
          user_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string | null
          dedupe_key?: string | null
          id?: string
          is_read?: boolean | null
          link_to?: string | null
          meta?: Json
          severity?: string
          title?: string
          type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      crm_outbound_webhooks: {
        Row: {
          attempts: number
          created_at: string
          event_type: string
          id: string
          idempotency_key: string | null
          last_attempt_at: string | null
          last_error: string | null
          last_status_code: number | null
          max_attempts: number
          next_attempt_at: string
          payload: Json
          status: string
          target_url: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          event_type: string
          id?: string
          idempotency_key?: string | null
          last_attempt_at?: string | null
          last_error?: string | null
          last_status_code?: number | null
          max_attempts?: number
          next_attempt_at?: string
          payload: Json
          status?: string
          target_url: string
        }
        Update: {
          attempts?: number
          created_at?: string
          event_type?: string
          id?: string
          idempotency_key?: string | null
          last_attempt_at?: string | null
          last_error?: string | null
          last_status_code?: number | null
          max_attempts?: number
          next_attempt_at?: string
          payload?: Json
          status?: string
          target_url?: string
        }
        Relationships: []
      }
      crm_presale_sync_audit: {
        Row: {
          action: string
          actor: string | null
          created_at: string
          field: string
          id: number
          mode: string | null
          new_value: string | null
          old_value: string | null
          project_id: string | null
          run_id: string
          slug: string
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string
          field: string
          id?: number
          mode?: string | null
          new_value?: string | null
          old_value?: string | null
          project_id?: string | null
          run_id: string
          slug: string
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string
          field?: string
          id?: number
          mode?: string | null
          new_value?: string | null
          old_value?: string | null
          project_id?: string | null
          run_id?: string
          slug?: string
        }
        Relationships: []
      }
      crm_project_floorplans: {
        Row: {
          bathrooms: number | null
          bedrooms: number | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          price_from: number | null
          project_slug: string
          sort_order: number
          sqft: number | null
          storage_path: string
          updated_at: string
        }
        Insert: {
          bathrooms?: number | null
          bedrooms?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          price_from?: number | null
          project_slug: string
          sort_order?: number
          sqft?: number | null
          storage_path: string
          updated_at?: string
        }
        Update: {
          bathrooms?: number | null
          bedrooms?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          price_from?: number | null
          project_slug?: string
          sort_order?: number
          sqft?: number | null
          storage_path?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_projects: {
        Row: {
          aliases: string[] | null
          assignment_rules: string | null
          bedrooms_offered: number[] | null
          brochure_filename: string | null
          brochure_url: string | null
          city: string | null
          color: string | null
          completion_date: string | null
          created_at: string
          deep_dive_embedding: string | null
          deep_dive_updated_at: string | null
          developer: string | null
          floor_plans_filename: string | null
          floor_plans_url: string | null
          hero_image_url: string | null
          id: string
          incentives: Json
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
          assignment_rules?: string | null
          bedrooms_offered?: number[] | null
          brochure_filename?: string | null
          brochure_url?: string | null
          city?: string | null
          color?: string | null
          completion_date?: string | null
          created_at?: string
          deep_dive_embedding?: string | null
          deep_dive_updated_at?: string | null
          developer?: string | null
          floor_plans_filename?: string | null
          floor_plans_url?: string | null
          hero_image_url?: string | null
          id?: string
          incentives?: Json
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
          assignment_rules?: string | null
          bedrooms_offered?: number[] | null
          brochure_filename?: string | null
          brochure_url?: string | null
          city?: string | null
          color?: string | null
          completion_date?: string | null
          created_at?: string
          deep_dive_embedding?: string | null
          deep_dive_updated_at?: string | null
          developer?: string | null
          floor_plans_filename?: string | null
          floor_plans_url?: string | null
          hero_image_url?: string | null
          id?: string
          incentives?: Json
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
          deleted_at: string | null
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
          deleted_at?: string | null
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
          deleted_at?: string | null
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
          attempt_count: number
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
          last_attempt_at: string | null
          max_attempts: number
          media_urls: string[]
          message_type: string
          num_segments: number | null
          price: number | null
          price_unit: string | null
          scheduled_for: string | null
          sent_at: string
          status: string
          template_id: string | null
          to_number: string
          twilio_message_sid: string | null
          user_id: string | null
        }
        Insert: {
          attempt_count?: number
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
          last_attempt_at?: string | null
          max_attempts?: number
          media_urls?: string[]
          message_type?: string
          num_segments?: number | null
          price?: number | null
          price_unit?: string | null
          scheduled_for?: string | null
          sent_at?: string
          status?: string
          template_id?: string | null
          to_number: string
          twilio_message_sid?: string | null
          user_id?: string | null
        }
        Update: {
          attempt_count?: number
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
          last_attempt_at?: string | null
          max_attempts?: number
          media_urls?: string[]
          message_type?: string
          num_segments?: number | null
          price?: number | null
          price_unit?: string | null
          scheduled_for?: string | null
          sent_at?: string
          status?: string
          template_id?: string | null
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
          created_by_agent_slug: string | null
          default_media_urls: string[]
          id: string
          is_active: boolean
          is_favorite_legacy: boolean
          is_featured: boolean
          is_locked: boolean
          last_used_at: string | null
          merge_tags: string[]
          name: string
          owner_agent_slug: string | null
          owner_scope: string
          times_used: number
          updated_at: string
        }
        Insert: {
          body: string
          category?: string
          channel?: string
          created_at?: string
          created_by?: string | null
          created_by_agent_slug?: string | null
          default_media_urls?: string[]
          id?: string
          is_active?: boolean
          is_favorite_legacy?: boolean
          is_featured?: boolean
          is_locked?: boolean
          last_used_at?: string | null
          merge_tags?: string[]
          name: string
          owner_agent_slug?: string | null
          owner_scope?: string
          times_used?: number
          updated_at?: string
        }
        Update: {
          body?: string
          category?: string
          channel?: string
          created_at?: string
          created_by?: string | null
          created_by_agent_slug?: string | null
          default_media_urls?: string[]
          id?: string
          is_active?: boolean
          is_favorite_legacy?: boolean
          is_featured?: boolean
          is_locked?: boolean
          last_used_at?: string | null
          merge_tags?: string[]
          name?: string
          owner_agent_slug?: string | null
          owner_scope?: string
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
      crm_sync_state: {
        Row: {
          last_cursor: string | null
          last_run_at: string | null
          payload: Json | null
          sync_key: string
          updated_at: string
        }
        Insert: {
          last_cursor?: string | null
          last_run_at?: string | null
          payload?: Json | null
          sync_key: string
          updated_at?: string
        }
        Update: {
          last_cursor?: string | null
          last_run_at?: string | null
          payload?: Json | null
          sync_key?: string
          updated_at?: string
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
          ack_token: string | null
          assigned_to: string | null
          claimed_at: string | null
          claimed_by: string | null
          contact_id: string | null
          created_at: string | null
          description: string | null
          due_date: string | null
          id: string
          lead_external_id: string | null
          presale_task_id: string | null
          priority: string | null
          status: string | null
          task_type: string | null
          title: string
        }
        Insert: {
          ack_token?: string | null
          assigned_to?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          contact_id?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          lead_external_id?: string | null
          presale_task_id?: string | null
          priority?: string | null
          status?: string | null
          task_type?: string | null
          title: string
        }
        Update: {
          ack_token?: string | null
          assigned_to?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          contact_id?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          lead_external_id?: string | null
          presale_task_id?: string | null
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
          is_ai: boolean
          license_no: string | null
          name_aliases: string[]
          permissions: Json
          phone: string | null
          presale_email: string | null
          presale_snapshot: Json | null
          presale_synced_at: string | null
          quiet_hours_end: number | null
          quiet_hours_start: number | null
          quiet_hours_tz: string
          role: string
          scheduler_onboarded_at: string | null
          sender_signature_html: string | null
          slug: string | null
          timezone: string | null
          title: string | null
          updated_at: string
          user_id: string | null
          zara_autonomy_override: number | null
          zara_quiet_hours: Json | null
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
          is_ai?: boolean
          license_no?: string | null
          name_aliases?: string[]
          permissions?: Json
          phone?: string | null
          presale_email?: string | null
          presale_snapshot?: Json | null
          presale_synced_at?: string | null
          quiet_hours_end?: number | null
          quiet_hours_start?: number | null
          quiet_hours_tz?: string
          role?: string
          scheduler_onboarded_at?: string | null
          sender_signature_html?: string | null
          slug?: string | null
          timezone?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string | null
          zara_autonomy_override?: number | null
          zara_quiet_hours?: Json | null
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
          is_ai?: boolean
          license_no?: string | null
          name_aliases?: string[]
          permissions?: Json
          phone?: string | null
          presale_email?: string | null
          presale_snapshot?: Json | null
          presale_synced_at?: string | null
          quiet_hours_end?: number | null
          quiet_hours_start?: number | null
          quiet_hours_tz?: string
          role?: string
          scheduler_onboarded_at?: string | null
          sender_signature_html?: string | null
          slug?: string | null
          timezone?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string | null
          zara_autonomy_override?: number | null
          zara_quiet_hours?: Json | null
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
      crm_team_settings: {
        Row: {
          created_at: string
          data_safety_checklist: Json
          id: string
          singleton: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          data_safety_checklist?: Json
          id?: string
          singleton?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          data_safety_checklist?: Json
          id?: string
          singleton?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      crm_template_favorites: {
        Row: {
          created_at: string
          template_id: string
          template_kind: string
          user_id: string
        }
        Insert: {
          created_at?: string
          template_id: string
          template_kind: string
          user_id: string
        }
        Update: {
          created_at?: string
          template_id?: string
          template_kind?: string
          user_id?: string
        }
        Relationships: []
      }
      crm_template_folder_items: {
        Row: {
          added_at: string
          added_by: string | null
          folder_id: string
          template_id: string
          template_kind: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          folder_id: string
          template_id: string
          template_kind: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          folder_id?: string
          template_id?: string
          template_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_template_folder_items_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "crm_template_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_template_folders: {
        Row: {
          channel: string
          color: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          channel?: string
          color?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          channel?: string
          color?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      crm_template_sync_log: {
        Row: {
          actor_id: string | null
          bridge_endpoint: string | null
          created_at: string
          direction: string
          error: string | null
          id: string
          payload_summary: Json | null
          status: string
          template_id: string | null
        }
        Insert: {
          actor_id?: string | null
          bridge_endpoint?: string | null
          created_at?: string
          direction: string
          error?: string | null
          id?: string
          payload_summary?: Json | null
          status: string
          template_id?: string | null
        }
        Update: {
          actor_id?: string | null
          bridge_endpoint?: string | null
          created_at?: string
          direction?: string
          error?: string | null
          id?: string
          payload_summary?: Json | null
          status?: string
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_template_sync_log_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "crm_email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_template_tag_items: {
        Row: {
          added_at: string
          added_by: string | null
          tag_id: string
          template_id: string
          template_kind: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          tag_id: string
          template_id: string
          template_kind: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          tag_id?: string
          template_id?: string
          template_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_template_tag_items_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "crm_template_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_template_tags: {
        Row: {
          color: string | null
          created_at: string
          created_by: string | null
          id: string
          label: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
        }
        Relationships: []
      }
      crm_template_versions: {
        Row: {
          body: string | null
          category: string | null
          changed_by: string | null
          changed_by_email: string | null
          created_at: string
          id: string
          kind: string
          name: string | null
          preview_text: string | null
          subject: string | null
          template_id: string
          version: number
        }
        Insert: {
          body?: string | null
          category?: string | null
          changed_by?: string | null
          changed_by_email?: string | null
          created_at?: string
          id?: string
          kind: string
          name?: string | null
          preview_text?: string | null
          subject?: string | null
          template_id: string
          version: number
        }
        Update: {
          body?: string | null
          category?: string | null
          changed_by?: string | null
          changed_by_email?: string | null
          created_at?: string
          id?: string
          kind?: string
          name?: string | null
          preview_text?: string | null
          subject?: string | null
          template_id?: string
          version?: number
        }
        Relationships: []
      }
      crm_thread_drafts: {
        Row: {
          body: string
          channel: string
          contact_id: string
          created_at: string
          id: string
          media: Json
          quote: string | null
          scheduled_for: string | null
          subject: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string
          channel: string
          contact_id: string
          created_at?: string
          id?: string
          media?: Json
          quote?: string | null
          scheduled_for?: string | null
          subject?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          channel?: string
          contact_id?: string
          created_at?: string
          id?: string
          media?: Json
          quote?: string | null
          scheduled_for?: string | null
          subject?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      crm_timeline_pins: {
        Row: {
          contact_id: string
          event_id: string
          event_kind: string
          id: string
          pinned_at: string
          pinned_by: string
        }
        Insert: {
          contact_id: string
          event_id: string
          event_kind: string
          id?: string
          pinned_at?: string
          pinned_by: string
        }
        Update: {
          contact_id?: string
          event_id?: string
          event_kind?: string
          id?: string
          pinned_at?: string
          pinned_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_timeline_pins_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_voicemail_drops: {
        Row: {
          audio_path: string
          audio_url: string
          created_at: string
          duration_sec: number | null
          id: string
          is_active: boolean
          name: string
          owner_agent_slug: string | null
          owner_scope: string
          owner_user_id: string | null
          updated_at: string
        }
        Insert: {
          audio_path: string
          audio_url: string
          created_at?: string
          duration_sec?: number | null
          id?: string
          is_active?: boolean
          name: string
          owner_agent_slug?: string | null
          owner_scope?: string
          owner_user_id?: string | null
          updated_at?: string
        }
        Update: {
          audio_path?: string
          audio_url?: string
          created_at?: string
          duration_sec?: number | null
          id?: string
          is_active?: boolean
          name?: string
          owner_agent_slug?: string | null
          owner_scope?: string
          owner_user_id?: string | null
          updated_at?: string
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
      crm_zara_drafts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          body: string
          channel: string
          confidence: number | null
          contact_id: string
          created_at: string
          draft_metadata: Json
          id: string
          is_training_example: boolean
          original_body: string | null
          original_subject: string | null
          reasoning: string | null
          reject_reason: string | null
          scheduled_for: string
          send_meta: Json | null
          sent_at: string | null
          source_event: Json | null
          status: string
          subject: string | null
          trigger_kind: string
          updated_at: string
          urgency: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          body: string
          channel: string
          confidence?: number | null
          contact_id: string
          created_at?: string
          draft_metadata?: Json
          id?: string
          is_training_example?: boolean
          original_body?: string | null
          original_subject?: string | null
          reasoning?: string | null
          reject_reason?: string | null
          scheduled_for?: string
          send_meta?: Json | null
          sent_at?: string | null
          source_event?: Json | null
          status?: string
          subject?: string | null
          trigger_kind: string
          updated_at?: string
          urgency?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          body?: string
          channel?: string
          confidence?: number | null
          contact_id?: string
          created_at?: string
          draft_metadata?: Json
          id?: string
          is_training_example?: boolean
          original_body?: string | null
          original_subject?: string | null
          reasoning?: string | null
          reject_reason?: string | null
          scheduled_for?: string
          send_meta?: Json | null
          sent_at?: string | null
          source_event?: Json | null
          status?: string
          subject?: string | null
          trigger_kind?: string
          updated_at?: string
          urgency?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_zara_drafts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_zara_insights: {
        Row: {
          created_at: string
          id: string
          insight_text: string
          is_dismissed: boolean
          period_end: string
          period_start: string
          severity: string
          suggested_action: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          insight_text: string
          is_dismissed?: boolean
          period_end: string
          period_start: string
          severity?: string
          suggested_action?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          insight_text?: string
          is_dismissed?: boolean
          period_end?: string
          period_start?: string
          severity?: string
          suggested_action?: string | null
        }
        Relationships: []
      }
      crm_zara_knowledge_gaps: {
        Row: {
          contact_id: string | null
          created_at: string
          draft_id: string | null
          gap_type: string
          id: string
          missing_value: string
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          draft_id?: string | null
          gap_type: string
          id?: string
          missing_value: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          draft_id?: string | null
          gap_type?: string
          id?: string
          missing_value?: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_zara_knowledge_gaps_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_zara_knowledge_gaps_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "crm_zara_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_zara_model_calls: {
        Row: {
          contact_id: string | null
          cost_usd: number
          created_at: string
          error: string | null
          function_called: string
          id: string
          input_tokens: number
          latency_ms: number | null
          model: string
          output_tokens: number
          success: boolean
        }
        Insert: {
          contact_id?: string | null
          cost_usd?: number
          created_at?: string
          error?: string | null
          function_called: string
          id?: string
          input_tokens?: number
          latency_ms?: number | null
          model: string
          output_tokens?: number
          success?: boolean
        }
        Update: {
          contact_id?: string | null
          cost_usd?: number
          created_at?: string
          error?: string | null
          function_called?: string
          id?: string
          input_tokens?: number
          latency_ms?: number | null
          model?: string
          output_tokens?: number
          success?: boolean
        }
        Relationships: []
      }
      crm_zara_outbound_audit: {
        Row: {
          channel: string | null
          confidence: number | null
          contact_id: string | null
          created_at: string
          decision: string
          decision_reason: string | null
          draft_id: string | null
          id: string
          meta: Json
          model: string | null
          provider_message_id: string | null
          rule_evaluation: Json
          subject: string | null
          template_key: string | null
          trigger_kind: string | null
          updated_at: string
        }
        Insert: {
          channel?: string | null
          confidence?: number | null
          contact_id?: string | null
          created_at?: string
          decision: string
          decision_reason?: string | null
          draft_id?: string | null
          id?: string
          meta?: Json
          model?: string | null
          provider_message_id?: string | null
          rule_evaluation?: Json
          subject?: string | null
          template_key?: string | null
          trigger_kind?: string | null
          updated_at?: string
        }
        Update: {
          channel?: string | null
          confidence?: number | null
          contact_id?: string | null
          created_at?: string
          decision?: string
          decision_reason?: string | null
          draft_id?: string | null
          id?: string
          meta?: Json
          model?: string | null
          provider_message_id?: string | null
          rule_evaluation?: Json
          subject?: string | null
          template_key?: string | null
          trigger_kind?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_zara_outbound_audit_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_zara_playbooks: {
        Row: {
          behavior_sequence: Json
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          priority: number
          times_triggered: number
          trigger_conditions: Json
          updated_at: string
        }
        Insert: {
          behavior_sequence?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          priority?: number
          times_triggered?: number
          trigger_conditions?: Json
          updated_at?: string
        }
        Update: {
          behavior_sequence?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          priority?: number
          times_triggered?: number
          trigger_conditions?: Json
          updated_at?: string
        }
        Relationships: []
      }
      crm_zara_settings: {
        Row: {
          auto_pause_on_cost: boolean
          auto_showcase_count: number
          auto_showcase_triggers: string[]
          autonomous_outbound: boolean
          cold_nudge_days: number
          created_at: string
          daily_cost_cap_usd: number
          daily_send_cap_per_lead: number
          enabled: boolean
          id: number
          max_drafts_per_lead_per_week: number
          max_workspace_pending: number
          model_classify: string
          model_draft: string
          outbound_planner_enabled: boolean
          quiet_hours_end: string
          quiet_hours_start: string
          system_prompt_version: string
          timezone: string
          weekly_send_cap_per_lead: number
          workspace_daily_cap: number
        }
        Insert: {
          auto_pause_on_cost?: boolean
          auto_showcase_count?: number
          auto_showcase_triggers?: string[]
          autonomous_outbound?: boolean
          cold_nudge_days?: number
          created_at?: string
          daily_cost_cap_usd?: number
          daily_send_cap_per_lead?: number
          enabled?: boolean
          id?: number
          max_drafts_per_lead_per_week?: number
          max_workspace_pending?: number
          model_classify?: string
          model_draft?: string
          outbound_planner_enabled?: boolean
          quiet_hours_end?: string
          quiet_hours_start?: string
          system_prompt_version?: string
          timezone?: string
          weekly_send_cap_per_lead?: number
          workspace_daily_cap?: number
        }
        Update: {
          auto_pause_on_cost?: boolean
          auto_showcase_count?: number
          auto_showcase_triggers?: string[]
          autonomous_outbound?: boolean
          cold_nudge_days?: number
          created_at?: string
          daily_cost_cap_usd?: number
          daily_send_cap_per_lead?: number
          enabled?: boolean
          id?: number
          max_drafts_per_lead_per_week?: number
          max_workspace_pending?: number
          model_classify?: string
          model_draft?: string
          outbound_planner_enabled?: boolean
          quiet_hours_end?: string
          quiet_hours_start?: string
          system_prompt_version?: string
          timezone?: string
          weekly_send_cap_per_lead?: number
          workspace_daily_cap?: number
        }
        Relationships: []
      }
      crm_zara_trigger_map: {
        Row: {
          ab_subjects: string[]
          created_at: string
          description: string | null
          fallback_template_slug: string | null
          is_active: boolean
          preferred_hour_end: number | null
          preferred_hour_start: number | null
          preferred_template_slug: string | null
          preferred_tz: string
          trigger_kind: string
          updated_at: string
        }
        Insert: {
          ab_subjects?: string[]
          created_at?: string
          description?: string | null
          fallback_template_slug?: string | null
          is_active?: boolean
          preferred_hour_end?: number | null
          preferred_hour_start?: number | null
          preferred_template_slug?: string | null
          preferred_tz?: string
          trigger_kind: string
          updated_at?: string
        }
        Update: {
          ab_subjects?: string[]
          created_at?: string
          description?: string | null
          fallback_template_slug?: string | null
          is_active?: boolean
          preferred_hour_end?: number | null
          preferred_hour_start?: number | null
          preferred_template_slug?: string | null
          preferred_tz?: string
          trigger_kind?: string
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
      market_intel: {
        Row: {
          area: string
          building_type: string | null
          created_at: string
          id: string
          metric: string
          notes: string | null
          source: string
          value: number
          week_starting: string
        }
        Insert: {
          area: string
          building_type?: string | null
          created_at?: string
          id?: string
          metric: string
          notes?: string | null
          source: string
          value: number
          week_starting: string
        }
        Update: {
          area?: string
          building_type?: string | null
          created_at?: string
          id?: string
          metric?: string
          notes?: string | null
          source?: string
          value?: number
          week_starting?: string
        }
        Relationships: []
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
          manual_override: boolean
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
          manual_override?: boolean
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
          manual_override?: boolean
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
      presale_projects: {
        Row: {
          assignment_rules: string | null
          brochure_url: string | null
          building_type: string | null
          city: string | null
          common_objections: string[] | null
          completion_quarter: string | null
          completion_year: number | null
          created_at: string
          deep_dive_embedding: string | null
          deep_dive_updated_at: string | null
          deposit_structure: string | null
          description: string | null
          developer: string | null
          hero_image_url: string | null
          honest_caveats: string | null
          id: string
          incentives: Json
          key_features: Json
          last_synced_at: string | null
          last_synced_source: string | null
          marketing_url: string | null
          mortgage_broker_note: string | null
          name: string
          neighborhood: string | null
          price_range_high: number | null
          price_range_low: number | null
          slug: string
          starting_psf: number | null
          status: string
          unit_count: number | null
          unit_types: string[] | null
          uzair_pitch: string | null
          vip_access: boolean
          who_this_doesnt_fit: string | null
          who_this_fits: string | null
        }
        Insert: {
          assignment_rules?: string | null
          brochure_url?: string | null
          building_type?: string | null
          city?: string | null
          common_objections?: string[] | null
          completion_quarter?: string | null
          completion_year?: number | null
          created_at?: string
          deep_dive_embedding?: string | null
          deep_dive_updated_at?: string | null
          deposit_structure?: string | null
          description?: string | null
          developer?: string | null
          hero_image_url?: string | null
          honest_caveats?: string | null
          id?: string
          incentives?: Json
          key_features?: Json
          last_synced_at?: string | null
          last_synced_source?: string | null
          marketing_url?: string | null
          mortgage_broker_note?: string | null
          name: string
          neighborhood?: string | null
          price_range_high?: number | null
          price_range_low?: number | null
          slug: string
          starting_psf?: number | null
          status?: string
          unit_count?: number | null
          unit_types?: string[] | null
          uzair_pitch?: string | null
          vip_access?: boolean
          who_this_doesnt_fit?: string | null
          who_this_fits?: string | null
        }
        Update: {
          assignment_rules?: string | null
          brochure_url?: string | null
          building_type?: string | null
          city?: string | null
          common_objections?: string[] | null
          completion_quarter?: string | null
          completion_year?: number | null
          created_at?: string
          deep_dive_embedding?: string | null
          deep_dive_updated_at?: string | null
          deposit_structure?: string | null
          description?: string | null
          developer?: string | null
          hero_image_url?: string | null
          honest_caveats?: string | null
          id?: string
          incentives?: Json
          key_features?: Json
          last_synced_at?: string | null
          last_synced_source?: string | null
          marketing_url?: string | null
          mortgage_broker_note?: string | null
          name?: string
          neighborhood?: string | null
          price_range_high?: number | null
          price_range_low?: number | null
          slug?: string
          starting_psf?: number | null
          status?: string
          unit_count?: number | null
          unit_types?: string[] | null
          uzair_pitch?: string | null
          vip_access?: boolean
          who_this_doesnt_fit?: string | null
          who_this_fits?: string | null
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
      sms_outbound_queue: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          body: string
          campaign_id: string | null
          contact_id: string | null
          created_at: string
          from_number: string | null
          id: string
          media_urls: string[]
          metadata: Json
          reason: string | null
          rejection_reason: string | null
          requested_by: string
          scheduled_for: string | null
          status: string
          template_id: string | null
          to_number: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          body: string
          campaign_id?: string | null
          contact_id?: string | null
          created_at?: string
          from_number?: string | null
          id?: string
          media_urls?: string[]
          metadata?: Json
          reason?: string | null
          rejection_reason?: string | null
          requested_by?: string
          scheduled_for?: string | null
          status?: string
          template_id?: string | null
          to_number: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          body?: string
          campaign_id?: string | null
          contact_id?: string | null
          created_at?: string
          from_number?: string | null
          id?: string
          media_urls?: string[]
          metadata?: Json
          reason?: string | null
          rejection_reason?: string | null
          requested_by?: string
          scheduled_for?: string | null
          status?: string
          template_id?: string | null
          to_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_outbound_queue_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
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
      system_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
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
      zara_actions_log: {
        Row: {
          action: string
          contact_id: string | null
          conversation_id: string | null
          id: string
          occurred_at: string
          payload: Json | null
          result_summary: string | null
          tool_name: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          contact_id?: string | null
          conversation_id?: string | null
          id?: string
          occurred_at?: string
          payload?: Json | null
          result_summary?: string | null
          tool_name?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          contact_id?: string | null
          conversation_id?: string | null
          id?: string
          occurred_at?: string
          payload?: Json | null
          result_summary?: string | null
          tool_name?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "zara_actions_log_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "zara_conversations"
            referencedColumns: ["id"]
          },
        ]
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
      zara_approval_decisions: {
        Row: {
          contact_id: string
          decided_at: string
          decided_by: string | null
          decided_via: string
          decision: string
          draft_id: string
          edit_distance: number | null
          final_text: string | null
          id: string
          original_text: string
          reject_reason: string | null
        }
        Insert: {
          contact_id: string
          decided_at?: string
          decided_by?: string | null
          decided_via: string
          decision: string
          draft_id: string
          edit_distance?: number | null
          final_text?: string | null
          id?: string
          original_text: string
          reject_reason?: string | null
        }
        Update: {
          contact_id?: string
          decided_at?: string
          decided_by?: string | null
          decided_via?: string
          decision?: string
          draft_id?: string
          edit_distance?: number | null
          final_text?: string | null
          id?: string
          original_text?: string
          reject_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "zara_approval_decisions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zara_approval_decisions_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "zara_approval_decisions_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "zara_suggested_replies"
            referencedColumns: ["id"]
          },
        ]
      }
      zara_bad_responses: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          reason: string | null
          response_text: string
          scenario_kind: string | null
          source_message_id: string | null
          tags: string[]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          reason?: string | null
          response_text: string
          scenario_kind?: string | null
          source_message_id?: string | null
          tags?: string[]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          reason?: string | null
          response_text?: string
          scenario_kind?: string | null
          source_message_id?: string | null
          tags?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "zara_bad_responses_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "zara_training_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      zara_chat_messages: {
        Row: {
          agent_user_id: string
          created_at: string
          id: string
          parts: Json
          pinned_contact_id: string | null
          role: string
        }
        Insert: {
          agent_user_id: string
          created_at?: string
          id?: string
          parts: Json
          pinned_contact_id?: string | null
          role: string
        }
        Update: {
          agent_user_id?: string
          created_at?: string
          id?: string
          parts?: Json
          pinned_contact_id?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "zara_chat_messages_pinned_contact_id_fkey"
            columns: ["pinned_contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      zara_conversations: {
        Row: {
          archived: boolean
          created_at: string
          id: string
          last_message_at: string | null
          last_message_snippet: string | null
          pinned: boolean
          presale_contact_id: string | null
          presale_user_id: string | null
          source: string
          title: string
          title_regenerated_at_turn: number
          user_id: string | null
        }
        Insert: {
          archived?: boolean
          created_at?: string
          id?: string
          last_message_at?: string | null
          last_message_snippet?: string | null
          pinned?: boolean
          presale_contact_id?: string | null
          presale_user_id?: string | null
          source?: string
          title?: string
          title_regenerated_at_turn?: number
          user_id?: string | null
        }
        Update: {
          archived?: boolean
          created_at?: string
          id?: string
          last_message_at?: string | null
          last_message_snippet?: string | null
          pinned?: boolean
          presale_contact_id?: string | null
          presale_user_id?: string | null
          source?: string
          title?: string
          title_regenerated_at_turn?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "zara_conversations_presale_contact_id_fkey"
            columns: ["presale_contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      zara_cta_preferences: {
        Row: {
          context: string | null
          created_at: string
          cta_text: string
          evidence_count: number
          id: string
          last_seen_at: string
          source_diff_ids: string[] | null
          stance: string
        }
        Insert: {
          context?: string | null
          created_at?: string
          cta_text: string
          evidence_count?: number
          id?: string
          last_seen_at?: string
          source_diff_ids?: string[] | null
          stance?: string
        }
        Update: {
          context?: string | null
          created_at?: string
          cta_text?: string
          evidence_count?: number
          id?: string
          last_seen_at?: string
          source_diff_ids?: string[] | null
          stance?: string
        }
        Relationships: []
      }
      zara_embed_queue: {
        Row: {
          attempts: number
          created_at: string
          embed_text: string
          enqueued_by: string | null
          id: string
          kind: string
          last_error: string | null
          max_attempts: number
          next_attempt_at: string
          status: string
          target_id: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          embed_text: string
          enqueued_by?: string | null
          id?: string
          kind: string
          last_error?: string | null
          max_attempts?: number
          next_attempt_at?: string
          status?: string
          target_id: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          embed_text?: string
          enqueued_by?: string | null
          id?: string
          kind?: string
          last_error?: string | null
          max_attempts?: number
          next_attempt_at?: string
          status?: string
          target_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      zara_escalation_rules: {
        Row: {
          action: string
          active: boolean
          condition_text: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          trigger_kind: string
        }
        Insert: {
          action: string
          active?: boolean
          condition_text: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          trigger_kind: string
        }
        Update: {
          action?: string
          active?: boolean
          condition_text?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          trigger_kind?: string
        }
        Relationships: []
      }
      zara_founder_conversations: {
        Row: {
          analysis: Json | null
          analyzed_at: string | null
          channel: string
          created_at: string
          created_by: string | null
          emotional_state: string | null
          id: string
          lead_persona: string | null
          notes: string | null
          outcome: string | null
          tags: string[]
          title: string
          transcript: string
        }
        Insert: {
          analysis?: Json | null
          analyzed_at?: string | null
          channel: string
          created_at?: string
          created_by?: string | null
          emotional_state?: string | null
          id?: string
          lead_persona?: string | null
          notes?: string | null
          outcome?: string | null
          tags?: string[]
          title: string
          transcript: string
        }
        Update: {
          analysis?: Json | null
          analyzed_at?: string | null
          channel?: string
          created_at?: string
          created_by?: string | null
          emotional_state?: string | null
          id?: string
          lead_persona?: string | null
          notes?: string | null
          outcome?: string | null
          tags?: string[]
          title?: string
          transcript?: string
        }
        Relationships: []
      }
      zara_founder_lessons: {
        Row: {
          created_at: string
          created_by: string | null
          detail: string | null
          id: string
          module_id: string | null
          promoted_principle_id: string | null
          source_id: string | null
          source_kind: string
          summary: string
          tags: string[]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          detail?: string | null
          id?: string
          module_id?: string | null
          promoted_principle_id?: string | null
          source_id?: string | null
          source_kind: string
          summary: string
          tags?: string[]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          detail?: string | null
          id?: string
          module_id?: string | null
          promoted_principle_id?: string | null
          source_id?: string | null
          source_kind?: string
          summary?: string
          tags?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "zara_founder_lessons_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "zara_founder_modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zara_founder_lessons_promoted_principle_id_fkey"
            columns: ["promoted_principle_id"]
            isOneToOne: false
            referencedRelation: "zara_founder_principles"
            referencedColumns: ["id"]
          },
        ]
      }
      zara_founder_modules: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      zara_founder_principles: {
        Row: {
          active: boolean
          body: string
          created_at: string
          created_by: string | null
          examples: string[]
          id: string
          module_id: string
          source_id: string | null
          source_kind: string | null
          tags: string[]
          title: string
          updated_at: string
          weight: number
        }
        Insert: {
          active?: boolean
          body: string
          created_at?: string
          created_by?: string | null
          examples?: string[]
          id?: string
          module_id: string
          source_id?: string | null
          source_kind?: string | null
          tags?: string[]
          title: string
          updated_at?: string
          weight?: number
        }
        Update: {
          active?: boolean
          body?: string
          created_at?: string
          created_by?: string | null
          examples?: string[]
          id?: string
          module_id?: string
          source_id?: string | null
          source_kind?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "zara_founder_principles_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "zara_founder_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      zara_founder_teach_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          meta: Json
          role: string
          session_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          meta?: Json
          role: string
          session_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          meta?: Json
          role?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "zara_founder_teach_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "zara_founder_teach_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      zara_founder_teach_sessions: {
        Row: {
          created_at: string
          focus_module_id: string | null
          id: string
          last_message_at: string
          message_count: number
          owner_user_id: string
          title: string
        }
        Insert: {
          created_at?: string
          focus_module_id?: string | null
          id?: string
          last_message_at?: string
          message_count?: number
          owner_user_id: string
          title: string
        }
        Update: {
          created_at?: string
          focus_module_id?: string | null
          id?: string
          last_message_at?: string
          message_count?: number
          owner_user_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "zara_founder_teach_sessions_focus_module_id_fkey"
            columns: ["focus_module_id"]
            isOneToOne: false
            referencedRelation: "zara_founder_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      zara_handoff_briefs: {
        Row: {
          brief: Json
          contact_id: string
          created_at: string
          from_agent_user_id: string | null
          id: string
          read_at: string | null
          summary: string | null
          to_agent_user_id: string | null
        }
        Insert: {
          brief?: Json
          contact_id: string
          created_at?: string
          from_agent_user_id?: string | null
          id?: string
          read_at?: string | null
          summary?: string | null
          to_agent_user_id?: string | null
        }
        Update: {
          brief?: Json
          contact_id?: string
          created_at?: string
          from_agent_user_id?: string | null
          id?: string
          read_at?: string | null
          summary?: string | null
          to_agent_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "zara_handoff_briefs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      zara_knowledge_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          document_id: string
          embedding: string | null
          id: string
          metadata: Json
          token_count: number | null
        }
        Insert: {
          chunk_index: number
          content: string
          created_at?: string
          document_id: string
          embedding?: string | null
          id?: string
          metadata?: Json
          token_count?: number | null
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          document_id?: string
          embedding?: string | null
          id?: string
          metadata?: Json
          token_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "zara_knowledge_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "zara_knowledge_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      zara_knowledge_documents: {
        Row: {
          crawl_etag: string | null
          error_message: string | null
          file_name: string | null
          file_size_bytes: number | null
          id: string
          indexed_at: string | null
          last_crawled_at: string | null
          last_retrieved_at: string | null
          raw_content: string
          retrieval_count: number
          source: string | null
          source_type: string
          source_url: string | null
          status: string
          tags: string[]
          title: string
          total_chunks: number
          total_tokens: number | null
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          crawl_etag?: string | null
          error_message?: string | null
          file_name?: string | null
          file_size_bytes?: number | null
          id?: string
          indexed_at?: string | null
          last_crawled_at?: string | null
          last_retrieved_at?: string | null
          raw_content: string
          retrieval_count?: number
          source?: string | null
          source_type: string
          source_url?: string | null
          status?: string
          tags?: string[]
          title: string
          total_chunks?: number
          total_tokens?: number | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          crawl_etag?: string | null
          error_message?: string | null
          file_name?: string | null
          file_size_bytes?: number | null
          id?: string
          indexed_at?: string | null
          last_crawled_at?: string | null
          last_retrieved_at?: string | null
          raw_content?: string
          retrieval_count?: number
          source?: string | null
          source_type?: string
          source_url?: string | null
          status?: string
          tags?: string[]
          title?: string
          total_chunks?: number
          total_tokens?: number | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "zara_knowledge_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      zara_lead_memory: {
        Row: {
          contact_id: string
          continuity_openers: string[] | null
          continuity_refreshed_at: string | null
          facts: Json
          last_rolled_at: string | null
          last_topics: string[] | null
          refresh_reason: string | null
          refreshed_at: string
          relationship_stage: string | null
          signals: Json
          summary: string
          turn_count: number
          version: number
        }
        Insert: {
          contact_id: string
          continuity_openers?: string[] | null
          continuity_refreshed_at?: string | null
          facts?: Json
          last_rolled_at?: string | null
          last_topics?: string[] | null
          refresh_reason?: string | null
          refreshed_at?: string
          relationship_stage?: string | null
          signals?: Json
          summary: string
          turn_count?: number
          version?: number
        }
        Update: {
          contact_id?: string
          continuity_openers?: string[] | null
          continuity_refreshed_at?: string | null
          facts?: Json
          last_rolled_at?: string | null
          last_topics?: string[] | null
          refresh_reason?: string | null
          refreshed_at?: string
          relationship_stage?: string | null
          signals?: Json
          summary?: string
          turn_count?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "zara_lead_memory_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: true
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      zara_lookup_misses: {
        Row: {
          contact_id: string | null
          created_at: string
          details: Json | null
          draft_id: string | null
          id: string
          project_slug: string | null
          resolved_at: string | null
          surface: string | null
          topic: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          details?: Json | null
          draft_id?: string | null
          id?: string
          project_slug?: string | null
          resolved_at?: string | null
          surface?: string | null
          topic: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          details?: Json | null
          draft_id?: string | null
          id?: string
          project_slug?: string | null
          resolved_at?: string | null
          surface?: string | null
          topic?: string
        }
        Relationships: [
          {
            foreignKeyName: "zara_lookup_misses_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      zara_messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          id: string
          input_tokens: number | null
          metadata: Json
          model: string | null
          output_tokens: number | null
          page_context: Json | null
          role: string
          tool_call_id: string | null
          tool_calls: Json | null
          tool_name: string | null
          tool_result: Json | null
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          input_tokens?: number | null
          metadata?: Json
          model?: string | null
          output_tokens?: number | null
          page_context?: Json | null
          role: string
          tool_call_id?: string | null
          tool_calls?: Json | null
          tool_name?: string | null
          tool_result?: Json | null
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          input_tokens?: number | null
          metadata?: Json
          model?: string | null
          output_tokens?: number | null
          page_context?: Json | null
          role?: string
          tool_call_id?: string | null
          tool_calls?: Json | null
          tool_name?: string | null
          tool_result?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "zara_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "zara_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      zara_objection_patterns: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          escalate_to_uzair: boolean
          id: string
          objection_kind: string
          suggested_reframe: string
          trigger_text: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          escalate_to_uzair?: boolean
          id?: string
          objection_kind: string
          suggested_reframe: string
          trigger_text: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          escalate_to_uzair?: boolean
          id?: string
          objection_kind?: string
          suggested_reframe?: string
          trigger_text?: string
        }
        Relationships: []
      }
      zara_org_context: {
        Row: {
          custom_instructions: string | null
          id: number
          updated_at: string
        }
        Insert: {
          custom_instructions?: string | null
          id?: number
          updated_at?: string
        }
        Update: {
          custom_instructions?: string | null
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      zara_pending_tool_calls: {
        Row: {
          conversation_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          expires_at: string
          id: string
          message_id: string | null
          requested_by: string
          result: Json | null
          status: string
          tool_input: Json
          tool_name: string
          tool_use_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          expires_at?: string
          id?: string
          message_id?: string | null
          requested_by: string
          result?: Json | null
          status?: string
          tool_input?: Json
          tool_name: string
          tool_use_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          expires_at?: string
          id?: string
          message_id?: string | null
          requested_by?: string
          result?: Json | null
          status?: string
          tool_input?: Json
          tool_name?: string
          tool_use_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "zara_pending_tool_calls_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "zara_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zara_pending_tool_calls_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "zara_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      zara_proactive_nudges: {
        Row: {
          agent_user_id: string | null
          body: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          dedupe_key: string
          id: string
          kind: string
          payload: Json
          resolved_at: string | null
          scheduled_for: string | null
          title: string
        }
        Insert: {
          agent_user_id?: string | null
          body?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          dedupe_key: string
          id?: string
          kind: string
          payload?: Json
          resolved_at?: string | null
          scheduled_for?: string | null
          title: string
        }
        Update: {
          agent_user_id?: string | null
          body?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          dedupe_key?: string
          id?: string
          kind?: string
          payload?: Json
          resolved_at?: string | null
          scheduled_for?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "zara_proactive_nudges_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      zara_prompt_evolution: {
        Row: {
          applied_at: string | null
          applied_by: string | null
          created_at: string
          example_feedback_ids: string[] | null
          id: string
          pattern: string
          status: string
          suggestion: string
        }
        Insert: {
          applied_at?: string | null
          applied_by?: string | null
          created_at?: string
          example_feedback_ids?: string[] | null
          id?: string
          pattern: string
          status?: string
          suggestion: string
        }
        Update: {
          applied_at?: string | null
          applied_by?: string | null
          created_at?: string
          example_feedback_ids?: string[] | null
          id?: string
          pattern?: string
          status?: string
          suggestion?: string
        }
        Relationships: []
      }
      zara_prompt_updates: {
        Row: {
          applied_to_addendum_id: string | null
          created_at: string
          created_by: string | null
          evidence: Json
          id: string
          kind: string
          proposal: string
          rationale: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_message_id: string | null
          source_session_id: string | null
          status: string
        }
        Insert: {
          applied_to_addendum_id?: string | null
          created_at?: string
          created_by?: string | null
          evidence?: Json
          id?: string
          kind: string
          proposal: string
          rationale?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_message_id?: string | null
          source_session_id?: string | null
          status?: string
        }
        Update: {
          applied_to_addendum_id?: string | null
          created_at?: string
          created_by?: string | null
          evidence?: Json
          id?: string
          kind?: string
          proposal?: string
          rationale?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_message_id?: string | null
          source_session_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "zara_prompt_updates_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "zara_training_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zara_prompt_updates_source_session_id_fkey"
            columns: ["source_session_id"]
            isOneToOne: false
            referencedRelation: "zara_training_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      zara_public_rate_limits: {
        Row: {
          message_count: number
          presale_user_id: string
          send_count: number
          updated_at: string
          window_start: string
        }
        Insert: {
          message_count?: number
          presale_user_id: string
          send_count?: number
          updated_at?: string
          window_start?: string
        }
        Update: {
          message_count?: number
          presale_user_id?: string
          send_count?: number
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      zara_research_cache: {
        Row: {
          created_at: string
          query_hash: string
          query_text: string
          result: Json
        }
        Insert: {
          created_at?: string
          query_hash: string
          query_text: string
          result: Json
        }
        Update: {
          created_at?: string
          query_hash?: string
          query_text?: string
          result?: Json
        }
        Relationships: []
      }
      zara_rewrite_diffs: {
        Row: {
          analysis: Json | null
          channel: string | null
          contact_id: string | null
          created_at: string
          draft_id: string | null
          edit_distance: number | null
          feedback_labels: string[] | null
          final_body: string | null
          final_subject: string | null
          id: string
          notes: string | null
          original_body: string | null
          original_subject: string | null
          reviewed_by: string | null
          trigger_kind: string | null
          was_approved: boolean | null
        }
        Insert: {
          analysis?: Json | null
          channel?: string | null
          contact_id?: string | null
          created_at?: string
          draft_id?: string | null
          edit_distance?: number | null
          feedback_labels?: string[] | null
          final_body?: string | null
          final_subject?: string | null
          id?: string
          notes?: string | null
          original_body?: string | null
          original_subject?: string | null
          reviewed_by?: string | null
          trigger_kind?: string | null
          was_approved?: boolean | null
        }
        Update: {
          analysis?: Json | null
          channel?: string | null
          contact_id?: string | null
          created_at?: string
          draft_id?: string | null
          edit_distance?: number | null
          feedback_labels?: string[] | null
          final_body?: string | null
          final_subject?: string | null
          id?: string
          notes?: string | null
          original_body?: string | null
          original_subject?: string | null
          reviewed_by?: string | null
          trigger_kind?: string | null
          was_approved?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "zara_rewrite_diffs_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "crm_zara_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      zara_rewrite_patterns: {
        Row: {
          after_phrase: string
          before_phrase: string
          context: string | null
          created_at: string
          evidence_count: number
          id: string
          last_seen_at: string
          source_diff_ids: string[] | null
        }
        Insert: {
          after_phrase: string
          before_phrase: string
          context?: string | null
          created_at?: string
          evidence_count?: number
          id?: string
          last_seen_at?: string
          source_diff_ids?: string[] | null
        }
        Update: {
          after_phrase?: string
          before_phrase?: string
          context?: string | null
          created_at?: string
          evidence_count?: number
          id?: string
          last_seen_at?: string
          source_diff_ids?: string[] | null
        }
        Relationships: []
      }
      zara_settings: {
        Row: {
          autonomy_level: number
          email_append_signature: boolean
          email_fallback_template_id: string | null
          email_use_template_scaffold: boolean
          enabled_at: string | null
          enabled_by: string | null
          id: number
          kill_switch: boolean
          kill_switch_at: string | null
          kill_switch_by: string | null
          kill_switch_reason: string | null
          mode: string
          never_quote: Json
          standup_hour_local: number
          test_phone_numbers: string[]
          updated_at: string
          voice_enabled: boolean
        }
        Insert: {
          autonomy_level?: number
          email_append_signature?: boolean
          email_fallback_template_id?: string | null
          email_use_template_scaffold?: boolean
          enabled_at?: string | null
          enabled_by?: string | null
          id?: number
          kill_switch?: boolean
          kill_switch_at?: string | null
          kill_switch_by?: string | null
          kill_switch_reason?: string | null
          mode?: string
          never_quote?: Json
          standup_hour_local?: number
          test_phone_numbers?: string[]
          updated_at?: string
          voice_enabled?: boolean
        }
        Update: {
          autonomy_level?: number
          email_append_signature?: boolean
          email_fallback_template_id?: string | null
          email_use_template_scaffold?: boolean
          enabled_at?: string | null
          enabled_by?: string | null
          id?: number
          kill_switch?: boolean
          kill_switch_at?: string | null
          kill_switch_by?: string | null
          kill_switch_reason?: string | null
          mode?: string
          never_quote?: Json
          standup_hour_local?: number
          test_phone_numbers?: string[]
          updated_at?: string
          voice_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "zara_settings_email_fallback_template_id_fkey"
            columns: ["email_fallback_template_id"]
            isOneToOne: false
            referencedRelation: "crm_email_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zara_settings_enabled_by_fkey"
            columns: ["enabled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      zara_style_memory: {
        Row: {
          category: string
          created_at: string
          evidence_count: number
          id: string
          last_seen_at: string
          observation: string
          source_diff_ids: string[] | null
          weight: number
        }
        Insert: {
          category: string
          created_at?: string
          evidence_count?: number
          id?: string
          last_seen_at?: string
          observation: string
          source_diff_ids?: string[] | null
          weight?: number
        }
        Update: {
          category?: string
          created_at?: string
          evidence_count?: number
          id?: string
          last_seen_at?: string
          observation?: string
          source_diff_ids?: string[] | null
          weight?: number
        }
        Relationships: []
      }
      zara_style_rules: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          id: string
          kind: string
          rationale: string | null
          rule: string
          source_message_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          rationale?: string | null
          rule: string
          source_message_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          rationale?: string | null
          rule?: string
          source_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "zara_style_rules_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "zara_training_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      zara_suggested_replies: {
        Row: {
          approval_method: string | null
          approved_at: string | null
          approved_by: string | null
          assigned_to: string | null
          channel: string
          citations: Json
          confidence: number | null
          consulted_sources: Json
          contact_id: string
          created_at: string
          draft_html: string | null
          draft_language: string | null
          draft_subject: string | null
          draft_text: string
          edit_distance: number | null
          edited_text: string | null
          escalate: boolean | null
          escalate_reason: string | null
          escalation_model: string | null
          expires_at: string
          guardrails_hit: string[]
          id: string
          inbound_at: string
          inbound_event_id: string | null
          inbound_text: string
          input_tokens: number | null
          intent: string | null
          latency_ms: number | null
          model: string
          output_tokens: number | null
          reasoning: string | null
          sent_at: string | null
          status: string
          template_id_used: string | null
        }
        Insert: {
          approval_method?: string | null
          approved_at?: string | null
          approved_by?: string | null
          assigned_to?: string | null
          channel: string
          citations?: Json
          confidence?: number | null
          consulted_sources?: Json
          contact_id: string
          created_at?: string
          draft_html?: string | null
          draft_language?: string | null
          draft_subject?: string | null
          draft_text: string
          edit_distance?: number | null
          edited_text?: string | null
          escalate?: boolean | null
          escalate_reason?: string | null
          escalation_model?: string | null
          expires_at?: string
          guardrails_hit?: string[]
          id?: string
          inbound_at: string
          inbound_event_id?: string | null
          inbound_text: string
          input_tokens?: number | null
          intent?: string | null
          latency_ms?: number | null
          model?: string
          output_tokens?: number | null
          reasoning?: string | null
          sent_at?: string | null
          status?: string
          template_id_used?: string | null
        }
        Update: {
          approval_method?: string | null
          approved_at?: string | null
          approved_by?: string | null
          assigned_to?: string | null
          channel?: string
          citations?: Json
          confidence?: number | null
          consulted_sources?: Json
          contact_id?: string
          created_at?: string
          draft_html?: string | null
          draft_language?: string | null
          draft_subject?: string | null
          draft_text?: string
          edit_distance?: number | null
          edited_text?: string | null
          escalate?: boolean | null
          escalate_reason?: string | null
          escalation_model?: string | null
          expires_at?: string
          guardrails_hit?: string[]
          id?: string
          inbound_at?: string
          inbound_event_id?: string | null
          inbound_text?: string
          input_tokens?: number | null
          intent?: string | null
          latency_ms?: number | null
          model?: string
          output_tokens?: number | null
          reasoning?: string | null
          sent_at?: string | null
          status?: string
          template_id_used?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "zara_suggested_replies_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "zara_suggested_replies_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "zara_suggested_replies_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zara_suggested_replies_inbound_event_id_fkey"
            columns: ["inbound_event_id"]
            isOneToOne: false
            referencedRelation: "crm_engagement_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zara_suggested_replies_template_id_used_fkey"
            columns: ["template_id_used"]
            isOneToOne: false
            referencedRelation: "crm_email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      zara_system_prompt_addenda: {
        Row: {
          active: boolean
          addendum: string
          created_at: string
          id: string
          source_evolution_id: string | null
        }
        Insert: {
          active?: boolean
          addendum: string
          created_at?: string
          id?: string
          source_evolution_id?: string | null
        }
        Update: {
          active?: boolean
          addendum?: string
          created_at?: string
          id?: string
          source_evolution_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "zara_system_prompt_addenda_source_evolution_id_fkey"
            columns: ["source_evolution_id"]
            isOneToOne: false
            referencedRelation: "zara_prompt_evolution"
            referencedColumns: ["id"]
          },
        ]
      }
      zara_system_prompts: {
        Row: {
          change_summary: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          model: string
          name: string
          prompt_text: string
          surface: string
          version: string
        }
        Insert: {
          change_summary?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          model?: string
          name?: string
          prompt_text: string
          surface?: string
          version: string
        }
        Update: {
          change_summary?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          model?: string
          name?: string
          prompt_text?: string
          surface?: string
          version?: string
        }
        Relationships: []
      }
      zara_tone_preferences: {
        Row: {
          created_at: string
          dimension: string
          evidence_count: number
          id: string
          last_seen_at: string
          rule: string
          source_diff_ids: string[] | null
          weight: number
        }
        Insert: {
          created_at?: string
          dimension: string
          evidence_count?: number
          id?: string
          last_seen_at?: string
          rule: string
          source_diff_ids?: string[] | null
          weight?: number
        }
        Update: {
          created_at?: string
          dimension?: string
          evidence_count?: number
          id?: string
          last_seen_at?: string
          rule?: string
          source_diff_ids?: string[] | null
          weight?: number
        }
        Relationships: []
      }
      zara_training_feedback: {
        Row: {
          applied_to_prompt: boolean
          contact_id: string | null
          created_at: string
          created_by: string | null
          decision: string
          draft_id: string | null
          id: string
          message_id: string | null
          notes: string | null
        }
        Insert: {
          applied_to_prompt?: boolean
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          decision: string
          draft_id?: string | null
          id?: string
          message_id?: string | null
          notes?: string | null
        }
        Update: {
          applied_to_prompt?: boolean
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          decision?: string
          draft_id?: string | null
          id?: string
          message_id?: string | null
          notes?: string | null
        }
        Relationships: []
      }
      zara_training_messages: {
        Row: {
          ask_uzair: boolean
          content: string
          created_at: string
          feedback_kind: string | null
          feedback_note: string | null
          id: string
          meta: Json
          role: string
          scenario_kind: string | null
          session_id: string
        }
        Insert: {
          ask_uzair?: boolean
          content: string
          created_at?: string
          feedback_kind?: string | null
          feedback_note?: string | null
          id?: string
          meta?: Json
          role: string
          scenario_kind?: string | null
          session_id: string
        }
        Update: {
          ask_uzair?: boolean
          content?: string
          created_at?: string
          feedback_kind?: string | null
          feedback_note?: string | null
          id?: string
          meta?: Json
          role?: string
          scenario_kind?: string | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "zara_training_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "zara_training_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      zara_training_sessions: {
        Row: {
          contact_id: string | null
          created_at: string
          id: string
          last_message_at: string
          message_count: number
          owner_user_id: string
          scenario_kind: string | null
          title: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          id?: string
          last_message_at?: string
          message_count?: number
          owner_user_id: string
          scenario_kind?: string | null
          title?: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          id?: string
          last_message_at?: string
          message_count?: number
          owner_user_id?: string
          scenario_kind?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "zara_training_sessions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      zara_whatsapp_message_map: {
        Row: {
          agent_id: string
          created_at: string
          draft_id: string
          whatsapp_message_id: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          draft_id: string
          whatsapp_message_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          draft_id?: string
          whatsapp_message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "zara_whatsapp_message_map_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "zara_whatsapp_message_map_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "zara_suggested_replies"
            referencedColumns: ["id"]
          },
        ]
      }
      zara_winning_conversations: {
        Row: {
          budget_range: string | null
          close_date: string | null
          created_at: string
          created_by: string | null
          embedding: string | null
          full_thread: string
          id: string
          initial_situation: string
          lead_profile: string
          outcome: string
          primary_language: string | null
          project_type: string | null
          source_contact_id: string | null
          tags: string[]
          turning_message: string
          why_it_worked: string
        }
        Insert: {
          budget_range?: string | null
          close_date?: string | null
          created_at?: string
          created_by?: string | null
          embedding?: string | null
          full_thread: string
          id?: string
          initial_situation: string
          lead_profile: string
          outcome: string
          primary_language?: string | null
          project_type?: string | null
          source_contact_id?: string | null
          tags?: string[]
          turning_message: string
          why_it_worked: string
        }
        Update: {
          budget_range?: string | null
          close_date?: string | null
          created_at?: string
          created_by?: string | null
          embedding?: string | null
          full_thread?: string
          id?: string
          initial_situation?: string
          lead_profile?: string
          outcome?: string
          primary_language?: string | null
          project_type?: string | null
          source_contact_id?: string | null
          tags?: string[]
          turning_message?: string
          why_it_worked?: string
        }
        Relationships: [
          {
            foreignKeyName: "zara_winning_conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "zara_winning_conversations_source_contact_id_fkey"
            columns: ["source_contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      zara_winning_responses: {
        Row: {
          channel: string | null
          created_at: string
          created_by: string | null
          id: string
          lead_situation: string
          response_text: string
          scenario_kind: string | null
          source_message_id: string | null
          tags: string[]
          why_it_works: string | null
        }
        Insert: {
          channel?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lead_situation: string
          response_text: string
          scenario_kind?: string | null
          source_message_id?: string | null
          tags?: string[]
          why_it_works?: string | null
        }
        Update: {
          channel?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lead_situation?: string
          response_text?: string
          scenario_kind?: string | null
          source_message_id?: string | null
          tags?: string[]
          why_it_works?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "zara_winning_responses_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "zara_training_messages"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      crm_contact_last_touch: {
        Row: {
          contact_id: string | null
          engagement_signal_count: number | null
          last_event_at: string | null
          last_inbound_at: string | null
          last_outbound_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_engagement_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_potential_duplicates: {
        Row: {
          contact_ids: string[] | null
          dup_count: number | null
          match_key: string | null
          match_type: string | null
        }
        Relationships: []
      }
      crm_template_stats: {
        Row: {
          last_sent_at: string | null
          sparkline_30d: Json | null
          template_id: string | null
          template_kind: string | null
          total_clicks: number | null
          total_opens: number | null
          total_replies: number | null
          total_sends: number | null
        }
        Relationships: []
      }
      zara_metrics_by_intent: {
        Row: {
          avg_confidence: number | null
          avg_edit_distance: number | null
          drafts: number | null
          intent: string | null
          sent: number | null
          sent_unedited: number | null
          unedited_pct: number | null
        }
        Relationships: []
      }
      zara_metrics_daily: {
        Row: {
          avg_confidence: number | null
          avg_edit_distance: number | null
          avg_latency_ms: number | null
          day: string | null
          drafts: number | null
          escalated: number | null
          flagged_for_human: number | null
          intent: string | null
          sent: number | null
          sent_unedited: number | null
        }
        Relationships: []
      }
      zara_tool_conversion_30d: {
        Row: {
          conversion_pct: number | null
          leads_converted: number | null
          leads_touched: number | null
          tool_name: string | null
        }
        Relationships: []
      }
      zara_tool_daily_30d: {
        Row: {
          calls: number | null
          day: string | null
          tool_name: string | null
        }
        Relationships: []
      }
      zara_tool_usage_30d: {
        Row: {
          calls: number | null
          failure_pct: number | null
          failures: number | null
          last_used_at: string | null
          leads_touched: number | null
          tool_name: string | null
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
      backfill_behavior_notes_for_contact: {
        Args: { _contact_id: string }
        Returns: number
      }
      bulk_reformat_crm_notes: { Args: never; Returns: Json }
      bulk_update_contacts_silent: {
        Args: { p_contact_ids: string[]; p_updates: Json }
        Returns: number
      }
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
      crm_add_tags_to_contacts: {
        Args: { _contact_ids: string[]; _tags: string[] }
        Returns: number
      }
      crm_attach_alternate: {
        Args: {
          _contact_id: string
          _email?: string
          _phone?: string
          _source?: string
        }
        Returns: undefined
      }
      crm_audit_actor_email: { Args: { _uid: string }; Returns: string }
      crm_audit_actor_label: { Args: { _uid: string }; Returns: string }
      crm_backfill_orphan_activity: {
        Args: { _contact_id: string }
        Returns: number
      }
      crm_behavior_overview: { Args: { _days?: number }; Returns: Json }
      crm_bulk_delete_contacts: {
        Args: { p_contact_ids: string[] }
        Returns: Json
      }
      crm_can_see_contact: {
        Args: { _assigned_to: string; _user_id: string }
        Returns: boolean
      }
      crm_can_see_contact_id: {
        Args: { _contact_id: string; _user_id: string }
        Returns: boolean
      }
      crm_claim_task: {
        Args: { _ack_token?: string; _task_id: string }
        Returns: {
          ack_token: string | null
          assigned_to: string | null
          claimed_at: string | null
          claimed_by: string | null
          contact_id: string | null
          created_at: string | null
          description: string | null
          due_date: string | null
          id: string
          lead_external_id: string | null
          presale_task_id: string | null
          priority: string | null
          status: string | null
          task_type: string | null
          title: string
        }
        SetofOptions: {
          from: "*"
          to: "crm_tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      crm_compute_engagement_score: {
        Args: { _contact_id: string }
        Returns: number
      }
      crm_contact_matches_pipeline_filter: {
        Args: {
          _contact: Database["public"]["Tables"]["crm_contacts"]["Row"]
          _filter: Json
        }
        Returns: boolean
      }
      crm_count_delete_scope: {
        Args: { p_contact_ids?: string[] }
        Returns: Json
      }
      crm_cta_label: {
        Args: { button_key: string; url: string }
        Returns: string
      }
      crm_delete_contact: { Args: { p_contact_id: string }; Returns: boolean }
      crm_distinct_sources: {
        Args: never
        Returns: {
          source: string
          usage_count: number
        }[]
      }
      crm_find_existing_conversation: {
        Args: { _channel: string; _contact_id: string }
        Returns: string
      }
      crm_find_my_duplicates: {
        Args: { _email?: string; _limit?: number; _phone?: string }
        Returns: {
          assigned_to: string
          email: string
          first_name: string
          id: string
          last_name: string
          phone: string
          status: string
        }[]
      }
      crm_funnel_snapshot: { Args: never; Returns: Json }
      crm_get_or_create_conversation: {
        Args: { _channel: string; _contact_id: string; _message_at?: string }
        Returns: string
      }
      crm_hard_delete_contacts: { Args: { _ids: string[] }; Returns: number }
      crm_has_perm: {
        Args: { _perm: string; _user_id: string }
        Returns: boolean
      }
      crm_lead_timeline_v2: {
        Args: {
          p_before?: string
          p_contact_id: string
          p_kinds?: string[]
          p_limit?: number
          p_search?: string
        }
        Returns: {
          body_excerpt: string
          direction: string
          event_id: string
          importance: number
          kind: string
          metadata: Json
          occurred_at: string
          sub_kind: string
          subtitle: string
          title: string
        }[]
      }
      crm_log_bulk_op: {
        Args: {
          _action: string
          _affected: number
          _filter?: Json
          _job_id?: string
          _meta?: Json
        }
        Returns: string
      }
      crm_match_contact_by_phone: {
        Args: { _phone: string }
        Returns: {
          assigned_to: string
          contact_id: string
        }[]
      }
      crm_merge_contacts: {
        Args: {
          p_field_choices?: Json
          p_loser_id: string
          p_winner_id: string
        }
        Returns: Json
      }
      crm_my_presale_slug: { Args: never; Returns: string }
      crm_normalize_email: { Args: { _v: string }; Returns: string }
      crm_normalize_phone: { Args: { _v: string }; Returns: string }
      crm_purge_trash: { Args: { _older_than?: string }; Returns: number }
      crm_recipients_for_contact: {
        Args: { _assigned_to: string }
        Returns: string[]
      }
      crm_record_identity: {
        Args: {
          _contact_id: string
          _is_primary?: boolean
          _kind: string
          _source?: string
          _value: string
        }
        Returns: string
      }
      crm_replay_recent_activity: {
        Args: { _contact_id: string; _hours?: number }
        Returns: number
      }
      crm_resolve_contact_identity: {
        Args: { _email?: string; _phone?: string }
        Returns: {
          contact_id: string
          matched_on: string
          matched_value: string
        }[]
      }
      crm_restore_contacts: { Args: { _ids: string[] }; Returns: number }
      crm_revert_template_version: {
        Args: { _kind: string; _template_id: string; _version: number }
        Returns: undefined
      }
      crm_scheduler_resolve_slug: {
        Args: { _event_slug: string; _team_slug: string }
        Returns: Json
      }
      crm_scheduler_seed_defaults: {
        Args: { _agent_user_id: string }
        Returns: undefined
      }
      crm_send_notification: {
        Args: {
          _body: string
          _dedupe_key?: string
          _dedupe_window_minutes?: number
          _link_to: string
          _meta?: Json
          _severity?: string
          _title: string
          _type: string
          _user_ids: string[]
        }
        Returns: number
      }
      crm_set_data_safety_check: {
        Args: { _checked: boolean; _key: string; _note?: string }
        Returns: Json
      }
      crm_soft_delete_contacts: { Args: { _ids: string[] }; Returns: number }
      crm_soft_delete_contacts_with_undo: {
        Args: { p_ids: string[] }
        Returns: number
      }
      crm_stitch_orphan_behavior: { Args: never; Returns: Json }
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
      crm_template_is_my_team_contribution: {
        Args: { _created_by_agent_slug: string }
        Returns: boolean
      }
      crm_warmup_digest_candidates: {
        Args: never
        Returns: {
          assigned_to: string
          contact_id: string
          engagement_score: number
          full_name: string
          last_activity_at: string
        }[]
      }
      crm_within_quiet_hours: { Args: { _user_id: string }; Returns: boolean }
      crm_zara_behavior_score: { Args: never; Returns: number }
      crm_zara_pending_drafts_count: { Args: never; Returns: number }
      decrypt_api_credential: {
        Args: { ciphertext: string; passphrase: string }
        Returns: string
      }
      encrypt_api_credential: {
        Args: { passphrase: string; plaintext: string }
        Returns: string
      }
      enroll_in_automation: {
        Args: {
          p_automation_id: string
          p_contact_id: string
          p_trigger_data?: Json
        }
        Returns: string
      }
      ensure_profile_for_user: {
        Args: { _full_name?: string; _user_id: string }
        Returns: undefined
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
      is_crm_admin_or_owner: { Args: { _uid: string }; Returns: boolean }
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
      normalize_phone: { Args: { p_raw: string }; Returns: string }
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
      update_deal_with_payouts: {
        Args: { p_deal_data: Json; p_deal_id: string; p_payouts?: Json }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "deals"
          isOneToOne: true
          isSetofReturn: false
        }
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
      zara_build_crm_project_deep_dive_text: {
        Args: { _project_id: string }
        Returns: string
      }
      zara_build_project_deep_dive_text: {
        Args: { _project_id: string }
        Returns: string
      }
      zara_bump_retrieval_counts: {
        Args: { doc_ids: string[] }
        Returns: undefined
      }
      zara_can_send_to: { Args: { _contact_id: string }; Returns: Json }
      zara_effective_autonomy: { Args: { _user_id: string }; Returns: number }
      zara_enqueue_project_embeddings: {
        Args: { _force?: boolean }
        Returns: number
      }
      zara_founder_retrieve: {
        Args: { _limit?: number; _module_slug?: string; _query: string }
        Returns: {
          body: string
          examples: string[]
          id: string
          module_name: string
          module_slug: string
          score: number
          tags: string[]
          title: string
          weight: number
        }[]
      }
      zara_match_knowledge_chunks: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          chunk_index: number
          content: string
          document_id: string
          id: string
          metadata: Json
          similarity: number
        }[]
      }
      zara_match_project_deep_dives: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          city: string
          common_objections: string[]
          honest_caveats: string
          id: string
          name: string
          similarity: number
          uzair_pitch: string
        }[]
      }
      zara_match_projects: {
        Args: {
          city_filter?: string
          match_count?: number
          query_embedding: string
        }
        Returns: {
          city: string
          common_objections: string[]
          completion_year: number
          developer: string
          honest_caveats: string
          id: string
          name: string
          neighborhood: string
          price_range_high: number
          price_range_low: number
          similarity: number
          slug: string
          source: string
          status: string
          uzair_pitch: string
          who_this_fits: string
        }[]
      }
      zara_match_winning_conversations: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          id: string
          initial_situation: string
          lead_profile: string
          outcome: string
          similarity: number
          turning_message: string
          why_it_worked: string
        }[]
      }
      zara_public_rate_check: {
        Args: {
          _is_send?: boolean
          _msg_limit?: number
          _presale_user_id: string
          _send_limit?: number
        }
        Returns: {
          allowed: boolean
          message_count: number
          retry_after_seconds: number
          send_count: number
        }[]
      }
      zara_recent_high_edits: {
        Args: { p_limit?: number }
        Returns: {
          channel: string
          created_at: string
          draft_text: string
          edit_distance: number
          edited_text: string
          escalation_model: string
          guardrails_hit: string[]
          id: string
          intent: string
          model: string
        }[]
      }
      zara_request_memory_rebuild: {
        Args: { _contact_id: string }
        Returns: undefined
      }
      zara_retrieve_context: {
        Args: { _contact_id: string; _query?: string; _trigger?: string }
        Returns: Json
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
