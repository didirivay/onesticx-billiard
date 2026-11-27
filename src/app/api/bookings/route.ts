import { randomInt } from "crypto";
import { NextResponse } from "next/server";
import { createPublicServerSupabaseClient } from "@/lib/supabase/server";
import {
  createAdminSupabaseClient,
  isAdminSupabaseConfigured,
} from "@/lib/supabase/admin";
import { wibOperationalDateTimeToMs } from "@/lib/booking-conflict";
import { getBestTablePromoForTable } from "@/lib/promo-discounts";
import { loadPromoDiscountsServer } from "@/lib/promo-discounts-server";
import {
  CLOSING_OPERATIONAL_MINUTES,
  MIN_BOOKING_DURATION_HOURS,
  OPERATIONAL_START_SLOTS,
  WIB_TIMEZONE,
  formatTimeHHmm,
  getWibNow,
  isTimeRangeOverlap,
  normalizeWhatsappNumber,
  parseStrictDurationHours,
  toOperationalMinutes,
} from "@/lib/format";

interface CreateBookingBody {
  tableId?: unknown;
  customerName?: unknown;
  whatsappNumber?: unknown;
  bookingDate?: unknown;
  startTime?: unknown;
  durationHours?: unknown;
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateBookingCode(): string {
  let suffix = "";
  for (let i = 0; i < 4; i += 1) {
    suffix += CODE_CHARS[randomInt(0, CODE_CHARS.length)];
  }
  return `ONS-${suffix}`;
}

export async function POST(request: Request) {
  let body: CreateBookingBody;
  try {
    body = (await request.json()) as CreateBookingBody;
  } catch {
    return NextResponse.json(
      { error: "Format data permintaan tidak valid." },
      { status: 400 },
    );
  }

  const tableId = typeof body.tableId === "string" ? body.tableId.trim() : "";
  const customerName =
    typeof body.customerName === "string" ? body.customerName.trim() : "";
  const rawWhatsapp =
    typeof body.whatsappNumber === "string" ? body.whatsappNumber.trim() : "";
  const bookingDate =
    typeof body.bookingDate === "string" ? body.bookingDate.trim() : "";
  const rawStartTime =
    typeof body.startTime === "string" ? formatTimeHHmm(body.startTime.trim()) : "";
  const durationHours = parseStrictDurationHours(
    body.durationHours,
    MIN_BOOKING_DURATION_HOURS,
  );

  if (!tableId) {
    return NextResponse.json(
      { error: "Silakan pilih meja terlebih dahulu." },
      { status: 400 },
    );
  }

  if (customerName.length < 2 || customerName.length > 80) {
    return NextResponse.json(
      { error: "Nama lengkap minimal 2 karakter dan maksimal 80 karakter." },
      { status: 400 },
    );
  }

  const normalizedWhatsapp = normalizeWhatsappNumber(rawWhatsapp);
  if (normalizedWhatsapp.length < 10 || normalizedWhatsapp.length > 15) {
    return NextResponse.json(
      {
        error:
          "Nomor WhatsApp tidak valid. Masukkan nomor aktif (contoh: 081234567890).",
      },
      { status: 400 },
    );
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) {
    return NextResponse.json(
      { error: "Format tanggal booking tidak valid." },
      { status: 400 },
    );
  }

  const wibNow = getWibNow();
  if (bookingDate < wibNow.dateYmd) {
    return NextResponse.json(
      { error: "Tanggal booking tidak boleh di masa lalu." },
      { status: 400 },
    );
  }

  if (!OPERATIONAL_START_SLOTS.includes(rawStartTime)) {
    return NextResponse.json(
      {
        error:
          "Jam mulai harus berada dalam jam operasional Onesticx (10.00 - 01.00 WIB).",
      },
      { status: 400 },
    );
  }

  if (durationHours === null) {
    return NextResponse.json(
      {
        error: "Durasi bermain harus berupa angka bulat minimal 1 jam.",
      },
      { status: 400 },
    );
  }

  const startMinutes = toOperationalMinutes(rawStartTime);
  if (startMinutes + durationHours * 60 > CLOSING_OPERATIONAL_MINUTES) {
    return NextResponse.json(
      {
        error:
          "Durasi bermain melebihi jam tutup (02.00 WIB). Silakan kurangi durasi atau pilih jam lebih awal.",
      },
      { status: 400 },
    );
  }

  // Jika memilih hari ini (dan jam sekarang masih dalam hari operasional 10:00-23:59), tolak slot yang sudah lewat
  if (bookingDate === wibNow.dateYmd && wibNow.hour >= 10) {
    const currentOperationalMinutes = wibNow.hour * 60 + wibNow.minute;
    if (startMinutes + 15 < currentOperationalMinutes) {
      return NextResponse.json(
        {
          error:
            "Jam mulai yang dipilih sudah terlewat (WIB). Silakan pilih jam berikutnya.",
        },
        { status: 400 },
      );
    }
  }

  const supabase = createPublicServerSupabaseClient();

  // 1. Validasi meja dan ambil tarif resmi dari database
  const { data: table, error: tableError } = await supabase
    .from("tables")
    .select("id, name, category, hourly_rate, status")
    .eq("id", tableId)
    .maybeSingle();

  if (tableError || !table) {
    return NextResponse.json(
      { error: "Meja yang dipilih tidak ditemukan." },
      { status: 404 },
    );
  }

  // 2. Cek bentrok jadwal booking aktif (pending / confirmed) pada meja & tanggal yang sama
  const { data: existingBookings, error: scheduleError } = await supabase
    .from("bookings")
    .select("id, start_time, duration_hours, status")
    .eq("table_id", table.id)
    .eq("booking_date", bookingDate)
    .in("status", ["pending", "confirmed"]);

  if (scheduleError) {
    return NextResponse.json(
      { error: "Gagal memeriksa jadwal meja. Silakan coba lagi." },
      { status: 500 },
    );
  }

  const hasConflict = (existingBookings ?? []).some((slot) =>
    isTimeRangeOverlap(
      rawStartTime,
      durationHours,
      slot.start_time,
      slot.duration_hours,
    ),
  );

  if (hasConflict) {
    return NextResponse.json(
      {
        error: `Maaf, ${table.name} sudah memiliki jadwal booking pada jam tersebut. Silakan pilih jam atau meja lain.`,
      },
      { status: 409 },
    );
  }

  // 2b. Cek juga sesi Paket Jam yang sedang aktif di meja tersebut agar tidak bertabrakan,
  //     tetap mengizinkan pelanggan 2 membooking tepat setelah sesi aktif selesai (misal 15:00 setelah 13:00-15:00).
  if (isAdminSupabaseConfigured()) {
    const adminSupabase = createAdminSupabaseClient();
    const { data: activeSession } = await adminSupabase
      .from("sessions")
      .select("id, billing_mode, start_time, duration_minutes")
      .eq("table_id", table.id)
      .eq("status", "active")
      .maybeSingle();

    if (activeSession && activeSession.billing_mode === "package") {
      const sessStartMs = new Date(activeSession.start_time).getTime();
      const sessEndMs = sessStartMs + activeSession.duration_minutes * 60_000;
      const reqStartMs = wibOperationalDateTimeToMs(bookingDate, rawStartTime);
      const reqEndMs = reqStartMs + durationHours * 3_600_000;

      if (
        !Number.isNaN(reqStartMs) &&
        reqStartMs < sessEndMs &&
        sessStartMs < reqEndMs
      ) {
        const endWib = new Intl.DateTimeFormat("id-ID", {
          timeZone: WIB_TIMEZONE,
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        }).format(new Date(sessEndMs));

        return NextResponse.json(
          {
            error: `Maaf, ${table.name} sedang digunakan hingga pukul ${endWib} WIB. Anda dapat membooking mulai setelah jam tersebut atau pilih meja lain.`,
          },
          { status: 409 },
        );
      }
    }
  }

  const promoDiscounts = await loadPromoDiscountsServer();
  const basePrice = table.hourly_rate * durationHours;
  const { discountAmount: promoDiscount } = getBestTablePromoForTable(
    promoDiscounts,
    table.id,
    table.category,
    basePrice,
    durationHours,
  );
  const totalPrice = Math.max(0, basePrice - promoDiscount);

  const writeClient = isAdminSupabaseConfigured()
    ? createAdminSupabaseClient()
    : supabase;

  // 3. Simpan booking dengan kode unik ONS-XXXX (retry otomatis jika bentrok kode)
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const bookingCode = generateBookingCode();
    const { data: inserted, error: insertError } = await writeClient
      .from("bookings")
      .insert({
        booking_code: bookingCode,
        table_id: table.id,
        customer_name: customerName,
        whatsapp_number: normalizedWhatsapp,
        booking_date: bookingDate,
        start_time: `${rawStartTime}:00`,
        duration_hours: durationHours,
        total_price: totalPrice,
        status: "pending",
      })
      .select("id, booking_code, total_price, status")
      .single();

    if (!insertError && inserted) {
      return NextResponse.json(
        {
          booking_code: inserted.booking_code,
          booking: inserted,
        },
        { status: 201 },
      );
    }

    // 23505 = unique violation pada booking_code -> coba generate kode baru
    if (insertError?.code === "23505") {
      continue;
    }

    return NextResponse.json(
      {
        error:
          "Gagal menyimpan booking ke server. Pastikan data sudah benar lalu coba lagi.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { error: "Gagal membuat kode booking unik. Silakan coba lagi." },
    { status: 500 },
  );
}
