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
          used_at?: string | null
          used_by?: string | null
          value?: number
        }
        Relationships: []
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
      delivery_requests: {
        Row: {
          created_at: string
          credit_cost: number
          customer_name: string | null
          customer_phone: string | null
          delivery_address: string | null
          driver_fee: number
          driver_id: string | null
          group_id: string | null
          id: string
          notes: string | null
          pickup_address: string | null
          restaurant_id: string | null
          status: string
          store_owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credit_cost?: number
          customer_name?: string | null
          customer_phone?: string | null
          delivery_address?: string | null
          driver_fee?: number
          driver_id?: string | null
          group_id?: string | null
          id?: string
          notes?: string | null
          pickup_address?: string | null
          restaurant_id?: string | null
          status?: string
          store_owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credit_cost?: number
          customer_name?: string | null
          customer_phone?: string | null
          delivery_address?: string | null
          driver_fee?: number
          driver_id?: string | null
          group_id?: string | null
          id?: string
          notes?: string | null
          pickup_address?: string | null
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
          event_type: string
          id: string
          onesignal_notification_id: string | null
          pedido_id: string | null
          platform: string | null
          recipients_found: number
          recipients_requested: number
          request_id: string | null
          response_body_sanitized: string | null
          response_status: number | null
        }
        Insert: {
          created_at?: string | null
          error_code?: string | null
          event_type: string
          id?: string
          onesignal_notification_id?: string | null
          pedido_id?: string | null
          platform?: string | null
          recipients_found?: number
          recipients_requested?: number
          request_id?: string | null
          response_body_sanitized?: string | null
          response_status?: number | null
        }
        Update: {
          created_at?: string | null
          error_code?: string | null
          event_type?: string
          id?: string
          onesignal_notification_id?: string | null
          pedido_id?: string | null
          platform?: string | null
          recipients_found?: number
          recipients_requested?: number
          request_id?: string | null
          response_body_sanitized?: string | null
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
          next_attempt_at: string | null
          onesignal_notification_id: string | null
          pedido_id: string | null
          processed_at: string | null
          recipients_count: number
          status: string
        }
        Insert: {
          attempts?: number
          created_at?: string | null
          event_key: string
          event_type: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string | null
          onesignal_notification_id?: string | null
          pedido_id?: string | null
          processed_at?: string | null
          recipients_count?: number
          status?: string
        }
        Update: {
          attempts?: number
          created_at?: string | null
          event_key?: string
          event_type?: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string | null
          onesignal_notification_id?: string | null
          pedido_id?: string | null
          processed_at?: string | null
          recipients_count?: number
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
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          active: boolean
          app_version: string | null
          created_at: string | null
          device_name: string | null
          id: string
          last_seen_at: string | null
          onesignal_external_id: string | null
          onesignal_subscription_id: string
          permission_status: string
          platform: string
          profile_type: string
          sdk_version: string | null
          subscription_status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          active?: boolean
          app_version?: string | null
          created_at?: string | null
          device_name?: string | null
          id?: string
          last_seen_at?: string | null
          onesignal_external_id?: string | null
          onesignal_subscription_id: string
          permission_status?: string
          platform: string
          profile_type?: string
          sdk_version?: string | null
          subscription_status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          active?: boolean
          app_version?: string | null
          created_at?: string | null
          device_name?: string | null
          id?: string
          last_seen_at?: string | null
          onesignal_external_id?: string | null
          onesignal_subscription_id?: string
          permission_status?: string
          platform?: string
          profile_type?: string
          sdk_version?: string | null
          subscription_status?: string
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
      withdrawal_requests: {
        Row: {
          amount: number
          created_at: string
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
      accept_delivery_request: { Args: { p_request_id: string }; Returns: Json }
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
      cancel_delivery_request: {
        Args: { p_request_id: string }
        Returns: boolean
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
      get_assigned_driver_info: {
        Args: { p_request_id: string }
        Returns: {
          driver_code: string
          full_name: string
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
      app_role: ["admin", "moderator", "user", "driver", "store_owner"],
    },
  },
} as const
