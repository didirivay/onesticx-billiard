import { NextResponse } from "next/server";
import { createPublicServerSupabaseClient } from "@/lib/supabase/server";
import {
  formatTimeHHmm,
  getWibNow,
  maskCustomerName,
  toOperationalMinutes,
} from "@/lib/format";
import type { BookingStatus, PublicBookingSlot } from "@/types/database";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawDate = searchParams.get("date")?.trim();
  const targetDate =
    rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
      ? rawDate
      : getWibNow().dateYmd;

  const supabase = createPublicServerSupabaseClient();

  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, table_id, customer_name, booking_date, start_time, duration_hours, status",
    )
    .eq("booking_date", targetDate)
    .in("status", ["pending", "confirmed"]);

  if (error) {
    return NextResponse.json(
      { error: "Gagal memuat jadwal booking." },
      { status: 500 },
    );
  }

  const slots: PublicBookingSlot[] = (data ?? [])
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

  return NextResponse.json({ date: targetDate, slots });
}
