import type { Metadata } from "next";
import DiscountManager from "@/components/kasir/DiscountManager";
import KasirPinGate from "@/components/kasir/KasirPinGate";
import { isKasirAuthenticated } from "@/lib/kasir-auth";
import { loadPromoDiscountsServer } from "@/lib/promo-discounts-server";
import {
  createAdminSupabaseClient,
  isAdminSupabaseConfigured,
} from "@/lib/supabase/admin";
import type {
  BilliardTable,
  FnbCategory,
  TableCategory,
  TableStatus,
} from "@/types/database";
import type { FnbMenuItem } from "@/types/kasir";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pengaturan Diskon Promo",
  description:
    "Atur diskon per kategori, meja tertentu, dan menu F&B tertentu di 1St!cx Billiard (Onesticx).",
};

export default async function KasirDiskonPage() {
  if (!isAdminSupabaseConfigured()) {
    return <KasirPinGate isServerKeyConfigured={false} />;
  }

  if (!(await isKasirAuthenticated())) {
    return <KasirPinGate isServerKeyConfigured={true} />;
  }

  const supabase = createAdminSupabaseClient();
  const [initialDiscounts, tablesRes, fnbRes] = await Promise.all([
    loadPromoDiscountsServer(),
    supabase
      .from("tables")
      .select("id, name, category, hourly_rate, minute_rate, status, sort_order")
      .order("sort_order", { ascending: true }),
    supabase
      .from("fnb_items")
      .select("id, name, category, price, is_available")
      .order("category", { ascending: true })
      .order("name", { ascending: true }),
  ]);

  const tables: BilliardTable[] = (tablesRes.data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    category: t.category as TableCategory,
    hourly_rate: t.hourly_rate,
    minute_rate: t.minute_rate,
    status: t.status as TableStatus,
    sort_order: t.sort_order,
  }));

  const fnbItems: FnbMenuItem[] = (fnbRes.data ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    category: f.category as FnbCategory,
    price: f.price,
    is_available: f.is_available,
  }));

  return (
    <DiscountManager
      initialDiscounts={initialDiscounts}
      tables={tables}
      fnbItems={fnbItems}
    />
  );
}
