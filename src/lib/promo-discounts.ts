import type { TableCategory } from "@/types/database";

export type PromoScope = "indoor" | "outdoor" | "high_table" | "fnb";
export type DiscountRuleType = "percent" | "nominal" | "duration_percent";

export const DURATION_TIER_HOURS = [1, 2, 3, 4, 5] as const;
export type DurationTierKey = "1" | "2" | "3" | "4" | "5";
export type DurationDiscountTiers = Record<DurationTierKey, number>;

export interface CategoryDiscountRule {
  id: string;
  scope: PromoScope;
  enabled: boolean;
  label: string;
  type: DiscountRuleType;
  value: number;
  duration_tiers: DurationDiscountTiers;
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

export function makeDefaultDurationTiers(): DurationDiscountTiers {
  return {
    "1": 0,
    "2": 0,
    "3": 0,
    "4": 0,
    "5": 0,
  };
}

function makeDefaultRule(scope: PromoScope): CategoryDiscountRule {
  return {
    id: scope,
    scope,
    enabled: false,
    label: "",
    type: "percent",
    value: 0,
    duration_tiers: makeDefaultDurationTiers(),
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

function sanitizeDurationTiers(input: unknown): DurationDiscountTiers {
  const result = makeDefaultDurationTiers();
  if (!input || typeof input !== "object") return result;
  const raw = input as Record<string, unknown>;

  for (const h of DURATION_TIER_HOURS) {
    const key = String(h) as DurationTierKey;
    const rawVal = raw[key];
    const num =
      typeof rawVal === "number"
        ? rawVal
        : Number.parseFloat(String(rawVal ?? "0"));
    result[key] =
      Number.isFinite(num) && num > 0 ? Math.min(100, Math.round(num)) : 0;
  }

  return result;
}

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

  let type: DiscountRuleType =
    raw.type === "nominal"
      ? "nominal"
      : raw.type === "duration_percent"
        ? "duration_percent"
        : "percent";

  // Mode diskon per durasi jam hanya berlaku untuk sewa meja, bukan F&B
  if (scope === "fnb" && type === "duration_percent") {
    type = "percent";
  }

  const rawNum =
    typeof raw.value === "number"
      ? raw.value
      : Number.parseFloat(String(raw.value ?? "0"));
  const safeNum = Number.isFinite(rawNum) && rawNum > 0 ? Math.round(rawNum) : 0;
  const clampedValue =
    type === "nominal" ? Math.min(10_000_000, safeNum) : Math.min(100, safeNum);

  const durationTiers = sanitizeDurationTiers(raw.duration_tiers);

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
    duration_tiers: durationTiers,
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

/**
 * Ambil persentase diskon untuk durasi tertentu (1..5 jam; durasi 6–10 jam mengikuti tier 5 jam).
 */
export function getDurationTierPercent(
  tiers: DurationDiscountTiers | undefined,
  durationHours?: number,
): number {
  if (!tiers || typeof durationHours !== "number" || !Number.isFinite(durationHours)) {
    return 0;
  }
  const wholeHours = Math.floor(durationHours);
  if (wholeHours < 1) return 0;
  const clamped = Math.min(5, wholeHours);
  const key = String(clamped) as DurationTierKey;
  const raw = tiers[key] ?? 0;
  return Number.isFinite(raw) && raw > 0 ? Math.min(100, Math.round(raw)) : 0;
}

export function hasAnyDurationTierDiscount(
  tiers: DurationDiscountTiers | undefined,
): boolean {
  if (!tiers) return false;
  return DURATION_TIER_HOURS.some(
    (h) => (tiers[String(h) as DurationTierKey] ?? 0) > 0,
  );
}

export function getMaxDurationTierPercent(
  tiers: DurationDiscountTiers | undefined,
): number {
  if (!tiers) return 0;
  let max = 0;
  for (const h of DURATION_TIER_HOURS) {
    const val = tiers[String(h) as DurationTierKey] ?? 0;
    if (val > max) max = val;
  }
  return Math.min(100, Math.max(0, Math.round(max)));
}

export function isRuleEffective(rule: CategoryDiscountRule): boolean {
  if (!rule.enabled) return false;
  if (!rule.apply_to_all && rule.target_ids.length === 0) return false;
  if (rule.type === "duration_percent") {
    return rule.scope !== "fnb" && hasAnyDurationTierDiscount(rule.duration_tiers);
  }
  return rule.value > 0;
}

/**
 * Hitung potongan Rupiah dari satu aturan diskon terhadap nominal dasar.
 * Untuk mode `duration_percent`, wajib menyertakan `durationHours`.
 */
export function calculateRuleDiscount(
  baseAmount: number,
  rule: CategoryDiscountRule | null | undefined,
  durationHours?: number,
): number {
  if (!rule || !isRuleEffective(rule) || baseAmount <= 0) {
    return 0;
  }
  if (rule.type === "duration_percent") {
    const pct = getDurationTierPercent(rule.duration_tiers, durationHours);
    if (pct <= 0) return 0;
    return Math.min(baseAmount, Math.round((baseAmount * pct) / 100));
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
 * - Jika `durationHours` diberikan (booking/checkout/estimasi sesi aktif):
 *   dihitung akurat sesuai durasi tersebut (aturan 0% untuk durasi itu tidak dipilih).
 * - Jika `durationHours` tidak diberikan (pratinjau badge kartu meja):
 *   aturan `duration_percent` tetap terdeteksi untuk badge promo, dengan potongan
 *   per jam mengikuti tier 1 jam.
 */
export function getBestTablePromoForTable(
  config: PromoDiscountsConfig,
  tableId: string,
  tableCategory: TableCategory | string,
  baseAmount: number,
  durationHours?: number,
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
  let bestScore = 0;

  for (const rule of candidates) {
    let score = 0;
    if (typeof durationHours === "number") {
      score =
        baseAmount > 0
          ? calculateRuleDiscount(baseAmount, rule, durationHours)
          : calculateRuleDiscount(100_000, rule, durationHours);
    } else if (rule.type === "duration_percent") {
      // Untuk pratinjau kartu meja, bandingkan potensi potongan maksimal (hingga tier 5 jam)
      const maxPct = getMaxDurationTierPercent(rule.duration_tiers);
      const refBase = baseAmount > 0 ? baseAmount : 100_000;
      score = Math.round((refBase * maxPct) / 100);
    } else {
      score =
        baseAmount > 0
          ? calculateRuleDiscount(baseAmount, rule)
          : calculateRuleDiscount(100_000, rule);
    }

    if (score > bestScore) {
      bestScore = score;
      bestRule = rule;
    }
  }

  if (!bestRule || bestScore <= 0) {
    return { rule: null, discountAmount: 0 };
  }

  const effectiveHoursForAmount =
    typeof durationHours === "number" ? durationHours : 1;

  return {
    rule: bestRule,
    discountAmount:
      baseAmount > 0
        ? calculateRuleDiscount(baseAmount, bestRule, effectiveHoursForAmount)
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
 * Format label singkat badge promo, contoh: "Diskon 10%", "Diskon s/d 25%", atau "Hemat Rp 5.000".
 */
export function formatPromoShortTag(
  rule: CategoryDiscountRule,
  durationHours?: number,
): string {
  if (!isRuleEffective(rule)) return "";
  if (rule.type === "duration_percent") {
    if (typeof durationHours === "number") {
      const pct = getDurationTierPercent(rule.duration_tiers, durationHours);
      return pct > 0 ? `Diskon ${pct}%` : "";
    }
    const nonZero = DURATION_TIER_HOURS.map(
      (h) => rule.duration_tiers[String(h) as DurationTierKey] ?? 0,
    ).filter((v) => v > 0);
    if (nonZero.length === 0) return "";
    const minPct = Math.min(...nonZero);
    const maxPct = Math.max(...nonZero);
    return minPct === maxPct ? `Diskon ${maxPct}%` : `Diskon s/d ${maxPct}%`;
  }
  if (rule.type === "percent") {
    return `Diskon ${rule.value}%`;
  }
  const formatted = new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 0,
  }).format(rule.value);
  return `Hemat Rp ${formatted}`;
}
