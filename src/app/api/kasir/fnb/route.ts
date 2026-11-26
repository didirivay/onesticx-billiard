import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isKasirAuthenticated } from "@/lib/kasir-auth";
import type { FnbCategory } from "@/types/database";

export const dynamic = "force-dynamic";

const VALID_CATEGORIES: FnbCategory[] = ["makanan", "minuman", "snack"];

export async function GET() {
  if (!(await isKasirAuthenticated())) {
    return NextResponse.json(
      { error: "Sesi kasir tidak aktif. Silakan masuk kembali." },
      { status: 401 },
    );
  }

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("fnb_items")
    .select("id, name, category, price, is_available")
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: "Gagal memuat daftar menu F&B." },
      { status: 500 },
    );
  }

  return NextResponse.json({ items: data ?? [] });
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
    price?: unknown;
    is_available?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "Format data tidak valid." },
      { status: 400 },
    );
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const category =
    typeof body.category === "string" &&
    VALID_CATEGORIES.includes(body.category as FnbCategory)
      ? (body.category as FnbCategory)
      : null;
  const price =
    typeof body.price === "number"
      ? Math.round(body.price)
      : Number.parseInt(String(body.price ?? ""), 10);
  const isAvailable =
    typeof body.is_available === "boolean" ? body.is_available : true;

  if (name.length < 2 || name.length > 80) {
    return NextResponse.json(
      { error: "Nama menu minimal 2 karakter dan maksimal 80 karakter." },
      { status: 400 },
    );
  }

  if (!category) {
    return NextResponse.json(
      { error: "Kategori harus Makanan, Minuman, atau Snack." },
      { status: 400 },
    );
  }

  if (!Number.isInteger(price) || price < 0 || price > 10_000_000) {
    return NextResponse.json(
      { error: "Harga menu tidak valid." },
      { status: 400 },
    );
  }

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("fnb_items")
    .insert({
      name,
      category,
      price,
      is_available: isAvailable,
    })
    .select("id, name, category, price, is_available")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Gagal menyimpan menu F&B baru." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, item: data }, { status: 201 });
}
