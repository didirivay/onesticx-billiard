export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type TableCategory = "indoor" | "outdoor" | "high_table";
export type TableStatus = "available" | "occupied" | "booked";
export type BookingStatus =
  | "pending"
  | "confirmed"
  | "rejected"
  | "cancelled"
  | "completed";
export type BillingMode = "open_table" | "package";
export type PaymentMethod = "tunai" | "qris" | "transfer";
export type SessionStatus = "active" | "completed";
export type FnbCategory = "makanan" | "minuman" | "snack";

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string;
          value: string;
        };
        Insert: {
          key: string;
          value: string;
        };
        Update: {
          key?: string;
          value?: string;
        };
        Relationships: [];
      };
      bookings: {
        Row: {
          booking_code: string;
          booking_date: string;
          created_at: string;
          customer_name: string;
          duration_hours: number;
          id: string;
          start_time: string;
          status: string;
          table_id: string;
          total_price: number;
          whatsapp_number: string;
        };
        Insert: {
          booking_code: string;
          booking_date: string;
          created_at?: string;
          customer_name: string;
          duration_hours: number;
          id?: string;
          start_time: string;
          status?: string;
          table_id: string;
          total_price: number;
          whatsapp_number: string;
        };
        Update: {
          booking_code?: string;
          booking_date?: string;
          created_at?: string;
          customer_name?: string;
          duration_hours?: number;
          id?: string;
          start_time?: string;
          status?: string;
          table_id?: string;
          total_price?: number;
          whatsapp_number?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bookings_table_id_fkey";
            columns: ["table_id"];
            isOneToOne: false;
            referencedRelation: "tables";
            referencedColumns: ["id"];
          },
        ];
      };
      fnb_items: {
        Row: {
          category: string;
          id: string;
          is_available: boolean;
          name: string;
          price: number;
        };
        Insert: {
          category: string;
          id?: string;
          is_available?: boolean;
          name: string;
          price: number;
        };
        Update: {
          category?: string;
          id?: string;
          is_available?: boolean;
          name?: string;
          price?: number;
        };
        Relationships: [];
      };
      session_fnb_orders: {
        Row: {
          created_at: string;
          fnb_item_id: string | null;
          id: string;
          item_name: string;
          quantity: number;
          session_id: string;
          subtotal: number;
          unit_price: number;
        };
        Insert: {
          created_at?: string;
          fnb_item_id?: string | null;
          id?: string;
          item_name: string;
          quantity: number;
          session_id: string;
          subtotal: number;
          unit_price: number;
        };
        Update: {
          created_at?: string;
          fnb_item_id?: string | null;
          id?: string;
          item_name?: string;
          quantity?: number;
          session_id?: string;
          subtotal?: number;
          unit_price?: number;
        };
        Relationships: [
          {
            foreignKeyName: "session_fnb_orders_fnb_item_id_fkey";
            columns: ["fnb_item_id"];
            isOneToOne: false;
            referencedRelation: "fnb_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "session_fnb_orders_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      sessions: {
        Row: {
          billing_mode: string;
          booking_id: string | null;
          created_at: string;
          customer_name: string;
          discount_amount: number;
          duration_minutes: number;
          end_time: string | null;
          fnb_cost: number;
          id: string;
          payment_method: string | null;
          start_time: string;
          status: string;
          table_cost: number;
          table_id: string;
          total_amount: number;
        };
        Insert: {
          billing_mode: string;
          booking_id?: string | null;
          created_at?: string;
          customer_name: string;
          discount_amount?: number;
          duration_minutes?: number;
          end_time?: string | null;
          fnb_cost?: number;
          id?: string;
          payment_method?: string | null;
          start_time?: string;
          status?: string;
          table_cost?: number;
          table_id: string;
          total_amount?: number;
        };
        Update: {
          billing_mode?: string;
          booking_id?: string | null;
          created_at?: string;
          customer_name?: string;
          discount_amount?: number;
          duration_minutes?: number;
          end_time?: string | null;
          fnb_cost?: number;
          id?: string;
          payment_method?: string | null;
          start_time?: string;
          status?: string;
          table_cost?: number;
          table_id?: string;
          total_amount?: number;
        };
        Relationships: [
          {
            foreignKeyName: "sessions_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sessions_table_id_fkey";
            columns: ["table_id"];
            isOneToOne: false;
            referencedRelation: "tables";
            referencedColumns: ["id"];
          },
        ];
      };
      tables: {
        Row: {
          category: string;
          hourly_rate: number;
          id: string;
          minute_rate: number;
          name: string;
          sort_order: number;
          status: string;
        };
        Insert: {
          category: string;
          hourly_rate: number;
          id?: string;
          minute_rate: number;
          name: string;
          sort_order?: number;
          status?: string;
        };
        Update: {
          category?: string;
          hourly_rate?: number;
          id?: string;
          minute_rate?: number;
          name?: string;
          sort_order?: number;
          status?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

export interface BilliardTable {
  id: string;
  name: string;
  category: TableCategory;
  hourly_rate: number;
  minute_rate: number;
  status: TableStatus;
  sort_order: number;
}

export interface PublicBookingSlot {
  id: string;
  table_id: string;
  customer_label: string;
  booking_date: string;
  start_time: string;
  duration_hours: number;
  status: BookingStatus;
}

export interface BookingDetail {
  id: string;
  booking_code: string;
  table_id: string;
  customer_name: string;
  whatsapp_number: string;
  booking_date: string;
  start_time: string;
  duration_hours: number;
  total_price: number;
  status: BookingStatus;
  created_at: string;
  table: {
    id: string;
    name: string;
    category: TableCategory;
    hourly_rate: number;
  };
}

export interface PublicPaymentSettings {
  whatsapp_kasir: string;
  bank_name: string;
  bank_account: string;
  bank_holder: string;
}
