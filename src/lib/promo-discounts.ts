import type { TableCategory } from "@/types/database";

export type PromoScope = "indoor" | "outdoor" | "high_table" | "fnb";
export type DiscountRuleType = "percent" | "nominal";

export interface CategoryDiscountRule {
  id: string;
  scope: PromoScope;
  enabled: boolean;
  label: string;
  type: DiscountRuleType;
  value: number;
  apply_to_all: boolean;
  target_ids: string[];
}

export interface PromoDiscountsConfig {
  indoor: CategoryDiscountRule;
  outdoor: CategoryDiscountRule;
  high_table: CategoryDiscountRule;
  fnb: CategoryDiscountRule;
  custom_rules: CategoryDiscountRule[];
}

export const PROMO_DISCOUNTS_SETTINGS_KEY = "promo_discounts";

function makeDefaultRule(scope: PromoScope): CategoryDiscountRule {
  return {
    id: scope,
    scope,
    enabled: false,
    label: "",
    type: "percent",
    value: 0,
    apply_to_all: true,
    target_ids: [],
  };
}

export const DEFAULT_PROMO_DISCOUNTS: PromoDiscountsConfig = {
  indoor: makeDefaultRule("indoor"),
  outdoor: makeDefaultRule("outdoor"),
  high_table: makeDefaultRule("high_table"),
  fnb: makeDefaultRule("fnb"),
  custom_rules: [],
};

const VALID_SCOPES: PromoScope[] = ["indoor", "outdoor", "high_table", "fnb"];

function sanitizeRule(
  input: unknown,
  fallbackScope: PromoScope,
  fallbackId?: string,
): CategoryDiscountRule {
  if (!input || typeof input !== "object") {
    return makeDefaultRule(fallbackScope);
  }
  const raw = input as Record<string, unknown>;
  const scope: PromoScope =
    typeof raw.scope === "string" &&
    VALID_SCOPES.includes(raw.scope as PromoScope)
      ? (raw.scope as PromoScope)
      : fallbackScope;

  const id =
    typeof raw.id === "string" && raw.id.trim().length > 0
      ? raw.id.trim().slice(0, 64)
      : (fallbackId ?? scope);

  const type: DiscountRuleType = raw.type === "nominal" ? "nominal" : "percent";
  const rawNum =
    typeof raw.value === "number"
      ? raw.value
      : Number.parseFloat(String(raw.value ?? "0"));
  const safeNum = Number.isFinite(rawNum) && rawNum > 0 ? Math.round(rawNum) : 0;
  const clampedValue =
    type === "percent" ? Math.min(100, safeNum) : Math.min(10_000_000, safeNum);

  const label =
    typeof raw.label === "string" ? raw.label.trim().slice(0, 60) : "";

  const applyToAll =
    typeof raw.apply_to_all === "boolean" ? raw.apply_to_all : true;

  const targetIds = Array.isArray(raw.target_ids)
    ? [
        ...new Set(
          raw.target_ids
            .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
            .map((x) => x.trim()),
        ),
      ].slice(0, 100)
    : [];

  return {
    id,
    scope,
    enabled: Boolean(raw.enabled),
    label,
    type,
    value: clampedValue,
    apply_to_all: applyToAll,
    target_ids: targetIds,
  };
}

export function parsePromoDiscounts(
  rawJson: string | null | undefined,
): PromoDiscountsConfig {
  if (!rawJson) return { ...DEFAULT_PROMO_DISCOUNTS, custom_rules: [] };
  try {
    const parsed = JSON.parse(rawJson) as Record<string, unknown>;
    return sanitizePromoDiscountsPayload(parsed);
  } catch {
    return { ...DEFAULT_PROMO_DISCOUNTS, custom_rules: [] };
  }
}

export function sanitizePromoDiscountsPayload(
  payload: unknown,
): PromoDiscountsConfig {
  if (!payload || typeof payload !== "object") {
    return { ...DEFAULT_PROMO_DISCOUNTS, custom_rules: [] };
  }
  const obj = payload as Record<string, unknown>;

  const rawCustom = Array.isArray(obj.custom_rules) ? obj.custom_rules : [];
  const customRules: CategoryDiscountRule[] = rawCustom
    .slice(0, 20)
    .map((entry, idx) =>
      sanitizeRule(entry, "indoor", `custom-${idx + 1}`),
    );

  return {
    indoor: sanitizeRule(obj.indoor, "indoor", "indoor"),
    outdoor: sanitizeRule(obj.outdoor, "outdoor", "outdoor"),
    high_table: sanitizeRule(obj.high_table, "high_table", "high_table"),
    fnb: sanitizeRule(obj.fnb, "fnb", "fnb"),
    custom_rules: customRules,
  };
}

export function isRuleEffective(rule: CategoryDiscountRule): boolean {
  if (!rule.enabled || rule.value <= 0) return false;
  if (!rule.apply_to_all && rule.target_ids.length === 0) return false;
  return true;
}

/**
 * Hitung potongan Rupiah dari satu aturan diskon terhadap nominal dasar.
 */
export function calculateRuleDiscount(
  baseAmount: number,
  rule: CategoryDiscountRule | null | undefined,
): number {
  if (!rule || !isRuleEffective(rule) || baseAmount <= 0) {
    return 0;
  }
  if (rule.type === "percent") {
    const pct = Math.min(100, Math.max(0, rule.value));
    return Math.min(baseAmount, Math.round((baseAmount * pct) / 100));
  }
  return Math.min(baseAmount, Math.round(rule.value));
}

export function getAllRulesForScope(
  config: PromoDiscountsConfig,
  scope: PromoScope,
): CategoryDiscountRule[] {
  const baseRule = config[scope];
  const extras = (config.custom_rules ?? []).filter((r) => r.scope === scope);
  return [baseRule, ...extras];
}

/**
 * Cari promo aktif terbaik yang berlaku untuk meja tertentu (id + kategori).
 * Mendukung aturan "Semua Meja di Kategori" maupun "Meja Tertentu" + aturan custom.
 */
export function getBestTablePromoForTable(
  config: PromoDiscountsConfig,
  tableId: string,
  tableCategory: TableCategory | string,
  baseAmount: number,
): { rule: CategoryDiscountRule | null; discountAmount: number } {
  const scope: PromoScope =
    tableCategory === "outdoor"
      ? "outdoor"
      : tableCategory === "high_table"
        ? "high_table"
        : "indoor";

  const candidates = getAllRulesForScope(config, scope).filter((rule) => {
    if (!isRuleEffective(rule)) return false;
    if (rule.apply_to_all) return true;
    return rule.target_ids.includes(tableId);
  });

  if (candidates.length === 0) {
    return { rule: null, discountAmount: 0 };
  }

  let bestRule: CategoryDiscountRule | null = null;
  let bestDiscount = 0;

  for (const rule of candidates) {
    const disc =
      baseAmount > 0
        ? calculateRuleDiscount(baseAmount, rule)
        : calculateRuleDiscount(100_000, rule);
    if (disc > bestDiscount || (disc === bestDiscount && !bestRule)) {
      bestDiscount = disc;
      bestRule = rule;
    }
  }

  return {
    rule: bestRule,
    discountAmount:
      bestRule && baseAmount > 0
        ? calculateRuleDiscount(baseAmount, bestRule)
        : 0,
  };
}

/**
 * Hitung total promo F&B untuk daftar pesanan F&B di sebuah sesi meja.
 * Mendukung "Semua Menu F&B", "Menu F&B Tertentu", maupun beberapa aturan F&B custom
 * tanpa memotong ganda pada item yang sama.
 */
export function calculateFnbOrdersPromoDiscount(
  config: PromoDiscountsConfig,
  orders: Array<{ fnb_item_id: string | null; subtotal: number }>,
): { discountAmount: number; appliedRules: CategoryDiscountRule[] } {
  if (orders.length === 0) {
    return { discountAmount: 0, appliedRules: [] };
  }

  const activeFnbRules = getAllRulesForScope(config, "fnb").filter(
    isRuleEffective,
  );
  if (activeFnbRules.length === 0) {
    return { discountAmount: 0, appliedRules: [] };
  }

  const totalFnb = orders.reduce((sum, o) => sum + o.subtotal, 0);
  if (totalFnb <= 0) {
    return { discountAmount: 0, appliedRules: [] };
  }

  // Kelompokkan item ke aturan yang paling menguntungkan per item (untuk persen)
  // atau hitung per aturan nominal berdasarkan subtotal item yang cocok
  const ruleMatchedSubtotal = new Map<string, number>();
  const ruleById = new Map(activeFnbRules.map((r) => [r.id, r]));

  for (const order of orders) {
    if (order.subtotal <= 0) continue;

    const matching = activeFnbRules.filter((rule) => {
      if (rule.apply_to_all) return true;
      return Boolean(
        order.fnb_item_id && rule.target_ids.includes(order.fnb_item_id),
      );
    });

    if (matching.length === 0) continue;

    // Pilih aturan terbaik untuk baris pesanan ini
    let bestRule = matching[0];
    let bestValue = calculateRuleDiscount(order.subtotal, bestRule);
    for (let i = 1; i < matching.length; i += 1) {
      const candidate = matching[i];
      const val = calculateRuleDiscount(order.subtotal, candidate);
      if (val > bestValue) {
        bestValue = val;
        bestRule = candidate;
      }
    }

    ruleMatchedSubtotal.set(
      bestRule.id,
      (ruleMatchedSubtotal.get(bestRule.id) ?? 0) + order.subtotal,
    );
  }

  let totalDiscount = 0;
  const appliedRules: CategoryDiscountRule[] = [];

  for (const [ruleId, eligibleSubtotal] of ruleMatchedSubtotal.entries()) {
    const rule = ruleById.get(ruleId);
    if (!rule || eligibleSubtotal <= 0) continue;
    const disc = calculateRuleDiscount(eligibleSubtotal, rule);
    if (disc > 0) {
      totalDiscount += disc;
      appliedRules.push(rule);
    }
  }

  return {
    discountAmount: Math.min(totalFnb, totalDiscount),
    appliedRules,
  };
}

/**
 * Format label singkat badge promo, contoh: "Diskon 10%" atau "Hemat Rp 5.000".
 */
export function formatPromoShortTag(rule: CategoryDiscountRule): string {
  if (!isRuleEffective(rule)) return "";
  if (rule.type === "percent") {
    return `Diskon ${rule.value}%`;
  }
  const formatted = new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 0,
  }).format(rule.value);
  return `Hemat Rp ${formatted}`;
}
