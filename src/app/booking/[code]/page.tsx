import type { Metadata } from "next";
import { notFound } from "next/navigation";
import BookingReceipt from "@/components/booking/BookingReceipt";
import { createPublicServerSupabaseClient } from "@/lib/supabase/server";
import { formatTimeHHmm } from "@/lib/format";
import type {
  BookingDetail,
  BookingStatus,
  PublicPaymentSettings,
  TableCategory,
} from "@/types/database";

export const dynamic = "force-dynamic";

interface BookingPageProps {
  params: Promise<{ code: string }>;
}

export async function generateMetadata({
  params,
}: BookingPageProps): Promise<Metadata> {
  const { code } = await params;
  const normalized = decodeURIComponent(code).trim().toUpperCase();
  return {
    title: `Bukti Booking ${normalized}`,
    description: `Detail reservasi dan instruksi pembayaran Onesticx Billiard untuk kode booking ${normalized}.`,
  };
}

export default async function BookingDetailPage({ params }: BookingPageProps) {
  const { code } = await params;
  const normalizedCode = decodeURIComponent(code).trim().toUpperCase();

  if (!normalizedCode) {
    notFound();
  }

  const supabase = createPublicServerSupabaseClient();

  const [bookingResult, settingsResult] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        "id, booking_code, table_id, customer_name, whatsapp_number, booking_date, start_time, duration_hours, total_price, status, created_at, tables(id, name, category, hourly_rate)",
      )
      .eq("booking_code", normalizedCode)
      .maybeSingle(),
    supabase
      .from("app_settings")
      .select("key, value")
      .in("key", ["whatsapp_kasir", "bank_name", "bank_account", "bank_holder"]),
  ]);

  const row = bookingResult.data;
  if (!row || !row.tables) {
    notFound();
  }

  const tableJoin = Array.isArray(row.tables) ? row.tables[0] : row.tables;
  if (!tableJoin) {
    notFound();
  }

  const settingsMap = Object.fromEntries(
    (settingsResult.data ?? []).map((item) => [item.key, item.value]),
  );

  const paymentSettings: PublicPaymentSettings = {
    whatsapp_kasir: settingsMap.whatsapp_kasir ?? "6281234567890",
    bank_name: settingsMap.bank_name ?? "BSI",
    bank_account: settingsMap.bank_account ?? "123456789",
    bank_holder: settingsMap.bank_holder ?? "Onesticx Billiard",
  };

  const bookingDetail: BookingDetail = {
    id: row.id,
    booking_code: row.booking_code,
    table_id: row.table_id,
    customer_name: row.customer_name,
    whatsapp_number: row.whatsapp_number,
    booking_date: row.booking_date,
    start_time: formatTimeHHmm(row.start_time),
    duration_hours: row.duration_hours,
    total_price: row.total_price,
    status: row.status as BookingStatus,
    created_at: row.created_at,
    table: {
      id: tableJoin.id,
      name: tableJoin.name,
      category: tableJoin.category as TableCategory,
      hourly_rate: tableJoin.hourly_rate,
    },
  };

  return (
    <BookingReceipt
      initialBooking={bookingDetail}
      paymentSettings={paymentSettings}
    />
  );
}
