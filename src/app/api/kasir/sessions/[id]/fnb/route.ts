import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isKasirAuthenticated } from "@/lib/kasir-auth";

export const dynamic = "force-dynamic";

interface SessionFnbRouteContext {
  params: Promise<{ id: string }>;
}

async function recalculateSessionFnbCost(sessionId: string) {
  const supabase = createAdminSupabaseClient();
  const [{ data: orders }, { data: session }] = await Promise.all([
    supabase
      .from("session_fnb_orders")
      .select("subtotal")
      .eq("session_id", sessionId),
    supabase
      .from("sessions")
      .select("table_cost, discount_amount")
      .eq("id", sessionId)
      .maybeSingle(),
  ]);

  const fnbCost = (orders ?? []).reduce((acc, row) => acc + row.subtotal, 0);
  const tableCost = session?.table_cost ?? 0;
  const discountAmount = session?.discount_amount ?? 0;
  const totalAmount = Math.max(0, tableCost + fnbCost - discountAmount);

  await supabase
    .from("sessions")
    .update({ fnb_cost: fnbCost, total_amount: totalAmount })
    .eq("id", sessionId);

  return fnbCost;
}

export async function GET(_request: Request, context: SessionFnbRouteContext) {
  if (!(await isKasirAuthenticated())) {
    return NextResponse.json(
      { error: "Sesi kasir tidak aktif. Silakan masuk kembali." },
      { status: 401 },
    );
  }

  const { id: sessionId } = await context.params;
  const supabase = createAdminSupabaseClient();

  const [ordersRes, menuRes] = await Promise.all([
    supabase
      .from("session_fnb_orders")
      .select(
        "id, session_id, fnb_item_id, item_name, quantity, unit_price, subtotal, created_at",
      )
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true }),
    supabase
      .from("fnb_items")
      .select("id, name, category, price, is_available")
      .eq("is_available", true)
      .order("category", { ascending: true })
      .order("name", { ascending: true }),
  ]);

  if (ordersRes.error || menuRes.error) {
    return NextResponse.json(
      { error: "Gagal memuat data F&B meja." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    orders: ordersRes.data ?? [],
    menu: menuRes.data ?? [],
  });
}

export async function POST(request: Request, context: SessionFnbRouteContext) {
  if (!(await isKasirAuthenticated())) {
    return NextResponse.json(
      { error: "Sesi kasir tidak aktif. Silakan masuk kembali." },
      { status: 401 },
    );
  }

  const { id: sessionId } = await context.params;
  let body: {
    items?: Array<{ fnbItemId?: unknown; quantity?: unknown }>;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "Format data pesanan tidak valid." },
      { status: 400 },
    );
  }

  const rawItems = Array.isArray(body.items) ? body.items : [];
  const normalizedItems = rawItems
    .map((entry) => ({
      fnbItemId:
        typeof entry.fnbItemId === "string" ? entry.fnbItemId.trim() : "",
      quantity:
        typeof entry.quantity === "number"
          ? Math.trunc(entry.quantity)
          : Number.parseInt(String(entry.quantity ?? "0"), 10),
    }))
    .filter((entry) => entry.fnbItemId && entry.quantity > 0 && entry.quantity <= 50);

  if (normalizedItems.length === 0) {
    return NextResponse.json(
      { error: "Pilih minimal 1 menu F&B terlebih dahulu." },
      { status: 400 },
    );
  }

  const supabase = createAdminSupabaseClient();

  const { data: session } = await supabase
    .from("sessions")
    .select("id, status")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session || session.status !== "active") {
    return NextResponse.json(
      { error: "Sesi bermain tidak aktif atau sudah selesai." },
      { status: 404 },
    );
  }

  const itemIds = [...new Set(normalizedItems.map((i) => i.fnbItemId))];
  const { data: menuRows, error: menuError } = await supabase
    .from("fnb_items")
    .select("id, name, price, is_available")
    .in("id", itemIds);

  if (menuError || !menuRows || menuRows.length === 0) {
    return NextResponse.json(
      { error: "Menu yang dipilih tidak ditemukan." },
      { status: 404 },
    );
  }

  const menuMap = new Map(menuRows.map((m) => [m.id, m]));
  const rowsToInsert = [];

  for (const reqItem of normalizedItems) {
    const menu = menuMap.get(reqItem.fnbItemId);
    if (!menu) continue;
    rowsToInsert.push({
      session_id: session.id,
      fnb_item_id: menu.id,
      item_name: menu.name,
      quantity: reqItem.quantity,
      unit_price: menu.price,
      subtotal: menu.price * reqItem.quantity,
    });
  }

  if (rowsToInsert.length === 0) {
    return NextResponse.json(
      { error: "Tidak ada item menu valid untuk ditambahkan." },
      { status: 400 },
    );
  }

  const { error: insertError } = await supabase
    .from("session_fnb_orders")
    .insert(rowsToInsert);

  if (insertError) {
    return NextResponse.json(
      { error: "Gagal menambahkan pesanan F&B ke meja." },
      { status: 500 },
    );
  }

  const fnbCost = await recalculateSessionFnbCost(session.id);

  const { data: latestOrders } = await supabase
    .from("session_fnb_orders")
    .select(
      "id, session_id, fnb_item_id, item_name, quantity, unit_price, subtotal, created_at",
    )
    .eq("session_id", session.id)
    .order("created_at", { ascending: true });

  return NextResponse.json(
    { ok: true, fnb_cost: fnbCost, orders: latestOrders ?? [] },
    { status: 201 },
  );
}

export async function DELETE(
  request: Request,
  context: SessionFnbRouteContext,
) {
  if (!(await isKasirAuthenticated())) {
    return NextResponse.json(
      { error: "Sesi kasir tidak aktif. Silakan masuk kembali." },
      { status: 401 },
    );
  }

  const { id: sessionId } = await context.params;
  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get("orderId")?.trim() ?? "";

  if (!orderId) {
    return NextResponse.json(
      { error: "ID pesanan F&B tidak ditemukan." },
      { status: 400 },
    );
  }

  const supabase = createAdminSupabaseClient();

  const { data: session } = await supabase
    .from("sessions")
    .select("id, status")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session || session.status !== "active") {
    return NextResponse.json(
      { error: "Hanya pesanan pada sesi aktif yang dapat dihapus." },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("session_fnb_orders")
    .delete()
    .eq("id", orderId)
    .eq("session_id", session.id);

  if (error) {
    return NextResponse.json(
      { error: "Gagal menghapus item pesanan F&B." },
      { status: 500 },
    );
  }

  const fnbCost = await recalculateSessionFnbCost(session.id);
  return NextResponse.json({ ok: true, fnb_cost: fnbCost });
}
