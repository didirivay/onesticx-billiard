"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  Calendar,
  Check,
  Clock,
  Copy,
  MessageCircle,
  Radio,
  ShieldAlert,
  Ticket,
  XCircle,
} from "lucide-react";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  buildWhatsappConfirmationUrl,
  calculateEndTimeHHmm,
  formatIndonesianDate,
  formatRupiah,
  formatTimeHHmm,
  getBookingStatusLabel,
  getCategoryLabel,
} from "@/lib/format";
import type {
  BookingDetail,
  BookingStatus,
  PublicPaymentSettings,
} from "@/types/database";

interface BookingReceiptProps {
  initialBooking: BookingDetail;
  paymentSettings: PublicPaymentSettings;
}

export default function BookingReceipt({
  initialBooking,
  paymentSettings,
}: BookingReceiptProps) {
  const [booking, setBooking] = useState<BookingDetail>(initialBooking);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState(false);

  // Subscribe ke perubahan status booking secara real-time di HP pelanggan
  useEffect(() => {
    const supabase = getBrowserSupabaseClient();

    const channel = supabase
      .channel(`onesticx-booking-${initialBooking.booking_code}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "bookings",
          filter: `booking_code=eq.${initialBooking.booking_code}`,
        },
        (payload) => {
          const updated = payload.new as {
            status: string;
            total_price: number;
            duration_hours: number;
            booking_date: string;
            start_time: string;
          };
          setBooking((prev) => ({
            ...prev,
            status: updated.status as BookingStatus,
            total_price: updated.total_price ?? prev.total_price,
            duration_hours: updated.duration_hours ?? prev.duration_hours,
            booking_date: updated.booking_date ?? prev.booking_date,
            start_time: formatTimeHHmm(updated.start_time ?? prev.start_time),
          }));
        },
      )
      .subscribe((status) => {
        setRealtimeConnected(status === "SUBSCRIBED");
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [initialBooking.booking_code]);

  const startHHmm = formatTimeHHmm(booking.start_time);
  const endHHmm = calculateEndTimeHHmm(startHHmm, booking.duration_hours);

  const whatsappUrl = useMemo(
    () =>
      buildWhatsappConfirmationUrl({
        kasirWhatsapp: paymentSettings.whatsapp_kasir,
        bookingCode: booking.booking_code,
        customerName: booking.customer_name,
        tableName: booking.table.name,
        tableCategory: booking.table.category,
        bookingDate: booking.booking_date,
        startTime: startHHmm,
        durationHours: booking.duration_hours,
        totalPrice: booking.total_price,
      }),
    [booking, paymentSettings.whatsapp_kasir, startHHmm],
  );

  const handleCopy = async (field: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      window.setTimeout(() => {
        setCopiedField((prev) => (prev === field ? null : prev));
      }, 2000);
    } catch {
      // Abaikan jika browser membatasi clipboard
    }
  };

  const isPending = booking.status === "pending";
  const isConfirmed = booking.status === "confirmed";
  const isRejectedOrCancelled =
    booking.status === "rejected" || booking.status === "cancelled";
  const isCompleted = booking.status === "completed";

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3 px-4 py-3">
          <Link
            href="/"
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-foreground transition hover:border-primary/60 hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Beranda</span>
          </Link>

          <div className="flex items-center gap-2">
            <div className="h-8 w-8 overflow-hidden rounded-full ring-1 ring-primary/70">
              <Image
                src="/images/onesticx-logo.png"
                alt="Logo Onesticx Billiard"
                width={32}
                height={32}
                className="h-full w-full rounded-full object-cover"
              />
            </div>
            <span className="font-heading text-base font-bold uppercase tracking-wide">
              1St!cx Billiard
            </span>
          </div>

          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
              realtimeConnected
                ? "bg-status-available/15 text-status-available"
                : "bg-surface text-muted"
            }`}
          >
            <Radio
              className={`h-2.5 w-2.5 ${realtimeConnected ? "animate-pulse" : ""}`}
            />
            Live
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-5 px-4 pb-16 pt-6">
        {/* Banner Status Dinamis */}
        {isPending && (
          <section className="rounded-2xl border border-status-booked/35 bg-status-booked/10 p-4">
            <div className="flex items-start gap-3">
              <Clock className="mt-0.5 h-5 w-5 shrink-0 text-status-booked" />
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-status-booked">
                  {getBookingStatusLabel(booking.status)}
                </p>
                <p className="mt-1 text-sm text-foreground">
                  Silakan transfer sesuai nominal di bawah, lalu tekan tombol{" "}
                  <strong>Sudah Membayar</strong> untuk konfirmasi ke WhatsApp
                  Kasir.
                </p>
                <p className="mt-1.5 text-xs text-muted">
                  Halaman ini otomatis berubah menjadi{" "}
                  <strong className="text-status-available">
                    Terkonfirmasi
                  </strong>{" "}
                  saat kasir menerima pembayaran Anda.
                </p>
              </div>
            </div>
          </section>
        )}

        {isConfirmed && (
          <section className="rounded-2xl border border-status-available/40 bg-status-available/10 p-4">
            <div className="flex items-start gap-3">
              <BadgeCheck className="mt-0.5 h-6 w-6 shrink-0 text-status-available" />
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-status-available">
                  Booking Terkonfirmasi — Bukti Sah
                </p>
                <p className="mt-1 text-sm text-foreground">
                  Pembayaran Anda sudah diterima kasir. Tunjukkan{" "}
                  <strong>ID Pelanggan / Kode Booking</strong> di bawah ini saat
                  tiba di Onesticx Billiard.
                </p>
              </div>
            </div>
          </section>
        )}

        {isRejectedOrCancelled && (
          <section className="rounded-2xl border border-status-occupied/40 bg-status-occupied/10 p-4">
            <div className="flex items-start gap-3">
              <XCircle className="mt-0.5 h-6 w-6 shrink-0 text-status-occupied" />
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-status-occupied">
                  Booking {getBookingStatusLabel(booking.status)}
                </p>
                <p className="mt-1 text-sm text-foreground">
                  {booking.status === "rejected"
                    ? "Maaf, booking ini ditolak oleh kasir. Silakan hubungi WhatsApp kasir atau buat booking baru."
                    : "Booking ini telah dibatalkan atau melewati batas keterlambatan 15 menit."}
                </p>
              </div>
            </div>
          </section>
        )}

        {isCompleted && (
          <section className="rounded-2xl border border-primary/40 bg-primary/10 p-4">
            <div className="flex items-start gap-3">
              <BadgeCheck className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-primary">
                  Sesi Selesai
                </p>
                <p className="mt-1 text-sm text-foreground">
                  Terima kasih telah bermain di Onesticx Billiard! Sampai jumpa
                  di sesi berikutnya.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Kartu Tiket / ID Pelanggan */}
        <section
          className={`relative overflow-hidden rounded-2xl border bg-surface p-5 shadow-lg shadow-black/30 ${
            isConfirmed
              ? "border-primary ring-2 ring-primary/35"
              : "border-border"
          }`}
        >
          <div className="flex items-center justify-between gap-2 border-b border-dashed border-border pb-4">
            <div className="flex items-center gap-2">
              <Ticket className="h-5 w-5 text-primary" />
              <span className="text-xs font-semibold uppercase tracking-widest text-muted">
                {isConfirmed ? "ID Pelanggan (Sah)" : "Kode Booking"}
              </span>
            </div>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                isConfirmed
                  ? "bg-status-available/15 text-status-available"
                  : isPending
                    ? "bg-status-booked/15 text-status-booked"
                    : isRejectedOrCancelled
                      ? "bg-status-occupied/15 text-status-occupied"
                      : "bg-primary/20 text-primary"
              }`}
            >
              {getBookingStatusLabel(booking.status)}
            </span>
          </div>

          {/* Kode Besar + Tombol Salin */}
          <div className="my-5 flex flex-col items-center justify-center rounded-xl border border-border bg-background px-4 py-5 text-center">
            <p className="tabular-nums font-heading text-4xl font-bold tracking-[0.14em] text-foreground">
              {booking.booking_code}
            </p>
            <button
              type="button"
              onClick={() => handleCopy("code", booking.booking_code)}
              className="mt-3 inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs font-semibold text-foreground transition hover:border-primary/60 hover:text-primary"
            >
              {copiedField === "code" ? (
                <>
                  <Check className="h-3.5 w-3.5 text-status-available" />
                  <span className="text-status-available">Kode Tersalin</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Salin Kode Booking</span>
                </>
              )}
            </button>
          </div>

          {/* Rincian Jadwal & Pelanggan */}
          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">Nama Pelanggan</dt>
              <dd className="text-right font-semibold text-foreground">
                {booking.customer_name}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">Meja</dt>
              <dd className="text-right font-semibold text-foreground">
                {booking.table.name} ({getCategoryLabel(booking.table.category)})
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="flex items-center gap-1.5 text-muted">
                <Calendar className="h-3.5 w-3.5 text-primary" />
                <span>Tanggal</span>
              </dt>
              <dd className="text-right font-semibold text-foreground">
                {formatIndonesianDate(booking.booking_date)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="flex items-center gap-1.5 text-muted">
                <Clock className="h-3.5 w-3.5 text-primary" />
                <span>Jam Main</span>
              </dt>
              <dd className="tabular-timer text-right font-semibold text-foreground">
                {startHHmm} - {endHHmm} WIB ({booking.duration_hours} Jam)
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-t border-border pt-3">
              <dt className="font-semibold text-foreground">Total Biaya</dt>
              <dd className="tabular-money font-heading text-2xl font-bold text-primary">
                {formatRupiah(booking.total_price)}
              </dd>
            </div>
          </dl>
        </section>

        {/* Instruksi Pembayaran Manual (Tampil saat Pending) */}
        {isPending && (
          <section className="rounded-2xl border border-border bg-surface p-5">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              <h2 className="font-heading text-lg font-bold uppercase tracking-wide text-foreground">
                Instruksi Pembayaran Transfer
              </h2>
            </div>

            <div className="mt-4 space-y-3 rounded-xl border border-border bg-background p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-muted">Bank Tujuan</p>
                  <p className="mt-0.5 text-base font-bold text-foreground">
                    {paymentSettings.bank_name}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted">Atas Nama</p>
                  <p className="mt-0.5 text-sm font-semibold text-foreground">
                    {paymentSettings.bank_holder}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
                <div>
                  <p className="text-xs text-muted">Nomor Rekening</p>
                  <p className="tabular-nums mt-0.5 font-heading text-xl font-bold tracking-wider text-foreground">
                    {paymentSettings.bank_account}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    handleCopy("account", paymentSettings.bank_account)
                  }
                  className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-foreground transition hover:border-primary/60 hover:text-primary"
                >
                  {copiedField === "account" ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-status-available" />
                      <span className="text-status-available">Tersalin</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Salin</span>
                    </>
                  )}
                </button>
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
                <div>
                  <p className="text-xs text-muted">Nominal Transfer</p>
                  <p className="tabular-money mt-0.5 font-heading text-xl font-bold text-primary">
                    {formatRupiah(booking.total_price)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    handleCopy("amount", String(booking.total_price))
                  }
                  className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-foreground transition hover:border-primary/60 hover:text-primary"
                >
                  {copiedField === "amount" ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-status-available" />
                      <span className="text-status-available">Tersalin</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Salin</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Tombol Utama Konfirmasi WhatsApp Kasir */}
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 flex min-h-[54px] w-full items-center justify-center gap-2.5 rounded-xl bg-whatsapp px-5 text-center text-sm font-extrabold text-[#062111] shadow-lg shadow-whatsapp/20 transition hover:brightness-105 active:scale-[0.99] sm:text-base"
            >
              <MessageCircle className="h-5 w-5 shrink-0" />
              <span>Sudah Membayar — Konfirmasi via WhatsApp</span>
            </a>

            <p className="mt-2.5 text-center text-xs text-muted">
              Tombol di atas akan membuka WhatsApp dengan detail booking otomatis
              untuk dikirim ke Kasir Onesticx.
            </p>
          </section>
        )}

        {/* Aturan Keterlambatan */}
        {!isRejectedOrCancelled && !isCompleted && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-status-booked/30 bg-status-booked/10 p-4 text-xs leading-relaxed text-status-booked">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              <strong>Batas Keterlambatan 15 Menit:</strong> Harap tiba paling
              lambat 15 menit setelah jam mulai (
              <span className="tabular-timer font-semibold">{startHHmm} WIB</span>
              ). Jika terlambat tanpa konfirmasi, kasir berhak membatalkan
              jadwal.
            </p>
          </div>
        )}

        {/* Aksi Tambahan */}
        <div className="flex flex-col gap-2.5">
          {(isConfirmed || isRejectedOrCancelled || isCompleted) && (
            <Link
              href="/"
              className="flex min-h-[50px] w-full items-center justify-center rounded-xl bg-primary px-5 text-sm font-bold text-white transition hover:bg-primary-hover"
            >
              {isRejectedOrCancelled || isCompleted
                ? "Buat Booking Baru"
                : "Kembali ke Status Meja"}
            </Link>
          )}

          {isConfirmed && (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface px-5 text-sm font-semibold text-foreground transition hover:border-whatsapp/60 hover:text-whatsapp"
            >
              <MessageCircle className="h-4 w-4" />
              <span>Hubungi WhatsApp Kasir</span>
            </a>
          )}
        </div>
      </main>
    </div>
  );
}
