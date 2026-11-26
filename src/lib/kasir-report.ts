import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { formatIndonesianDate, getWibNow } from "@/lib/format";
import type { BillingMode, PaymentMethod } from "@/types/database";
import type { DailyReportData, DailyReportTransaction } from "@/types/kasir";

function addOneDayYmd(dateYmd: string): string {
  const d = new Date(`${dateYmd}T12:00:00+07:00`);
  d.setUTCDate(d.getUTCDate() + 1);
  return getWibNow(d).dateYmd;
}

export async function loadDailyReportData(
  rawDateYmd?: string,
  mode: "calendar" | "shift" = "calendar",
): Promise<DailyReportData> {
  const dateYmd =
    rawDateYmd && /^\d{4}-\d{2}-\d{2}$/.test(rawDateYmd)
      ? rawDateYmd
      : getWibNow().dateYmd;

  const nextDayYmd = addOneDayYmd(dateYmd);

  const rangeStartIso =
    mode === "shift"
      ? `${dateYmd}T10:00:00+07:00`
      : `${dateYmd}T00:00:00+07:00`;
  const rangeEndIso =
    mode === "shift"
      ? `${nextDayYmd}T02:00:00+07:00`
      : `${nextDayYmd}T00:00:00+07:00`;

  const rangeLabel =
    mode === "shift"
      ? `${formatIndonesianDate(dateYmd)} (Shift 10.00 - 02.00 WIB)`
      : `${formatIndonesianDate(dateYmd)} (00.00 - 23.59 WIB)`;

  const supabase = createAdminSupabaseClient();

  const [sessionsRes, tablesRes] = await Promise.all([
    supabase
      .from("sessions")
      .select(
        "id, table_id, customer_name, billing_mode, start_time, end_time, duration_minutes, table_cost, fnb_cost, discount_amount, total_amount, payment_method, created_at",
      )
      .eq("status", "completed")
      .gte("end_time", rangeStartIso)
      .lt("end_time", rangeEndIso)
      .order("end_time", { ascending: false }),
    supabase.from("tables").select("id, name, category"),
  ]);

  const tableMap = new Map(
    (tablesRes.data ?? []).map((t) => [t.id, t]),
  );

  const completedSessions = sessionsRes.data ?? [];
  const ordersBySessionId = new Map<
    string,
    DailyReportTransaction["fnb_orders"]
  >();

  if (completedSessions.length > 0) {
    const { data: orderRows } = await supabase
      .from("session_fnb_orders")
      .select("id, session_id, item_name, quantity, unit_price, subtotal")
      .in(
        "session_id",
        completedSessions.map((s) => s.id),
      )
      .order("created_at", { ascending: true });

    for (const row of orderRows ?? []) {
      const list = ordersBySessionId.get(row.session_id) ?? [];
      list.push({
        id: row.id,
        item_name: row.item_name,
        quantity: row.quantity,
        unit_price: row.unit_price,
        subtotal: row.subtotal,
      });
      ordersBySessionId.set(row.session_id, list);
    }
  }

  const byPaymentMethod = {
    tunai: { total: 0, count: 0 },
    qris: { total: 0, count: 0 },
    transfer: { total: 0, count: 0 },
  };

  let totalRevenue = 0;
  let totalTableRevenue = 0;
  let totalFnbRevenue = 0;
  let totalDiscount = 0;

  const transactions: DailyReportTransaction[] = completedSessions.map((s) => {
    const tbl = tableMap.get(s.table_id);
    const method: PaymentMethod =
      s.payment_method === "qris" || s.payment_method === "transfer"
        ? s.payment_method
        : "tunai";

    totalRevenue += s.total_amount;
    totalTableRevenue += s.table_cost;
    totalFnbRevenue += s.fnb_cost;
    totalDiscount += s.discount_amount;
    byPaymentMethod[method].total += s.total_amount;
    byPaymentMethod[method].count += 1;

    return {
      id: s.id,
      table_name: tbl?.name ?? "Meja",
      table_category: tbl?.category ?? "indoor",
      customer_name: s.customer_name,
      billing_mode: s.billing_mode as BillingMode,
      start_time: s.start_time,
      end_time: s.end_time ?? s.created_at,
      duration_minutes: s.duration_minutes,
      table_cost: s.table_cost,
      fnb_cost: s.fnb_cost,
      discount_amount: s.discount_amount,
      total_amount: s.total_amount,
      payment_method: method,
      fnb_orders: ordersBySessionId.get(s.id) ?? [],
    };
  });

  return {
    dateYmd,
    mode,
    rangeLabel,
    summary: {
      totalRevenue,
      totalTransactions: transactions.length,
      totalTableRevenue,
      totalFnbRevenue,
      totalDiscount,
      byPaymentMethod,
    },
    transactions,
  };
}
