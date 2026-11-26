import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isKasirAuthenticated } from "@/lib/kasir-auth";
import { getWibNow } from "@/lib/format";
import {
  calculateFnbOrdersPromoDiscount,
  getBestTablePromoForTable,
} from "@/lib/promo-discounts";
import { loadPromoDiscountsServer } from "@/lib/promo-discounts-server";
import type { BillingMode, PaymentMethod } from "@/types/database";
import type { CheckoutReceiptData } from "@/types/kasir";

interface CheckoutRouteContext {
  params: Promise<{ id: string }>;
}

const VALID_PAYMENT_METHODS: PaymentMethod[] = ["tunai", "qris", "transfer"];

export async function POST(request: Request, context: CheckoutRouteContext) {
  if (!(await isKasirAuthenticated())) {
    return NextResponse.json(
      { error: "Sesi kasir tidak aktif. Silakan masuk kembali." },
      { status: 401 },
    );
  }

  const { id: sessionId } = await context.params;
  let body: {
    paymentMethod?: unknown;
    applyPromo?: unknown;
    discountType?: unknown;
    discountValue?: unknown;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "Format permintaan tidak valid." },
      { status: 400 },
    );
  }

  const paymentMethod =
    typeof body.paymentMethod === "string" &&
    VALID_PAYMENT_METHODS.includes(body.paymentMethod as PaymentMethod)
      ? (body.paymentMethod as PaymentMethod)
      : null;

  if (!paymentMethod) {
    return NextResponse.json(
      { error: "Pilih metode pembayaran (Tunai, QRIS, atau Transfer)." },
      { status: 400 },
    );
  }

  const applyPromo = body.applyPromo !== false;
  const discountType =
    body.discountType === "percent" ? "percent" : "nominal";
  const rawDiscount =
    typeof body.discountValue === "number"
      ? body.discountValue
      : Number.parseFloat(String(body.discountValue ?? "0"));
  const discountValue =
    Number.isFinite(rawDiscount) && rawDiscount > 0 ? rawDiscount : 0;

  const supabase = createAdminSupabaseClient();

  const { data: session } = await supabase
    .from("sessions")
    .select(
      "id, table_id, booking_id, customer_name, billing_mode, start_time, duration_minutes, table_cost, fnb_cost, discount_amount, status",
    )
    .eq("id", sessionId)
    .maybeSingle();

  if (!session || session.status !== "active") {
    return NextResponse.json(
      { error: "Sesi aktif tidak ditemukan atau sudah diselesaikan." },
      { status: 404 },
    );
  }

  const [{ data: table }, { data: fnbOrders }, promoConfig] = await Promise.all(
    [
      supabase
        .from("tables")
        .select("id, name, category, hourly_rate, minute_rate")
        .eq("id", session.table_id)
        .maybeSingle(),
      supabase
        .from("session_fnb_orders")
        .select("id, fnb_item_id, item_name, quantity, unit_price, subtotal")
        .eq("session_id", session.id)
        .order("created_at", { ascending: true }),
      loadPromoDiscountsServer(),
    ],
  );

  if (!table) {
    return NextResponse.json(
      { error: "Data meja tidak ditemukan." },
      { status: 404 },
    );
  }

  const now = new Date();
  const startMs = new Date(session.start_time).getTime();
  const elapsedMinutes = Math.max(
    1,
    Math.ceil(Math.max(0, now.getTime() - startMs) / 60_000),
  );

  const finalDurationMinutes =
    session.billing_mode === "open_table"
      ? elapsedMinutes
      : session.duration_minutes;

  const finalTableCost =
    session.billing_mode === "open_table"
      ? elapsedMinutes * table.minute_rate
      : session.table_cost;

  const orders = fnbOrders ?? [];
  const finalFnbCost = orders.reduce((acc, item) => acc + item.subtotal, 0);
  const subtotal = finalTableCost + finalFnbCost;

  // Hitung promo otomatis per kategori meja & F&B (tanpa double-diskon pada booking yang sudah dipotong)
  const hasLockedBookingDiscount =
    Boolean(session.booking_id) && session.discount_amount > 0;

  const tablePromoDiscount = hasLockedBookingDiscount
    ? Math.min(finalTableCost, session.discount_amount)
    : applyPromo
      ? getBestTablePromoForTable(
          promoConfig,
          table.id,
          table.category,
          finalTableCost,
        ).discountAmount
      : 0;

  const fnbPromoDiscount =
    applyPromo && orders.length > 0
      ? calculateFnbOrdersPromoDiscount(promoConfig, orders).discountAmount
      : 0;

  const remainingAfterPromo = Math.max(
    0,
    subtotal - tablePromoDiscount - fnbPromoDiscount,
  );

  let manualDiscountAmount = 0;
  if (discountType === "percent") {
    const clampedPercent = Math.min(100, discountValue);
    manualDiscountAmount = Math.round(
      (remainingAfterPromo * clampedPercent) / 100,
    );
  } else {
    manualDiscountAmount = Math.min(
      remainingAfterPromo,
      Math.round(discountValue),
    );
  }

  const discountAmount = Math.min(
    subtotal,
    tablePromoDiscount + fnbPromoDiscount + manualDiscountAmount,
  );
  const finalTotalAmount = Math.max(0, subtotal - discountAmount);
  const endTimeIso = now.toISOString();

  const { error: updateSessionError } = await supabase
    .from("sessions")
    .update({
      end_time: endTimeIso,
      duration_minutes: finalDurationMinutes,
      table_cost: finalTableCost,
      fnb_cost: finalFnbCost,
      discount_amount: discountAmount,
      total_amount: finalTotalAmount,
      payment_method: paymentMethod,
      status: "completed",
    })
    .eq("id", session.id);

  if (updateSessionError) {
    return NextResponse.json(
      { error: "Gagal menyelesaikan pembayaran sesi." },
      { status: 500 },
    );
  }

  if (session.booking_id) {
    await supabase
      .from("bookings")
      .update({ status: "completed" })
      .eq("id", session.booking_id);
  }

  const todayWib = getWibNow(now).dateYmd;
  const { data: otherConfirmed } = await supabase
    .from("bookings")
    .select("id")
    .eq("table_id", table.id)
    .eq("booking_date", todayWib)
    .eq("status", "confirmed")
    .limit(1);

  const nextTableStatus =
    (otherConfirmed?.length ?? 0) > 0 ? "booked" : "available";

  await supabase
    .from("tables")
    .update({ status: nextTableStatus })
    .eq("id", table.id);

  const receipt: CheckoutReceiptData = {
    session_id: session.id,
    table_name: table.name,
    customer_name: session.customer_name,
    billing_mode: session.billing_mode as BillingMode,
    start_time: session.start_time,
    end_time: endTimeIso,
    duration_minutes: finalDurationMinutes,
    table_cost: finalTableCost,
    fnb_cost: finalFnbCost,
    discount_amount: discountAmount,
    total_amount: finalTotalAmount,
    payment_method: paymentMethod,
    fnb_orders: orders,
  };

  return NextResponse.json({ ok: true, receipt });
}
