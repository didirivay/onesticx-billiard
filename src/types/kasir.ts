import type {
  BilliardTable,
  BillingMode,
  BookingStatus,
  FnbCategory,
  PaymentMethod,
} from "@/types/database";
import type { PromoDiscountsConfig } from "@/lib/promo-discounts";

export interface KasirActiveSession {
  id: string;
  table_id: string;
  booking_id: string | null;
  customer_name: string;
  billing_mode: BillingMode;
  start_time: string;
  duration_minutes: number;
  table_cost: number;
  fnb_cost: number;
  discount_amount: number;
  total_amount: number;
  fnb_item_count: number;
  fnb_promo_discount: number;
}

export interface KasirBookingItem {
  id: string;
  booking_code: string;
  table_id: string;
  table_name: string;
  table_category: string;
  customer_name: string;
  whatsapp_number: string;
  booking_date: string;
  start_time: string;
  duration_hours: number;
  total_price: number;
  status: BookingStatus;
  created_at: string;
  checked_in: boolean;
}

export interface KasirDashboardData {
  todayWib: string;
  tables: BilliardTable[];
  activeSessions: KasirActiveSession[];
  pendingBookings: KasirBookingItem[];
  confirmedTodayBookings: KasirBookingItem[];
  promoDiscounts: PromoDiscountsConfig;
}

export interface SessionFnbOrderItem {
  id: string;
  session_id: string;
  fnb_item_id: string | null;
  item_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  created_at: string;
}

export interface FnbMenuItem {
  id: string;
  name: string;
  category: FnbCategory;
  price: number;
  is_available: boolean;
}

export interface CheckoutReceiptData {
  session_id: string;
  table_name: string;
  customer_name: string;
  billing_mode: BillingMode;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  table_cost: number;
  fnb_cost: number;
  discount_amount: number;
  total_amount: number;
  payment_method: PaymentMethod;
  fnb_orders: Array<{
    id: string;
    item_name: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
  }>;
}

export interface DailyReportTransaction {
  id: string;
  table_name: string;
  table_category: string;
  customer_name: string;
  billing_mode: BillingMode;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  table_cost: number;
  fnb_cost: number;
  discount_amount: number;
  total_amount: number;
  payment_method: PaymentMethod;
  fnb_orders: Array<{
    id: string;
    item_name: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
  }>;
}

export interface DailyReportData {
  dateYmd: string;
  mode: "calendar" | "shift";
  rangeLabel: string;
  summary: {
    totalRevenue: number;
    totalTransactions: number;
    totalTableRevenue: number;
    totalFnbRevenue: number;
    totalDiscount: number;
    byPaymentMethod: {
      tunai: { total: number; count: number };
      qris: { total: number; count: number };
      transfer: { total: number; count: number };
    };
  };
  transactions: DailyReportTransaction[];
}

export interface KasirStoreSettings {
  whatsapp_kasir: string;
  bank_name: string;
  bank_account: string;
  bank_holder: string;
}
