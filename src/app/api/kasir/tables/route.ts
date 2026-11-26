import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isKasirAuthenticated } from "@/lib/kasir-auth";
import type { TableCategory } from "@/types/database";

export const dynamic = "force-dynamic";

const VALID_CATEGORIES: TableCategory[] = ["indoor", "outdoor", "high_table"];

export async function GET() {
  if (!(await isKasirAuthenticated())) {
    return NextResponse.json(
      { error: "Sesi kasir tidak aktif. Silakan masuk kembali." },
      { status: 401 },
    );
  }

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("tables")
    .select("id, name, category, hourly_rate, minute_rate, status, sort_order")
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: "Gagal memuat daftar meja." },
      { status: 500 },
    );
  }

  return NextResponse.json({ tables: data ?? [] });
}

export async function POST(request: Request) {
  if (!(await isKasirAuthenticated())) {
    return NextResponse.json(
      { error: "Sesi kasir tidak aktif. Silakan masuk kembali." },
      { status: 401 },
    );
  }

  let body: {
    name?: unknown;
    category?: unknown;
    hourly_rate?: unknown;
    minute_rate?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "Format data meja tidak valid." },
      { status: 400 },
    );
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const category =
    typeof body.category === "string" &&
    VALID_CATEGORIES.includes(body.category as TableCategory)
      ? (body.category as TableCategory)
      : null;
  const hourlyRate = Number.parseInt(String(body.hourly_rate ?? ""), 10);
  const minuteRate = Number.parseInt(String(body.minute_rate ?? ""), 10);

  if (name.length < 2 || name.length > 40) {
    return NextResponse.json(
      { error: "Nama meja minimal 2 karakter dan maksimal 40 karakter." },
      { status: 400 },
    );
  }

  if (!category) {
    return NextResponse.json(
      { error: "Kategori meja harus Indoor, Outdoor, atau High Table." },
      { status: 400 },
    );
  }

  if (
    !Number.isInteger(hourlyRate) ||
    hourlyRate < 0 ||
    !Number.isInteger(minuteRate) ||
    minuteRate < 0
  ) {
    return NextResponse.json(
      { error: "Tarif per jam dan per menit harus angka positif." },
      { status: 400 },
    );
  }

  const supabase = createAdminSupabaseClient();

  const { data: maxOrderRow } = await supabase
    .from("tables")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextSortOrder = (maxOrderRow?.sort_order ?? 0) + 1;

  const { data, error } = await supabase
    .from("tables")
    .insert({
      name,
      category,
      hourly_rate: hourlyRate,
      minute_rate: minuteRate,
      status: "available",
      sort_order: nextSortOrder,
    })
    .select("id, name, category, hourly_rate, minute_rate, status, sort_order")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: `Nama meja "${name}" sudah digunakan. Gunakan nama lain.` },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Gagal menambahkan meja baru." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, table: data }, { status: 201 });
}
