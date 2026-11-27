"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  Banknote,
  CheckCircle2,
  Clock,
  CreditCard,
  Loader2,
  Play,
  Plus,
  QrCode,
  Receipt,
  X,
} from "lucide-react";
import {
  MAX_BOOKING_DURATION_HOURS,
  MIN_BOOKING_DURATION_HOURS,
  PRESET_DURATION_OPTIONS,
  WIB_TIMEZONE,
  calculateEndTimeHHmm,
  formatRupiah,
  formatTimeHHmm,
  getCategoryLabel,
  parseStrictDurationHours,
} from "@/lib/format";
import { getSessionExtendConstraint } from "@/lib/booking-conflict";
import {
  calculateFnbOrdersPromoDiscount,
  formatPromoShortTag,
  getBestTablePromoForTable,
  type PromoDiscountsConfig,
} from "@/lib/promo-discounts";
import type {
  BilliardTable,
  BillingMode,
  PaymentMethod,
} from "@/types/database";
import type {
  CheckoutReceiptData,
  KasirActiveSession,
  KasirBookingItem,
  SessionFnbOrderItem,
} from "@/types/kasir";

function formatIsoTimeWib(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: WIB_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

function formatDurationHuman(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} menit`;
  if (m === 0) return `${h} jam`;
  return `${h} jam ${m} menit`;
}

/* ============================================================================
 * 1. MODAL MULAI MAIN (WALK-IN: OPEN TABLE / PAKET JAM)
 * ========================================================================== */
interface StartSessionModalProps {
  table: BilliardTable;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

export function StartSessionModal({
  table,
  onClose,
  onSuccess,
}: StartSessionModalProps) {
  const customDurationInputRef = useRef<HTMLInputElement | null>(null);
  const [billingMode, setBillingMode] = useState<BillingMode>("open_table");
  const [durationHours, setDurationHours] = useState<number>(1);
  const [isCustomDuration, setIsCustomDuration] = useState<boolean>(false);
  const [customDurationInput, setCustomDurationInput] = useState<string>("");
  const [customInputHint, setCustomInputHint] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const customDurationValidation = useMemo(() => {
    if (!isCustomDuration) {
      return { parsedHours: durationHours, error: null as string | null };
    }
    const trimmed = customDurationInput.trim();
    if (!trimmed) {
      return { parsedHours: null as number | null, error: null as string | null };
    }
    if (!/^\d+$/.test(trimmed)) {
      return {
        parsedHours: null,
        error:
          "Durasi hanya boleh angka bulat 1–10 (tidak boleh huruf atau simbol).",
      };
    }
    if (trimmed.startsWith("0")) {
      return {
        parsedHours: null,
        error: "Durasi harus bilangan asli 1 sampai 10 jam (tidak boleh 0).",
      };
    }
    const parsed = parseStrictDurationHours(
      trimmed,
      MIN_BOOKING_DURATION_HOURS,
      MAX_BOOKING_DURATION_HOURS,
    );
    if (parsed === null) {
      return {
        parsedHours: null,
        error: `Durasi harus bilangan asli antara ${MIN_BOOKING_DURATION_HOURS} sampai ${MAX_BOOKING_DURATION_HOURS} jam.`,
      };
    }
    return { parsedHours: parsed, error: null };
  }, [customDurationInput, durationHours, isCustomDuration]);

  const effectiveDurationHours = isCustomDuration
    ? customDurationValidation.parsedHours
    : durationHours;

  const handleCustomKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.length === 1 && !/^\d$/.test(e.key)) {
      e.preventDefault();
      setCustomInputHint(
        "Hanya boleh memasukkan bilangan asli 1–10 (tidak boleh huruf atau simbol).",
      );
    }
  };

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === "") {
      setCustomDurationInput("");
      setCustomInputHint(null);
      setError(null);
      return;
    }
    if (/[^0-9]/.test(raw)) {
      setCustomInputHint(
        "Hanya boleh memasukkan bilangan asli 1–10 (tidak boleh huruf atau simbol).",
      );
      return;
    }
    if (raw.length > 2) return;
    setCustomInputHint(null);
    setCustomDurationInput(raw);
    setError(null);
  };

  const handleStart = async () => {
    if (billingMode === "package" && effectiveDurationHours === null) {
      setError(
        customDurationValidation.error ??
          "Masukkan durasi paket berupa bilangan asli antara 1 sampai 10 jam.",
      );
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/kasir/sessions/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableId: table.id,
          billingMode,
          durationHours:
            billingMode === "package" ? effectiveDurationHours : undefined,
          customerName: customerName.trim() || "Walk-in",
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Gagal memulai sesi.");
        return;
      }
      await onSuccess();
      onClose();
    } catch {
      setError("Gagal terhubung ke server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-3xl border border-border bg-surface p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-primary">
              Walk-in • {getCategoryLabel(table.category)}
            </p>
            <h3 className="mt-0.5 font-heading text-2xl font-bold uppercase tracking-wide text-foreground">
              Mulai Main — {table.name}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-xl border border-border bg-background text-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 space-y-5">
          {/* Pilih Mode Billing */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setBillingMode("open_table")}
              className={`flex min-h-[78px] flex-col items-start justify-center rounded-2xl border p-3.5 text-left transition ${
                billingMode === "open_table"
                  ? "border-primary bg-primary/15 ring-2 ring-primary/35"
                  : "border-border bg-background hover:border-primary/50"
              }`}
            >
              <span className="font-heading text-base font-bold uppercase tracking-wide text-foreground">
                Open Table
              </span>
              <span className="tabular-money mt-1 text-xs font-semibold text-primary">
                {formatRupiah(table.minute_rate)} / menit
              </span>
              <span className="mt-0.5 text-[11px] text-muted">
                Timer maju (Freetime)
              </span>
            </button>

            <button
              type="button"
              onClick={() => setBillingMode("package")}
              className={`flex min-h-[78px] flex-col items-start justify-center rounded-2xl border p-3.5 text-left transition ${
                billingMode === "package"
                  ? "border-primary bg-primary/15 ring-2 ring-primary/35"
                  : "border-border bg-background hover:border-primary/50"
              }`}
            >
              <span className="font-heading text-base font-bold uppercase tracking-wide text-foreground">
                Paket Jam
              </span>
              <span className="tabular-money mt-1 text-xs font-semibold text-primary">
                {formatRupiah(table.hourly_rate)} / jam
              </span>
              <span className="mt-0.5 text-[11px] text-muted">
                Timer mundur pasti
              </span>
            </button>
          </div>

          {/* Pilihan Durasi Paket */}
          {billingMode === "package" && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                Pilih Durasi Paket
              </p>
              <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
                {PRESET_DURATION_OPTIONS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => {
                      setIsCustomDuration(false);
                      setDurationHours(h);
                      setCustomInputHint(null);
                      setError(null);
                    }}
                    className={`tabular-nums min-h-[50px] rounded-xl border text-sm font-bold transition ${
                      !isCustomDuration && durationHours === h
                        ? "border-primary bg-primary text-white"
                        : "border-border bg-background text-foreground hover:border-primary/60"
                    }`}
                  >
                    {h} Jam
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomDuration(true);
                    setCustomInputHint(null);
                    setError(null);
                    window.requestAnimationFrame(() => {
                      customDurationInputRef.current?.focus();
                      customDurationInputRef.current?.select();
                    });
                  }}
                  className={`min-h-[50px] rounded-xl border text-sm font-bold transition ${
                    isCustomDuration
                      ? "border-primary bg-primary text-white"
                      : "border-border bg-background text-foreground hover:border-primary/60"
                  }`}
                >
                  Custom
                </button>
              </div>

              {isCustomDuration && (
                <div className="mt-3 rounded-xl border border-primary/40 bg-background p-3.5">
                  <label
                    htmlFor="walkin-custom-duration"
                    className="mb-2 block text-xs font-semibold text-foreground"
                  >
                    Masukkan Durasi Custom (1–10 Jam)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      ref={customDurationInputRef}
                      id="walkin-custom-duration"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="off"
                      maxLength={2}
                      value={customDurationInput}
                      onKeyDown={handleCustomKeyDown}
                      onChange={handleCustomChange}
                      placeholder="Contoh: 6, 7, 8, 9, atau 10"
                      className={`tabular-nums min-h-[50px] flex-1 rounded-xl border bg-surface px-3.5 text-sm font-semibold text-foreground placeholder:font-normal placeholder:text-muted/70 focus:outline-none ${
                        customInputHint || customDurationValidation.error
                          ? "border-status-occupied focus:border-status-occupied"
                          : "border-border focus:border-primary"
                      }`}
                    />
                    <span className="flex min-h-[50px] items-center rounded-xl border border-border bg-surface px-3.5 text-sm font-bold text-muted">
                      Jam
                    </span>
                  </div>
                  {customInputHint || customDurationValidation.error ? (
                    <p className="mt-2 text-xs font-semibold text-status-occupied">
                      {customInputHint ?? customDurationValidation.error}
                    </p>
                  ) : (
                    <p className="mt-2 text-[11px] text-muted">
                      Hanya bilangan asli 1 sampai 10 (angka bulat, tanpa huruf).
                    </p>
                  )}
                </div>
              )}

              <p className="tabular-money mt-2.5 text-right text-sm text-muted">
                Biaya Paket:{" "}
                <strong className="font-heading text-lg text-primary">
                  {effectiveDurationHours !== null
                    ? formatRupiah(table.hourly_rate * effectiveDurationHours)
                    : "—"}
                </strong>
              </p>
            </div>
          )}

          {/* Nama Pelanggan (Opsional) */}
          <div>
            <label
              htmlFor="walkin-name"
              className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted"
            >
              Nama Pelanggan (Opsional)
            </label>
            <input
              id="walkin-name"
              type="text"
              maxLength={80}
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Kosongkan untuk 'Walk-in'"
              className="min-h-[50px] w-full rounded-xl border border-border bg-background px-4 text-sm text-foreground placeholder:text-muted/70 focus:border-primary focus:outline-none"
            />
          </div>

          {error && (
            <p className="rounded-xl border border-status-occupied/40 bg-status-occupied/10 px-3.5 py-2.5 text-xs font-semibold text-status-occupied">
              {error}
            </p>
          )}

          <button
            type="button"
            disabled={
              loading ||
              (billingMode === "package" && effectiveDurationHours === null)
            }
            onClick={() => void handleStart()}
            className="flex min-h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-base font-bold text-white shadow-lg shadow-primary/25 transition hover:bg-primary-hover active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Play className="h-5 w-5 fill-current" />
            )}
            <span>Mulai Timer Sekarang</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * 2. MODAL PINDAH MEJA
 * ========================================================================== */
interface MoveTableModalProps {
  sourceTable: BilliardTable;
  session: KasirActiveSession;
  availableTables: BilliardTable[];
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

export function MoveTableModal({
  sourceTable,
  session,
  availableTables,
  onClose,
  onSuccess,
}: MoveTableModalProps) {
  const [targetId, setTargetId] = useState<string>(
    availableTables[0]?.id ?? "",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleMove = async () => {
    if (!targetId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/kasir/sessions/${session.id}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetTableId: targetId }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Gagal memindahkan meja.");
        return;
      }
      await onSuccess();
      onClose();
    } catch {
      setError("Gagal terhubung ke server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-3xl border border-border bg-surface p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-primary">
              Pindah Meja • {session.customer_name}
            </p>
            <h3 className="mt-0.5 font-heading text-2xl font-bold uppercase tracking-wide text-foreground">
              Dari {sourceTable.name} ke Meja Kosong
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-xl border border-border bg-background text-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          {availableTables.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-background p-6 text-center text-sm text-muted">
              Saat ini tidak ada meja kosong yang tersedia untuk pindah meja.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {availableTables.map((tbl) => {
                const selected = tbl.id === targetId;
                return (
                  <button
                    key={tbl.id}
                    type="button"
                    onClick={() => setTargetId(tbl.id)}
                    className={`flex min-h-[76px] flex-col items-start justify-center rounded-2xl border p-3.5 text-left transition ${
                      selected
                        ? "border-primary bg-primary/15 ring-2 ring-primary/35"
                        : "border-border bg-background hover:border-primary/50"
                    }`}
                  >
                    <span className="font-heading text-lg font-bold text-foreground">
                      {tbl.name}
                    </span>
                    <span className="text-xs text-muted">
                      {getCategoryLabel(tbl.category)}
                    </span>
                    <span className="tabular-money mt-1 text-[11px] font-semibold text-status-available">
                      {formatRupiah(tbl.hourly_rate)}/jam
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {error && (
            <p className="rounded-xl border border-status-occupied/40 bg-status-occupied/10 px-3.5 py-2.5 text-xs font-semibold text-status-occupied">
              {error}
            </p>
          )}

          <button
            type="button"
            disabled={loading || !targetId || availableTables.length === 0}
            onClick={() => void handleMove()}
            className="flex min-h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-base font-bold text-white transition hover:bg-primary-hover disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <ArrowRightLeft className="h-5 w-5" />
            )}
            <span>Konfirmasi Pindah Meja</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * 3. MODAL TAMBAH WAKTU (ANTI-BENTROK BOOKING TERKONFIRMASI)
 * ========================================================================== */
interface ExtendTimeModalProps {
  table: BilliardTable;
  session: KasirActiveSession;
  confirmedBookings: KasirBookingItem[];
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

export function ExtendTimeModal({
  table,
  session,
  confirmedBookings,
  onClose,
  onSuccess,
}: ExtendTimeModalProps) {
  const constraint = useMemo(
    () =>
      getSessionExtendConstraint(
        session.start_time,
        session.duration_minutes,
        confirmedBookings,
        session.booking_id,
        4,
      ),
    [
      session.start_time,
      session.duration_minutes,
      confirmedBookings,
      session.booking_id,
    ],
  );

  const [hours, setHours] = useState<number>(
    constraint.maxAddableHours > 0 ? 1 : 0,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExtend = async () => {
    if (hours < 1 || hours > constraint.maxAddableHours) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/kasir/sessions/${session.id}/extend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ additionalHours: hours }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Gagal menambah waktu.");
        return;
      }
      await onSuccess();
      onClose();
    } catch {
      setError("Gagal terhubung ke server.");
    } finally {
      setLoading(false);
    }
  };

  const blocker = constraint.blockingBooking;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl border border-border bg-surface p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-primary">
              Tambah Waktu • {session.customer_name}
            </p>
            <h3 className="mt-0.5 font-heading text-2xl font-bold uppercase tracking-wide text-foreground">
              {table.name}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-xl border border-border bg-background text-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          {blocker && (
            <div className="flex items-start gap-2.5 rounded-2xl border border-status-booked/45 bg-status-booked/10 p-3.5 text-xs leading-relaxed text-status-booked">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                {constraint.maxAddableHours === 0 ? (
                  <>
                    <strong>Tidak bisa tambah jam!</strong> {table.name} sudah
                    dibooking &amp; dibayar oleh{" "}
                    <strong>{blocker.customer_name}</strong> (
                    {blocker.booking_code}) pukul{" "}
                    <span className="tabular-timer font-bold">
                      {formatTimeHHmm(blocker.start_time)} -{" "}
                      {calculateEndTimeHHmm(
                        blocker.start_time,
                        blocker.duration_hours,
                      )}{" "}
                      WIB
                    </span>
                    .
                  </>
                ) : (
                  <>
                    <strong>Batas Tambah Maksimal +{constraint.maxAddableHours} Jam:</strong>{" "}
                    {table.name} sudah dibooking &amp; dibayar pukul{" "}
                    <span className="tabular-timer font-bold">
                      {formatTimeHHmm(blocker.start_time)} WIB
                    </span>{" "}
                    ({blocker.customer_name} • {blocker.booking_code}).
                  </>
                )}
              </p>
            </div>
          )}

          <div className="grid grid-cols-4 gap-2.5">
            {[1, 2, 3, 4].map((h) => {
              const disabled = h > constraint.maxAddableHours;
              const active = hours === h && !disabled;
              return (
                <button
                  key={h}
                  type="button"
                  disabled={disabled}
                  onClick={() => setHours(h)}
                  className={`tabular-nums min-h-[54px] rounded-2xl border text-base font-bold transition ${
                    active
                      ? "border-primary bg-primary text-white"
                      : disabled
                        ? "cursor-not-allowed border-border/50 bg-background/40 text-muted/40 line-through"
                        : "border-border bg-background text-foreground hover:border-primary/60"
                  }`}
                >
                  +{h} Jam
                </button>
              );
            })}
          </div>

          {constraint.maxAddableHours > 0 && (
            <div className="rounded-2xl border border-border bg-background p-4 text-sm">
              <div className="flex items-center justify-between text-muted">
                <span>Tambahan Biaya Meja</span>
                <span className="tabular-money font-heading text-xl font-bold text-primary">
                  +{formatRupiah(table.hourly_rate * hours)}
                </span>
              </div>
            </div>
          )}

          {error && (
            <p className="rounded-xl border border-status-occupied/40 bg-status-occupied/10 px-3.5 py-2.5 text-xs font-semibold text-status-occupied">
              {error}
            </p>
          )}

          <button
            type="button"
            disabled={loading || constraint.maxAddableHours === 0 || hours < 1}
            onClick={() => void handleExtend()}
            className="flex min-h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-base font-bold text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-45"
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Plus className="h-5 w-5" />
            )}
            <span>
              {constraint.maxAddableHours === 0
                ? "Tambah Jam Terkunci (Terbooking)"
                : `Tambahkan +${hours} Jam`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * 4. MODAL SELESAI & BAYAR (+ RINCIAN F&B + DISKON MANUAL + STRUK DIGITAL)
 * ========================================================================== */
interface CheckoutModalProps {
  table: BilliardTable;
  session: KasirActiveSession;
  promoDiscounts: PromoDiscountsConfig;
  nowMs: number;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

export function CheckoutModal({
  table,
  session,
  promoDiscounts,
  nowMs,
  onClose,
  onSuccess,
}: CheckoutModalProps) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("tunai");
  const [applyPromo, setApplyPromo] = useState<boolean>(true);
  const [discountType, setDiscountType] = useState<"nominal" | "percent">(
    "nominal",
  );
  const [discountInput, setDiscountInput] = useState<string>("");
  const [fnbOrders, setFnbOrders] = useState<SessionFnbOrderItem[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<CheckoutReceiptData | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/kasir/sessions/${session.id}/fnb`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload: { orders?: SessionFnbOrderItem[] } | null) => {
        if (!cancelled && payload?.orders) {
          setFnbOrders(payload.orders);
        }
      })
      .catch(() => {
        // fallback ke session.fnb_cost
      })
      .finally(() => {
        if (!cancelled) setLoadingOrders(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session.id]);

  const fnbTotal = useMemo(() => {
    if (fnbOrders.length > 0) {
      return fnbOrders.reduce((acc, o) => acc + o.subtotal, 0);
    }
    return session.fnb_cost;
  }, [fnbOrders, session.fnb_cost]);

  const hasLockedBookingDiscount =
    Boolean(session.booking_id) && session.discount_amount > 0;

  const livePricing = useMemo(() => {
    const startMs = new Date(session.start_time).getTime();
    const elapsedMin = Math.max(
      1,
      Math.ceil(Math.max(0, nowMs - startMs) / 60_000),
    );

    const tableCost =
      session.billing_mode === "open_table"
        ? elapsedMin * table.minute_rate
        : session.table_cost;

    const durationMinutes =
      session.billing_mode === "open_table"
        ? elapsedMin
        : session.duration_minutes;

    const subtotal = tableCost + fnbTotal;

    const effectiveDurationHours = Math.floor(durationMinutes / 60);

    const tableMatch = getBestTablePromoForTable(
      promoDiscounts,
      table.id,
      table.category,
      tableCost,
      effectiveDurationHours,
    );
    const fnbMatch = calculateFnbOrdersPromoDiscount(promoDiscounts, fnbOrders);

    const tablePromoDiscount = hasLockedBookingDiscount
      ? Math.min(tableCost, session.discount_amount)
      : applyPromo
        ? tableMatch.discountAmount
        : 0;

    const fnbPromoDiscount = applyPromo ? fnbMatch.discountAmount : 0;

    const remainingAfterPromo = Math.max(
      0,
      subtotal - tablePromoDiscount - fnbPromoDiscount,
    );

    const rawNum = Number.parseFloat(discountInput.replace(/[^\d.]/g, "")) || 0;
    const manualDiscountAmount =
      discountType === "percent"
        ? Math.round(
            (remainingAfterPromo * Math.min(100, Math.max(0, rawNum))) / 100,
          )
        : Math.min(remainingAfterPromo, Math.max(0, Math.round(rawNum)));

    const discountAmount = Math.min(
      subtotal,
      tablePromoDiscount + fnbPromoDiscount + manualDiscountAmount,
    );
    const total = Math.max(0, subtotal - discountAmount);

      return {
      durationMinutes,
      effectiveDurationHours,
      tableCost,
      fnbCost: fnbTotal,
      subtotal,
      tablePromoRule: tableMatch.rule,
      fnbAppliedRules: fnbMatch.appliedRules,
      tablePromoPotential: hasLockedBookingDiscount ? 0 : tableMatch.discountAmount,
      fnbPromoPotential: fnbMatch.discountAmount,
      tablePromoDiscount,
      fnbPromoDiscount,
      manualDiscountAmount,
      discountAmount,
      total,
    };
  }, [
    applyPromo,
    discountInput,
    discountType,
    fnbOrders,
    fnbTotal,
    hasLockedBookingDiscount,
    nowMs,
    promoDiscounts,
    session.billing_mode,
    session.discount_amount,
    session.duration_minutes,
    session.start_time,
    session.table_cost,
    table.category,
    table.id,
    table.minute_rate,
  ]);

  const hasAnyActiveCategoryPromo =
    livePricing.tablePromoPotential > 0 || livePricing.fnbPromoPotential > 0;

  const handleConfirmPayment = async () => {
    setLoading(true);
    setError(null);
    try {
      const numericDiscount =
        Number.parseFloat(discountInput.replace(/[^\d.]/g, "")) || 0;
      const res = await fetch(`/api/kasir/sessions/${session.id}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMethod,
          applyPromo,
          discountType,
          discountValue: numericDiscount,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        receipt?: CheckoutReceiptData;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.receipt) {
        setError(data.error ?? "Gagal memproses pembayaran.");
        return;
      }
      setReceipt(data.receipt);
      await onSuccess();
    } catch {
      setError("Gagal terhubung ke server.");
    } finally {
      setLoading(false);
    }
  };

  // Tampilan Struk Digital Setelah Pembayaran Lunas
  if (receipt) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
        <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-3xl border border-status-available/50 bg-surface p-6 shadow-2xl">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-status-available/15 text-status-available">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <p className="mt-3 text-xs font-bold uppercase tracking-widest text-status-available">
              Pembayaran Lunas
            </p>
            <h3 className="mt-1 font-heading text-2xl font-bold uppercase tracking-wide text-foreground">
              Struk Digital — {receipt.table_name}
            </h3>
            <p className="tabular-timer mt-1 text-xs text-muted">
              {formatIsoTimeWib(receipt.start_time)} -{" "}
              {formatIsoTimeWib(receipt.end_time)} WIB (
              {formatDurationHuman(receipt.duration_minutes)})
            </p>
          </div>

          <div className="mt-5 space-y-2.5 rounded-2xl border border-border bg-background p-4 text-sm">
            <div className="flex justify-between text-muted">
              <span>Pelanggan</span>
              <span className="font-semibold text-foreground">
                {receipt.customer_name}
              </span>
            </div>
            <div className="flex justify-between text-muted">
              <span>Mode</span>
              <span className="font-semibold text-foreground">
                {receipt.billing_mode === "open_table"
                  ? "Open Table (Freetime)"
                  : "Paket Jam"}
              </span>
            </div>
            <div className="flex justify-between text-muted">
              <span>Biaya Meja</span>
              <span className="tabular-money font-semibold text-foreground">
                {formatRupiah(receipt.table_cost)}
              </span>
            </div>

            {receipt.fnb_orders.length > 0 && (
              <div className="space-y-1 border-t border-dashed border-border pt-2">
                <p className="text-xs font-bold uppercase tracking-wider text-muted">
                  Rincian F&amp;B
                </p>
                {receipt.fnb_orders.map((order) => (
                  <div
                    key={order.id}
                    className="flex justify-between text-xs text-muted"
                  >
                    <span>
                      {order.quantity}× {order.item_name}
                    </span>
                    <span className="tabular-money font-semibold text-foreground">
                      {formatRupiah(order.subtotal)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {receipt.discount_amount > 0 && (
              <div className="flex justify-between text-status-available">
                <span>Diskon Manual</span>
                <span className="tabular-money font-semibold">
                  -{formatRupiah(receipt.discount_amount)}
                </span>
              </div>
            )}
            <div className="flex items-baseline justify-between border-t border-border pt-3">
              <span className="font-bold text-foreground">Total Dibayar</span>
              <span className="tabular-money font-heading text-2xl font-bold text-status-available">
                {formatRupiah(receipt.total_amount)}
              </span>
            </div>
            <div className="flex justify-between text-xs text-muted">
              <span>Metode Pembayaran</span>
              <span className="font-bold uppercase text-foreground">
                {receipt.payment_method}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="mt-5 flex min-h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-base font-bold text-white transition hover:bg-primary-hover"
          >
            <Receipt className="h-5 w-5" />
            <span>Tutup &amp; Kembali ke Meja</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-border bg-surface p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-primary">
              Selesai &amp; Bayar • {session.customer_name}
            </p>
            <h3 className="mt-0.5 font-heading text-2xl font-bold uppercase tracking-wide text-foreground">
              Tagihan {table.name}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-xl border border-border bg-background text-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {/* Rincian Biaya */}
          <div className="space-y-2 rounded-2xl border border-border bg-background p-4 text-sm">
            <div className="flex items-center justify-between text-muted">
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-primary" />
                <span>
                  {session.billing_mode === "open_table"
                    ? `Open Table (${livePricing.durationMinutes} mnt × ${formatRupiah(table.minute_rate)})`
                    : `Paket Jam (${formatDurationHuman(livePricing.durationMinutes)})`}
                </span>
              </span>
              <span className="tabular-money font-semibold text-foreground">
                {formatRupiah(livePricing.tableCost)}
              </span>
            </div>

            <div className="flex items-center justify-between text-muted">
              <span>Pesanan F&amp;B</span>
              <span className="tabular-money font-semibold text-foreground">
                {loadingOrders ? "..." : formatRupiah(livePricing.fnbCost)}
              </span>
            </div>

            {fnbOrders.length > 0 && (
              <ul className="space-y-1 rounded-xl border border-border/70 bg-surface/60 px-3 py-2 text-xs text-muted">
                {fnbOrders.map((order) => (
                  <li key={order.id} className="flex justify-between gap-2">
                    <span className="truncate">
                      {order.quantity}× {order.item_name}
                    </span>
                    <span className="tabular-money shrink-0 font-semibold text-foreground">
                      {formatRupiah(order.subtotal)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {livePricing.tablePromoDiscount > 0 && (
              <div className="flex items-center justify-between text-status-available">
                <span>
                  {hasLockedBookingDiscount
                    ? "Promo Booking Meja"
                    : `Promo ${table.name} (${livePricing.tablePromoRule?.label || (livePricing.tablePromoRule ? formatPromoShortTag(livePricing.tablePromoRule, livePricing.effectiveDurationHours) : "Diskon")})`}
                </span>
                <span className="tabular-money font-semibold">
                  -{formatRupiah(livePricing.tablePromoDiscount)}
                </span>
              </div>
            )}

            {livePricing.fnbPromoDiscount > 0 && (
              <div className="flex items-center justify-between text-status-available">
                <span>
                  Promo F&amp;B (
                  {livePricing.fnbAppliedRules[0]?.label ||
                    (livePricing.fnbAppliedRules[0]
                      ? formatPromoShortTag(livePricing.fnbAppliedRules[0])
                      : "Diskon")}
                  )
                </span>
                <span className="tabular-money font-semibold">
                  -{formatRupiah(livePricing.fnbPromoDiscount)}
                </span>
              </div>
            )}

            {livePricing.manualDiscountAmount > 0 && (
              <div className="flex items-center justify-between text-status-available">
                <span>Diskon Manual Tambahan</span>
                <span className="tabular-money font-semibold">
                  -{formatRupiah(livePricing.manualDiscountAmount)}
                </span>
              </div>
            )}

            <div className="flex items-baseline justify-between border-t border-border pt-3">
              <span className="text-base font-bold text-foreground">
                Total Tagihan
              </span>
              <span className="tabular-money font-heading text-3xl font-bold text-primary">
                {formatRupiah(livePricing.total)}
              </span>
            </div>
          </div>

          {/* Toggle Promo Kategori Otomatis */}
          {hasAnyActiveCategoryPromo && (
            <label className="flex min-h-[48px] cursor-pointer items-center justify-between gap-3 rounded-2xl border border-status-available/35 bg-status-available/10 px-4 py-2.5 text-xs">
              <div>
                <p className="font-bold text-status-available">
                  Terapkan Promo Kategori Aktif
                </p>
                <p className="text-muted">
                  Otomatis memotong sesuai aturan di menu Diskon.
                </p>
              </div>
              <input
                type="checkbox"
                checked={applyPromo}
                onChange={(e) => setApplyPromo(e.target.checked)}
                className="h-5 w-5 accent-primary"
              />
            </label>
          )}

          {/* Input Diskon Manual (Rp / % + Preset Cepat) */}
          <div className="rounded-2xl border border-border bg-background p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                Diskon Manual (Opsional)
              </span>
              <div className="inline-flex rounded-xl border border-border bg-surface p-1">
                <button
                  type="button"
                  onClick={() => {
                    setDiscountType("nominal");
                    setDiscountInput("");
                  }}
                  className={`min-h-[36px] rounded-lg px-3 text-xs font-bold transition ${
                    discountType === "nominal"
                      ? "bg-primary text-white"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  Rp
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDiscountType("percent");
                    setDiscountInput("");
                  }}
                  className={`min-h-[36px] rounded-lg px-3 text-xs font-bold transition ${
                    discountType === "percent"
                      ? "bg-primary text-white"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  %
                </button>
              </div>
            </div>

            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {discountType === "nominal"
                ? [5000, 10000, 20000].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setDiscountInput(String(val))}
                      className="tabular-money min-h-[36px] rounded-lg border border-border bg-surface px-2.5 text-xs font-semibold text-muted hover:border-primary/60 hover:text-foreground"
                    >
                      {formatRupiah(val)}
                    </button>
                  ))
                : [5, 10, 15, 20].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setDiscountInput(String(pct))}
                      className="tabular-nums min-h-[36px] rounded-lg border border-border bg-surface px-3 text-xs font-semibold text-muted hover:border-primary/60 hover:text-foreground"
                    >
                      {pct}%
                    </button>
                  ))}
            </div>

            <div className="mt-2.5 flex items-center gap-2">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={discountType === "percent" ? 100 : livePricing.subtotal}
                value={discountInput}
                onChange={(e) => setDiscountInput(e.target.value)}
                placeholder={
                  discountType === "percent"
                    ? "Contoh: 10 (%)"
                    : "Contoh: 10000 (Rp)"
                }
                className="tabular-nums min-h-[48px] flex-1 rounded-xl border border-border bg-surface px-3.5 text-sm font-semibold text-foreground placeholder:text-muted/70 focus:border-primary focus:outline-none"
              />
              {discountInput && (
                <button
                  type="button"
                  onClick={() => setDiscountInput("")}
                  className="min-h-[48px] rounded-xl border border-border bg-surface px-3 text-xs font-bold text-muted hover:text-foreground"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Metode Pembayaran */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
              Metode Pembayaran
            </p>
            <div className="grid grid-cols-3 gap-2.5">
              {(
                [
                  { id: "tunai", label: "Tunai", Icon: Banknote },
                  { id: "qris", label: "QRIS", Icon: QrCode },
                  { id: "transfer", label: "Transfer", Icon: CreditCard },
                ] as const
              ).map(({ id, label, Icon }) => {
                const active = paymentMethod === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPaymentMethod(id)}
                    className={`flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-2xl border text-xs font-bold transition ${
                      active
                        ? "border-primary bg-primary text-white shadow-md shadow-primary/25"
                        : "border-border bg-background text-foreground hover:border-primary/60"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <p className="rounded-xl border border-status-occupied/40 bg-status-occupied/10 px-3.5 py-2.5 text-xs font-semibold text-status-occupied">
              {error}
            </p>
          )}

          <button
            type="button"
            disabled={loading}
            onClick={() => void handleConfirmPayment()}
            className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-status-available px-5 text-base font-extrabold text-[#042317] shadow-lg shadow-status-available/20 transition hover:brightness-105 active:scale-[0.99] disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-5 w-5" />
            )}
            <span>Bayar {formatRupiah(livePricing.total)} &amp; Selesai</span>
          </button>
        </div>
      </div>
    </div>
  );
}
