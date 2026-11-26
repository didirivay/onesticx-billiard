import CustomerPortal from "@/components/customer/CustomerPortal";
import { createPublicServerSupabaseClient } from "@/lib/supabase/server";
import { loadPromoDiscountsServer } from "@/lib/promo-discounts-server";
import {
  formatTimeHHmm,
  getWibNow,
  maskCustomerName,
  toOperationalMinutes,
} from "@/lib/format";
import type {
  BilliardTable,
  BookingStatus,
  PublicBookingSlot,
  TableCategory,
  TableStatus,
} from "@/types/database";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = createPublicServerSupabaseClient();
  const wibNow = getWibNow();

  const [tablesResult, bookingsResult, promoDiscounts] = await Promise.all([
    supabase
      .from("tables")
      .select("id, name, category, hourly_rate, minute_rate, status, sort_order")
      .order("sort_order", { ascending: true }),
    supabase
      .from("bookings")
      .select(
        "id, table_id, customer_name, booking_date, start_time, duration_hours, status",
      )
      .eq("booking_date", wibNow.dateYmd)
      .in("status", ["pending", "confirmed"]),
    loadPromoDiscountsServer(),
  ]);

  const initialTables: BilliardTable[] = (tablesResult.data ?? []).map(
    (row) => ({
      id: row.id,
      name: row.name,
      category: row.category as TableCategory,
      hourly_rate: row.hourly_rate,
      minute_rate: row.minute_rate,
      status: row.status as TableStatus,
      sort_order: row.sort_order,
    }),
  );

  const initialTodayBookings: PublicBookingSlot[] = (bookingsResult.data ?? [])
    .map((row) => ({
      id: row.id,
      table_id: row.table_id,
      customer_label: maskCustomerName(row.customer_name),
      booking_date: row.booking_date,
      start_time: formatTimeHHmm(row.start_time),
      duration_hours: row.duration_hours,
      status: row.status as BookingStatus,
    }))
    .sort(
      (a, b) =>
        toOperationalMinutes(a.start_time) - toOperationalMinutes(b.start_time),
    );

  return (
    <CustomerPortal
      initialTables={initialTables}
      initialTodayBookings={initialTodayBookings}
      initialPromoDiscounts={promoDiscounts}
      initialTodayWib={wibNow.dateYmd}
      initialIsOpen={wibNow.isOpen}
      initialCurrentHHmm={wibNow.hhmm}
    />
  );
}
