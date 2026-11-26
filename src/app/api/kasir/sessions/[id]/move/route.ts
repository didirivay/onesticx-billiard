import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isKasirAuthenticated } from "@/lib/kasir-auth";
import { getWibNow } from "@/lib/format";

interface MoveRouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: MoveRouteContext) {
  if (!(await isKasirAuthenticated())) {
    return NextResponse.json(
      { error: "Sesi kasir tidak aktif. Silakan masuk kembali." },
      { status: 401 },
    );
  }

  const { id: sessionId } = await context.params;
  let body: { targetTableId?: unknown };
  try {
    body = (await request.json()) as { targetTableId?: unknown };
  } catch {
    return NextResponse.json(
      { error: "Format permintaan tidak valid." },
      { status: 400 },
    );
  }

  const targetTableId =
    typeof body.targetTableId === "string" ? body.targetTableId.trim() : "";

  if (!targetTableId) {
    return NextResponse.json(
      { error: "Pilih meja tujuan terlebih dahulu." },
      { status: 400 },
    );
  }

  const supabase = createAdminSupabaseClient();

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("id, table_id, status")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError || !session || session.status !== "active") {
    return NextResponse.json(
      { error: "Sesi aktif tidak ditemukan." },
      { status: 404 },
    );
  }

  if (session.table_id === targetTableId) {
    return NextResponse.json(
      { error: "Meja tujuan sama dengan meja saat ini." },
      { status: 400 },
    );
  }

  const { data: targetTable } = await supabase
    .from("tables")
    .select("id, name, status")
    .eq("id", targetTableId)
    .maybeSingle();

  if (!targetTable) {
    return NextResponse.json(
      { error: "Meja tujuan tidak ditemukan." },
      { status: 404 },
    );
  }

  if (targetTable.status !== "available") {
    return NextResponse.json(
      { error: `${targetTable.name} tidak sedang kosong.` },
      { status: 409 },
    );
  }

  const { data: targetActive } = await supabase
    .from("sessions")
    .select("id")
    .eq("table_id", targetTable.id)
    .eq("status", "active")
    .maybeSingle();

  if (targetActive) {
    return NextResponse.json(
      { error: `${targetTable.name} sedang digunakan oleh sesi lain.` },
      { status: 409 },
    );
  }

  // Pindahkan sesi ke meja tujuan
  const { error: moveError } = await supabase
    .from("sessions")
    .update({ table_id: targetTable.id })
    .eq("id", session.id);

  if (moveError) {
    return NextResponse.json(
      { error: "Gagal memindahkan sesi ke meja tujuan." },
      { status: 500 },
    );
  }

  // Tentukan status meja lama (booked jika masih ada booking terkonfirmasi hari ini, selain itu available)
  const todayWib = getWibNow().dateYmd;
  const { data: remainingBookings } = await supabase
    .from("bookings")
    .select("id")
    .eq("table_id", session.table_id)
    .eq("booking_date", todayWib)
    .eq("status", "confirmed")
    .limit(1);

  const oldTableNextStatus =
    (remainingBookings?.length ?? 0) > 0 ? "booked" : "available";

  await Promise.all([
    supabase
      .from("tables")
      .update({ status: oldTableNextStatus })
      .eq("id", session.table_id),
    supabase
      .from("tables")
      .update({ status: "occupied" })
      .eq("id", targetTable.id),
  ]);

  return NextResponse.json({ ok: true });
}
