import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  isKasirAuthenticated,
  verifyKasirPinAgainstDb,
} from "@/lib/kasir-auth";
import { loadKasirSettingsPageData } from "@/lib/kasir-settings";
import { normalizeWhatsappNumber } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isKasirAuthenticated())) {
    return NextResponse.json(
      { error: "Sesi kasir tidak aktif. Silakan masuk kembali." },
      { status: 401 },
    );
  }

  try {
    const data = await loadKasirSettingsPageData();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Gagal memuat pengaturan toko." },
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

  let body: {
    type?: unknown;
    whatsapp_kasir?: unknown;
    bank_name?: unknown;
    bank_account?: unknown;
    bank_holder?: unknown;
    currentPin?: unknown;
    newPin?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "Format permintaan tidak valid." },
      { status: 400 },
    );
  }

  const supabase = createAdminSupabaseClient();

  if (body.type === "pin") {
    const currentPin =
      typeof body.currentPin === "string" ? body.currentPin.trim() : "";
    const newPin = typeof body.newPin === "string" ? body.newPin.trim() : "";

    if (!/^\d{4,6}$/.test(currentPin)) {
      return NextResponse.json(
        { error: "Masukkan PIN lama (4–6 digit angka)." },
        { status: 400 },
      );
    }

    if (!/^\d{4,6}$/.test(newPin)) {
      return NextResponse.json(
        { error: "PIN baru harus berupa 4 sampai 6 digit angka." },
        { status: 400 },
      );
    }

    const validOld = await verifyKasirPinAgainstDb(currentPin);
    if (!validOld) {
      return NextResponse.json(
        { error: "PIN lama tidak sesuai." },
        { status: 401 },
      );
    }

    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: "kasir_pin", value: newPin }, { onConflict: "key" });

    if (error) {
      return NextResponse.json(
        { error: "Gagal menyimpan PIN baru." },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  }

  // Update informasi WhatsApp & rekening bank
  const rawWa =
    typeof body.whatsapp_kasir === "string" ? body.whatsapp_kasir.trim() : "";
  const bankName =
    typeof body.bank_name === "string" ? body.bank_name.trim() : "";
  const bankAccount =
    typeof body.bank_account === "string" ? body.bank_account.trim() : "";
  const bankHolder =
    typeof body.bank_holder === "string" ? body.bank_holder.trim() : "";

  const normalizedWa = normalizeWhatsappNumber(rawWa);
  if (normalizedWa.length < 10 || normalizedWa.length > 15) {
    return NextResponse.json(
      { error: "Nomor WhatsApp kasir tidak valid (contoh: 6281234567890)." },
      { status: 400 },
    );
  }

  if (bankName.length < 2 || bankAccount.length < 4 || bankHolder.length < 2) {
    return NextResponse.json(
      { error: "Lengkapi nama bank, nomor rekening, dan nama pemilik rekening." },
      { status: 400 },
    );
  }

  const { error } = await supabase.from("app_settings").upsert(
    [
      { key: "whatsapp_kasir", value: normalizedWa },
      { key: "bank_name", value: bankName },
      { key: "bank_account", value: bankAccount },
      { key: "bank_holder", value: bankHolder },
    ],
    { onConflict: "key" },
  );

  if (error) {
    return NextResponse.json(
      { error: "Gagal menyimpan pengaturan pembayaran." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    settings: {
      whatsapp_kasir: normalizedWa,
      bank_name: bankName,
      bank_account: bankAccount,
      bank_holder: bankHolder,
    },
  });
}
