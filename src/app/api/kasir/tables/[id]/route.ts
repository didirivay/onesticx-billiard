import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isKasirAuthenticated } from "@/lib/kasir-auth";
import type { TableCategory } from "@/types/database";

interface TableItemRouteContext {
  params: Promise<{ id: string }>;
}

const VALID_CATEGORIES: TableCategory[] = ["indoor", "outdoor", "high_table"];

export async function PATCH(request: Request, context: TableItemRouteContext) {
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
    hourly_rate?: unknown;
    minute_rate?: unknown;
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
    category?: TableCategory;
    hourly_rate?: number;
    minute_rate?: number;
  } = {};

  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name.length < 2 || name.length > 40) {
      return NextResponse.json(
        { error: "Nama meja minimal 2 karakter." },
        { status: 400 },
      );
    }
    patch.name = name;
  }

  if (body.category !== undefined) {
    if (
      typeof body.category !== "string" ||
      !VALID_CATEGORIES.includes(body.category as TableCategory)
    ) {
      return NextResponse.json(
        { error: "Kategori tidak valid." },
        { status: 400 },
      );
    }
    patch.category = body.category as TableCategory;
  }

  if (body.hourly_rate !== undefined) {
    const val = Number.parseInt(String(body.hourly_rate), 10);
    if (!Number.isInteger(val) || val < 0) {
      return NextResponse.json(
        { error: "Tarif per jam tidak valid." },
        { status: 400 },
      );
    }
    patch.hourly_rate = val;
  }

  if (body.minute_rate !== undefined) {
    const val = Number.parseInt(String(body.minute_rate), 10);
    if (!Number.isInteger(val) || val < 0) {
      return NextResponse.json(
        { error: "Tarif per menit tidak valid." },
        { status: 400 },
      );
    }
    patch.minute_rate = val;
  }

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("tables")
    .update(patch)
    .eq("id", id)
    .select("id, name, category, hourly_rate, minute_rate, status, sort_order")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Nama meja tersebut sudah digunakan." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Gagal memperbarui data meja." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, table: data });
}

export async function DELETE(
  _request: Request,
  context: TableItemRouteContext,
) {
  if (!(await isKasirAuthenticated())) {
    return NextResponse.json(
      { error: "Sesi kasir tidak aktif. Silakan masuk kembali." },
      { status: 401 },
    );
  }

  const { id } = await context.params;
  const supabase = createAdminSupabaseClient();

  const { error } = await supabase.from("tables").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") {
      return NextResponse.json(
        {
          error:
            "Meja tidak dapat dihapus karena sudah memiliki riwayat booking atau transaksi.",
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Gagal menghapus meja." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
