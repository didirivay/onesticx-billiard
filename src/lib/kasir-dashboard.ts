import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { formatTimeHHmm, getWibNow, toOperationalMinutes } from "@/lib/format";
import { calculateFnbOrdersPromoDiscount } from "@/lib/promo-discounts";
import { loadPromoDiscountsServer } from "@/lib/promo-discounts-server";
import type {
  BilliardTable,
  BillingMode,
  BookingStatus,
  TableCategory,
  TableStatus,
} from "@/types/database";
import type {
  KasirActiveSession,
  KasirBookingItem,
  KasirDashboardData,
} from "@/types/kasir";

export async function loadKasirDashboardData(): Promise<KasirDashboardData> {
  const supabase = createAdminSupabaseClient();
  const wibNow = getWibNow();

  const [tablesRes, sessionsRes, pendingRes, confirmedRes, promoDiscounts] =
    await Promise.all([
      supabase
        .from("tables")
        .select(
          "id, name, category, hourly_rate, minute_rate, status, sort_order",
        )
        .order("sort_order", { ascending: true }),
      supabase
        .from("sessions")
        .select(
          "id, table_id, booking_id, customer_name, billing_mode, start_time, duration_minutes, table_cost, fnb_cost, discount_amount, total_amount",
        )
        .eq("status", "active"),
      supabase
        .from("bookings")
        .select(
          "id, booking_code, table_id, customer_name, whatsapp_number, booking_date, start_time, duration_hours, total_price, status, created_at",
        )
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
      supabase
        .from("bookings")
        .select(
          "id, booking_code, table_id, customer_name, whatsapp_number, booking_date, start_time, duration_hours, total_price, status, created_at",
        )
        .eq("status", "confirmed")
        .eq("booking_date", wibNow.dateYmd),
      loadPromoDiscountsServer(),
    ]);

  const tables: BilliardTable[] = (tablesRes.data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    category: t.category as TableCategory,
    hourly_rate: t.hourly_rate,
    minute_rate: t.minute_rate,
    status: t.status as TableStatus,
    sort_order: t.sort_order,
  }));

  const tableMap = new Map(tables.map((t) => [t.id, t]));
  const rawSessions = sessionsRes.data ?? [];

  const fnbCountMap = new Map<string, number>();
  const fnbSumMap = new Map<string, number>();
  const fnbOrdersBySession = new Map<
    string,
    Array<{ fnb_item_id: string | null; subtotal: number }>
  >();

  if (rawSessions.length > 0) {
    const sessionIds = rawSessions.map((s) => s.id);
    const { data: fnbOrders } = await supabase
      .from("session_fnb_orders")
      .select("session_id, fnb_item_id, quantity, subtotal")
      .in("session_id", sessionIds);

    for (const order of fnbOrders ?? []) {
      fnbCountMap.set(
        order.session_id,
        (fnbCountMap.get(order.session_id) ?? 0) + order.quantity,
      );
      fnbSumMap.set(
        order.session_id,
        (fnbSumMap.get(order.session_id) ?? 0) + order.subtotal,
      );
      const list = fnbOrdersBySession.get(order.session_id) ?? [];
      list.push({
        fnb_item_id: order.fnb_item_id,
        subtotal: order.subtotal,
      });
      fnbOrdersBySession.set(order.session_id, list);
    }
  }

  const activeSessions: KasirActiveSession[] = rawSessions.map((s) => {
    const sessOrders = fnbOrdersBySession.get(s.id) ?? [];
    const { discountAmount: fnbPromoDiscount } =
      calculateFnbOrdersPromoDiscount(promoDiscounts, sessOrders);
    return {
      id: s.id,
      table_id: s.table_id,
      booking_id: s.booking_id,
      customer_name: s.customer_name,
      billing_mode: s.billing_mode as BillingMode,
      start_time: s.start_time,
      duration_minutes: s.duration_minutes,
      table_cost: s.table_cost,
      fnb_cost: fnbSumMap.get(s.id) ?? s.fnb_cost,
      discount_amount: s.discount_amount,
      total_amount: s.total_amount,
      fnb_item_count: fnbCountMap.get(s.id) ?? 0,
      fnb_promo_discount: fnbPromoDiscount,
    };
  });

  const checkedInBookingIds = new Set(
    activeSessions
      .map((s) => s.booking_id)
      .filter((id): id is string => Boolean(id)),
  );

  const mapBooking = (row: {
    id: string;
    booking_code: string;
    table_id: string;
    customer_name: string;
    whatsapp_number: string;
    booking_date: string;
    start_time: string;
    duration_hours: number;
    total_price: number;
    status: string;
    created_at: string;
  }): KasirBookingItem => {
    const tbl = tableMap.get(row.table_id);
    return {
      id: row.id,
      booking_code: row.booking_code,
      table_id: row.table_id,
      table_name: tbl?.name ?? "Meja",
      table_category: tbl?.category ?? "indoor",
      customer_name: row.customer_name,
      whatsapp_number: row.whatsapp_number,
      booking_date: row.booking_date,
      start_time: formatTimeHHmm(row.start_time),
      duration_hours: row.duration_hours,
      total_price: row.total_price,
      status: row.status as BookingStatus,
      created_at: row.created_at,
      checked_in: checkedInBookingIds.has(row.id),
    };
  };

  const pendingBookings = (pendingRes.data ?? []).map(mapBooking);
  const confirmedTodayBookings = (confirmedRes.data ?? [])
    .map(mapBooking)
    .sort(
      (a, b) =>
        toOperationalMinutes(a.start_time) - toOperationalMinutes(b.start_time),
    );

  return {
    todayWib: wibNow.dateYmd,
    tables,
    activeSessions,
    pendingBookings,
    confirmedTodayBookings,
    promoDiscounts,
  };
}
