import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isKasirAuthenticated } from "@/lib/kasir-auth";
import {
  findConflictingConfirmedBooking,
  formatBookingConflictMessage,
} from "@/lib/booking-conflict";
import { getWibNow } from "@/lib/format";

interface ExtendRouteContext {
  params: Promise<{ id: string }>;
}

function addDaysYmd(dateYmd: string, deltaDays: number): string {
  const base = new Date(`${dateYmd}T12:00:00+07:00`);
  base.setUTCDate(base.getUTCDate() + deltaDays);
  return getWibNow(base).dateYmd;
}

export async function POST(request: Request, context: ExtendRouteContext) {
  if (!(await isKasirAuthenticated())) {
    return NextResponse.json(
      { error: "Sesi kasir tidak aktif. Silakan masuk kembali." },
      { status: 401 },
    );
  }

  const { id: sessionId } = await context.params;
  let body: { additionalHours?: unknown };
  try {
    body = (await request.json()) as { additionalHours?: unknown };
  } catch {
    return NextResponse.json(
      { error: "Format permintaan tidak valid." },
      { status: 400 },
    );
  }

  const additionalHours =
    typeof body.additionalHours === "number"
      ? Math.trunc(body.additionalHours)
      : Number.parseInt(String(body.additionalHours ?? "0"), 10);

  if (
    !Number.isInteger(additionalHours) ||
    additionalHours < 1 ||
    additionalHours > 6
  ) {
    return NextResponse.json(
      { error: "Tambahan waktu harus antara 1 sampai 6 jam." },
      { status: 400 },
    );
  }

  const supabase = createAdminSupabaseClient();

  const { data: session } = await supabase
    .from("sessions")
    .select(
      "id, table_id, booking_id, billing_mode, start_time, duration_minutes, table_cost, fnb_cost, discount_amount, status",
    )
    .eq("id", sessionId)
    .maybeSingle();

  if (!session || session.status !== "active") {
    return NextResponse.json(
      { error: "Sesi aktif tidak ditemukan." },
      { status: 404 },
    );
  }

  if (session.billing_mode !== "package") {
    return NextResponse.json(
      {
        error:
          "Tambah waktu hanya berlaku untuk mode Paket Jam (Open Table berjalan otomatis).",
      },
      { status: 400 },
    );
  }

  const sessionDateYmd = getWibNow(new Date(session.start_time)).dateYmd;
  const candidateDates = [
    addDaysYmd(sessionDateYmd, -1),
    sessionDateYmd,
    addDaysYmd(sessionDateYmd, 1),
  ];

  const [{ data: table }, { data: confirmedBookings }] = await Promise.all([
    supabase
      .from("tables")
      .select("name, hourly_rate")
      .eq("id", session.table_id)
      .maybeSingle(),
    supabase
      .from("bookings")
      .select(
        "id, booking_code, customer_name, booking_date, start_time, duration_hours",
      )
      .eq("table_id", session.table_id)
      .eq("status", "confirmed")
      .in("booking_date", candidateDates),
  ]);

  if (!table) {
    return NextResponse.json(
      { error: "Data meja tidak ditemukan." },
      { status: 404 },
    );
  }

  // Validasi anti-bentrok: jika ada booking terkonfirmasi (sudah dibayar) pada jam tambahan, tolak!
  const sessionStartMs = new Date(session.start_time).getTime();
  const proposedEndMs =
    sessionStartMs + (session.duration_minutes + additionalHours * 60) * 60_000;

  const conflict = findConflictingConfirmedBooking(
    sessionStartMs,
    proposedEndMs,
    confirmedBookings ?? [],
    session.booking_id,
  );

  if (conflict) {
    return NextResponse.json(
      {
        error: `Tidak bisa tambah jam! ${formatBookingConflictMessage(table.name, conflict)}`,
      },
      { status: 409 },
    );
  }

  const nextDurationMinutes = session.duration_minutes + additionalHours * 60;
  const nextTableCost = session.table_cost + additionalHours * table.hourly_rate;
  const nextTotalAmount = Math.max(
    0,
    nextTableCost + session.fnb_cost - session.discount_amount,
  );

  const { error: updateError } = await supabase
    .from("sessions")
    .update({
      duration_minutes: nextDurationMinutes,
      table_cost: nextTableCost,
      total_amount: nextTotalAmount,
    })
    .eq("id", session.id);

  if (updateError) {
    return NextResponse.json(
      { error: "Gagal menambah waktu sesi." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    duration_minutes: nextDurationMinutes,
    table_cost: nextTableCost,
  });
}
