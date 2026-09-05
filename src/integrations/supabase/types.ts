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
      admin_direct_messages: {
        Row: {
          created_at: string
          id: string
          message: string
          read_at: string | null
          recipient_id: string
          sender_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          read_at?: string | null
          recipient_id: string
          sender_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          read_at?: string | null
          recipient_id?: string
          sender_id?: string
        }
        Relationships: []
      }
      admin_impersonation_logs: {
        Row: {
          admin_user_id: string
          created_at: string
          id: string
          target_email: string | null
          target_role: string | null
          target_user_id: string
        }
        Insert: {
          admin_user_id: string
          created_at?: string
          id?: string
          target_email?: string | null
          target_role?: string | null
          target_user_id: string
        }
        Update: {
          admin_user_id?: string
          created_at?: string
          id?: string
          target_email?: string | null
          target_role?: string | null
          target_user_id?: string
        }
        Relationships: []
      }
      admin_requests: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          phone: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id?: string
          phone?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          phone?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          icon: string
          id: string
          image: string | null
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          icon?: string
          id?: string
          image?: string | null
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          icon?: string
          id?: string
          image?: string | null
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          created_at: string
          delivery_request_id: string
          id: string
          message: string
          sender_id: string
        }
        Insert: {
          created_at?: string
          delivery_request_id: string
          id?: string
          message: string
          sender_id: string
        }
        Update: {
          created_at?: string
          delivery_request_id?: string
          id?: string
          message?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_delivery_request_id_fkey"
            columns: ["delivery_request_id"]
            isOneToOne: false
            referencedRelation: "delivery_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_codes: {
        Row: {
          assigned_to_user_id: string | null
          code: string
          created_at: string
          id: string
          is_used: boolean
          restaurant_id: string | null
          used_at: string | null
          used_by: string | null
          value: number
        }
        Insert: {
          assigned_to_user_id?: string | null
          code: string
          created_at?: string
          id?: string
          is_used?: boolean
          restaurant_id?: string | null
          used_at?: string | null
          used_by?: string | null
          value?: number
        }
        Update: {
          assigned_to_user_id?: string | null
          code?: string
          created_at?: string
          id?: string
          is_used?: boolean
          restaurant_id?: string | null
          used_at?: string | null
          used_by?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "credit_codes_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_codes_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_deletion_logs: {
        Row: {
          admin_id: string
          created_at: string
          deleted_name: string | null
          deleted_phone: string | null
          deleted_user_id: string
          id: string
          reason: string | null
        }
        Insert: {
          admin_id: string
          created_at?: string
          deleted_name?: string | null
          deleted_phone?: string | null
          deleted_user_id: string
          id?: string
          reason?: string | null
        }
        Update: {
          admin_id?: string
          created_at?: string
          deleted_name?: string | null
          deleted_phone?: string | null
          deleted_user_id?: string
          id?: string
          reason?: string | null
        }
        Relationships: []
      }
      delivery_config: {
        Row: {
          app_fee_per_delivery: number
          base_fee: number
          credit_cost_per_call: number
          dynamic_fee_per_km: number | null
          dynamic_pricing_enabled: boolean | null
          early_withdrawal_fee_percent: number
          fee_per_km: number
          id: string
          max_km: number
          min_km: number
          payment_day: number
          promo_credit_percent: number
          recharge_url: string | null
          round_km_up: boolean
          updated_at: string
          whatsapp_number: string | null
          withdrawal_fixed_fee: number
        }
        Insert: {
          app_fee_per_delivery?: number
          base_fee?: number
          credit_cost_per_call?: number
          dynamic_fee_per_km?: number | null
          dynamic_pricing_enabled?: boolean | null
          early_withdrawal_fee_percent?: number
          fee_per_km?: number
          id?: string
          max_km?: number
          min_km?: number
          payment_day?: number
          promo_credit_percent?: number
          recharge_url?: string | null
          round_km_up?: boolean
          updated_at?: string
          whatsapp_number?: string | null
          withdrawal_fixed_fee?: number
        }
        Update: {
          app_fee_per_delivery?: number
          base_fee?: number
          credit_cost_per_call?: number
          dynamic_fee_per_km?: number | null
          dynamic_pricing_enabled?: boolean | null
          early_withdrawal_fee_percent?: number
          fee_per_km?: number
          id?: string
          max_km?: number
          min_km?: number
          payment_day?: number
          promo_credit_percent?: number
          recharge_url?: string | null
          round_km_up?: boolean
          updated_at?: string
          whatsapp_number?: string | null
          withdrawal_fixed_fee?: number
        }
        Relationships: []
      }
      delivery_groups: {
        Row: {
          created_at: string
          driver_id: string | null
          id: string
          notes: string | null
          pickup_address: string
          restaurant_id: string | null
          status: string
          stops_count: number
          store_owner_id: string
          total_cost: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          driver_id?: string | null
          id?: string
          notes?: string | null
          pickup_address: string
          restaurant_id?: string | null
          status?: string
          stops_count?: number
          store_owner_id: string
          total_cost?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          driver_id?: string | null
          id?: string
          notes?: string | null
          pickup_address?: string
          restaurant_id?: string | null
          status?: string
          stops_count?: number
          store_owner_id?: string
          total_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_groups_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_groups_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_notification_dispatches: {
        Row: {
          completed_at: string | null
          created_at: string
          dispatch_version: number
          drivers_found: number | null
          error_code: string | null
          error_message: string | null
          external_ids_sent: string[] | null
          id: string
          idempotency_key: string
          onesignal_notification_id: string | null
          pedido_id: string
          recipients: number | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          dispatch_version?: number
          drivers_found?: number | null
          error_code?: string | null
          error_message?: string | null
          external_ids_sent?: string[] | null
          id?: string
          idempotency_key: string
          onesignal_notification_id?: string | null
          pedido_id: string
          recipients?: number | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          dispatch_version?: number
          drivers_found?: number | null
          error_code?: string | null
          error_message?: string | null
          external_ids_sent?: string[] | null
          id?: string
          idempotency_key?: string
          onesignal_notification_id?: string | null
          pedido_id?: string
          recipients?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_notification_dispatches_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "delivery_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_requests: {
        Row: {
          accepted_at: string | null
          created_at: string
          credit_cost: number
          customer_name: string | null
          customer_phone: string | null
          delivery_address: string | null
          delivery_lat: number | null
          delivery_lng: number | null
          delivery_price: number | null
          distance_km: number | null
          driver_fee: number
          driver_id: string | null
          geocode_confidence: string | null
          geocode_source: string | null
          group_id: string | null
          hidden_for_store: boolean | null
          id: string
          notes: string | null
          pickup_address: string | null
          pickup_lat: number | null
          pickup_lng: number | null
          restaurant_id: string | null
          status: string
          store_owner_id: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          credit_cost?: number
          customer_name?: string | null
          customer_phone?: string | null
          delivery_address?: string | null
          delivery_lat?: number | null
          delivery_lng?: number | null
          delivery_price?: number | null
          distance_km?: number | null
          driver_fee?: number
          driver_id?: string | null
          geocode_confidence?: string | null
          geocode_source?: string | null
          group_id?: string | null
          hidden_for_store?: boolean | null
          id?: string
          notes?: string | null
          pickup_address?: string | null
          pickup_lat?: number | null
          pickup_lng?: number | null
          restaurant_id?: string | null
          status?: string
          store_owner_id: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          credit_cost?: number
          customer_name?: string | null
          customer_phone?: string | null
          delivery_address?: string | null
          delivery_lat?: number | null
          delivery_lng?: number | null
          delivery_price?: number | null
          distance_km?: number | null
          driver_fee?: number
          driver_id?: string | null
          geocode_confidence?: string | null
          geocode_source?: string | null
          group_id?: string | null
          hidden_for_store?: boolean | null
          id?: string
          notes?: string | null
          pickup_address?: string | null
          pickup_lat?: number | null
          pickup_lng?: number | null
          restaurant_id?: string | null
          status?: string
          store_owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_requests_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "delivery_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_requests_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_requests_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_earnings: {
        Row: {
          amount: number
          created_at: string
          delivery_request_id: string | null
          driver_id: string
          id: string
          status: string
        }
        Insert: {
          amount?: number
          created_at?: string
          delivery_request_id?: string | null
          driver_id: string
          id?: string
          status?: string
        }
        Update: {
          amount?: number
          created_at?: string
          delivery_request_id?: string | null
          driver_id?: string
          id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_earnings_delivery_request_id_fkey"
            columns: ["delivery_request_id"]
            isOneToOne: false
            referencedRelation: "delivery_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_locations: {
        Row: {
          accuracy: number | null
          driver_id: string
          heading: number | null
          id: string
          latitude: number
          longitude: number
          speed: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          accuracy?: number | null
          driver_id: string
          heading?: number | null
          id?: string
          latitude: number
          longitude: number
          speed?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          accuracy?: number | null
          driver_id?: string
          heading?: number | null
          id?: string
          latitude?: number
          longitude?: number
          speed?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      driver_push_devices: {
        Row: {
          active: boolean
          created_at: string
          driver_id: string
          external_id: string
          id: string
          last_error: string | null
          last_seen_at: string | null
          onesignal_id: string | null
          permission_status: string
          platform: string
          subscription_id: string | null
          subscription_status: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          driver_id: string
          external_id: string
          id?: string
          last_error?: string | null
          last_seen_at?: string | null
          onesignal_id?: string | null
          permission_status?: string
          platform: string
          subscription_id?: string | null
          subscription_status?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          driver_id?: string
          external_id?: string
          id?: string
          last_error?: string | null
          last_seen_at?: string | null
          onesignal_id?: string | null
          permission_status?: string
          platform?: string
          subscription_id?: string | null
          subscription_status?: string
          updated_at?: string
        }
        Relationships: []
      }
      drivers: {
        Row: {
          approval_status: string
          cpf: string | null
          created_at: string
          driver_code: string | null
          full_name: string
          id: string
          is_active: boolean
          is_online: boolean
          last_seen_at: string | null
          phone: string
          photo_url: string | null
          pix_key: string | null
          pix_key_type: string | null
          updated_at: string
          user_id: string
          vehicle_plate: string | null
          vehicle_type: string
          zone_description: string | null
          zone_lat: number | null
          zone_lng: number | null
          zone_radius_km: number | null
        }
        Insert: {
          approval_status?: string
          cpf?: string | null
          created_at?: string
          driver_code?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          is_online?: boolean
          last_seen_at?: string | null
          phone: string
          photo_url?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          updated_at?: string
          user_id: string
          vehicle_plate?: string | null
          vehicle_type?: string
          zone_description?: string | null
          zone_lat?: number | null
          zone_lng?: number | null
          zone_radius_km?: number | null
        }
        Update: {
          approval_status?: string
          cpf?: string | null
          created_at?: string
          driver_code?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          is_online?: boolean
          last_seen_at?: string | null
          phone?: string
          photo_url?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          updated_at?: string
          user_id?: string
          vehicle_plate?: string | null
          vehicle_type?: string
          zone_description?: string | null
          zone_lat?: number | null
          zone_lng?: number | null
          zone_radius_km?: number | null
        }
        Relationships: []
      }
      financial_cleanup_logs: {
        Row: {
          admin_user_id: string
          created_at: string
          deleted_delivered_orders: number
          deleted_delivered_requests: number
          deleted_earnings: number
          deleted_withdrawals: number
          from_date: string | null
          id: string
          reason: string | null
          to_date: string | null
        }
        Insert: {
          admin_user_id: string
          created_at?: string
          deleted_delivered_orders?: number
          deleted_delivered_requests?: number
          deleted_earnings?: number
          deleted_withdrawals?: number
          from_date?: string | null
          id?: string
          reason?: string | null
          to_date?: string | null
        }
        Update: {
          admin_user_id?: string
          created_at?: string
          deleted_delivered_orders?: number
          deleted_delivered_requests?: number
          deleted_earnings?: number
          deleted_withdrawals?: number
          from_date?: string | null
          id?: string
          reason?: string | null
          to_date?: string | null
        }
        Relationships: []
      }
      location_reports: {
        Row: {
          created_at: string
          description: string | null
          id: string
          latitude: number
          longitude: number
          reported_address: string | null
          reporter_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          latitude: number
          longitude: number
          reported_address?: string | null
          reporter_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          latitude?: number
          longitude?: number
          reported_address?: string | null
          reporter_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_delivery_logs: {
        Row: {
          created_at: string | null
          error_code: string | null
          event_type: string | null
          id: string
          onesignal_notification_id: string | null
          pedido_id: string | null
          platform: string | null
          recipients_count: number | null
          response_body_sanitized: Json | null
          response_status: number | null
        }
        Insert: {
          created_at?: string | null
          error_code?: string | null
          event_type?: string | null
          id?: string
          onesignal_notification_id?: string | null
          pedido_id?: string | null
          platform?: string | null
          recipients_count?: number | null
          response_body_sanitized?: Json | null
          response_status?: number | null
        }
        Update: {
          created_at?: string | null
          error_code?: string | null
          event_type?: string | null
          id?: string
          onesignal_notification_id?: string | null
          pedido_id?: string | null
          platform?: string | null
          recipients_count?: number | null
          response_body_sanitized?: Json | null
          response_status?: number | null
        }
        Relationships: []
      }
      notification_jobs: {
        Row: {
          attempts: number
          created_at: string | null
          event_key: string
          event_type: string
          id: string
          last_error: string | null
          onesignal_notification_id: string | null
          pedido_id: string
          processed_at: string | null
          recipients_count: number | null
          status: string
        }
        Insert: {
          attempts?: number
          created_at?: string | null
          event_key: string
          event_type: string
          id?: string
          last_error?: string | null
          onesignal_notification_id?: string | null
          pedido_id: string
          processed_at?: string | null
          recipients_count?: number | null
          status?: string
        }
        Update: {
          attempts?: number
          created_at?: string | null
          event_key?: string
          event_type?: string
          id?: string
          last_error?: string | null
          onesignal_notification_id?: string | null
          pedido_id?: string
          processed_at?: string | null
          recipients_count?: number | null
          status?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          address: string | null
          created_at: string
          delivery_fee: number
          delivery_request_id: string | null
          id: string
          items: Json
          notes: string | null
          payment_method: string | null
          restaurant_id: string
          status: string
          subtotal: number
          total: number
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          delivery_fee?: number
          delivery_request_id?: string | null
          id?: string
          items?: Json
          notes?: string | null
          payment_method?: string | null
          restaurant_id: string
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          created_at?: string
          delivery_fee?: number
          delivery_request_id?: string | null
          id?: string
          items?: Json
          notes?: string | null
          payment_method?: string | null
          restaurant_id?: string
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_delivery_request_id_fkey"
            columns: ["delivery_request_id"]
            isOneToOne: false
            referencedRelation: "delivery_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      password_reset_logs: {
        Row: {
          action: string
          admin_user_id: string
          created_at: string
          failure_count: number | null
          id: string
          success_count: number | null
          target_user_email: string | null
          target_user_id: string | null
          total_users: number | null
        }
        Insert: {
          action?: string
          admin_user_id: string
          created_at?: string
          failure_count?: number | null
          id?: string
          success_count?: number | null
          target_user_email?: string | null
          target_user_id?: string | null
          total_users?: number | null
        }
        Update: {
          action?: string
          admin_user_id?: string
          created_at?: string
          failure_count?: number | null
          id?: string
          success_count?: number | null
          target_user_email?: string | null
          target_user_id?: string | null
          total_users?: number | null
        }
        Relationships: []
      }
      products: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          image: string | null
          is_available: boolean
          name: string
          price: number
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          image?: string | null
          is_available?: boolean
          name: string
          price?: number
          restaurant_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          image?: string | null
          is_available?: boolean
          name?: string
          price?: number
          restaurant_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          avatar_url: string | null
          city: string | null
          created_at: string
          full_name: string | null
          id: string
          neighborhood: string | null
          phone: string | null
          suspended_at: string | null
          suspended_by: string | null
          suspended_until: string | null
          suspension_reason: string | null
          terms_accepted: boolean
          terms_accepted_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          avatar_url?: string | null
          city?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          neighborhood?: string | null
          phone?: string | null
          suspended_at?: string | null
          suspended_by?: string | null
          suspended_until?: string | null
          suspension_reason?: string | null
          terms_accepted?: boolean
          terms_accepted_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          avatar_url?: string | null
          city?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          neighborhood?: string | null
          phone?: string | null
          suspended_at?: string | null
          suspended_by?: string | null
          suspended_until?: string | null
          suspension_reason?: string | null
          terms_accepted?: boolean
          terms_accepted_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      push_notification_tests: {
        Row: {
          admin_id: string
          confirmation_note: string | null
          confirmation_status: string | null
          confirmed_at: string | null
          created_at: string
          driver_id: string
          error_code: string | null
          error_message: string | null
          external_id: string | null
          id: string
          message: string
          onesignal_notification_id: string | null
          platforms: Json | null
          recipients: number | null
          status: string
          targeted_external_ids: number | null
          title: string
        }
        Insert: {
          admin_id: string
          confirmation_note?: string | null
          confirmation_status?: string | null
          confirmed_at?: string | null
          created_at?: string
          driver_id: string
          error_code?: string | null
          error_message?: string | null
          external_id?: string | null
          id?: string
          message: string
          onesignal_notification_id?: string | null
          platforms?: Json | null
          recipients?: number | null
          status: string
          targeted_external_ids?: number | null
          title: string
        }
        Update: {
          admin_id?: string
          confirmation_note?: string | null
          confirmation_status?: string | null
          confirmed_at?: string | null
          created_at?: string
          driver_id?: string
          error_code?: string | null
          error_message?: string | null
          external_id?: string | null
          id?: string
          message?: string
          onesignal_notification_id?: string | null
          platforms?: Json | null
          recipients?: number | null
          status?: string
          targeted_external_ids?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_notification_tests_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "assigned_driver_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_notification_tests_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          active: boolean
          app_version: string | null
          browser_name: string | null
          created_at: string | null
          device_model: string | null
          device_name: string | null
          device_type: string | null
          id: string
          last_login_at: string | null
          last_logout_at: string | null
          last_seen_at: string | null
          onesignal_external_id: string | null
          onesignal_id: string | null
          onesignal_subscription_id: string
          operating_system: string | null
          permission_status: string | null
          platform: string
          profile_type: string
          push_token: string | null
          sdk_version: string | null
          subscription_status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          active?: boolean
          app_version?: string | null
          browser_name?: string | null
          created_at?: string | null
          device_model?: string | null
          device_name?: string | null
          device_type?: string | null
          id?: string
          last_login_at?: string | null
          last_logout_at?: string | null
          last_seen_at?: string | null
          onesignal_external_id?: string | null
          onesignal_id?: string | null
          onesignal_subscription_id: string
          operating_system?: string | null
          permission_status?: string | null
          platform: string
          profile_type?: string
          push_token?: string | null
          sdk_version?: string | null
          subscription_status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          active?: boolean
          app_version?: string | null
          browser_name?: string | null
          created_at?: string | null
          device_model?: string | null
          device_name?: string | null
          device_type?: string | null
          id?: string
          last_login_at?: string | null
          last_logout_at?: string | null
          last_seen_at?: string | null
          onesignal_external_id?: string | null
          onesignal_id?: string | null
          onesignal_subscription_id?: string
          operating_system?: string | null
          permission_status?: string | null
          platform?: string
          profile_type?: string
          push_token?: string | null
          sdk_version?: string | null
          subscription_status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      restaurants: {
        Row: {
          address: string | null
          category_id: string | null
          category_name: string
          created_at: string
          delivery_fee: number
          delivery_time: string
          distance: string
          history_retention_days: number | null
          id: string
          image: string | null
          is_featured: boolean
          is_open: boolean
          latitude: number | null
          logo: string | null
          longitude: number | null
          min_order: number
          name: string
          owner_id: string | null
          rating: number
          updated_at: string
        }
        Insert: {
          address?: string | null
          category_id?: string | null
          category_name?: string
          created_at?: string
          delivery_fee?: number
          delivery_time?: string
          distance?: string
          history_retention_days?: number | null
          id?: string
          image?: string | null
          is_featured?: boolean
          is_open?: boolean
          latitude?: number | null
          logo?: string | null
          longitude?: number | null
          min_order?: number
          name: string
          owner_id?: string | null
          rating?: number
          updated_at?: string
        }
        Update: {
          address?: string | null
          category_id?: string | null
          category_name?: string
          created_at?: string
          delivery_fee?: number
          delivery_time?: string
          distance?: string
          history_retention_days?: number | null
          id?: string
          image?: string | null
          is_featured?: boolean
          is_open?: boolean
          latitude?: number | null
          logo?: string | null
          longitude?: number | null
          min_order?: number
          name?: string
          owner_id?: string | null
          rating?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurants_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      site_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      store_credits: {
        Row: {
          balance: number
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      store_driver_favorites: {
        Row: {
          created_at: string
          driver_id: string
          id: string
          is_default: boolean
          restaurant_id: string
        }
        Insert: {
          created_at?: string
          driver_id: string
          id?: string
          is_default?: boolean
          restaurant_id: string
        }
        Update: {
          created_at?: string
          driver_id?: string
          id?: string
          is_default?: boolean
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_driver_favorites_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "assigned_driver_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_driver_favorites_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_driver_favorites_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_driver_favorites_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      store_recharges: {
        Row: {
          admin_id: string | null
          amount_paid: number
          bonus_amount: number
          created_at: string
          credit_code_id: string | null
          id: string
          restaurant_id: string | null
          source: string
          status: string
          store_owner_id: string
          total_credited: number
          updated_at: string
        }
        Insert: {
          admin_id?: string | null
          amount_paid?: number
          bonus_amount?: number
          created_at?: string
          credit_code_id?: string | null
          id?: string
          restaurant_id?: string | null
          source: string
          status?: string
          store_owner_id: string
          total_credited?: number
          updated_at?: string
        }
        Update: {
          admin_id?: string | null
          amount_paid?: number
          bonus_amount?: number
          created_at?: string
          credit_code_id?: string | null
          id?: string
          restaurant_id?: string | null
          source?: string
          status?: string
          store_owner_id?: string
          total_credited?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_recharges_credit_code_id_fkey"
            columns: ["credit_code_id"]
            isOneToOne: false
            referencedRelation: "credit_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_recharges_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_recharges_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants_public"
            referencedColumns: ["id"]
          },
        ]
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
      user_suspension_logs: {
        Row: {
          action: string
          admin_user_id: string
          created_at: string
          id: string
          reason: string | null
          suspended_until: string | null
          target_user_id: string
        }
        Insert: {
          action: string
          admin_user_id: string
          created_at?: string
          id?: string
          reason?: string | null
          suspended_until?: string | null
          target_user_id: string
        }
        Update: {
          action?: string
          admin_user_id?: string
          created_at?: string
          id?: string
          reason?: string | null
          suspended_until?: string | null
          target_user_id?: string
        }
        Relationships: []
      }
      wallet_adjustments: {
        Row: {
          adjustment_type: string
          admin_id: string
          amount: number
          created_at: string
          driver_id: string
          final_balance: number
          id: string
          internal_notes: string | null
          is_reversed: boolean
          previous_balance: number
          reason: string
          reversal_reason: string | null
          reversed_at: string | null
          reversed_by: string | null
        }
        Insert: {
          adjustment_type: string
          admin_id: string
          amount: number
          created_at?: string
          driver_id: string
          final_balance: number
          id?: string
          internal_notes?: string | null
          is_reversed?: boolean
          previous_balance: number
          reason: string
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
        }
        Update: {
          adjustment_type?: string
          admin_id?: string
          amount?: number
          created_at?: string
          driver_id?: string
          final_balance?: number
          id?: string
          internal_notes?: string | null
          is_reversed?: boolean
          previous_balance?: number
          reason?: string
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wallet_adjustments_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "assigned_driver_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_adjustments_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      withdrawal_requests: {
        Row: {
          amount: number
          created_at: string
          decided_by: string | null
          decision_reason: string | null
          driver_id: string
          driver_user_id: string
          fee_amount: number
          fee_percent: number
          id: string
          net_amount: number
          pix_key: string | null
          pix_key_type: string | null
          processed_at: string | null
          status: string
        }
        Insert: {
          amount: number
          created_at?: string
          decided_by?: string | null
          decision_reason?: string | null
          driver_id: string
          driver_user_id: string
          fee_amount?: number
          fee_percent?: number
          id?: string
          net_amount?: number
          pix_key?: string | null
          pix_key_type?: string | null
          processed_at?: string | null
          status?: string
        }
        Update: {
          amount?: number
          created_at?: string
          decided_by?: string | null
          decision_reason?: string | null
          driver_id?: string
          driver_user_id?: string
          fee_amount?: number
          fee_percent?: number
          id?: string
          net_amount?: number
          pix_key?: string | null
          pix_key_type?: string | null
          processed_at?: string | null
          status?: string
        }
        Relationships: []
      }
    }
    Views: {
      assigned_driver_details: {
        Row: {
          full_name: string | null
          id: string | null
          is_active: boolean | null
          phone: string | null
          photo_url: string | null
          vehicle_plate: string | null
          vehicle_type: string | null
        }
        Insert: {
          full_name?: string | null
          id?: string | null
          is_active?: boolean | null
          phone?: string | null
          photo_url?: string | null
          vehicle_plate?: string | null
          vehicle_type?: string | null
        }
        Update: {
          full_name?: string | null
          id?: string | null
          is_active?: boolean | null
          phone?: string | null
          photo_url?: string | null
          vehicle_plate?: string | null
          vehicle_type?: string | null
        }
        Relationships: []
      }
      restaurants_public: {
        Row: {
          address: string | null
          category_id: string | null
          category_name: string | null
          created_at: string | null
          delivery_fee: number | null
          delivery_time: string | null
          distance: string | null
          id: string | null
          image: string | null
          is_featured: boolean | null
          is_open: boolean | null
          latitude: number | null
          logo: string | null
          longitude: number | null
          min_order: number | null
          name: string | null
          rating: number | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          category_id?: string | null
          category_name?: string | null
          created_at?: string | null
          delivery_fee?: number | null
          delivery_time?: string | null
          distance?: string | null
          id?: string | null
          image?: string | null
          is_featured?: boolean | null
          is_open?: boolean | null
          latitude?: number | null
          logo?: string | null
          longitude?: number | null
          min_order?: number | null
          name?: string | null
          rating?: number | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          category_id?: string | null
          category_name?: string | null
          created_at?: string | null
          delivery_fee?: number | null
          delivery_time?: string | null
          distance?: string | null
          id?: string | null
          image?: string | null
          is_featured?: boolean | null
          is_open?: boolean | null
          latitude?: number | null
          logo?: string | null
          longitude?: number | null
          min_order?: number | null
          name?: string | null
          rating?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurants_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      store_config: {
        Row: {
          base_fee: number | null
          fee_per_km: number | null
          id: string | null
          max_km: number | null
          min_km: number | null
          round_km_up: boolean | null
          updated_at: string | null
        }
        Insert: {
          base_fee?: number | null
          fee_per_km?: number | null
          id?: string | null
          max_km?: number | null
          min_km?: number | null
          round_km_up?: boolean | null
          updated_at?: string | null
        }
        Update: {
          base_fee?: number | null
          fee_per_km?: number | null
          id?: string | null
          max_km?: number | null
          min_km?: number | null
          round_km_up?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_delivery_group: { Args: { p_group_id: string }; Returns: boolean }
      accept_delivery_request:
        | {
            Args: { p_motorista_id: string; p_pedido_id: string }
            Returns: Json
          }
        | { Args: { p_request_id: string }; Returns: Json }
      aceitar_entrega_v1: {
        Args: { p_motorista_id: string; p_pedido_id: string }
        Returns: Json
      }
      admin_adjust_driver_wallet: {
        Args: {
          p_adjustment_type: string
          p_amount: number
          p_driver_id: string
          p_internal_notes?: string
          p_reason: string
        }
        Returns: string
      }
      admin_cleanup_financials: {
        Args: {
          p_from?: string
          p_include_delivered_orders?: boolean
          p_include_delivered_requests?: boolean
          p_include_earnings?: boolean
          p_include_withdrawals?: boolean
          p_reason?: string
          p_to?: string
        }
        Returns: Json
      }
      admin_decide_withdrawal: {
        Args: { p_decision: string; p_reason?: string; p_request_id: string }
        Returns: Json
      }
      admin_list_store_owners: {
        Args: never
        Returns: {
          email: string
          full_name: string
          user_id: string
        }[]
      }
      admin_recharge_store: {
        Args: {
          p_amount: number
          p_apply_promo?: boolean
          p_store_owner_id: string
        }
        Returns: number
      }
      admin_reverse_wallet_adjustment: {
        Args: { p_adjustment_id: string; p_reversal_reason: string }
        Returns: boolean
      }
      admin_suspend_user: {
        Args: { p_reason: string; p_target_user_id: string; p_until: string }
        Returns: boolean
      }
      admin_unsuspend_user: {
        Args: { p_target_user_id: string }
        Returns: boolean
      }
      admin_update_delivery_address: {
        Args: {
          p_delivery_address: string
          p_distance_km: number
          p_pickup_address: string
          p_request_id: string
        }
        Returns: Json
      }
      cancel_delivery_group: { Args: { p_group_id: string }; Returns: boolean }
      cancel_delivery_request: {
        Args: { p_request_id: string }
        Returns: boolean
      }
      claim_push_subscription: {
        Args: {
          p_active?: boolean
          p_browser_name?: string
          p_device_model?: string
          p_device_name?: string
          p_onesignal_id?: string
          p_operating_system?: string
          p_permission_status?: string
          p_platform?: string
          p_profile_type?: string
          p_push_token?: string
          p_sdk_version?: string
          p_subscription_id: string
          p_subscription_status?: string
        }
        Returns: string
      }
      complete_delivery: { Args: { p_request_id: string }; Returns: string }
      complete_group_stop: { Args: { p_request_id: string }; Returns: boolean }
      create_delivery_group: {
        Args: {
          p_group_notes?: string
          p_pickup_address: string
          p_preferred_driver_id?: string
          p_restaurant_id: string
          p_stops: Json
        }
        Returns: string
      }
      deduct_credits_for_delivery: {
        Args: {
          p_delivery_address: string
          p_distance_km?: number
          p_notes?: string
          p_pickup_address: string
          p_preferred_driver_id?: string
          p_restaurant_id?: string
        }
        Returns: string
      }
      delete_all_chat_messages: { Args: never; Returns: undefined }
      get_delivery_driver_info: {
        Args: { p_request_id: string }
        Returns: {
          driver_code: string
          full_name: string
          id: string
          phone: string
          photo_url: string
          user_id: string
          vehicle_plate: string
          vehicle_type: string
        }[]
      }
      get_my_suspension: {
        Args: never
        Returns: {
          suspended_until: string
          suspension_reason: string
        }[]
      }
      get_public_delivery_config: {
        Args: never
        Returns: {
          base_fee: number
          dynamic_fee_per_km: number
          dynamic_pricing_enabled: boolean
          early_withdrawal_fee_percent: number
          fee_per_km: number
          id: string
          max_km: number
          min_km: number
          payment_day: number
          promo_credit_percent: number
          recharge_url: string
          round_km_up: boolean
          updated_at: string
          whatsapp_number: string
          withdrawal_fixed_fee: number
        }[]
      }
      get_radar_drivers: {
        Args: never
        Returns: {
          driver_code: string
          full_name: string
          id: string
          is_active: boolean
          user_id: string
          vehicle_plate: string
          vehicle_type: string
        }[]
      }
      get_support_admin_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_store_owner_of_driver: {
        Args: { driver_id_to_check: string }
        Returns: boolean
      }
      pickup_delivery_group: { Args: { p_group_id: string }; Returns: boolean }
      place_order: {
        Args: {
          p_address: string
          p_items: Json
          p_notes?: string
          p_payment_method: string
          p_restaurant_id: string
        }
        Returns: string
      }
      reassign_delivery_driver: {
        Args: { p_driver_user_id: string; p_request_id: string }
        Returns: boolean
      }
      redeem_credit_code: { Args: { p_code: string }; Returns: boolean }
      register_push_device: {
        Args: {
          p_browser?: string
          p_external_id?: string
          p_is_standalone?: boolean
          p_opted_in?: boolean
          p_permission?: string
          p_platform?: string
          p_subscription_id: string
        }
        Returns: string
      }
      release_stale_directed_requests: { Args: never; Returns: number }
      request_withdrawal: { Args: never; Returns: boolean }
      set_default_favorite_driver: {
        Args: { p_favorite_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user" | "driver" | "store_owner"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "moderator", "user", "driver", "store_owner"],
    },
  },
} as const
