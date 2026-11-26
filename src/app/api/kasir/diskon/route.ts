import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isKasirAuthenticated } from "@/lib/kasir-auth";
import {
  PROMO_DISCOUNTS_SETTINGS_KEY,
  sanitizePromoDiscountsPayload,
} from "@/lib/promo-discounts";
import { loadPromoDiscountsServer } from "@/lib/promo-discounts-server";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isKasirAuthenticated())) {
    return NextResponse.json(
      { error: "Sesi kasir tidak aktif. Silakan masuk kembali." },
      { status: 401 },
    );
  }

  try {
    const discounts = await loadPromoDiscountsServer();
    return NextResponse.json({ discounts });
  } catch {
    return NextResponse.json(
      { error: "Gagal memuat konfigurasi diskon." },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  if (!(await isKasirAuthenticated())) {
    return NextResponse.json(
      { error: "Sesi kasir tidak aktif. Silakan masuk kembali." },
      { status: 401 },
    );
  }

  let body: { discounts?: unknown };
  try {
    body = (await request.json()) as { discounts?: unknown };
  } catch {
    return NextResponse.json(
      { error: "Format data diskon tidak valid." },
      { status: 400 },
    );
  }

  const sanitized = sanitizePromoDiscountsPayload(body.discounts ?? body);
  const supabase = createAdminSupabaseClient();

  const { error } = await supabase.from("app_settings").upsert(
    {
      key: PROMO_DISCOUNTS_SETTINGS_KEY,
      value: JSON.stringify(sanitized),
    },
    { onConflict: "key" },
  );

  if (error) {
    return NextResponse.json(
      { error: "Gagal menyimpan pengaturan diskon." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, discounts: sanitized });
}
