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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_events: {
        Row: {
          activity_code: string | null
          activity_date: string
          activity_name: string
          activity_type: string
          assigned_user_ids: Json
          attachment_urls: Json | null
          client_uuid: string | null
          created_at: string
          customer_id: string | null
          description: string | null
          duration_type: string | null
          end_time: string | null
          from_date: string | null
          grn_po_id: string | null
          half_day_type: string | null
          id: string
          lead_id: string | null
          location_address: string | null
          location_lat: number | null
          location_lng: number | null
          manual_distance_attachments: Json
          manual_distance_km: number | null
          manual_distance_note: string | null
          milestone_id: string | null
          next_follow_up_date: string | null
          opportunity_id: string | null
          outcome: string | null
          photo_urls: Json
          project_id: string | null
          remarks: string | null
          retailer_id: string | null
          risk: string | null
          site_id: string | null
          start_time: string | null
          status: string
          status_change_lat: number | null
          status_change_lng: number | null
          status_changed_at: string | null
          status_history: Json
          to_date: string | null
          total_days: number | null
          total_hours: number | null
          travel_distance_km: number | null
          travel_from_activity_id: string | null
          travel_from_at: string | null
          travel_from_type: string | null
          travel_time_mins: number | null
          user_id: string
          visit_id: string | null
        }
        Insert: {
          activity_code?: string | null
          activity_date?: string
          activity_name: string
          activity_type: string
          assigned_user_ids?: Json
          attachment_urls?: Json | null
          client_uuid?: string | null
          created_at?: string
          customer_id?: string | null
          description?: string | null
          duration_type?: string | null
          end_time?: string | null
          from_date?: string | null
          grn_po_id?: string | null
          half_day_type?: string | null
          id?: string
          lead_id?: string | null
          location_address?: string | null
          location_lat?: number | null
          location_lng?: number | null
          manual_distance_attachments?: Json
          manual_distance_km?: number | null
          manual_distance_note?: string | null
          milestone_id?: string | null
          next_follow_up_date?: string | null
          opportunity_id?: string | null
          outcome?: string | null
          photo_urls?: Json
          project_id?: string | null
          remarks?: string | null
          retailer_id?: string | null
          risk?: string | null
          site_id?: string | null
          start_time?: string | null
          status?: string
          status_change_lat?: number | null
          status_change_lng?: number | null
          status_changed_at?: string | null
          status_history?: Json
          to_date?: string | null
          total_days?: number | null
          total_hours?: number | null
          travel_distance_km?: number | null
          travel_from_activity_id?: string | null
          travel_from_at?: string | null
          travel_from_type?: string | null
          travel_time_mins?: number | null
          user_id: string
          visit_id?: string | null
        }
        Update: {
          activity_code?: string | null
          activity_date?: string
          activity_name?: string
          activity_type?: string
          assigned_user_ids?: Json
          attachment_urls?: Json | null
          client_uuid?: string | null
          created_at?: string
          customer_id?: string | null
          description?: string | null
          duration_type?: string | null
          end_time?: string | null
          from_date?: string | null
          grn_po_id?: string | null
          half_day_type?: string | null
          id?: string
          lead_id?: string | null
          location_address?: string | null
          location_lat?: number | null
          location_lng?: number | null
          manual_distance_attachments?: Json
          manual_distance_km?: number | null
          manual_distance_note?: string | null
          milestone_id?: string | null
          next_follow_up_date?: string | null
          opportunity_id?: string | null
          outcome?: string | null
          photo_urls?: Json
          project_id?: string | null
          remarks?: string | null
          retailer_id?: string | null
          risk?: string | null
          site_id?: string | null
          start_time?: string | null
          status?: string
          status_change_lat?: number | null
          status_change_lng?: number | null
          status_changed_at?: string | null
          status_history?: Json
          to_date?: string | null
          total_days?: number | null
          total_hours?: number | null
          travel_distance_km?: number | null
          travel_from_activity_id?: string | null
          travel_from_at?: string | null
          travel_from_type?: string | null
          travel_time_mins?: number | null
          user_id?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_grn_po_id_fkey"
            columns: ["grn_po_id"]
            isOneToOne: false
            referencedRelation: "procurement_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "site_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "customer_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_retailer_id_fkey"
            columns: ["retailer_id"]
            isOneToOne: false
            referencedRelation: "retailers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "project_sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_travel_from_activity_id_fkey"
            columns: ["travel_from_activity_id"]
            isOneToOne: false
            referencedRelation: "activity_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_sessions: {
        Row: {
          activity_id: string
          checked_in_at: string
          checked_out_at: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          activity_id: string
          checked_in_at: string
          checked_out_at?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          activity_id?: string
          checked_in_at?: string
          checked_out_at?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_sessions_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activity_events"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_types_master: {
        Row: {
          created_at: string
          created_by: string | null
          details: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          details?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          details?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      additional_expenses: {
        Row: {
          amount: number
          bill_url: string | null
          category: string
          category_id: string | null
          created_at: string
          custom_category: string | null
          description: string | null
          expense_date: string
          id: string
          month_key: string | null
          rejection_reason: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          bill_url?: string | null
          category: string
          category_id?: string | null
          created_at?: string
          custom_category?: string | null
          description?: string | null
          expense_date?: string
          id?: string
          month_key?: string | null
          rejection_reason?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          bill_url?: string | null
          category?: string
          category_id?: string | null
          created_at?: string
          custom_category?: string | null
          description?: string | null
          expense_date?: string
          id?: string
          month_key?: string | null
          rejection_reason?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "additional_expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      app_configuration: {
        Row: {
          config_key: string
          config_value: Json | null
          created_at: string
          id: string
          module: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          config_key: string
          config_value?: Json | null
          created_at?: string
          id?: string
          module: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          config_key?: string
          config_value?: Json | null
          created_at?: string
          id?: string
          module?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      attendance: {
        Row: {
          check_in_address: string | null
          check_in_location: Json | null
          check_in_photo_url: string | null
          check_in_time: string | null
          check_out_address: string | null
          check_out_location: Json | null
          check_out_photo_url: string | null
          check_out_time: string | null
          created_at: string
          date: string
          face_match_confidence: number | null
          face_match_confidence_out: number | null
          face_verification_status: string | null
          face_verification_status_out: string | null
          id: string
          notes: string | null
          regularized_request_id: string | null
          status: string
          total_distance_km: number | null
          total_hours: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          check_in_address?: string | null
          check_in_location?: Json | null
          check_in_photo_url?: string | null
          check_in_time?: string | null
          check_out_address?: string | null
          check_out_location?: Json | null
          check_out_photo_url?: string | null
          check_out_time?: string | null
          created_at?: string
          date?: string
          face_match_confidence?: number | null
          face_match_confidence_out?: number | null
          face_verification_status?: string | null
          face_verification_status_out?: string | null
          id?: string
          notes?: string | null
          regularized_request_id?: string | null
          status?: string
          total_distance_km?: number | null
          total_hours?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          check_in_address?: string | null
          check_in_location?: Json | null
          check_in_photo_url?: string | null
          check_in_time?: string | null
          check_out_address?: string | null
          check_out_location?: Json | null
          check_out_photo_url?: string | null
          check_out_time?: string | null
          created_at?: string
          date?: string
          face_match_confidence?: number | null
          face_match_confidence_out?: number | null
          face_verification_status?: string | null
          face_verification_status_out?: string | null
          id?: string
          notes?: string | null
          regularized_request_id?: string | null
          status?: string
          total_distance_km?: number | null
          total_hours?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      attendance_policy: {
        Row: {
          created_at: string
          id: string
          policy_key: string
          policy_value: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          policy_key: string
          policy_value?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          policy_key?: string
          policy_value?: Json
          updated_at?: string
        }
        Relationships: []
      }
      beat_allowances: {
        Row: {
          beat_id: string
          beat_name: string
          created_at: string
          da_amount: number | null
          id: string
          ta_amount: number | null
          updated_at: string
        }
        Insert: {
          beat_id: string
          beat_name: string
          created_at?: string
          da_amount?: number | null
          id?: string
          ta_amount?: number | null
          updated_at?: string
        }
        Update: {
          beat_id?: string
          beat_name?: string
          created_at?: string
          da_amount?: number | null
          id?: string
          ta_amount?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      beat_plans: {
        Row: {
          beat_data: Json | null
          beat_id: string | null
          beat_name: string | null
          created_at: string
          id: string
          plan_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          beat_data?: Json | null
          beat_id?: string | null
          beat_name?: string | null
          created_at?: string
          id?: string
          plan_date: string
          updated_at?: string
          user_id: string
        }
        Update: {
          beat_data?: Json | null
          beat_id?: string | null
          beat_name?: string | null
          created_at?: string
          id?: string
          plan_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      company_profile: {
        Row: {
          address: string | null
          bank_account: string | null
          bank_ifsc: string | null
          bank_name: string | null
          company_name: string
          created_at: string
          email: string | null
          gst_number: string | null
          id: string
          logo_url: string | null
          pan_number: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          bank_account?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          company_name?: string
          created_at?: string
          email?: string | null
          gst_number?: string | null
          id?: string
          logo_url?: string | null
          pan_number?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          bank_account?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          company_name?: string
          created_at?: string
          email?: string | null
          gst_number?: string | null
          id?: string
          logo_url?: string | null
          pan_number?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      customer_activities: {
        Row: {
          activity_date: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          id: string
          lead_id: string | null
          notes: string | null
          opportunity_id: string | null
          outcome: string | null
          subject: string
          type: string
          updated_at: string
        }
        Insert: {
          activity_date?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          lead_id?: string | null
          notes?: string | null
          opportunity_id?: string | null
          outcome?: string | null
          subject: string
          type?: string
          updated_at?: string
        }
        Update: {
          activity_date?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          lead_id?: string | null
          notes?: string | null
          opportunity_id?: string | null
          outcome?: string | null
          subject?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_activities_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_activities_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "customer_opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_contact_roles: {
        Row: {
          contact_id: string
          created_at: string
          customer_id: string
          id: string
          role: string
          updated_at: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          customer_id: string
          id?: string
          role: string
          updated_at?: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          customer_id?: string
          id?: string
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_contact_roles_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "customer_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_contact_roles_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_contacts: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string | null
          email: string | null
          id: string
          last_contact_at: string | null
          name: string
          phone: string | null
          reports_to_id: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          email?: string | null
          id?: string
          last_contact_at?: string | null
          name: string
          phone?: string | null
          reports_to_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          email?: string | null
          id?: string
          last_contact_at?: string | null
          name?: string
          phone?: string | null
          reports_to_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_contacts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_contacts_reports_to_id_fkey"
            columns: ["reports_to_id"]
            isOneToOne: false
            referencedRelation: "customer_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_documents: {
        Row: {
          created_at: string
          customer_id: string | null
          doc_type: string | null
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          lead_id: string | null
          opportunity_id: string | null
          updated_at: string
          updated_by: string | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          doc_type?: string | null
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          lead_id?: string | null
          opportunity_id?: string | null
          updated_at?: string
          updated_by?: string | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          doc_type?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          lead_id?: string | null
          opportunity_id?: string | null
          updated_at?: string
          updated_by?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_documents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_documents_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_documents_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "customer_opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_opportunities: {
        Row: {
          amount: number
          authority_role: string | null
          budget_status: string | null
          close_date: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          customer_id: string | null
          id: string
          name: string
          need_level: string | null
          opportunity_source_id: string | null
          owner_id: string | null
          payment_terms: string | null
          primary_contact_id: string | null
          probability: number
          requirements_highlights: string | null
          stage: string | null
          stage_changed_at: string | null
          timeline: string | null
          type: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          authority_role?: string | null
          budget_status?: string | null
          close_date?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          customer_id?: string | null
          id?: string
          name: string
          need_level?: string | null
          opportunity_source_id?: string | null
          owner_id?: string | null
          payment_terms?: string | null
          primary_contact_id?: string | null
          probability?: number
          requirements_highlights?: string | null
          stage?: string | null
          stage_changed_at?: string | null
          timeline?: string | null
          type?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          authority_role?: string | null
          budget_status?: string | null
          close_date?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          customer_id?: string | null
          id?: string
          name?: string
          need_level?: string | null
          opportunity_source_id?: string | null
          owner_id?: string | null
          payment_terms?: string | null
          primary_contact_id?: string | null
          probability?: number
          requirements_highlights?: string | null
          stage?: string | null
          stage_changed_at?: string | null
          timeline?: string | null
          type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_opportunities_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          industry: string | null
          name: string
          owner_id: string | null
          primary_contact_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          industry?: string | null
          name: string
          owner_id?: string | null
          primary_contact_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          industry?: string | null
          name?: string
          owner_id?: string | null
          primary_contact_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      employee_documents: {
        Row: {
          content_type: string | null
          created_at: string
          doc_type: Database["public"]["Enums"]["employee_doc_type"]
          file_name: string
          file_path: string
          id: string
          uploaded_by: string | null
          user_id: string
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          doc_type?: Database["public"]["Enums"]["employee_doc_type"]
          file_name: string
          file_path: string
          id?: string
          uploaded_by?: string | null
          user_id: string
        }
        Update: {
          content_type?: string | null
          created_at?: string
          doc_type?: Database["public"]["Enums"]["employee_doc_type"]
          file_name?: string
          file_path?: string
          id?: string
          uploaded_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      employees: {
        Row: {
          address: string | null
          alternate_email: string | null
          band: string | null
          created_at: string
          daily_da_allowance: number | null
          date_of_exit: string | null
          date_of_joining: string | null
          education: string | null
          emergency_contact_number: string | null
          hq: string | null
          id: string
          manager_id: string | null
          monthly_salary: number | null
          photo_url: string | null
          secondary_manager_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          alternate_email?: string | null
          band?: string | null
          created_at?: string
          daily_da_allowance?: number | null
          date_of_exit?: string | null
          date_of_joining?: string | null
          education?: string | null
          emergency_contact_number?: string | null
          hq?: string | null
          id?: string
          manager_id?: string | null
          monthly_salary?: number | null
          photo_url?: string | null
          secondary_manager_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          alternate_email?: string | null
          band?: string | null
          created_at?: string
          daily_da_allowance?: number | null
          date_of_exit?: string | null
          date_of_joining?: string | null
          education?: string | null
          emergency_contact_number?: string | null
          hq?: string | null
          id?: string
          manager_id?: string | null
          monthly_salary?: number | null
          photo_url?: string | null
          secondary_manager_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          actual_amount: number
          budget_amount: number
          created_at: string
          created_by: string | null
          customer_id: string | null
          end_date: string | null
          event_details: string | null
          event_type_id: string | null
          expected_end_result: string | null
          id: string
          name: string
          owner_id: string | null
          start_date: string | null
          updated_at: string
        }
        Insert: {
          actual_amount?: number
          budget_amount?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          end_date?: string | null
          event_details?: string | null
          event_type_id?: string | null
          expected_end_result?: string | null
          id?: string
          name: string
          owner_id?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          actual_amount?: number
          budget_amount?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          end_date?: string | null
          event_details?: string | null
          event_type_id?: string | null
          expected_end_result?: string | null
          id?: string
          name?: string
          owner_id?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_event_type_id_fkey"
            columns: ["event_type_id"]
            isOneToOne: false
            referencedRelation: "master_event_types"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_approval_rules: {
        Row: {
          category_id: string | null
          condition_type: string
          created_at: string
          id: string
          is_active: boolean
          max_amount: number | null
          min_amount: number | null
          priority: number
          rule_name: string
          updated_at: string
          workflow_id: string
        }
        Insert: {
          category_id?: string | null
          condition_type?: string
          created_at?: string
          id?: string
          is_active?: boolean
          max_amount?: number | null
          min_amount?: number | null
          priority?: number
          rule_name: string
          updated_at?: string
          workflow_id: string
        }
        Update: {
          category_id?: string | null
          condition_type?: string
          created_at?: string
          id?: string
          is_active?: boolean
          max_amount?: number | null
          min_amount?: number | null
          priority?: number
          rule_name?: string
          updated_at?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_approval_rules_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_approval_rules_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "expense_approval_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_approval_workflows: {
        Row: {
          approval_type: string
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          steps: number
          updated_at: string
        }
        Insert: {
          approval_type?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          steps?: number
          updated_at?: string
        }
        Update: {
          approval_type?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          steps?: number
          updated_at?: string
        }
        Relationships: []
      }
      expense_categories: {
        Row: {
          auto_approval_limit: number | null
          created_at: string
          daily_limit: number | null
          id: string
          is_active: boolean
          monthly_limit: number | null
          name: string
          receipt_required_above: number | null
          updated_at: string
        }
        Insert: {
          auto_approval_limit?: number | null
          created_at?: string
          daily_limit?: number | null
          id?: string
          is_active?: boolean
          monthly_limit?: number | null
          name: string
          receipt_required_above?: number | null
          updated_at?: string
        }
        Update: {
          auto_approval_limit?: number | null
          created_at?: string
          daily_limit?: number | null
          id?: string
          is_active?: boolean
          monthly_limit?: number | null
          name?: string
          receipt_required_above?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      expense_group_members: {
        Row: {
          created_at: string
          group_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "expense_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_groups: {
        Row: {
          created_at: string
          da_amount: number
          description: string | null
          fixed_ta_amount: number
          id: string
          name: string
          ta_per_km_rate: number
          ta_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          da_amount?: number
          description?: string | null
          fixed_ta_amount?: number
          id?: string
          name: string
          ta_per_km_rate?: number
          ta_type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          da_amount?: number
          description?: string | null
          fixed_ta_amount?: number
          id?: string
          name?: string
          ta_per_km_rate?: number
          ta_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      expense_master_config: {
        Row: {
          created_at: string
          da_applicable: boolean
          da_calculation_basis: string
          da_type: string
          fixed_da_amount: number | null
          fixed_ta_amount: number | null
          id: string
          ta_per_km_rate: number
          ta_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          da_applicable?: boolean
          da_calculation_basis?: string
          da_type?: string
          fixed_da_amount?: number | null
          fixed_ta_amount?: number | null
          id?: string
          ta_per_km_rate?: number
          ta_type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          da_applicable?: boolean
          da_calculation_basis?: string
          da_type?: string
          fixed_da_amount?: number | null
          fixed_ta_amount?: number | null
          id?: string
          ta_per_km_rate?: number
          ta_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      expense_overrides: {
        Row: {
          amount: number
          created_at: string
          field: string
          id: string
          ref_id: string
          ref_type: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          field: string
          id?: string
          ref_id: string
          ref_type: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          field?: string
          id?: string
          ref_id?: string
          ref_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      expense_policy: {
        Row: {
          allow_backdate: boolean
          created_at: string
          id: string
          max_additional_expense_per_day: number
          max_additional_expense_per_month: number
          max_back_days: number
          month_lock_enabled: boolean
          multi_level_approval: boolean
          policy_notes: string | null
          require_bill_above_amount: number
          submission_deadline: number
          updated_at: string
        }
        Insert: {
          allow_backdate?: boolean
          created_at?: string
          id?: string
          max_additional_expense_per_day?: number
          max_additional_expense_per_month?: number
          max_back_days?: number
          month_lock_enabled?: boolean
          multi_level_approval?: boolean
          policy_notes?: string | null
          require_bill_above_amount?: number
          submission_deadline?: number
          updated_at?: string
        }
        Update: {
          allow_backdate?: boolean
          created_at?: string
          id?: string
          max_additional_expense_per_day?: number
          max_additional_expense_per_month?: number
          max_back_days?: number
          month_lock_enabled?: boolean
          multi_level_approval?: boolean
          policy_notes?: string | null
          require_bill_above_amount?: number
          submission_deadline?: number
          updated_at?: string
        }
        Relationships: []
      }
      global_leave_policy: {
        Row: {
          allow_backdated_leave: boolean
          allow_negative_balance: boolean
          carry_forward_enabled: boolean
          created_at: string
          half_day_enabled: boolean
          id: string
          max_backdate_days: number
          max_carry_forward_days: number
          max_continuous_days: number
          max_negative_days: number
          notice_period_days: number
          reset_cycle: string
          sandwich_rule_enabled: boolean
          updated_at: string
        }
        Insert: {
          allow_backdated_leave?: boolean
          allow_negative_balance?: boolean
          carry_forward_enabled?: boolean
          created_at?: string
          half_day_enabled?: boolean
          id?: string
          max_backdate_days?: number
          max_carry_forward_days?: number
          max_continuous_days?: number
          max_negative_days?: number
          notice_period_days?: number
          reset_cycle?: string
          sandwich_rule_enabled?: boolean
          updated_at?: string
        }
        Update: {
          allow_backdated_leave?: boolean
          allow_negative_balance?: boolean
          carry_forward_enabled?: boolean
          created_at?: string
          half_day_enabled?: boolean
          id?: string
          max_backdate_days?: number
          max_carry_forward_days?: number
          max_continuous_days?: number
          max_negative_days?: number
          notice_period_days?: number
          reset_cycle?: string
          sandwich_rule_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      gps_tracking: {
        Row: {
          accuracy: number | null
          date: string
          heading: number | null
          id: string
          latitude: number
          longitude: number
          speed: number | null
          timestamp: string
          user_id: string
        }
        Insert: {
          accuracy?: number | null
          date?: string
          heading?: number | null
          id?: string
          latitude: number
          longitude: number
          speed?: number | null
          timestamp?: string
          user_id: string
        }
        Update: {
          accuracy?: number | null
          date?: string
          heading?: number | null
          id?: string
          latitude?: number
          longitude?: number
          speed?: number | null
          timestamp?: string
          user_id?: string
        }
        Relationships: []
      }
      gps_tracking_stops: {
        Row: {
          duration_minutes: number | null
          id: string
          latitude: number
          longitude: number
          reason: string | null
          timestamp: string
          user_id: string
        }
        Insert: {
          duration_minutes?: number | null
          id?: string
          latitude: number
          longitude: number
          reason?: string | null
          timestamp?: string
          user_id: string
        }
        Update: {
          duration_minutes?: number | null
          id?: string
          latitude?: number
          longitude?: number
          reason?: string | null
          timestamp?: string
          user_id?: string
        }
        Relationships: []
      }
      holidays: {
        Row: {
          created_at: string
          created_by: string | null
          date: string
          description: string | null
          holiday_name: string
          id: string
          year: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date: string
          description?: string | null
          holiday_name: string
          id?: string
          year?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date?: string
          description?: string | null
          holiday_name?: string
          id?: string
          year?: number
        }
        Relationships: []
      }
      lead_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          field_name: string | null
          from_value: string | null
          id: string
          lead_id: string
          to_value: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          field_name?: string | null
          from_value?: string | null
          id?: string
          lead_id: string
          to_value?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          field_name?: string | null
          from_value?: string | null
          id?: string
          lead_id?: string
          to_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_audit_log_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          actual_first_contact_date: string | null
          address: string | null
          business_card_url: string | null
          company: string | null
          contact_role: string | null
          converted_at: string | null
          converted_customer_id: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          indicative_budget: number | null
          industry: string | null
          lead_source_id: string | null
          lead_status_id: string | null
          name: string
          opportunity_close_date: string | null
          opportunity_probability: number | null
          opportunity_value: number | null
          owner_id: string | null
          phone: string | null
          related_event_id: string | null
          researched_information: string | null
          target_conversion_date: string | null
          target_first_contact_date: string | null
          title: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          actual_first_contact_date?: string | null
          address?: string | null
          business_card_url?: string | null
          company?: string | null
          contact_role?: string | null
          converted_at?: string | null
          converted_customer_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          indicative_budget?: number | null
          industry?: string | null
          lead_source_id?: string | null
          lead_status_id?: string | null
          name: string
          opportunity_close_date?: string | null
          opportunity_probability?: number | null
          opportunity_value?: number | null
          owner_id?: string | null
          phone?: string | null
          related_event_id?: string | null
          researched_information?: string | null
          target_conversion_date?: string | null
          target_first_contact_date?: string | null
          title?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          actual_first_contact_date?: string | null
          address?: string | null
          business_card_url?: string | null
          company?: string | null
          contact_role?: string | null
          converted_at?: string | null
          converted_customer_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          indicative_budget?: number | null
          industry?: string | null
          lead_source_id?: string | null
          lead_status_id?: string | null
          name?: string
          opportunity_close_date?: string | null
          opportunity_probability?: number | null
          opportunity_value?: number | null
          owner_id?: string | null
          phone?: string | null
          related_event_id?: string | null
          researched_information?: string | null
          target_conversion_date?: string | null
          target_first_contact_date?: string | null
          title?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_converted_customer_id_fkey"
            columns: ["converted_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_lead_source_id_fkey"
            columns: ["lead_source_id"]
            isOneToOne: false
            referencedRelation: "master_lead_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_lead_status_id_fkey"
            columns: ["lead_status_id"]
            isOneToOne: false
            referencedRelation: "master_lead_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_related_event_id_fkey"
            columns: ["related_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_applications: {
        Row: {
          applied_date: string | null
          approved_at: string | null
          approved_by: string | null
          approved_date: string | null
          created_at: string
          from_date: string
          half_day_period: string | null
          id: string
          is_half_day: boolean | null
          leave_type_id: string
          reason: string | null
          status: string
          to_date: string
          total_days: number
          updated_at: string
          user_id: string
        }
        Insert: {
          applied_date?: string | null
          approved_at?: string | null
          approved_by?: string | null
          approved_date?: string | null
          created_at?: string
          from_date: string
          half_day_period?: string | null
          id?: string
          is_half_day?: boolean | null
          leave_type_id: string
          reason?: string | null
          status?: string
          to_date: string
          total_days: number
          updated_at?: string
          user_id: string
        }
        Update: {
          applied_date?: string | null
          approved_at?: string | null
          approved_by?: string | null
          approved_date?: string | null
          created_at?: string
          from_date?: string
          half_day_period?: string | null
          id?: string
          is_half_day?: boolean | null
          leave_type_id?: string
          reason?: string | null
          status?: string
          to_date?: string
          total_days?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_applications_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_balance: {
        Row: {
          created_at: string
          id: string
          leave_type_id: string
          opening_balance: number
          remaining_balance: number | null
          updated_at: string
          used_balance: number
          user_id: string
          year: number
        }
        Insert: {
          created_at?: string
          id?: string
          leave_type_id: string
          opening_balance?: number
          remaining_balance?: number | null
          updated_at?: string
          used_balance?: number
          user_id: string
          year?: number
        }
        Update: {
          created_at?: string
          id?: string
          leave_type_id?: string
          opening_balance?: number
          remaining_balance?: number | null
          updated_at?: string
          used_balance?: number
          user_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "leave_balance_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_policy: {
        Row: {
          accrual_type: string
          carry_forward_allowed: boolean
          created_at: string
          id: string
          is_active: boolean
          leave_type_id: string
          max_carry_forward: number
          monthly_accrual: number | null
          updated_at: string
          yearly_entitlement: number
        }
        Insert: {
          accrual_type?: string
          carry_forward_allowed?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          leave_type_id: string
          max_carry_forward?: number
          monthly_accrual?: number | null
          updated_at?: string
          yearly_entitlement?: number
        }
        Update: {
          accrual_type?: string
          carry_forward_allowed?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          leave_type_id?: string
          max_carry_forward?: number
          monthly_accrual?: number | null
          updated_at?: string
          yearly_entitlement?: number
        }
        Relationships: [
          {
            foreignKeyName: "leave_policy_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: true
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_type_policy_override: {
        Row: {
          created_at: string
          custom_reset_cycle: string | null
          id: string
          leave_type_id: string
          max_carry_forward_days: number | null
          max_continuous_days: number | null
          max_negative_days: number | null
          min_notice_days: number | null
          override_carry_forward: boolean | null
          override_negative_balance: boolean | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          custom_reset_cycle?: string | null
          id?: string
          leave_type_id: string
          max_carry_forward_days?: number | null
          max_continuous_days?: number | null
          max_negative_days?: number | null
          min_notice_days?: number | null
          override_carry_forward?: boolean | null
          override_negative_balance?: boolean | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          custom_reset_cycle?: string | null
          id?: string
          leave_type_id?: string
          max_carry_forward_days?: number | null
          max_continuous_days?: number | null
          max_negative_days?: number | null
          min_notice_days?: number | null
          override_carry_forward?: boolean | null
          override_negative_balance?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_type_policy_override_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: true
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_types: {
        Row: {
          accrual_type: string
          annual_quota: number
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          max_days: number
          name: string
        }
        Insert: {
          accrual_type?: string
          annual_quota?: number
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          max_days?: number
          name: string
        }
        Update: {
          accrual_type?: string
          annual_quota?: number
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          max_days?: number
          name?: string
        }
        Relationships: []
      }
      list_views: {
        Row: {
          charts: Json
          created_at: string
          display_fields: string[]
          filter_match: string
          filters: Json
          id: string
          is_default: boolean
          is_shared: boolean
          name: string
          section: string
          shared_with: string[]
          sort_by: string | null
          sort_direction: string
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          charts?: Json
          created_at?: string
          display_fields?: string[]
          filter_match?: string
          filters?: Json
          id?: string
          is_default?: boolean
          is_shared?: boolean
          name: string
          section: string
          shared_with?: string[]
          sort_by?: string | null
          sort_direction?: string
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          charts?: Json
          created_at?: string
          display_fields?: string[]
          filter_match?: string
          filters?: Json
          id?: string
          is_default?: boolean
          is_shared?: boolean
          name?: string
          section?: string
          shared_with?: string[]
          sort_by?: string | null
          sort_direction?: string
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: []
      }
      master_activity_outcomes: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      master_addresses: {
        Row: {
          address_name: string
          city: string | null
          contact_persons: Json
          contact_phones: Json
          created_at: string
          created_by: string | null
          full_address: string | null
          gst_number: string | null
          id: string
          is_active: boolean
          pincode: string | null
          state: string | null
          updated_at: string
        }
        Insert: {
          address_name: string
          city?: string | null
          contact_persons?: Json
          contact_phones?: Json
          created_at?: string
          created_by?: string | null
          full_address?: string | null
          gst_number?: string | null
          id?: string
          is_active?: boolean
          pincode?: string | null
          state?: string | null
          updated_at?: string
        }
        Update: {
          address_name?: string
          city?: string | null
          contact_persons?: Json
          contact_phones?: Json
          created_at?: string
          created_by?: string | null
          full_address?: string | null
          gst_number?: string | null
          id?: string
          is_active?: boolean
          pincode?: string | null
          state?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      master_categories: {
        Row: {
          category_name: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          sub_category_name: string | null
          updated_at: string
        }
        Insert: {
          category_name: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          sub_category_name?: string | null
          updated_at?: string
        }
        Update: {
          category_name?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          sub_category_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      master_currencies: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          symbol: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          symbol: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          symbol?: string
          updated_at?: string
        }
        Relationships: []
      }
      master_entities: {
        Row: {
          address: string | null
          contact_number: string | null
          contact_person: string | null
          created_at: string
          created_by: string | null
          entity_code: string | null
          entity_name: string
          gst_number: string | null
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          address?: string | null
          contact_number?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          entity_code?: string | null
          entity_name: string
          gst_number?: string | null
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          address?: string | null
          contact_number?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          entity_code?: string | null
          entity_name?: string
          gst_number?: string | null
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      master_event_types: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      master_industries: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      master_lead_sources: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      master_lead_statuses: {
        Row: {
          color: string
          created_at: string
          id: string
          is_active: boolean
          is_converted_status: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_converted_status?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_converted_status?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      master_payment_terms: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      master_products: {
        Row: {
          category_id: string | null
          created_at: string
          created_by: string | null
          default_unit_price: number
          default_uom: string | null
          id: string
          is_active: boolean
          product_name: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          default_unit_price?: number
          default_uom?: string | null
          id?: string
          is_active?: boolean
          product_name: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          default_unit_price?: number
          default_uom?: string | null
          id?: string
          is_active?: boolean
          product_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "master_products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "master_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      master_uom: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          short_code: string
          sort_order: number
          uom_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          short_code: string
          sort_order?: number
          uom_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          short_code?: string
          sort_order?: number
          uom_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      monthly_leave_accrual: {
        Row: {
          allocated: number
          carried_forward: number
          created_at: string
          id: string
          leave_type_id: string
          month: number
          updated_at: string
          used: number
          user_id: string
          year: number
        }
        Insert: {
          allocated?: number
          carried_forward?: number
          created_at?: string
          id?: string
          leave_type_id: string
          month: number
          updated_at?: string
          used?: number
          user_id: string
          year: number
        }
        Update: {
          allocated?: number
          carried_forward?: number
          created_at?: string
          id?: string
          leave_type_id?: string
          month?: number
          updated_at?: string
          used?: number
          user_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "monthly_leave_accrual_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean | null
          message: string
          related_id: string | null
          related_table: string | null
          title: string
          type: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean | null
          message: string
          related_id?: string | null
          related_table?: string | null
          title: string
          type?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean | null
          message?: string
          related_id?: string | null
          related_table?: string | null
          title?: string
          type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      opportunity_milestones: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          invoice_date: string | null
          invoice_number: string | null
          invoice_value: number
          name: string
          opportunity_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          invoice_value?: number
          name: string
          opportunity_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          invoice_value?: number
          name?: string
          opportunity_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_milestones_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "customer_opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_quote_items: {
        Row: {
          created_at: string
          discount_pct: number
          end_date: string | null
          id: string
          product_id: string | null
          product_name: string | null
          qty: number
          quote_id: string
          sort_order: number
          start_date: string | null
          term_months: number | null
          total: number
          unit_price: number
          uom: string | null
        }
        Insert: {
          created_at?: string
          discount_pct?: number
          end_date?: string | null
          id?: string
          product_id?: string | null
          product_name?: string | null
          qty?: number
          quote_id: string
          sort_order?: number
          start_date?: string | null
          term_months?: number | null
          total?: number
          unit_price?: number
          uom?: string | null
        }
        Update: {
          created_at?: string
          discount_pct?: number
          end_date?: string | null
          id?: string
          product_id?: string | null
          product_name?: string | null
          qty?: number
          quote_id?: string
          sort_order?: number
          start_date?: string | null
          term_months?: number | null
          total?: number
          unit_price?: number
          uom?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_quote_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "master_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "opportunity_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_quotes: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_synced: boolean
          name: string
          notes: string | null
          opportunity_id: string
          overall_discount_pct: number
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_synced?: boolean
          name: string
          notes?: string | null
          opportunity_id: string
          overall_discount_pct?: number
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_synced?: boolean
          name?: string
          notes?: string | null
          opportunity_id?: string
          overall_discount_pct?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_quotes_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "customer_opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_stages: {
        Row: {
          color: string
          created_at: string
          id: string
          is_active: boolean
          is_closed: boolean
          is_won: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_closed?: boolean
          is_won?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_closed?: boolean
          is_won?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      opportunity_types: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          category: string | null
          created_at: string
          id: string
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          rate: number
          total: number
          unit: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          order_id: string
          product_id?: string | null
          product_name: string
          quantity?: number
          rate?: number
          total?: number
          unit?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          order_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          rate?: number
          total?: number
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          discount_amount: number | null
          id: string
          retailer_name: string | null
          status: string
          subtotal: number | null
          total_amount: number | null
          updated_at: string
          user_id: string
          visit_id: string | null
        }
        Insert: {
          created_at?: string
          discount_amount?: number | null
          id?: string
          retailer_name?: string | null
          status?: string
          subtotal?: number | null
          total_amount?: number | null
          updated_at?: string
          user_id: string
          visit_id?: string | null
        }
        Update: {
          created_at?: string
          discount_amount?: number | null
          id?: string
          retailer_name?: string | null
          status?: string
          subtotal?: number | null
          total_amount?: number | null
          updated_at?: string
          user_id?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_definitions: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          label: string
          name: string
          parent_module: string | null
          sort_order: number
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          name: string
          parent_module?: string | null
          sort_order?: number
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          name?: string
          parent_module?: string | null
          sort_order?: number
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "permission_definitions_parent_module_fkey"
            columns: ["parent_module"]
            isOneToOne: false
            referencedRelation: "permission_definitions"
            referencedColumns: ["name"]
          },
        ]
      }
      permissions: {
        Row: {
          can_create: boolean
          can_delete: boolean
          can_edit: boolean
          can_modify_all: boolean
          can_read: boolean
          can_view_all: boolean
          id: string
          object_name: string
        }
        Insert: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_modify_all?: boolean
          can_read?: boolean
          can_view_all?: boolean
          id?: string
          object_name: string
        }
        Update: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_modify_all?: boolean
          can_read?: boolean
          can_view_all?: boolean
          id?: string
          object_name?: string
        }
        Relationships: []
      }
      pm_ai_insights: {
        Row: {
          content: string
          created_at: string
          id: string
          insight_type: string
          metadata: Json | null
          project_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          insight_type: string
          metadata?: Json | null
          project_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          insight_type?: string
          metadata?: Json | null
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_ai_insights_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_ideas: {
        Row: {
          created_at: string
          description: string | null
          id: string
          project_id: string
          status: string
          submitted_by: string
          title: string
          updated_at: string
          votes: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          project_id: string
          status?: string
          submitted_by: string
          title: string
          updated_at?: string
          votes?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          project_id?: string
          status?: string
          submitted_by?: string
          title?: string
          updated_at?: string
          votes?: number
        }
        Relationships: [
          {
            foreignKeyName: "pm_ideas_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_ideas_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_knowledge_documents: {
        Row: {
          content: string | null
          created_at: string
          file_url: string | null
          id: string
          project_id: string
          title: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          file_url?: string | null
          id?: string
          project_id: string
          title: string
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          content?: string | null
          created_at?: string
          file_url?: string | null
          id?: string
          project_id?: string
          title?: string
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_knowledge_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_knowledge_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_milestones: {
        Row: {
          color: string
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          is_completed: boolean
          name: string
          project_id: string
          updated_at: string
        }
        Insert: {
          color?: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_completed?: boolean
          name: string
          project_id: string
          updated_at?: string
        }
        Update: {
          color?: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_completed?: boolean
          name?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_project_members: {
        Row: {
          created_at: string
          id: string
          project_id: string
          role: Database["public"]["Enums"]["pm_member_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          role?: Database["public"]["Enums"]["pm_member_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          role?: Database["public"]["Enums"]["pm_member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_project_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_project_resources: {
        Row: {
          allocated_hours: number | null
          created_at: string
          hourly_rate: number | null
          id: string
          project_id: string
          role: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          allocated_hours?: number | null
          created_at?: string
          hourly_rate?: number | null
          id?: string
          project_id: string
          role?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          allocated_hours?: number | null
          created_at?: string
          hourly_rate?: number | null
          id?: string
          project_id?: string
          role?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_project_resources_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_project_resources_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_projects: {
        Row: {
          budget: number | null
          color: string
          created_at: string
          created_by: string
          description: string | null
          end_date: string | null
          estimated_hours: number | null
          id: string
          is_template: boolean
          logged_hours: number | null
          name: string
          owner_id: string | null
          priority: Database["public"]["Enums"]["pm_priority"]
          start_date: string | null
          status: Database["public"]["Enums"]["pm_project_status"]
          template_name: string | null
          updated_at: string
        }
        Insert: {
          budget?: number | null
          color?: string
          created_at?: string
          created_by: string
          description?: string | null
          end_date?: string | null
          estimated_hours?: number | null
          id?: string
          is_template?: boolean
          logged_hours?: number | null
          name: string
          owner_id?: string | null
          priority?: Database["public"]["Enums"]["pm_priority"]
          start_date?: string | null
          status?: Database["public"]["Enums"]["pm_project_status"]
          template_name?: string | null
          updated_at?: string
        }
        Update: {
          budget?: number | null
          color?: string
          created_at?: string
          created_by?: string
          description?: string | null
          end_date?: string | null
          estimated_hours?: number | null
          id?: string
          is_template?: boolean
          logged_hours?: number | null
          name?: string
          owner_id?: string | null
          priority?: Database["public"]["Enums"]["pm_priority"]
          start_date?: string | null
          status?: Database["public"]["Enums"]["pm_project_status"]
          template_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_projects_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_risks: {
        Row: {
          created_at: string
          description: string | null
          id: string
          impact: string
          mitigation_plan: string | null
          owner_id: string | null
          probability: string
          project_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          impact?: string
          mitigation_plan?: string | null
          owner_id?: string | null
          probability?: string
          project_id: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          impact?: string
          mitigation_plan?: string | null
          owner_id?: string | null
          probability?: string
          project_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_risks_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_risks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_sections: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          position: number
          project_id: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          position?: number
          project_id: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          position?: number
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_sections_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_sprints: {
        Row: {
          created_at: string
          end_date: string | null
          goal: string | null
          id: string
          name: string
          project_id: string
          start_date: string | null
          status: Database["public"]["Enums"]["pm_sprint_status"]
          updated_at: string
          velocity: number | null
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          goal?: string | null
          id?: string
          name: string
          project_id: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["pm_sprint_status"]
          updated_at?: string
          velocity?: number | null
        }
        Update: {
          created_at?: string
          end_date?: string | null
          goal?: string | null
          id?: string
          name?: string
          project_id?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["pm_sprint_status"]
          updated_at?: string
          velocity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pm_sprints_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_support_requests: {
        Row: {
          assigned_to: string | null
          created_at: string
          description: string | null
          id: string
          priority: string
          project_id: string
          status: string
          submitted_by: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          description?: string | null
          id?: string
          priority?: string
          project_id: string
          status?: string
          submitted_by: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          description?: string | null
          id?: string
          priority?: string
          project_id?: string
          status?: string
          submitted_by?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_support_requests_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_support_requests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_support_requests_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_task_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          note: string | null
          task_id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          note?: string | null
          task_id: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          note?: string | null
          task_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "pm_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_task_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_task_collaborators: {
        Row: {
          created_at: string
          id: string
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_task_collaborators_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "pm_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_task_collaborators_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_task_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          task_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          task_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          task_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "pm_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_task_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_task_dependencies: {
        Row: {
          created_at: string
          dependency_type: string
          depends_on_task_id: string
          id: string
          task_id: string
        }
        Insert: {
          created_at?: string
          dependency_type?: string
          depends_on_task_id: string
          id?: string
          task_id: string
        }
        Update: {
          created_at?: string
          dependency_type?: string
          depends_on_task_id?: string
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_task_dependencies_depends_on_task_id_fkey"
            columns: ["depends_on_task_id"]
            isOneToOne: false
            referencedRelation: "pm_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_task_dependencies_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "pm_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_task_templates: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          estimated_hours: number | null
          id: string
          name: string
          priority: string
          tags: string[] | null
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          estimated_hours?: number | null
          id?: string
          name: string
          priority?: string
          tags?: string[] | null
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          estimated_hours?: number | null
          id?: string
          name?: string
          priority?: string
          tags?: string[] | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_task_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_tasks: {
        Row: {
          assignee_id: string | null
          block_reason: string | null
          collaborator_id: string | null
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          estimated_hours: number | null
          id: string
          is_blocked: boolean
          logged_hours: number | null
          milestone_id: string | null
          parent_task_id: string | null
          priority: Database["public"]["Enums"]["pm_priority"]
          project_id: string
          reporter_id: string | null
          section_id: string | null
          sort_order: number
          sprint_id: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["pm_task_status"]
          story_points: number | null
          tags: string[] | null
          title: string
          type: Database["public"]["Enums"]["pm_task_type"]
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          block_reason?: string | null
          collaborator_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          id?: string
          is_blocked?: boolean
          logged_hours?: number | null
          milestone_id?: string | null
          parent_task_id?: string | null
          priority?: Database["public"]["Enums"]["pm_priority"]
          project_id: string
          reporter_id?: string | null
          section_id?: string | null
          sort_order?: number
          sprint_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["pm_task_status"]
          story_points?: number | null
          tags?: string[] | null
          title: string
          type?: Database["public"]["Enums"]["pm_task_type"]
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          block_reason?: string | null
          collaborator_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          id?: string
          is_blocked?: boolean
          logged_hours?: number | null
          milestone_id?: string | null
          parent_task_id?: string | null
          priority?: Database["public"]["Enums"]["pm_priority"]
          project_id?: string
          reporter_id?: string | null
          section_id?: string | null
          sort_order?: number
          sprint_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["pm_task_status"]
          story_points?: number | null
          tags?: string[] | null
          title?: string
          type?: Database["public"]["Enums"]["pm_task_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_tasks_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_tasks_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "pm_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "pm_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_tasks_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_tasks_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "pm_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_tasks_sprint_id_fkey"
            columns: ["sprint_id"]
            isOneToOne: false
            referencedRelation: "pm_sprints"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_template_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          note: string | null
          task_id: string
          template_id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          note?: string | null
          task_id: string
          template_id: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          note?: string | null
          task_id?: string
          template_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_template_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "pm_template_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_template_attachments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "pm_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_template_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_template_dependencies: {
        Row: {
          created_at: string
          dependency_type: string
          depends_on_task_id: string
          id: string
          task_id: string
          template_id: string
        }
        Insert: {
          created_at?: string
          dependency_type?: string
          depends_on_task_id: string
          id?: string
          task_id: string
          template_id: string
        }
        Update: {
          created_at?: string
          dependency_type?: string
          depends_on_task_id?: string
          id?: string
          task_id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_template_dependencies_depends_on_task_id_fkey"
            columns: ["depends_on_task_id"]
            isOneToOne: false
            referencedRelation: "pm_template_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_template_dependencies_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "pm_template_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_template_dependencies_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "pm_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_template_sections: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          position: number
          template_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          position?: number
          template_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          position?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_template_sections_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "pm_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_template_tasks: {
        Row: {
          created_at: string
          description: string | null
          duration_days: number
          estimated_hours: number | null
          id: string
          parent_task_id: string | null
          priority: string
          section_id: string | null
          sort_order: number
          tags: string[] | null
          template_id: string
          title: string
          type: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          duration_days?: number
          estimated_hours?: number | null
          id?: string
          parent_task_id?: string | null
          priority?: string
          section_id?: string | null
          sort_order?: number
          tags?: string[] | null
          template_id: string
          title: string
          type?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          duration_days?: number
          estimated_hours?: number | null
          id?: string
          parent_task_id?: string | null
          priority?: string
          section_id?: string | null
          sort_order?: number
          tags?: string[] | null
          template_id?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_template_tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "pm_template_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_template_tasks_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "pm_template_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_template_tasks_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "pm_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_templates: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_time_logs: {
        Row: {
          created_at: string
          date: string
          description: string | null
          hours: number
          id: string
          project_id: string
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date?: string
          description?: string | null
          hours?: number
          id?: string
          project_id: string
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          description?: string | null
          hours?: number
          id?: string
          project_id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_time_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_time_logs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "pm_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_time_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_grn_items: {
        Row: {
          created_at: string
          grn_id: string
          id: string
          ordered_qty: number
          procurement_item_id: string | null
          product_id: string | null
          received_qty: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          grn_id: string
          id?: string
          ordered_qty?: number
          procurement_item_id?: string | null
          product_id?: string | null
          received_qty?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          grn_id?: string
          id?: string
          ordered_qty?: number
          procurement_item_id?: string | null
          product_id?: string | null
          received_qty?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_grn_items_grn_id_fkey"
            columns: ["grn_id"]
            isOneToOne: false
            referencedRelation: "procurement_grns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_grn_items_procurement_item_id_fkey"
            columns: ["procurement_item_id"]
            isOneToOne: false
            referencedRelation: "procurement_items"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_grns: {
        Row: {
          created_at: string
          created_by: string | null
          grn_number: string | null
          id: string
          photos: Json
          po_id: string
          receipt_date: string
          received_by: string | null
          remarks: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          grn_number?: string | null
          id?: string
          photos?: Json
          po_id: string
          receipt_date?: string
          received_by?: string | null
          remarks?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          grn_number?: string | null
          id?: string
          photos?: Json
          po_id?: string
          receipt_date?: string
          received_by?: string | null
          remarks?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_grns_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "procurement_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_invoice_attachments: {
        Row: {
          created_at: string
          created_by: string | null
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          invoice_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          invoice_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          invoice_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_invoice_attachments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "procurement_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_invoice_items: {
        Row: {
          created_at: string
          id: string
          invoice_id: string
          invoiced_qty: number
          invoiced_rate: number
          procurement_item_id: string | null
          product_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          invoice_id: string
          invoiced_qty?: number
          invoiced_rate?: number
          procurement_item_id?: string | null
          product_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          invoice_id?: string
          invoiced_qty?: number
          invoiced_rate?: number
          procurement_item_id?: string | null
          product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "procurement_invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "procurement_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_invoice_items_procurement_item_id_fkey"
            columns: ["procurement_item_id"]
            isOneToOne: false
            referencedRelation: "procurement_items"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_invoice_payments: {
        Row: {
          amount: number
          bank_name: string | null
          created_at: string
          created_by: string | null
          id: string
          invoice_id: string
          payment_date: string | null
          reference_number: string | null
        }
        Insert: {
          amount?: number
          bank_name?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id: string
          payment_date?: string | null
          reference_number?: string | null
        }
        Update: {
          amount?: number
          bank_name?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id?: string
          payment_date?: string | null
          reference_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "procurement_invoice_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "procurement_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_invoices: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          invoice_amount: number
          invoice_date: string
          invoice_number: string | null
          po_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_amount?: number
          invoice_date?: string
          invoice_number?: string | null
          po_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_amount?: number
          invoice_date?: string
          invoice_number?: string | null
          po_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_invoices_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "procurement_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_items: {
        Row: {
          amount: number
          created_at: string
          id: string
          procurement_id: string
          product_id: string | null
          qty: number
          rate: number
          uom: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          procurement_id: string
          product_id?: string | null
          qty?: number
          rate?: number
          uom?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          procurement_id?: string
          product_id?: string | null
          qty?: number
          rate?: number
          uom?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_items_procurement_id_fkey"
            columns: ["procurement_id"]
            isOneToOne: false
            referencedRelation: "procurement_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "master_products"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_orders: {
        Row: {
          bill_to: string | null
          bill_to_address_id: string | null
          bill_to_gst: string | null
          created_at: string
          created_by: string | null
          entity_id: string | null
          estimated_budget: number | null
          expected_delivery_date: string | null
          grn_number: string | null
          grn_status: string | null
          id: string
          order_date: string
          payment_terms: string | null
          po_number: string | null
          requisition_notes: string | null
          ship_to: string | null
          ship_to_address_id: string | null
          ship_to_gst: string | null
          site_id: string | null
          status: string
          total_amount: number
          updated_at: string
          vendor_id: string | null
          vendor_ids: string[] | null
        }
        Insert: {
          bill_to?: string | null
          bill_to_address_id?: string | null
          bill_to_gst?: string | null
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          estimated_budget?: number | null
          expected_delivery_date?: string | null
          grn_number?: string | null
          grn_status?: string | null
          id?: string
          order_date?: string
          payment_terms?: string | null
          po_number?: string | null
          requisition_notes?: string | null
          ship_to?: string | null
          ship_to_address_id?: string | null
          ship_to_gst?: string | null
          site_id?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
          vendor_id?: string | null
          vendor_ids?: string[] | null
        }
        Update: {
          bill_to?: string | null
          bill_to_address_id?: string | null
          bill_to_gst?: string | null
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          estimated_budget?: number | null
          expected_delivery_date?: string | null
          grn_number?: string | null
          grn_status?: string | null
          id?: string
          order_date?: string
          payment_terms?: string | null
          po_number?: string | null
          requisition_notes?: string | null
          ship_to?: string | null
          ship_to_address_id?: string | null
          ship_to_gst?: string | null
          site_id?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
          vendor_id?: string | null
          vendor_ids?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "procurement_orders_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "master_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_orders_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "project_sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_vendor_feedback: {
        Row: {
          comments: string | null
          created_at: string
          created_by: string | null
          delivery_timeliness: number
          grn_id: string
          id: string
          material_quality: number
          overall_experience: number
          po_id: string | null
          quantity_accuracy: number
          updated_at: string
          vendor_id: string
        }
        Insert: {
          comments?: string | null
          created_at?: string
          created_by?: string | null
          delivery_timeliness: number
          grn_id: string
          id?: string
          material_quality: number
          overall_experience: number
          po_id?: string | null
          quantity_accuracy: number
          updated_at?: string
          vendor_id: string
        }
        Update: {
          comments?: string | null
          created_at?: string
          created_by?: string | null
          delivery_timeliness?: number
          grn_id?: string
          id?: string
          material_quality?: number
          overall_experience?: number
          po_id?: string | null
          quantity_accuracy?: number
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_vendor_feedback_grn_id_fkey"
            columns: ["grn_id"]
            isOneToOne: true
            referencedRelation: "procurement_grns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_vendor_feedback_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "procurement_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_vendor_feedback_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      product_schemes: {
        Row: {
          condition_quantity: number | null
          created_at: string
          description: string | null
          discount_amount: number | null
          discount_percentage: number | null
          end_date: string | null
          free_quantity: number | null
          id: string
          is_active: boolean
          name: string
          product_id: string
          scheme_type: string
          start_date: string | null
        }
        Insert: {
          condition_quantity?: number | null
          created_at?: string
          description?: string | null
          discount_amount?: number | null
          discount_percentage?: number | null
          end_date?: string | null
          free_quantity?: number | null
          id?: string
          is_active?: boolean
          name: string
          product_id: string
          scheme_type?: string
          start_date?: string | null
        }
        Update: {
          condition_quantity?: number | null
          created_at?: string
          description?: string | null
          discount_amount?: number | null
          discount_percentage?: number | null
          end_date?: string | null
          free_quantity?: number | null
          id?: string
          is_active?: boolean
          name?: string
          product_id?: string
          scheme_type?: string
          start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_schemes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category_id: string | null
          closing_stock: number | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          product_number: string | null
          rate: number
          sku: string | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          closing_stock?: number | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          product_number?: string | null
          rate?: number
          sku?: string | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          closing_stock?: number | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          product_number?: string | null
          rate?: number
          sku?: string | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_object_permissions: {
        Row: {
          can_create: boolean
          can_delete: boolean
          can_edit: boolean
          can_modify_all: boolean
          can_read: boolean
          can_view_all: boolean
          id: string
          object_name: string
          parent_module: string | null
          permission_type: string
          profile_id: string
        }
        Insert: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_modify_all?: boolean
          can_read?: boolean
          can_view_all?: boolean
          id?: string
          object_name: string
          parent_module?: string | null
          permission_type?: string
          profile_id: string
        }
        Update: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_modify_all?: boolean
          can_read?: boolean
          can_view_all?: boolean
          id?: string
          object_name?: string
          parent_module?: string | null
          permission_type?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_object_permissions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "security_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          hint_answer: string | null
          hint_question: string | null
          id: string
          must_change_password: boolean
          onboarding_completed: boolean
          phone_number: string | null
          profile_picture_url: string | null
          recovery_email: string | null
          updated_at: string
          user_status: string
          username: string | null
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          hint_answer?: string | null
          hint_question?: string | null
          id: string
          must_change_password?: boolean
          onboarding_completed?: boolean
          phone_number?: string | null
          profile_picture_url?: string | null
          recovery_email?: string | null
          updated_at?: string
          user_status?: string
          username?: string | null
        }
        Update: {
          created_at?: string
          full_name?: string | null
          hint_answer?: string | null
          hint_question?: string | null
          id?: string
          must_change_password?: boolean
          onboarding_completed?: boolean
          phone_number?: string | null
          profile_picture_url?: string | null
          recovery_email?: string | null
          updated_at?: string
          user_status?: string
          username?: string | null
        }
        Relationships: []
      }
      project_sites: {
        Row: {
          attachment_urls: string[]
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          end_date: string | null
          flag: string | null
          id: string
          is_active: boolean
          site_code: string | null
          site_name: string
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          attachment_urls?: string[]
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          end_date?: string | null
          flag?: string | null
          id?: string
          is_active?: boolean
          site_code?: string | null
          site_name: string
          start_date?: string
          status?: string
          updated_at?: string
        }
        Update: {
          attachment_urls?: string[]
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          end_date?: string | null
          flag?: string | null
          id?: string
          is_active?: boolean
          site_code?: string | null
          site_name?: string
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          created_at: string
          id: string
          last_seen_at: string
          platform: string | null
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_seen_at?: string
          platform?: string | null
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_seen_at?: string
          platform?: string | null
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      regularization_policy: {
        Row: {
          approval_mode: string
          auto_approve_within_hours: number | null
          created_at: string
          daily_limit: number
          id: string
          max_backdate_days: number
          monthly_limit: number
          post_approval_status: string
          require_reason: boolean
          updated_at: string
        }
        Insert: {
          approval_mode?: string
          auto_approve_within_hours?: number | null
          created_at?: string
          daily_limit?: number
          id?: string
          max_backdate_days?: number
          monthly_limit?: number
          post_approval_status?: string
          require_reason?: boolean
          updated_at?: string
        }
        Update: {
          approval_mode?: string
          auto_approve_within_hours?: number | null
          created_at?: string
          daily_limit?: number
          id?: string
          max_backdate_days?: number
          monthly_limit?: number
          post_approval_status?: string
          require_reason?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      regularization_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          attendance_date: string | null
          created_at: string
          current_check_in_time: string | null
          current_check_out_time: string | null
          date: string
          id: string
          reason: string | null
          rejection_reason: string | null
          request_type: string
          requested_check_in_time: string | null
          requested_check_out_time: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          attendance_date?: string | null
          created_at?: string
          current_check_in_time?: string | null
          current_check_out_time?: string | null
          date: string
          id?: string
          reason?: string | null
          rejection_reason?: string | null
          request_type: string
          requested_check_in_time?: string | null
          requested_check_out_time?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          attendance_date?: string | null
          created_at?: string
          current_check_in_time?: string | null
          current_check_out_time?: string | null
          date?: string
          id?: string
          reason?: string | null
          rejection_reason?: string | null
          request_type?: string
          requested_check_in_time?: string | null
          requested_check_out_time?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      retailers: {
        Row: {
          address: string | null
          beat_id: string | null
          category: string | null
          created_at: string
          id: string
          last_visit_date: string | null
          latitude: number | null
          location_tag: string | null
          longitude: number | null
          name: string
          notes: string | null
          order_value: number | null
          phone: string | null
          potential: string | null
          priority: string | null
          retail_type: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          beat_id?: string | null
          category?: string | null
          created_at?: string
          id?: string
          last_visit_date?: string | null
          latitude?: number | null
          location_tag?: string | null
          longitude?: number | null
          name: string
          notes?: string | null
          order_value?: number | null
          phone?: string | null
          potential?: string | null
          priority?: string | null
          retail_type?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          beat_id?: string | null
          category?: string | null
          created_at?: string
          id?: string
          last_visit_date?: string | null
          latitude?: number | null
          location_tag?: string | null
          longitude?: number | null
          name?: string
          notes?: string | null
          order_value?: number | null
          phone?: string | null
          potential?: string | null
          priority?: string | null
          retail_type?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          id: string
          permission_id: string
          role_id: string
        }
        Insert: {
          id?: string
          permission_id: string
          role_id: string
        }
        Update: {
          id?: string
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          id: string
          is_system: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_system?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_system?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      saved_reports: {
        Row: {
          config: Json
          created_at: string
          id: string
          is_favourite: boolean
          module: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          is_favourite?: boolean
          module: string
          name: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          is_favourite?: boolean
          module?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      security_profiles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      site_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          id: string
          site_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          site_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          site_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_assignments_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "project_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      site_milestone_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          milestone_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          milestone_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          milestone_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_milestone_comments_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "site_milestones"
            referencedColumns: ["id"]
          },
        ]
      }
      site_milestones: {
        Row: {
          actual_end_date: string | null
          actual_start_date: string | null
          at_risk: boolean
          created_at: string
          end_date: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          parent_id: string | null
          percent_complete: number
          priority: string | null
          site_id: string
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          actual_end_date?: string | null
          actual_start_date?: string | null
          at_risk?: boolean
          created_at?: string
          end_date: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          parent_id?: string | null
          percent_complete?: number
          priority?: string | null
          site_id: string
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          actual_end_date?: string | null
          actual_start_date?: string | null
          at_risk?: boolean
          created_at?: string
          end_date?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          parent_id?: string | null
          percent_complete?: number
          priority?: string | null
          site_id?: string
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_milestones_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "site_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_milestones_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "project_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      ta_rate_history: {
        Row: {
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          note: string | null
          per_km_rate: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_from: string
          effective_to?: string | null
          id?: string
          note?: string | null
          per_km_rate?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          note?: string | null
          per_km_rate?: number
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          assigned_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          assigned_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          assigned_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_security_profiles: {
        Row: {
          created_at: string
          id: string
          profile_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_security_profiles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "security_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          battery_charging: boolean | null
          battery_level: number | null
          created_at: string
          device_platform: string | null
          device_status_at: string | null
          email: string
          full_name: string | null
          id: string
          is_active: boolean
          network_type: string | null
          phone: string | null
          reporting_manager_id: string | null
          role_id: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          battery_charging?: boolean | null
          battery_level?: number | null
          created_at?: string
          device_platform?: string | null
          device_status_at?: string | null
          email: string
          full_name?: string | null
          id: string
          is_active?: boolean
          network_type?: string | null
          phone?: string | null
          reporting_manager_id?: string | null
          role_id?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          battery_charging?: boolean | null
          battery_level?: number | null
          created_at?: string
          device_platform?: string | null
          device_status_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          network_type?: string | null
          phone?: string | null
          reporting_manager_id?: string | null
          role_id?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_reporting_manager_id_fkey"
            columns: ["reporting_manager_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          address: string | null
          category: string | null
          contact_person: Json | null
          created_at: string
          created_by: string
          email: Json | null
          id: string
          name: string
          notes: string | null
          phone: Json
          services: string | null
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          category?: string | null
          contact_person?: Json | null
          created_at?: string
          created_by: string
          email?: Json | null
          id?: string
          name: string
          notes?: string | null
          phone?: Json
          services?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          category?: string | null
          contact_person?: Json | null
          created_at?: string
          created_by?: string
          email?: Json | null
          id?: string
          name?: string
          notes?: string | null
          phone?: Json
          services?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      visits: {
        Row: {
          check_in_location: Json | null
          check_in_photo_url: string | null
          check_in_time: string | null
          check_out_location: Json | null
          check_out_photo_url: string | null
          check_out_time: string | null
          created_at: string
          id: string
          location_match_in: boolean | null
          location_match_out: boolean | null
          planned_date: string | null
          retailer_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          check_in_location?: Json | null
          check_in_photo_url?: string | null
          check_in_time?: string | null
          check_out_location?: Json | null
          check_out_photo_url?: string | null
          check_out_time?: string | null
          created_at?: string
          id?: string
          location_match_in?: boolean | null
          location_match_out?: boolean | null
          planned_date?: string | null
          retailer_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          check_in_location?: Json | null
          check_in_photo_url?: string | null
          check_in_time?: string | null
          check_out_location?: Json | null
          check_out_photo_url?: string | null
          check_out_time?: string | null
          created_at?: string
          id?: string
          location_match_in?: boolean | null
          location_match_out?: boolean | null
          planned_date?: string | null
          retailer_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visits_retailer_id_fkey"
            columns: ["retailer_id"]
            isOneToOne: false
            referencedRelation: "retailers"
            referencedColumns: ["id"]
          },
        ]
      }
      web_push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_seen_at: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_seen_at?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_seen_at?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      week_off_config: {
        Row: {
          alternate_pattern: string | null
          created_at: string
          day_of_week: number
          id: string
          is_off: boolean
          updated_at: string
        }
        Insert: {
          alternate_pattern?: string | null
          created_at?: string
          day_of_week: number
          id?: string
          is_off?: boolean
          updated_at?: string
        }
        Update: {
          alternate_pattern?: string | null
          created_at?: string
          day_of_week?: number
          id?: string
          is_off?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      working_days_config: {
        Row: {
          created_at: string
          holidays: number
          id: string
          month: number
          total_days: number
          updated_at: string
          week_offs: number
          working_days: number
          year: number
        }
        Insert: {
          created_at?: string
          holidays?: number
          id?: string
          month: number
          total_days?: number
          updated_at?: string
          week_offs?: number
          working_days?: number
          year: number
        }
        Update: {
          created_at?: string
          holidays?: number
          id?: string
          month?: number
          total_days?: number
          updated_at?: string
          week_offs?: number
          working_days?: number
          year?: number
        }
        Relationships: []
      }
    }
    Views: {
      company_branding: {
        Row: {
          address: string | null
          company_name: string | null
          id: string | null
          logo_url: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          company_name?: string | null
          id?: string | null
          logo_url?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          company_name?: string | null
          id?: string | null
          logo_url?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      can_access_crm_record: {
        Args: { _creator: string; _owner: string }
        Returns: boolean
      }
      can_access_customer: { Args: { _customer_id: string }; Returns: boolean }
      can_access_object: {
        Args: { _object_name: string; _permission: string; _user_id: string }
        Returns: boolean
      }
      compute_filtered_distance_km: {
        Args: { _date: string; _user_id: string }
        Returns: number
      }
      convert_lead: {
        Args: { _lead_id: string; _payload: Json }
        Returns: string
      }
      ensure_current_user: {
        Args: { _email: string; _full_name?: string; _username?: string }
        Returns: {
          email: string
          full_name: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
          username: string
        }[]
      }
      get_company_profile_full: {
        Args: never
        Returns: {
          address: string | null
          bank_account: string | null
          bank_ifsc: string | null
          bank_name: string | null
          company_name: string
          created_at: string
          email: string | null
          gst_number: string | null
          id: string
          logo_url: string | null
          pan_number: string | null
          phone: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "company_profile"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_dashboard_summary: { Args: never; Returns: Json }
      get_monthly_expense_summary: {
        Args: { _user_id: string; _year_month: string }
        Returns: Json
      }
      get_subordinate_users: {
        Args: { _manager_id: string }
        Returns: {
          level: number
          user_id: string
        }[]
      }
      get_ta_rate_for_date: { Args: { _date: string }; Returns: number }
      get_user_hierarchy: {
        Args: { _manager_id: string }
        Returns: {
          level: number
          user_id: string
        }[]
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_security_management_access: {
        Args: { _permission: string; _user_id: string }
        Returns: boolean
      }
      recalculate_monthly_leave_accruals: {
        Args: { _target_user_id?: string }
        Returns: undefined
      }
      report_device_status: {
        Args: {
          _battery: number
          _charging: boolean
          _network: string
          _platform: string
        }
        Returns: undefined
      }
      send_notification: {
        Args: {
          message_param: string
          related_id_param?: string
          related_table_param?: string
          title_param: string
          type_param?: string
          user_id_param: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "user" | "data_viewer" | "sales_manager"
      employee_doc_type: "address_proof" | "id_proof" | "other"
      pm_member_role:
        | "owner"
        | "manager"
        | "developer"
        | "designer"
        | "tester"
        | "viewer"
      pm_priority: "critical" | "high" | "medium" | "low"
      pm_project_status:
        | "planning"
        | "active"
        | "on_hold"
        | "completed"
        | "cancelled"
      pm_sprint_status: "planning" | "active" | "completed" | "cancelled"
      pm_task_status:
        | "backlog"
        | "todo"
        | "in_progress"
        | "in_review"
        | "done"
        | "cancelled"
        | "overdue"
      pm_task_type: "epic" | "story" | "task" | "bug" | "idea" | "milestone"
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
      app_role: ["admin", "user", "data_viewer", "sales_manager"],
      employee_doc_type: ["address_proof", "id_proof", "other"],
      pm_member_role: [
        "owner",
        "manager",
        "developer",
        "designer",
        "tester",
        "viewer",
      ],
      pm_priority: ["critical", "high", "medium", "low"],
      pm_project_status: [
        "planning",
        "active",
        "on_hold",
        "completed",
        "cancelled",
      ],
      pm_sprint_status: ["planning", "active", "completed", "cancelled"],
      pm_task_status: [
        "backlog",
        "todo",
        "in_progress",
        "in_review",
        "done",
        "cancelled",
        "overdue",
      ],
      pm_task_type: ["epic", "story", "task", "bug", "idea", "milestone"],
    },
  },
} as const
