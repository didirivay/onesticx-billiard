import { createPublicServerSupabaseClient } from "@/lib/supabase/server";
import {
  createAdminSupabaseClient,
  isAdminSupabaseConfigured,
} from "@/lib/supabase/admin";
import {
  PROMO_DISCOUNTS_SETTINGS_KEY,
  parsePromoDiscounts,
  type PromoDiscountsConfig,
} from "@/lib/promo-discounts";

export async function loadPromoDiscountsServer(): Promise<PromoDiscountsConfig> {
  const supabase = isAdminSupabaseConfigured()
    ? createAdminSupabaseClient()
    : createPublicServerSupabaseClient();

  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", PROMO_DISCOUNTS_SETTINGS_KEY)
    .maybeSingle();

  return parsePromoDiscounts(data?.value);
}
