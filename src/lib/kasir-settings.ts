import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { BilliardTable, TableCategory, TableStatus } from "@/types/database";
import type { KasirStoreSettings } from "@/types/kasir";

export async function loadKasirSettingsPageData(): Promise<{
  settings: KasirStoreSettings;
  tables: BilliardTable[];
}> {
  const supabase = createAdminSupabaseClient();

  const [settingsRes, tablesRes] = await Promise.all([
    supabase
      .from("app_settings")
      .select("key, value")
      .in("key", ["whatsapp_kasir", "bank_name", "bank_account", "bank_holder"]),
    supabase
      .from("tables")
      .select("id, name, category, hourly_rate, minute_rate, status, sort_order")
      .order("sort_order", { ascending: true }),
  ]);

  const map = Object.fromEntries(
    (settingsRes.data ?? []).map((row) => [row.key, row.value]),
  );

  const settings: KasirStoreSettings = {
    whatsapp_kasir: map.whatsapp_kasir ?? "6281234567890",
    bank_name: map.bank_name ?? "BSI",
    bank_account: map.bank_account ?? "123456789",
    bank_holder: map.bank_holder ?? "Onesticx Billiard",
  };

  const tables: BilliardTable[] = (tablesRes.data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    category: t.category as TableCategory,
    hourly_rate: t.hourly_rate,
    minute_rate: t.minute_rate,
    status: t.status as TableStatus,
    sort_order: t.sort_order,
  }));

  return { settings, tables };
}
