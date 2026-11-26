import type { Metadata } from "next";
import FnbManager from "@/components/kasir/FnbManager";
import KasirPinGate from "@/components/kasir/KasirPinGate";
import { isKasirAuthenticated } from "@/lib/kasir-auth";
import {
  createAdminSupabaseClient,
  isAdminSupabaseConfigured,
} from "@/lib/supabase/admin";
import type { FnbCategory } from "@/types/database";
import type { FnbMenuItem } from "@/types/kasir";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Menu F&B Kasir",
  description:
    "Manajemen menu makanan, minuman, dan snack 1St!cx Billiard (Onesticx).",
};

export default async function KasirFnbPage() {
  if (!isAdminSupabaseConfigured()) {
    return <KasirPinGate isServerKeyConfigured={false} />;
  }

  if (!(await isKasirAuthenticated())) {
    return <KasirPinGate isServerKeyConfigured={true} />;
  }

  const supabase = createAdminSupabaseClient();
  const { data } = await supabase
    .from("fnb_items")
    .select("id, name, category, price, is_available")
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  const initialItems: FnbMenuItem[] = (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category as FnbCategory,
    price: row.price,
    is_available: row.is_available,
  }));

  return <FnbManager initialItems={initialItems} />;
}
