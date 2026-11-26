import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isKasirAuthenticated } from "@/lib/kasir-auth";
import type { FnbCategory } from "@/types/database";

interface FnbItemRouteContext {
  params: Promise<{ id: string }>;
}

const VALID_CATEGORIES: FnbCategory[] = ["makanan", "minuman", "snack"];

export async function PATCH(request: Request, context: FnbItemRouteContext) {
  if (!(await isKasirAuthenticated())) {
    return NextResponse.json(
      { error: "Sesi kasir tidak aktif. Silakan masuk kembali." },
      { status: 401 },
    );
  }

  const { id } = await context.params;
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

  const patch: {
    name?: string;
    category?: FnbCategory;
    price?: number;
    is_available?: boolean;
  } = {};

  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name.length < 2 || name.length > 80) {
      return NextResponse.json(
        { error: "Nama menu minimal 2 karakter dan maksimal 80 karakter." },
        { status: 400 },
      );
    }
    patch.name = name;
  }

  if (body.category !== undefined) {
    if (
      typeof body.category !== "string" ||
      !VALID_CATEGORIES.includes(body.category as FnbCategory)
    ) {
      return NextResponse.json(
        { error: "Kategori tidak valid." },
        { status: 400 },
      );
    }
    patch.category = body.category as FnbCategory;
  }

  if (body.price !== undefined) {
    const price =
      typeof body.price === "number"
        ? Math.round(body.price)
        : Number.parseInt(String(body.price), 10);
    if (!Number.isInteger(price) || price < 0 || price > 10_000_000) {
      return NextResponse.json(
        { error: "Harga menu tidak valid." },
        { status: 400 },
      );
    }
    patch.price = price;
  }

  if (body.is_available !== undefined) {
    if (typeof body.is_available !== "boolean") {
      return NextResponse.json(
        { error: "Status ketersediaan tidak valid." },
        { status: 400 },
      );
    }
    patch.is_available = body.is_available;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "Tidak ada perubahan yang dikirim." },
      { status: 400 },
    );
  }

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("fnb_items")
    .update(patch)
    .eq("id", id)
    .select("id, name, category, price, is_available")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { error: "Gagal memperbarui menu F&B." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, item: data });
}

export async function DELETE(_request: Request, context: FnbItemRouteContext) {
  if (!(await isKasirAuthenticated())) {
    return NextResponse.json(
      { error: "Sesi kasir tidak aktif. Silakan masuk kembali." },
      { status: 401 },
    );
  }

  const { id } = await context.params;
  const supabase = createAdminSupabaseClient();

  const { error } = await supabase.from("fnb_items").delete().eq("id", id);
  if (error) {
    return NextResponse.json(
      { error: "Gagal menghapus menu F&B." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
