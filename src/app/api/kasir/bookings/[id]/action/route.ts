import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isKasirAuthenticated } from "@/lib/kasir-auth";
import { getWibNow } from "@/lib/format";

interface BookingActionContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: BookingActionContext) {
  if (!(await isKasirAuthenticated())) {
    return NextResponse.json(
      { error: "Sesi kasir tidak aktif. Silakan masuk kembali." },
      { status: 401 },
    );
  }

  const { id: bookingId } = await context.params;
  let body: { action?: unknown };
  try {
    body = (await request.json()) as { action?: unknown };
  } catch {
    return NextResponse.json(
      { error: "Format permintaan tidak valid." },
      { status: 400 },
    );
  }

  const action =
    body.action === "confirm" ||
    body.action === "reject" ||
    body.action === "cancel"
      ? body.action
      : null;

  if (!action) {
    return NextResponse.json(
      { error: "Aksi booking tidak dikenali." },
      { status: 400 },
    );
  }

  const supabase = createAdminSupabaseClient();

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, booking_code, table_id, booking_date, status")
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking) {
    return NextResponse.json(
      { error: "Booking tidak ditemukan." },
      { status: 404 },
    );
  }

  const todayWib = getWibNow().dateYmd;

  if (action === "confirm") {
    if (booking.status !== "pending") {
      return NextResponse.json(
        { error: "Hanya booking berstatus Pending yang dapat diterima." },
        { status: 400 },
      );
    }

    const { error } = await supabase
      .from("bookings")
      .update({ status: "confirmed" })
      .eq("id", booking.id);

    if (error) {
      return NextResponse.json(
        { error: "Gagal menerima booking." },
        { status: 500 },
      );
    }

    // Jika booking untuk hari ini dan meja sedang kosong, ubah status meja jadi booked
    if (booking.booking_date === todayWib) {
      await supabase
        .from("tables")
        .update({ status: "booked" })
        .eq("id", booking.table_id)
        .eq("status", "available");
    }

    return NextResponse.json({
      ok: true,
      booking_code: booking.booking_code,
      status: "confirmed",
    });
  }

  if (action === "reject") {
    if (booking.status !== "pending") {
      return NextResponse.json(
        { error: "Hanya booking berstatus Pending yang dapat ditolak." },
        { status: 400 },
      );
    }

    const { error } = await supabase
      .from("bookings")
      .update({ status: "rejected" })
      .eq("id", booking.id);

    if (error) {
      return NextResponse.json(
        { error: "Gagal menolak booking." },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, status: "rejected" });
  }

  // action === "cancel" (misal lewat batas keterlambatan 15 menit)
  if (booking.status !== "confirmed" && booking.status !== "pending") {
    return NextResponse.json(
      { error: "Booking ini tidak dapat dibatalkan lagi." },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("id", booking.id);

  if (error) {
    return NextResponse.json(
      { error: "Gagal membatalkan booking." },
      { status: 500 },
    );
  }

  // Jika meja sedang berstatus booked dan tidak ada booking confirmed lain hari ini, kembalikan ke available
  if (booking.booking_date === todayWib) {
    const { data: otherConfirmed } = await supabase
      .from("bookings")
      .select("id")
      .eq("table_id", booking.table_id)
      .eq("booking_date", todayWib)
      .eq("status", "confirmed")
      .limit(1);

    if ((otherConfirmed?.length ?? 0) === 0) {
      await supabase
        .from("tables")
        .update({ status: "available" })
        .eq("id", booking.table_id)
        .eq("status", "booked");
    }
  }

  return NextResponse.json({ ok: true, status: "cancelled" });
}
