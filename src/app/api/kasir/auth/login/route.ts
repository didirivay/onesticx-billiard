import { NextResponse } from "next/server";
import { isAdminSupabaseConfigured } from "@/lib/supabase/admin";
import {
  KASIR_COOKIE_NAME,
  KASIR_SESSION_MAX_AGE_SECONDS,
  checkPinRateLimit,
  clearFailedPinAttempts,
  createKasirSessionToken,
  recordFailedPinAttempt,
  verifyKasirPinAgainstDb,
} from "@/lib/kasir-auth";

export async function POST(request: Request) {
  if (!isAdminSupabaseConfigured()) {
    return NextResponse.json(
      {
        error:
          "SUPABASE_SERVICE_ROLE_KEY belum diatur di .env.local. Silakan tambahkan kunci server Supabase terlebih dahulu.",
      },
      { status: 503 },
    );
  }

  const forwarded = request.headers.get("x-forwarded-for");
  const clientKey = forwarded?.split(",")[0]?.trim() || "local-kasir";

  const rate = checkPinRateLimit(clientKey);
  if (!rate.allowed) {
    return NextResponse.json(
      {
        error: `Terlalu banyak percobaan PIN salah. Coba lagi dalam ${rate.retryAfterSeconds} detik.`,
      },
      { status: 429 },
    );
  }

  let body: { pin?: unknown };
  try {
    body = (await request.json()) as { pin?: unknown };
  } catch {
    return NextResponse.json(
      { error: "Format permintaan tidak valid." },
      { status: 400 },
    );
  }

  const pin = typeof body.pin === "string" ? body.pin.trim() : "";
  if (!/^\d{4,6}$/.test(pin)) {
    return NextResponse.json(
      { error: "PIN harus berupa 4 sampai 6 digit angka." },
      { status: 400 },
    );
  }

  const isValid = await verifyKasirPinAgainstDb(pin);
  if (!isValid) {
    recordFailedPinAttempt(clientKey);
    return NextResponse.json(
      { error: "PIN salah. Silakan periksa kembali PIN kasir Anda." },
      { status: 401 },
    );
  }

  clearFailedPinAttempts(clientKey);

  const token = createKasirSessionToken();
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: KASIR_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: KASIR_SESSION_MAX_AGE_SECONDS,
  });

  return response;
}
