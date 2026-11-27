"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  CheckCircle2,
  Coffee,
  Loader2,
  Percent,
  Plus,
  Power,
  RotateCcw,
  Sparkles,
  Sun,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import KasirTopBar from "@/components/kasir/KasirTopBar";
import { formatRupiah } from "@/lib/format";
import {
  DURATION_TIER_HOURS,
  calculateRuleDiscount,
  formatPromoShortTag,
  hasAnyDurationTierDiscount,
  isRuleEffective,
  makeDefaultDurationTiers,
  type CategoryDiscountRule,
  type DiscountRuleType,
  type DurationDiscountTiers,
  type DurationTierKey,
  type PromoDiscountsConfig,
  type PromoScope,
} from "@/lib/promo-discounts";
import type { BilliardTable } from "@/types/database";
import type { FnbMenuItem } from "@/types/kasir";

interface DiscountManagerProps {
  initialDiscounts: PromoDiscountsConfig;
  tables: BilliardTable[];
  fnbItems: FnbMenuItem[];
}

interface ScopeMeta {
  key: PromoScope;
  title: string;
  shortLabel: string;
  sampleLabel: string;
  sampleAmount: number;
  Icon: typeof Tag;
}

const SCOPE_META: Record<PromoScope, ScopeMeta> = {
  indoor: {
    key: "indoor",
    title: "Diskon Meja Indoor",
    shortLabel: "Indoor",
    sampleLabel: "Simulasi 1 jam Indoor",
    sampleAmount: 50000,
    Icon: Tag,
  },
  outdoor: {
    key: "outdoor",
    title: "Diskon Meja Outdoor",
    shortLabel: "Outdoor",
    sampleLabel: "Simulasi 1 jam Outdoor",
    sampleAmount: 40000,
    Icon: Sun,
  },
  fnb: {
    key: "fnb",
    title: "Diskon F&B (Makanan & Minuman)",
    shortLabel: "F&B",
    sampleLabel: "Simulasi tagihan F&B",
    sampleAmount: 50000,
    Icon: Coffee,
  },
  high_table: {
    key: "high_table",
    title: "Diskon High Table (VIP)",
    shortLabel: "High Table",
    sampleLabel: "Simulasi 1 jam High Table",
    sampleAmount: 100000,
    Icon: Sparkles,
  },
};

const BASE_SCOPE_ORDER: PromoScope[] = ["indoor", "outdoor", "fnb", "high_table"];
const PERCENT_PRESETS = [5, 10, 15, 20, 25];
const NOMINAL_PRESETS = [5000, 10000, 15000, 20000];
const DURATION_TIER_PRESETS: Array<{
  label: string;
  tiers: DurationDiscountTiers;
}> = [
  {
    label: "Bertahap 5–25%",
    tiers: { "1": 5, "2": 10, "3": 15, "4": 20, "5": 25 },
  },
  {
    label: "Mulai 2j (10–25%)",
    tiers: { "1": 0, "2": 10, "3": 15, "4": 20, "5": 25 },
  },
  {
    label: "Bertahap 10–30%",
    tiers: { "1": 10, "2": 15, "3": 20, "4": 25, "5": 30 },
  },
];

const DEFAULT_STARTER_TIERS: DurationDiscountTiers = {
  "1": 5,
  "2": 10,
  "3": 15,
  "4": 20,
  "5": 25,
};

export default function DiscountManager({
  initialDiscounts,
  tables,
  fnbItems,
}: DiscountManagerProps) {
  const [config, setConfig] = useState<PromoDiscountsConfig>(initialDiscounts);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modal buat aturan diskon custom baru (untuk meja tertentu / menu F&B tertentu)
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newScope, setNewScope] = useState<PromoScope>("indoor");
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState<DiscountRuleType>("percent");
  const [newValue, setNewValue] = useState("10");
  const [newDurationTiers, setNewDurationTiers] = useState<DurationDiscountTiers>(
    () => ({ ...DEFAULT_STARTER_TIERS }),
  );
  const [newApplyAll, setNewApplyAll] = useState(false);
  const [newTargetIds, setNewTargetIds] = useState<string[]>([]);

  const debounceRef = useRef<number | null>(null);
  const latestReqIdRef = useRef<number>(0);

  // Simpan otomatis ke Supabase tanpa perlu tombol "Simpan Semua Diskon"
  const persistConfig = useCallback(async (nextConfig: PromoDiscountsConfig) => {
    const reqId = ++latestReqIdRef.current;
    setSaveState("saving");
    setErrorMessage(null);

    try {
      const res = await fetch("/api/kasir/diskon", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discounts: nextConfig }),
      });
      const payload = (await res.json()) as {
        ok?: boolean;
        discounts?: PromoDiscountsConfig;
        error?: string;
      };

      if (reqId !== latestReqIdRef.current) return;

      if (!res.ok || !payload.ok) {
        setSaveState("error");
        setErrorMessage(payload.error ?? "Gagal menyimpan perubahan diskon.");
        return;
      }

      setSaveState("saved");
      window.setTimeout(() => {
        if (reqId === latestReqIdRef.current) {
          setSaveState("idle");
        }
      }, 2200);
    } catch {
      if (reqId === latestReqIdRef.current) {
        setSaveState("error");
        setErrorMessage("Koneksi bermasalah saat menyimpan diskon.");
      }
    }
  }, []);

  const commitConfig = useCallback(
    (nextConfig: PromoDiscountsConfig, immediate: boolean) => {
      setConfig(nextConfig);
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      if (immediate) {
        void persistConfig(nextConfig);
      } else {
        setSaveState("saving");
        debounceRef.current = window.setTimeout(() => {
          void persistConfig(nextConfig);
        }, 450);
      }
    },
    [persistConfig],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const allRules = useMemo(() => {
    const base = BASE_SCOPE_ORDER.map((scope) => ({
      rule: config[scope],
      isCustom: false,
    }));
    const custom = (config.custom_rules ?? []).map((rule) => ({
      rule,
      isCustom: true,
    }));
    return [...base, ...custom];
  }, [config]);

  const activeCount = useMemo(
    () => allRules.filter(({ rule }) => isRuleEffective(rule)).length,
    [allRules],
  );

  const getTargetsForScope = useCallback(
    (scope: PromoScope): Array<{ id: string; name: string; sub: string }> => {
      if (scope === "fnb") {
        return fnbItems.map((f) => ({
          id: f.id,
          name: f.name,
          sub: formatRupiah(f.price),
        }));
      }
      return tables
        .filter((t) => t.category === scope)
        .map((t) => ({
          id: t.id,
          name: t.name,
          sub: `${formatRupiah(t.hourly_rate)}/jam`,
        }));
    },
    [tables, fnbItems],
  );

  const patchRule = (
    ruleId: string,
    isCustom: boolean,
    patch: Partial<CategoryDiscountRule>,
    immediate: boolean,
  ) => {
    let nextConfig: PromoDiscountsConfig;
    if (isCustom) {
      nextConfig = {
        ...config,
        custom_rules: (config.custom_rules ?? []).map((r) =>
          r.id === ruleId ? { ...r, ...patch } : r,
        ),
      };
    } else {
      const scope = ruleId as PromoScope;
      nextConfig = {
        ...config,
        [scope]: {
          ...config[scope],
          ...patch,
        },
      };
    }
    commitConfig(nextConfig, immediate);
  };

  const toggleTargetId = (
    rule: CategoryDiscountRule,
    isCustom: boolean,
    targetId: string,
  ) => {
    const exists = rule.target_ids.includes(targetId);
    const nextTargets = exists
      ? rule.target_ids.filter((id) => id !== targetId)
      : [...rule.target_ids, targetId];
    patchRule(
      rule.id,
      isCustom,
      { apply_to_all: false, target_ids: nextTargets },
      true,
    );
  };

  const handleDeleteCustomRule = (ruleId: string) => {
    const nextConfig: PromoDiscountsConfig = {
      ...config,
      custom_rules: (config.custom_rules ?? []).filter((r) => r.id !== ruleId),
    };
    commitConfig(nextConfig, true);
  };

  const handleDisableAll = () => {
    const nextConfig: PromoDiscountsConfig = {
      indoor: { ...config.indoor, enabled: false },
      outdoor: { ...config.outdoor, enabled: false },
      high_table: { ...config.high_table, enabled: false },
      fnb: { ...config.fnb, enabled: false },
      custom_rules: (config.custom_rules ?? []).map((r) => ({
        ...r,
        enabled: false,
      })),
    };
    commitConfig(nextConfig, true);
  };

  const openCreateModal = () => {
    const indoorTargets = getTargetsForScope("indoor");
    setNewScope("indoor");
    setNewLabel("");
    setNewType("percent");
    setNewValue("10");
    setNewDurationTiers({ ...DEFAULT_STARTER_TIERS });
    setNewApplyAll(false);
    setNewTargetIds(indoorTargets[0] ? [indoorTargets[0].id] : []);
    setCreateModalOpen(true);
  };

  const handleCreateCustomRule = (e: React.FormEvent) => {
    e.preventDefault();
    const isDurationMode =
      newType === "duration_percent" && newScope !== "fnb";
    const numeric = Number.parseInt(newValue.replace(/\D/g, ""), 10) || 0;

    if (isDurationMode) {
      if (!hasAnyDurationTierDiscount(newDurationTiers)) return;
    } else if (numeric <= 0) {
      return;
    }

    const clamped = newType === "percent" ? Math.min(100, numeric) : numeric;
    const rule: CategoryDiscountRule = {
      id: `custom-${Date.now().toString(36)}`,
      scope: newScope,
      enabled: true,
      label: newLabel.trim(),
      type: isDurationMode ? "duration_percent" : newType,
      value: isDurationMode ? 0 : clamped,
      duration_tiers: isDurationMode
        ? { ...newDurationTiers }
        : makeDefaultDurationTiers(),
      apply_to_all: newApplyAll,
      target_ids: newApplyAll ? [] : newTargetIds,
    };

    const nextConfig: PromoDiscountsConfig = {
      ...config,
      custom_rules: [...(config.custom_rules ?? []), rule],
    };
    commitConfig(nextConfig, true);
    setCreateModalOpen(false);
  };

  const modalTargets = getTargetsForScope(newScope);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <KasirTopBar activeTab="diskon" />

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-5 p-4 pb-12 lg:p-6">
        {/* Header — Tanpa Tombol Simpan Semua (Auto-Save Instan!) */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-primary">
              Promo &amp; Potongan Harga
            </p>
            <h1 className="mt-0.5 font-heading text-3xl font-bold uppercase tracking-wide text-foreground">
              Pengaturan Diskon Kasir
            </h1>
            <p className="mt-1 text-xs text-muted">
              Cukup aktifkan toggle atau ubah pilihan —{" "}
              <strong className="text-foreground">
                diskon langsung tersimpan &amp; langsung bisa dipakai
              </strong>{" "}
              untuk semua meja atau <strong>hanya meja / menu F&amp;B tertentu</strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {activeCount > 0 && (
              <button
                type="button"
                onClick={handleDisableAll}
                className="flex min-h-[48px] items-center gap-2 rounded-2xl border border-border bg-surface px-4 text-xs font-bold text-muted transition hover:border-status-occupied/50 hover:text-status-occupied"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Matikan Semua</span>
              </button>
            )}

            <button
              type="button"
              onClick={openCreateModal}
              className="flex min-h-[48px] items-center gap-2 rounded-2xl bg-primary px-5 text-sm font-bold text-white shadow-lg shadow-primary/25 transition hover:bg-primary-hover active:scale-[0.98]"
            >
              <Plus className="h-5 w-5" />
              <span>Buat Diskon Khusus</span>
            </button>
          </div>
        </div>

        {/* Strip Status Auto-Save & Promo Aktif */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Percent className="h-4 w-4 text-primary" />
            <span className="font-semibold text-foreground">
              Diskon Aktif Sekarang:
            </span>
            <span
              className={`tabular-nums rounded-full px-2.5 py-0.5 text-xs font-bold ${
                activeCount > 0
                  ? "bg-status-available/15 text-status-available"
                  : "bg-background text-muted"
              }`}
            >
              {activeCount} promo berjalan
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs font-semibold">
            {saveState === "saving" && (
              <span className="inline-flex items-center gap-1.5 text-primary">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Menyimpan otomatis...
              </span>
            )}
            {saveState === "saved" && (
              <span className="inline-flex items-center gap-1.5 text-status-available">
                <CheckCircle2 className="h-4 w-4" />
                Langsung aktif &amp; tersimpan
              </span>
            )}
            {saveState === "error" && (
              <span className="text-status-occupied">
                {errorMessage ?? "Gagal menyimpan"}
              </span>
            )}
            {saveState === "idle" && (
              <span className="text-muted">
                Perubahan otomatis tersimpan instan
              </span>
            )}
          </div>
        </div>

        {/* Grid Kartu Diskon (Kategori + Diskon Khusus Kasir) */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {allRules.map(({ rule, isCustom }) => {
            const meta = SCOPE_META[rule.scope];
            const Icon = meta.Icon;
            const targets = getTargetsForScope(rule.scope);
            const effective = isRuleEffective(rule);
            const shortTag = formatPromoShortTag(rule);
            const sampleDiscount = calculateRuleDiscount(
              meta.sampleAmount,
              rule,
            );
            const sampleAfter = Math.max(0, meta.sampleAmount - sampleDiscount);
            const missingTargetSelection =
              rule.enabled && !rule.apply_to_all && rule.target_ids.length === 0;

            return (
              <section
                key={rule.id}
                className={`flex flex-col justify-between rounded-3xl border bg-surface p-5 transition ${
                  effective
                    ? "border-status-available/55 ring-1 ring-status-available/30"
                    : "border-border"
                }`}
              >
                <div>
                  {/* Header Kartu + Toggle Aktif Instan */}
                  <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                          effective
                            ? "bg-status-available/15 text-status-available"
                            : "bg-background text-muted"
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-heading text-xl font-bold uppercase tracking-wide text-foreground">
                            {isCustom
                              ? rule.label || `Diskon Khusus ${meta.shortLabel}`
                              : meta.title}
                          </h2>
                          {isCustom && (
                            <span className="rounded-md bg-primary/20 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
                              {meta.shortLabel}
                            </span>
                          )}
                          {effective && shortTag && (
                            <span className="rounded-full bg-status-available/15 px-2.5 py-0.5 text-[11px] font-bold text-status-available">
                              {shortTag}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-muted">
                          {rule.apply_to_all
                            ? rule.scope === "fnb"
                              ? "Berlaku untuk semua menu F&B"
                              : `Berlaku untuk semua meja ${meta.shortLabel}`
                            : rule.target_ids.length > 0
                              ? `Khusus ${rule.target_ids.length} ${rule.scope === "fnb" ? "menu F&B" : "meja"} terpilih`
                              : `Belum memilih ${rule.scope === "fnb" ? "menu F&B" : "meja"} target`}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {isCustom && (
                        <button
                          type="button"
                          onClick={() => handleDeleteCustomRule(rule.id)}
                          title="Hapus aturan diskon ini"
                          className="flex min-h-[48px] min-w-[44px] items-center justify-center rounded-xl border border-border bg-background text-muted hover:border-status-occupied/50 hover:text-status-occupied"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          const nextEnabled = !rule.enabled;
                          if (rule.type === "duration_percent") {
                            const nextTiers =
                              nextEnabled &&
                              !hasAnyDurationTierDiscount(rule.duration_tiers)
                                ? { ...DEFAULT_STARTER_TIERS }
                                : rule.duration_tiers;
                            patchRule(
                              rule.id,
                              isCustom,
                              { enabled: nextEnabled, duration_tiers: nextTiers },
                              true,
                            );
                            return;
                          }
                          const nextVal =
                            nextEnabled && rule.value === 0
                              ? rule.type === "percent"
                                ? 10
                                : 5000
                              : rule.value;
                          patchRule(
                            rule.id,
                            isCustom,
                            { enabled: nextEnabled, value: nextVal },
                            true,
                          );
                        }}
                        className={`flex min-h-[48px] items-center gap-1.5 rounded-xl border px-3.5 text-xs font-extrabold uppercase tracking-wide transition active:scale-95 ${
                          rule.enabled
                            ? "border-status-available/40 bg-status-available text-[#042317]"
                            : "border-border bg-background text-muted hover:text-foreground"
                        }`}
                      >
                        <Power className="h-4 w-4" />
                        <span>{rule.enabled ? "Aktif" : "Nonaktif"}</span>
                      </button>
                    </div>
                  </div>

                  {/* Body Setting Diskon */}
                  <div className="mt-4 space-y-4">
                    {/* 1. Target Berlaku: Semua vs Meja/Menu Tertentu */}
                    <div>
                      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted">
                        Berlaku Untuk
                      </span>
                      <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-border bg-background p-1">
                        <button
                          type="button"
                          onClick={() =>
                            patchRule(
                              rule.id,
                              isCustom,
                              { apply_to_all: true },
                              true,
                            )
                          }
                          className={`min-h-[44px] rounded-lg px-3 text-xs font-bold transition ${
                            rule.apply_to_all
                              ? "bg-primary text-white"
                              : "text-muted hover:text-foreground"
                          }`}
                        >
                          {rule.scope === "fnb"
                            ? "Semua Menu F&B"
                            : `Semua ${meta.shortLabel}`}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            patchRule(
                              rule.id,
                              isCustom,
                              { apply_to_all: false },
                              true,
                            )
                          }
                          className={`min-h-[44px] rounded-lg px-3 text-xs font-bold transition ${
                            !rule.apply_to_all
                              ? "bg-primary text-white"
                              : "text-muted hover:text-foreground"
                          }`}
                        >
                          {rule.scope === "fnb"
                            ? "Menu F&B Tertentu"
                            : "Meja Tertentu"}
                        </button>
                      </div>

                      {/* Chip Pilihan Meja / Menu F&B Tertentu */}
                      {!rule.apply_to_all && (
                        <div className="mt-2.5 rounded-2xl border border-border bg-background p-3">
                          {targets.length === 0 ? (
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                              <span>
                                Belum ada{" "}
                                {rule.scope === "fnb"
                                  ? "menu F&B"
                                  : `meja ${meta.shortLabel}`}{" "}
                                terdaftar.
                              </span>
                              <Link
                                href={
                                  rule.scope === "fnb"
                                    ? "/kasir/fnb"
                                    : "/kasir/pengaturan"
                                }
                                className="font-bold text-primary hover:underline"
                              >
                                Tambah sekarang →
                              </Link>
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {targets.map((t) => {
                                const selected = rule.target_ids.includes(t.id);
                                return (
                                  <button
                                    key={t.id}
                                    type="button"
                                    onClick={() =>
                                      toggleTargetId(rule, isCustom, t.id)
                                    }
                                    className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition active:scale-95 ${
                                      selected
                                        ? "border-primary bg-primary/20 text-foreground"
                                        : "border-border bg-surface text-muted hover:border-primary/50 hover:text-foreground"
                                    }`}
                                  >
                                    <span
                                      className={`flex h-4 w-4 items-center justify-center rounded ${
                                        selected
                                          ? "bg-primary text-white"
                                          : "border border-border"
                                      }`}
                                    >
                                      {selected && (
                                        <Check className="h-3 w-3 stroke-[3]" />
                                      )}
                                    </span>
                                    <span>{t.name}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {missingTargetSelection && targets.length > 0 && (
                            <p className="mt-2 text-[11px] font-semibold text-status-booked">
                              Pilih minimal 1{" "}
                              {rule.scope === "fnb" ? "menu F&B" : "meja"} di
                              atas agar diskon aktif dipakai.
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 2. Nama / Label Promo (Opsional) */}
                    <div>
                      <label
                        htmlFor={`promo-label-${rule.id}`}
                        className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted"
                      >
                        Nama Promo (Opsional)
                      </label>
                      <input
                        id={`promo-label-${rule.id}`}
                        type="text"
                        maxLength={60}
                        value={rule.label}
                        onChange={(e) =>
                          patchRule(
                            rule.id,
                            isCustom,
                            { label: e.target.value },
                            false,
                          )
                        }
                        placeholder="Contoh: Promo Happy Hour / Diskon Khusus Meja 1"
                        className="min-h-[46px] w-full rounded-xl border border-border bg-background px-3.5 text-sm text-foreground placeholder:text-muted/60 focus:border-primary focus:outline-none"
                      />
                    </div>

                    {/* 3. Tipe & Nilai Diskon */}
                    <div>
                      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted">
                        Tipe Potongan
                      </span>
                      <div
                        className={`grid gap-1 rounded-xl border border-border bg-background p-1 ${
                          rule.scope === "fnb" ? "grid-cols-2" : "grid-cols-3"
                        }`}
                      >
                        {(
                          [
                            { id: "percent", label: "Persen (%)" },
                            ...(rule.scope !== "fnb"
                              ? [
                                  {
                                    id: "duration_percent" as const,
                                    label: "Per Jam (1–5j)",
                                  },
                                ]
                              : []),
                            { id: "nominal", label: "Rp" },
                          ] as Array<{
                            id: DiscountRuleType;
                            label: string;
                          }>
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              if (opt.id === "duration_percent") {
                                const nextTiers = hasAnyDurationTierDiscount(
                                  rule.duration_tiers,
                                )
                                  ? rule.duration_tiers
                                  : { ...DEFAULT_STARTER_TIERS };
                                patchRule(
                                  rule.id,
                                  isCustom,
                                  {
                                    type: "duration_percent",
                                    duration_tiers: nextTiers,
                                  },
                                  true,
                                );
                                return;
                              }
                              patchRule(
                                rule.id,
                                isCustom,
                                {
                                  type: opt.id,
                                  value:
                                    opt.id === "percent"
                                      ? Math.min(100, rule.value || 10)
                                      : rule.value < 500
                                        ? 5000
                                        : rule.value,
                                },
                                true,
                              );
                            }}
                            className={`min-h-[48px] rounded-lg px-2 text-xs font-bold transition ${
                              rule.type === opt.id
                                ? "bg-primary text-white"
                                : "text-muted hover:text-foreground"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {rule.type === "duration_percent" && rule.scope !== "fnb" ? (
                      <div className="space-y-3 rounded-2xl border border-border bg-background p-3.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-muted">
                            Custom Diskon Per Durasi (1–5 Jam)
                          </span>
                          <span className="text-[11px] text-muted">
                            6–10 jam ikut 5 Jam+
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                          {DURATION_TIER_HOURS.map((hour) => {
                            const key = String(hour) as DurationTierKey;
                            const pctVal = rule.duration_tiers[key] ?? 0;
                            return (
                              <div
                                key={hour}
                                className="rounded-xl border border-border bg-surface p-2.5"
                              >
                                <label
                                  htmlFor={`tier-${rule.id}-${hour}`}
                                  className="block text-[11px] font-bold uppercase tracking-wide text-muted"
                                >
                                  {hour === 5 ? "5 Jam+" : `${hour} Jam`}
                                </label>
                                <div className="mt-1.5 flex items-center gap-1">
                                  <input
                                    id={`tier-${rule.id}-${hour}`}
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    maxLength={3}
                                    value={pctVal === 0 ? "" : String(pctVal)}
                                    onChange={(e) => {
                                      const digits = e.target.value.replace(
                                        /\D/g,
                                        "",
                                      );
                                      const num = digits
                                        ? Math.min(100, Number.parseInt(digits, 10))
                                        : 0;
                                      patchRule(
                                        rule.id,
                                        isCustom,
                                        {
                                          duration_tiers: {
                                            ...rule.duration_tiers,
                                            [key]: num,
                                          },
                                        },
                                        false,
                                      );
                                    }}
                                    placeholder="0"
                                    className="tabular-nums min-h-[48px] w-full rounded-lg border border-border bg-background px-2 text-center text-sm font-bold text-foreground placeholder:text-muted/50 focus:border-primary focus:outline-none"
                                  />
                                  <span className="text-xs font-bold text-muted">
                                    %
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Preset Cepat Bertahap */}
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <span className="text-[11px] font-semibold text-muted">
                            Cepat:
                          </span>
                          {DURATION_TIER_PRESETS.map((preset) => (
                            <button
                              key={preset.label}
                              type="button"
                              onClick={() =>
                                patchRule(
                                  rule.id,
                                  isCustom,
                                  {
                                    enabled: true,
                                    duration_tiers: { ...preset.tiers },
                                  },
                                  true,
                                )
                              }
                              className="min-h-[48px] rounded-xl border border-border bg-surface px-3 text-xs font-bold text-muted transition hover:border-primary/60 hover:text-foreground"
                            >
                              {preset.label}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() =>
                              patchRule(
                                rule.id,
                                isCustom,
                                { duration_tiers: makeDefaultDurationTiers() },
                                true,
                              )
                            }
                            className="min-h-[48px] rounded-xl border border-border bg-surface px-3 text-xs font-bold text-muted transition hover:border-status-occupied/60 hover:text-status-occupied"
                          >
                            Reset 0%
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div>
                          <label
                            htmlFor={`promo-value-${rule.id}`}
                            className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted"
                          >
                            Besaran ({rule.type === "percent" ? "%" : "Rp"})
                          </label>
                          <input
                            id={`promo-value-${rule.id}`}
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={rule.type === "percent" ? 100 : 10000000}
                            value={rule.value === 0 ? "" : rule.value}
                            onChange={(e) => {
                              const num = Number.parseInt(
                                e.target.value.replace(/\D/g, ""),
                                10,
                              );
                              const safe = Number.isNaN(num) ? 0 : num;
                              patchRule(
                                rule.id,
                                isCustom,
                                {
                                  value:
                                    rule.type === "percent"
                                      ? Math.min(100, safe)
                                      : safe,
                                },
                                false,
                              );
                            }}
                            placeholder={
                              rule.type === "percent"
                                ? "Contoh: 10"
                                : "Contoh: 5000"
                            }
                            className="tabular-nums min-h-[48px] w-full rounded-xl border border-border bg-background px-4 text-base font-bold text-foreground placeholder:text-muted/60 focus:border-primary focus:outline-none"
                          />
                        </div>

                        {/* Preset Cepat (1 Ketuk Langsung Aktif & Tersimpan) */}
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-semibold text-muted">
                            Cepat:
                          </span>
                          {rule.type === "percent"
                            ? PERCENT_PRESETS.map((pct) => (
                                <button
                                  key={pct}
                                  type="button"
                                  onClick={() =>
                                    patchRule(
                                      rule.id,
                                      isCustom,
                                      { enabled: true, value: pct },
                                      true,
                                    )
                                  }
                                  className={`tabular-nums min-h-[40px] rounded-xl border px-3 text-xs font-bold transition ${
                                    rule.enabled && rule.value === pct
                                      ? "border-primary bg-primary text-white"
                                      : "border-border bg-background text-muted hover:border-primary/60 hover:text-foreground"
                                  }`}
                                >
                                  {pct}%
                                </button>
                              ))
                            : NOMINAL_PRESETS.map((nom) => (
                                <button
                                  key={nom}
                                  type="button"
                                  onClick={() =>
                                    patchRule(
                                      rule.id,
                                      isCustom,
                                      { enabled: true, value: nom },
                                      true,
                                    )
                                  }
                                  className={`tabular-money min-h-[40px] rounded-xl border px-3 text-xs font-bold transition ${
                                    rule.enabled && rule.value === nom
                                      ? "border-primary bg-primary text-white"
                                      : "border-border bg-background text-muted hover:border-primary/60 hover:text-foreground"
                                  }`}
                                >
                                  {formatRupiah(nom)}
                                </button>
                              ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Simulasi Harga Live */}
                {rule.type === "duration_percent" && rule.scope !== "fnb" ? (
                  <div className="mt-4 rounded-2xl border border-border bg-background p-3.5">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted">
                      Simulasi Harga {meta.shortLabel} ({formatRupiah(meta.sampleAmount)}/jam)
                    </p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                      {DURATION_TIER_HOURS.map((h) => {
                        const key = String(h) as DurationTierKey;
                        const pct = rule.duration_tiers[key] ?? 0;
                        const normal = meta.sampleAmount * h;
                        const disc = calculateRuleDiscount(normal, rule, h);
                        const after = Math.max(0, normal - disc);
                        return (
                          <div
                            key={h}
                            className="rounded-xl border border-border/70 bg-surface px-2.5 py-2 text-center"
                          >
                            <p className="text-[10px] font-bold uppercase text-muted">
                              {h === 5 ? "5 Jam+" : `${h} Jam`}{" "}
                              {pct > 0 && (
                                <span className="text-status-available">
                                  (-{pct}%)
                                </span>
                              )}
                            </p>
                            {disc > 0 && (
                              <p className="tabular-money text-[10px] text-muted line-through">
                                {formatRupiah(normal)}
                              </p>
                            )}
                            <p className="tabular-money font-heading text-sm font-bold text-primary">
                              {formatRupiah(after)}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-background px-4 py-3">
                    <span className="text-xs text-muted">{meta.sampleLabel}</span>
                    <div className="flex items-baseline gap-2">
                      {sampleDiscount > 0 && (
                        <span className="tabular-money text-xs text-muted line-through">
                          {formatRupiah(meta.sampleAmount)}
                        </span>
                      )}
                      <span className="tabular-money font-heading text-xl font-bold text-primary">
                        {formatRupiah(sampleAfter)}
                      </span>
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </main>

      {/* Modal Buat Diskon Khusus Baru (Untuk Meja / Menu F&B Tertentu) */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-border bg-surface p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-2 border-b border-border pb-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-primary">
                  Aturan Promo Baru
                </p>
                <h2 className="font-heading text-2xl font-bold uppercase text-foreground">
                  Buat Diskon Khusus
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-xl border border-border bg-background text-muted hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCustomRule} className="mt-5 space-y-4">
              <div>
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted">
                  Kategori Diskon
                </span>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {BASE_SCOPE_ORDER.map((sc) => (
                    <button
                      key={sc}
                      type="button"
                      onClick={() => {
                        setNewScope(sc);
                        if (sc === "fnb" && newType === "duration_percent") {
                          setNewType("percent");
                        }
                        const list = getTargetsForScope(sc);
                        setNewTargetIds(list[0] ? [list[0].id] : []);
                      }}
                      className={`min-h-[46px] rounded-xl border text-xs font-bold transition ${
                        newScope === sc
                          ? "border-primary bg-primary text-white"
                          : "border-border bg-background text-muted hover:text-foreground"
                      }`}
                    >
                      {SCOPE_META[sc].shortLabel}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label
                  htmlFor="new-promo-label"
                  className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted"
                >
                  Nama Diskon (Opsional)
                </label>
                <input
                  id="new-promo-label"
                  type="text"
                  maxLength={60}
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Contoh: Promo Meja 1 & 2 / Diskon Es Teh"
                  className="min-h-[48px] w-full rounded-xl border border-border bg-background px-4 text-sm text-foreground focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted">
                  Target Berlaku
                </span>
                <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-border bg-background p-1">
                  <button
                    type="button"
                    onClick={() => setNewApplyAll(false)}
                    className={`min-h-[44px] rounded-lg text-xs font-bold ${
                      !newApplyAll
                        ? "bg-primary text-white"
                        : "text-muted hover:text-foreground"
                    }`}
                  >
                    {newScope === "fnb" ? "Menu Tertentu" : "Meja Tertentu"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewApplyAll(true)}
                    className={`min-h-[44px] rounded-lg text-xs font-bold ${
                      newApplyAll
                        ? "bg-primary text-white"
                        : "text-muted hover:text-foreground"
                    }`}
                  >
                    Semua {SCOPE_META[newScope].shortLabel}
                  </button>
                </div>

                {!newApplyAll && (
                  <div className="mt-2.5 flex flex-wrap gap-2 rounded-2xl border border-border bg-background p-3">
                    {modalTargets.length === 0 ? (
                      <p className="text-xs text-muted">
                        Belum ada item di kategori ini.
                      </p>
                    ) : (
                      modalTargets.map((t) => {
                        const checked = newTargetIds.includes(t.id);
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() =>
                              setNewTargetIds((prev) =>
                                checked
                                  ? prev.filter((id) => id !== t.id)
                                  : [...prev, t.id],
                              )
                            }
                            className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition ${
                              checked
                                ? "border-primary bg-primary/20 text-foreground"
                                : "border-border bg-surface text-muted"
                            }`}
                          >
                            {checked && <Check className="h-3.5 w-3.5 text-primary" />}
                            <span>{t.name}</span>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              <div>
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted">
                  Tipe Potongan
                </span>
                <div
                  className={`grid gap-1 rounded-xl border border-border bg-background p-1 ${
                    newScope === "fnb" ? "grid-cols-2" : "grid-cols-3"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setNewType("percent");
                      setNewValue("10");
                    }}
                    className={`min-h-[44px] rounded-lg text-xs font-bold ${
                      newType === "percent"
                        ? "bg-primary text-white"
                        : "text-muted hover:text-foreground"
                    }`}
                  >
                    Persen (%)
                  </button>
                  {newScope !== "fnb" && (
                    <button
                      type="button"
                      onClick={() => setNewType("duration_percent")}
                      className={`min-h-[44px] rounded-lg text-xs font-bold ${
                        newType === "duration_percent"
                          ? "bg-primary text-white"
                          : "text-muted hover:text-foreground"
                      }`}
                    >
                      Per Jam (1–5j)
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setNewType("nominal");
                      setNewValue("5000");
                    }}
                    className={`min-h-[44px] rounded-lg text-xs font-bold ${
                      newType === "nominal"
                        ? "bg-primary text-white"
                        : "text-muted hover:text-foreground"
                    }`}
                  >
                    Rp
                  </button>
                </div>
              </div>

              {newType === "duration_percent" && newScope !== "fnb" ? (
                <div className="space-y-2.5 rounded-2xl border border-border bg-background p-3.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold uppercase tracking-wider text-muted">
                      Diskon Per Durasi (1–5 Jam)
                    </span>
                    <span className="text-[11px] text-muted">
                      6–10 jam ikut 5 Jam+
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {DURATION_TIER_HOURS.map((hour) => {
                      const key = String(hour) as DurationTierKey;
                      const pctVal = newDurationTiers[key] ?? 0;
                      return (
                        <div
                          key={hour}
                          className="rounded-xl border border-border bg-surface p-2"
                        >
                          <label
                            htmlFor={`new-tier-${hour}`}
                            className="block text-[11px] font-bold uppercase text-muted"
                          >
                            {hour === 5 ? "5 Jam+" : `${hour} Jam`}
                          </label>
                          <div className="mt-1 flex items-center gap-1">
                            <input
                              id={`new-tier-${hour}`}
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              maxLength={3}
                              value={pctVal === 0 ? "" : String(pctVal)}
                              onChange={(e) => {
                                const digits = e.target.value.replace(/\D/g, "");
                                const num = digits
                                  ? Math.min(100, Number.parseInt(digits, 10))
                                  : 0;
                                setNewDurationTiers((prev) => ({
                                  ...prev,
                                  [key]: num,
                                }));
                              }}
                              placeholder="0"
                              className="tabular-nums min-h-[48px] w-full rounded-lg border border-border bg-background px-2 text-center text-sm font-bold text-foreground focus:border-primary focus:outline-none"
                            />
                            <span className="text-xs font-bold text-muted">%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div>
                  <label
                    htmlFor="new-promo-val"
                    className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted"
                  >
                    Nilai ({newType === "percent" ? "%" : "Rp"})
                  </label>
                  <input
                    id="new-promo-val"
                    type="number"
                    inputMode="numeric"
                    required
                    min={1}
                    max={newType === "percent" ? 100 : 10000000}
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    className="tabular-nums min-h-[50px] w-full rounded-xl border border-border bg-background px-4 text-base font-bold text-foreground focus:border-primary focus:outline-none"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={
                  (!newApplyAll && newTargetIds.length === 0) ||
                  (newType === "duration_percent" &&
                    newScope !== "fnb" &&
                    !hasAnyDurationTierDiscount(newDurationTiers))
                }
                className="flex min-h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-status-available px-5 text-base font-extrabold text-[#042317] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Power className="h-5 w-5" />
                <span>Aktifkan Diskon Sekarang</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
