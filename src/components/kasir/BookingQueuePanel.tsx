"use client";

import { useState } from "react";
import {
  AlertTriangle,
  BellRing,
  Check,
  Clock,
  Loader2,
  MessageCircle,
  Play,
  X,
} from "lucide-react";
import {
  calculateEndTimeHHmm,
  formatRupiah,
  formatShortIndonesianDate,
  getCategoryLabel,
  getWibNow,
  normalizeWhatsappNumber,
  toOperationalMinutes,
} from "@/lib/format";
import type { KasirBookingItem } from "@/types/kasir";

interface BookingQueuePanelProps {
  pendingBookings: KasirBookingItem[];
  confirmedTodayBookings: KasirBookingItem[];
  todayWib: string;
  busyBookingId: string | null;
  onBookingAction: (
    bookingId: string,
    action: "confirm" | "reject" | "cancel",
  ) => Promise<void>;
  onCheckInBooking: (booking: KasirBookingItem) => Promise<void>;
  onCloseMobileDrawer?: () => void;
}

function buildCustomerIdWhatsappLink(booking: KasirBookingItem): string {
  const phone = normalizeWhatsappNumber(booking.whatsapp_number);
  const endHHmm = calculateEndTimeHHmm(
    booking.start_time,
    booking.duration_hours,
  );
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://onesticx.diclaude.tech";
  const receiptUrl = `${origin}/booking/${booking.booking_code}`;

  const lines = [
    `Halo Kak *${booking.customer_name}*, booking Anda di *Onesticx Billiard* sudah *TERKONFIRMASI*! 🎱`,
    "",
    `• ID Pelanggan / Kode Booking: *${booking.booking_code}*`,
    `• Meja: ${booking.table_name} (${getCategoryLabel(booking.table_category)})`,
    `• Tanggal: ${formatShortIndonesianDate(booking.booking_date)}`,
    `• Jam Main: ${booking.start_time} - ${endHHmm} WIB (${booking.duration_hours} Jam)`,
    `• Total: ${formatRupiah(booking.total_price)} (Lunas)`,
    "",
    `Bukti booking digital: ${receiptUrl}`,
    "Harap tiba maksimal 15 menit dari jam booking. Sampai jumpa di Onesticx!",
  ];

  return `https://wa.me/${phone}?text=${encodeURIComponent(lines.join("\n"))}`;
}

function isBookingLateOver15Min(
  booking: KasirBookingItem,
  todayWib: string,
): boolean {
  if (booking.checked_in || booking.booking_date !== todayWib) return false;
  const now = getWibNow();
  const nowOpMin = (now.hour < 10 ? now.hour + 24 : now.hour) * 60 + now.minute;
  const startOpMin = toOperationalMinutes(booking.start_time);
  return startOpMin >= 0 && nowOpMin > startOpMin + 15;
}

export default function BookingQueuePanel({
  pendingBookings,
  confirmedTodayBookings,
  todayWib,
  busyBookingId,
  onBookingAction,
  onCheckInBooking,
  onCloseMobileDrawer,
}: BookingQueuePanelProps) {
  const [activeTab, setActiveTab] = useState<"pending" | "confirmed">(
    "pending",
  );
  const [confirmDangerId, setConfirmDangerId] = useState<string | null>(null);

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* Header Panel */}
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3.5">
        <div className="flex items-center gap-2">
          <BellRing
            className={`h-5 w-5 ${
              pendingBookings.length > 0
                ? "animate-bounce text-status-occupied"
                : "text-primary"
            }`}
          />
          <h2 className="font-heading text-lg font-bold uppercase tracking-wide text-foreground">
            Antrean Booking
          </h2>
          {pendingBookings.length > 0 && (
            <span className="tabular-nums inline-flex h-6 min-w-[24px] items-center justify-center rounded-full bg-status-occupied px-2 text-xs font-extrabold text-white">
              {pendingBookings.length}
            </span>
          )}
        </div>

        {onCloseMobileDrawer && (
          <button
            type="button"
            onClick={onCloseMobileDrawer}
            aria-label="Tutup panel antrean"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-border bg-background text-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Tab Pilihan */}
      <div className="grid grid-cols-2 gap-2 border-b border-border p-3">
        <button
          type="button"
          onClick={() => {
            setActiveTab("pending");
            setConfirmDangerId(null);
          }}
          className={`flex min-h-[48px] items-center justify-center gap-2 rounded-xl border px-3 text-sm font-bold transition ${
            activeTab === "pending"
              ? "border-primary bg-primary text-white"
              : "border-border bg-background text-muted hover:text-foreground"
          }`}
        >
          <span>Pending</span>
          <span
            className={`tabular-nums rounded-full px-2 py-0.5 text-xs font-extrabold ${
              pendingBookings.length > 0
                ? "bg-status-occupied text-white"
                : "bg-surface text-muted"
            }`}
          >
            {pendingBookings.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab("confirmed");
            setConfirmDangerId(null);
          }}
          className={`flex min-h-[48px] items-center justify-center gap-2 rounded-xl border px-3 text-sm font-bold transition ${
            activeTab === "confirmed"
              ? "border-primary bg-primary text-white"
              : "border-border bg-background text-muted hover:text-foreground"
          }`}
        >
          <span>Hari Ini</span>
          <span className="tabular-nums rounded-full bg-background/40 px-2 py-0.5 text-xs font-bold">
            {confirmedTodayBookings.length}
          </span>
        </button>
      </div>

      {/* Daftar Booking */}
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {activeTab === "pending" ? (
          pendingBookings.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-background/50 px-4 py-10 text-center">
              <Check className="mx-auto h-7 w-7 text-status-available" />
              <p className="mt-2 text-sm font-semibold text-foreground">
                Tidak ada booking pending
              </p>
              <p className="mt-1 text-xs text-muted">
                Booking online baru dari pelanggan akan muncul otomatis di sini.
              </p>
            </div>
          ) : (
            pendingBookings.map((item) => {
              const endHHmm = calculateEndTimeHHmm(
                item.start_time,
                item.duration_hours,
              );
              const isBusy = busyBookingId === item.id;
              const isConfirmingReject = confirmDangerId === item.id;

              return (
                <article
                  key={item.id}
                  className="rounded-2xl border border-status-booked/40 bg-background p-3.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-foreground">
                        {item.customer_name}
                      </p>
                      <p className="tabular-nums text-xs text-muted">
                        WA: {item.whatsapp_number}
                      </p>
                    </div>
                    <span className="tabular-nums shrink-0 rounded-lg border border-border bg-surface px-2 py-1 font-heading text-xs font-bold tracking-wider text-primary">
                      {item.booking_code}
                    </span>
                  </div>

                  <div className="mt-2.5 space-y-1 rounded-xl border border-border bg-surface/80 px-3 py-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-foreground">
                        {item.table_name}
                      </span>
                      <span className="tabular-money font-bold text-primary">
                        {formatRupiah(item.total_price)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-muted">
                      <span>{formatShortIndonesianDate(item.booking_date)}</span>
                      <span className="tabular-timer font-semibold text-foreground">
                        {item.start_time} - {endHHmm} WIB ({item.duration_hours}
                        j)
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => {
                        setConfirmDangerId(null);
                        void onBookingAction(item.id, "confirm");
                      }}
                      className="flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl bg-status-available px-3 text-sm font-extrabold text-[#042317] transition hover:brightness-105 active:scale-[0.98] disabled:opacity-50"
                    >
                      {isBusy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4 stroke-[3]" />
                      )}
                      <span>Terima</span>
                    </button>

                    {isConfirmingReject ? (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                          setConfirmDangerId(null);
                          void onBookingAction(item.id, "reject");
                        }}
                        className="flex min-h-[48px] items-center justify-center gap-1 rounded-xl bg-status-occupied px-3 text-xs font-extrabold text-white transition active:scale-[0.98] disabled:opacity-50"
                      >
                        Yakin Tolak?
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => setConfirmDangerId(item.id)}
                        className="flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl border border-status-occupied/40 bg-status-occupied/15 px-3 text-sm font-bold text-status-occupied transition hover:bg-status-occupied/25 active:scale-[0.98] disabled:opacity-50"
                      >
                        <X className="h-4 w-4" />
                        <span>Tolak</span>
                      </button>
                    )}
                  </div>
                </article>
              );
            })
          )
        ) : confirmedTodayBookings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-background/50 px-4 py-10 text-center">
            <Clock className="mx-auto h-7 w-7 text-muted" />
            <p className="mt-2 text-sm font-semibold text-foreground">
              Belum ada booking terkonfirmasi hari ini
            </p>
            <p className="mt-1 text-xs text-muted">
              Booking yang diterima untuk hari ini akan muncul di sini untuk
              check-in cepat.
            </p>
          </div>
        ) : (
          confirmedTodayBookings.map((item) => {
            const endHHmm = calculateEndTimeHHmm(
              item.start_time,
              item.duration_hours,
            );
            const late = isBookingLateOver15Min(item, todayWib);
            const isBusy = busyBookingId === item.id;
            const isConfirmingCancel = confirmDangerId === item.id;

            return (
              <article
                key={item.id}
                className={`rounded-2xl border bg-background p-3.5 ${
                  late ? "border-status-occupied/60" : "border-border"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-bold text-foreground">
                        {item.customer_name}
                      </p>
                      {item.checked_in && (
                        <span className="rounded-full bg-status-available/15 px-2 py-0.5 text-[10px] font-bold uppercase text-status-available">
                          Main
                        </span>
                      )}
                    </div>
                    <p className="tabular-timer mt-0.5 text-xs text-muted">
                      {item.table_name} • {item.start_time} - {endHHmm} WIB (
                      {item.duration_hours}j)
                    </p>
                  </div>
                  <span className="tabular-nums shrink-0 rounded-lg border border-primary/40 bg-primary/15 px-2 py-1 font-heading text-xs font-bold tracking-wider text-primary">
                    {item.booking_code}
                  </span>
                </div>

                {late && (
                  <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-status-occupied/15 px-2.5 py-1.5 text-[11px] font-semibold text-status-occupied">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    <span>Lewat batas keterlambatan 15 menit!</span>
                  </p>
                )}

                {!item.checked_in && (
                  <div className="mt-3 space-y-2">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void onCheckInBooking(item)}
                      className="flex min-h-[48px] w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-bold text-white transition hover:bg-primary-hover active:scale-[0.98] disabled:opacity-50"
                    >
                      {isBusy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4 fill-current" />
                      )}
                      <span>Check-in &amp; Mulai Main</span>
                    </button>

                    <div className="grid grid-cols-2 gap-2">
                      <a
                        href={buildCustomerIdWhatsappLink(item)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl border border-whatsapp/40 bg-whatsapp/10 px-2.5 text-xs font-bold text-whatsapp transition hover:bg-whatsapp/20"
                      >
                        <MessageCircle className="h-4 w-4" />
                        <span>Kirim ID WA</span>
                      </a>

                      {isConfirmingCancel ? (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => {
                            setConfirmDangerId(null);
                            void onBookingAction(item.id, "cancel");
                          }}
                          className="flex min-h-[48px] items-center justify-center rounded-xl bg-status-occupied px-2.5 text-xs font-extrabold text-white"
                        >
                          Yakin Hangus?
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setConfirmDangerId(item.id)}
                          className="flex min-h-[48px] items-center justify-center rounded-xl border border-border bg-surface px-2.5 text-xs font-bold text-muted transition hover:border-status-occupied/50 hover:text-status-occupied"
                        >
                          Batalkan
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
