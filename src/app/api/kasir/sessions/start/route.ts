import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isKasirAuthenticated } from "@/lib/kasir-auth";
import {
  findConflictingConfirmedBooking,
  formatBookingConflictMessage,
} from "@/lib/booking-conflict";
import {
  MIN_BOOKING_DURATION_HOURS,
  getWibNow,
  parseStrictDurationHours,
} from "@/lib/format";

interface StartSessionBody {
  tableId?: unknown;
  bookingId?: unknown;
  customerName?: unknown;
  billingMode?: unknown;
  durationHours?: unknown;
}

export async function POST(request: Request) {
  if (!(await isKasirAuthenticated())) {
    return NextResponse.json(
      { error: "Sesi kasir tidak aktif. Silakan masuk kembali." },
      { status: 401 },
    );
  }

  let body: StartSessionBody;
  try {
    body = (await request.json()) as StartSessionBody;
  } catch {
    return NextResponse.json(
      { error: "Format permintaan tidak valid." },
      { status: 400 },
    );
  }

  const supabase = createAdminSupabaseClient();
  const bookingId =
    typeof body.bookingId === "string" && body.bookingId.trim()
      ? body.bookingId.trim()
      : null;

  let tableId = typeof body.tableId === "string" ? body.tableId.trim() : "";
  let customerName =
    typeof body.customerName === "string" && body.customerName.trim()
      ? body.customerName.trim()
      : "Walk-in";
  let billingMode: "open_table" | "package" =
    body.billingMode === "package" ? "package" : "open_table";
  let durationHours: number | null =
    billingMode === "package"
      ? parseStrictDurationHours(
          body.durationHours,
          MIN_BOOKING_DURATION_HOURS,
          999,
        )
      : 0;
  let bookingTotalPrice: number | null = null;

  // Jika check-in dari booking online
  if (bookingId) {
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select(
        "id, table_id, customer_name, duration_hours, total_price, status",
      )
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingError || !booking) {
      return NextResponse.json(
        { error: "Data booking tidak ditemukan." },
        { status: 404 },
      );
    }

    if (booking.status !== "confirmed") {
      return NextResponse.json(
        {
          error:
            "Booking harus berstatus Terkonfirmasi sebelum mulai bermain.",
        },
        { status: 400 },
      );
    }

    // Pastikan booking belum punya sesi aktif
    const { data: existingBookingSession } = await supabase
      .from("sessions")
      .select("id")
      .eq("booking_id", booking.id)
      .eq("status", "active")
      .maybeSingle();

    if (existingBookingSession) {
      return NextResponse.json(
        { error: "Booking ini sudah sedang bermain." },
        { status: 409 },
      );
    }

    tableId = booking.table_id;
    customerName = booking.customer_name;
    billingMode = "package";
    durationHours = booking.duration_hours;
    bookingTotalPrice = booking.total_price;
  }

  if (!tableId) {
    return NextResponse.json(
      { error: "Meja tujuan wajib dipilih." },
      { status: 400 },
    );
  }

  if (
    billingMode === "package" &&
    (durationHours === null ||
      !Number.isInteger(durationHours) ||
      durationHours < MIN_BOOKING_DURATION_HOURS ||
      durationHours > 999)
  ) {
    return NextResponse.json(
      {
        error: "Durasi paket jam harus berupa angka bulat minimal 1 jam.",
      },
      { status: 400 },
    );
  }

  const safeDurationHours = billingMode === "package" ? (durationHours ?? 1) : 0;

  const { data: table, error: tableError } = await supabase
    .from("tables")
    .select("id, name, hourly_rate, minute_rate, status")
    .eq("id", tableId)
    .maybeSingle();

  if (tableError || !table) {
    return NextResponse.json(
      { error: "Meja tidak ditemukan." },
      { status: 404 },
    );
  }

  // Pastikan meja belum memiliki sesi aktif
  const { data: activeOnTable } = await supabase
    .from("sessions")
    .select("id")
    .eq("table_id", table.id)
    .eq("status", "active")
    .maybeSingle();

  if (activeOnTable) {
    return NextResponse.json(
      { error: `${table.name} sedang memiliki sesi bermain yang aktif.` },
      { status: 409 },
    );
  }

  // Untuk walk-in Paket Jam, pastikan durasi yang dipilih tidak menabrak booking terkonfirmasi hari ini
  if (!bookingId && billingMode === "package") {
    const now = new Date();
    const todayWib = getWibNow(now).dateYmd;
    const { data: confirmedBookings } = await supabase
      .from("bookings")
      .select(
        "id, booking_code, customer_name, booking_date, start_time, duration_hours",
      )
      .eq("table_id", table.id)
      .eq("status", "confirmed")
      .eq("booking_date", todayWib);

    const conflict = findConflictingConfirmedBooking(
      now.getTime(),
      now.getTime() + safeDurationHours * 3_600_000,
      confirmedBookings ?? [],
    );

    if (conflict) {
      return NextResponse.json(
        {
          error: `Durasi paket bentrok! ${formatBookingConflictMessage(table.name, conflict)}`,
        },
        { status: 409 },
      );
    }
  }

  const durationMinutes =
    billingMode === "package" ? safeDurationHours * 60 : 0;
  const fullPackageCost =
    billingMode === "package" ? table.hourly_rate * safeDurationHours : 0;
  const preAppliedDiscount =
    billingMode === "package" && bookingTotalPrice !== null
      ? Math.max(0, fullPackageCost - bookingTotalPrice)
      : 0;
  const tableCost = billingMode === "package" ? fullPackageCost : 0;
  const initialTotalAmount = Math.max(0, tableCost - preAppliedDiscount);

  const { data: createdSession, error: insertError } = await supabase
    .from("sessions")
    .insert({
      table_id: table.id,
      booking_id: bookingId,
      customer_name: customerName.slice(0, 80),
      billing_mode: billingMode,
      start_time: new Date().toISOString(),
      duration_minutes: durationMinutes,
      table_cost: tableCost,
      fnb_cost: 0,
      discount_amount: preAppliedDiscount,
      total_amount: initialTotalAmount,
      status: "active",
    })
    .select("id")
    .single();

  if (insertError || !createdSession) {
    return NextResponse.json(
      { error: "Gagal memulai sesi bermain. Silakan coba lagi." },
      { status: 500 },
    );
  }

  const { error: updateTableError } = await supabase
    .from("tables")
    .update({ status: "occupied" })
    .eq("id", table.id);

  if (updateTableError) {
    return NextResponse.json(
      { error: "Sesi dimulai tetapi status meja gagal diperbarui." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { ok: true, session_id: createdSession.id },
    { status: 201 },
  );
}
