"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Banknote,
  Calendar,
  CreditCard,
  Download,
  Loader2,
  QrCode,
  Receipt,
  RefreshCw,
  Wallet,
  X,
} from "lucide-react";
import KasirTopBar from "@/components/kasir/KasirTopBar";
import { WIB_TIMEZONE, formatRupiah, getCategoryLabel } from "@/lib/format";
import type { PaymentMethod } from "@/types/database";
import type { DailyReportData, DailyReportTransaction } from "@/types/kasir";

interface DailyReportViewProps {
  initialReport: DailyReportData;
  todayWib: string;
}

function getYesterdayYmd(todayYmd: string): string {
  const d = new Date(`${todayYmd}T12:00:00+07:00`);
  d.setUTCDate(d.getUTCDate() - 1);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: WIB_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function formatIsoTimeWib(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: WIB_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

function formatDurationShort(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} mnt`;
  if (m === 0) return `${h} jam`;
  return `${h}j ${m}m`;
}

function getPaymentBadge(method: PaymentMethod) {
  switch (method) {
    case "tunai":
      return "border-status-available/30 bg-status-available/15 text-status-available";
    case "qris":
      return "border-status-booked/30 bg-status-booked/15 text-status-booked";
    case "transfer":
      return "border-primary/40 bg-primary/15 text-primary";
  }
}

export default function DailyReportView({
  initialReport,
  todayWib,
}: DailyReportViewProps) {
  const [report, setReport] = useState<DailyReportData>(initialReport);
  const [dateYmd, setDateYmd] = useState<string>(initialReport.dateYmd);
  const [mode, setMode] = useState<"calendar" | "shift">(initialReport.mode);
  const [methodFilter, setMethodFilter] = useState<"all" | PaymentMethod>(
    "all",
  );
  const [loading, setLoading] = useState(false);
  const [selectedTx, setSelectedTx] = useState<DailyReportTransaction | null>(
    null,
  );

  const yesterdayWib = useMemo(() => getYesterdayYmd(todayWib), [todayWib]);

  const fetchReport = useCallback(
    async (targetDate: string, targetMode: "calendar" | "shift") => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/kasir/laporan?date=${encodeURIComponent(targetDate)}&mode=${targetMode}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const next = (await res.json()) as DailyReportData;
        setReport(next);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const handleChangeDate = (nextDate: string) => {
    setDateYmd(nextDate);
    void fetchReport(nextDate, mode);
  };

  const handleChangeMode = (nextMode: "calendar" | "shift") => {
    setMode(nextMode);
    void fetchReport(dateYmd, nextMode);
  };

  const visibleTransactions = useMemo(() => {
    if (methodFilter === "all") return report.transactions;
    return report.transactions.filter((tx) => tx.payment_method === methodFilter);
  }, [report.transactions, methodFilter]);

  const handleExportCsv = () => {
    const escapeCsv = (val: string | number) => {
      const str = String(val);
      if (/[",\r\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headers = [
      "Tanggal",
      "Jam Mulai (WIB)",
      "Jam Selesai (WIB)",
      "Meja",
      "Kategori",
      "Pelanggan",
      "Mode Billing",
      "Durasi (Menit)",
      "Biaya Meja (Rp)",
      "Biaya F&B (Rp)",
      "Detail F&B",
      "Diskon (Rp)",
      "Total Dibayar (Rp)",
      "Metode Pembayaran",
    ];

    const rows = visibleTransactions.map((tx) => {
      const fnbDetail = tx.fnb_orders
        .map((o) => `${o.quantity}x ${o.item_name}`)
        .join("; ");
      return [
        report.dateYmd,
        formatIsoTimeWib(tx.start_time),
        formatIsoTimeWib(tx.end_time),
        tx.table_name,
        getCategoryLabel(tx.table_category),
        tx.customer_name,
        tx.billing_mode === "open_table" ? "Open Table" : "Paket Jam",
        tx.duration_minutes,
        tx.table_cost,
        tx.fnb_cost,
        fnbDetail || "-",
        tx.discount_amount,
        tx.total_amount,
        tx.payment_method.toUpperCase(),
      ];
    });

    const summaryRows = [
      [],
      ["RINGKASAN LAPORAN", report.rangeLabel],
      ["Total Transaksi", report.summary.totalTransactions],
      ["Total Pendapatan Bersih (Rp)", report.summary.totalRevenue],
      ["Tunai (Rp)", report.summary.byPaymentMethod.tunai.total],
      ["QRIS (Rp)", report.summary.byPaymentMethod.qris.total],
      ["Transfer (Rp)", report.summary.byPaymentMethod.transfer.total],
      ["Total Sewa Meja (Rp)", report.summary.totalTableRevenue],
      ["Total Penjualan F&B (Rp)", report.summary.totalFnbRevenue],
      ["Total Diskon (Rp)", report.summary.totalDiscount],
    ];

    const csvContent =
      "\uFEFF" +
      [headers, ...rows, ...summaryRows]
        .map((cols) => cols.map(escapeCsv).join(","))
        .join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const modeSuffix = report.mode === "shift" ? "-shift" : "";
    link.download = `laporan-onesticx-${report.dateYmd}${modeSuffix}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <KasirTopBar
        activeTab="laporan"
        rightActions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              className="flex min-h-[48px] items-center gap-2 rounded-xl border border-primary/50 bg-primary/15 px-3.5 text-xs font-bold text-primary transition hover:bg-primary hover:text-white"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Export CSV</span>
            </button>
            <button
              type="button"
              onClick={() => void fetchReport(dateYmd, mode)}
              title="Muat ulang laporan"
              className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-xl border border-border bg-background text-foreground hover:border-primary/60"
            >
              <RefreshCw
                className={`h-5 w-5 ${loading ? "animate-spin text-primary" : ""}`}
              />
            </button>
          </div>
        }
      />

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-5 p-4 lg:p-6">
        {/* Header & Filter Tanggal / Mode Shift */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-primary">
              Rekap Keuangan
            </p>
            <h1 className="mt-0.5 font-heading text-3xl font-bold uppercase tracking-wide text-foreground">
              Laporan Pendapatan Harian
            </h1>
            <p className="mt-1 text-xs text-muted">{report.rangeLabel}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleChangeDate(todayWib)}
              className={`min-h-[48px] rounded-xl border px-3.5 text-xs font-bold transition ${
                dateYmd === todayWib
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-surface text-muted hover:text-foreground"
              }`}
            >
              Hari Ini
            </button>
            <button
              type="button"
              onClick={() => handleChangeDate(yesterdayWib)}
              className={`min-h-[48px] rounded-xl border px-3.5 text-xs font-bold transition ${
                dateYmd === yesterdayWib
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-surface text-muted hover:text-foreground"
              }`}
            >
              Kemarin
            </button>

            <div className="relative">
              <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
              <input
                type="date"
                value={dateYmd}
                onChange={(e) => {
                  if (e.target.value) handleChangeDate(e.target.value);
                }}
                className="min-h-[48px] rounded-xl border border-border bg-surface pl-9 pr-3 text-sm font-semibold text-foreground focus:border-primary focus:outline-none"
              />
            </div>

            <div className="inline-flex rounded-xl border border-border bg-surface p-1">
              <button
                type="button"
                onClick={() => handleChangeMode("calendar")}
                className={`min-h-[40px] rounded-lg px-3 text-xs font-bold transition ${
                  mode === "calendar"
                    ? "bg-primary text-white"
                    : "text-muted hover:text-foreground"
                }`}
              >
                00–24 WIB
              </button>
              <button
                type="button"
                onClick={() => handleChangeMode("shift")}
                className={`min-h-[40px] rounded-lg px-3 text-xs font-bold transition ${
                  mode === "shift"
                    ? "bg-primary text-white"
                    : "text-muted hover:text-foreground"
                }`}
              >
                Shift 10–02
              </button>
            </div>
          </div>
        </div>

        {/* 4 Kartu KPI Pendapatan per Metode Pembayaran */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-primary/50 bg-primary/10 p-4">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-primary">
              <span>Total Pendapatan</span>
              <Wallet className="h-4 w-4" />
            </div>
            <p className="tabular-money mt-2 font-heading text-3xl font-bold text-foreground">
              {formatRupiah(report.summary.totalRevenue)}
            </p>
            <p className="tabular-nums mt-1 text-xs text-muted">
              {report.summary.totalTransactions} transaksi selesai
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-status-available">
              <span>Tunai</span>
              <Banknote className="h-4 w-4" />
            </div>
            <p className="tabular-money mt-2 font-heading text-3xl font-bold text-foreground">
              {formatRupiah(report.summary.byPaymentMethod.tunai.total)}
            </p>
            <p className="tabular-nums mt-1 text-xs text-muted">
              {report.summary.byPaymentMethod.tunai.count} transaksi
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-status-booked">
              <span>QRIS</span>
              <QrCode className="h-4 w-4" />
            </div>
            <p className="tabular-money mt-2 font-heading text-3xl font-bold text-foreground">
              {formatRupiah(report.summary.byPaymentMethod.qris.total)}
            </p>
            <p className="tabular-nums mt-1 text-xs text-muted">
              {report.summary.byPaymentMethod.qris.count} transaksi
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-primary">
              <span>Transfer</span>
              <CreditCard className="h-4 w-4" />
            </div>
            <p className="tabular-money mt-2 font-heading text-3xl font-bold text-foreground">
              {formatRupiah(report.summary.byPaymentMethod.transfer.total)}
            </p>
            <p className="tabular-nums mt-1 text-xs text-muted">
              {report.summary.byPaymentMethod.transfer.count} transaksi
            </p>
          </div>
        </section>

        {/* Strip Rincian Meja vs F&B vs Diskon */}
        <section className="grid grid-cols-1 gap-3 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-3">
          <div className="flex items-center justify-between rounded-xl border border-border bg-background px-4 py-3">
            <span className="text-xs font-semibold text-muted">
              Sewa Meja
            </span>
            <span className="tabular-money font-heading text-lg font-bold text-foreground">
              {formatRupiah(report.summary.totalTableRevenue)}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border bg-background px-4 py-3">
            <span className="text-xs font-semibold text-muted">
              Penjualan F&amp;B
            </span>
            <span className="tabular-money font-heading text-lg font-bold text-foreground">
              {formatRupiah(report.summary.totalFnbRevenue)}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border bg-background px-4 py-3">
            <span className="text-xs font-semibold text-muted">
              Total Diskon Manual
            </span>
            <span className="tabular-money font-heading text-lg font-bold text-status-booked">
              -{formatRupiah(report.summary.totalDiscount)}
            </span>
          </div>
        </section>

        {/* Tabel Riwayat Transaksi */}
        <section className="rounded-2xl border border-border bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3.5">
            <div className="flex items-center gap-2">
              <h2 className="font-heading text-xl font-bold uppercase tracking-wide text-foreground">
                Riwayat Transaksi
              </h2>
              {loading && (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(["all", "tunai", "qris", "transfer"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethodFilter(m)}
                  className={`min-h-[42px] rounded-xl border px-3.5 text-xs font-bold uppercase transition ${
                    methodFilter === m
                      ? "border-primary bg-primary text-white"
                      : "border-border bg-background text-muted hover:text-foreground"
                  }`}
                >
                  {m === "all" ? "Semua" : m}
                </button>
              ))}
            </div>
          </div>

          {visibleTransactions.length === 0 ? (
            <div className="py-12 text-center">
              <Receipt className="mx-auto h-9 w-9 text-muted" />
              <p className="mt-2 text-sm font-semibold text-foreground">
                Belum ada transaksi selesai pada periode ini
              </p>
              <p className="mt-1 text-xs text-muted">
                Transaksi otomatis tercatat setelah kasir menekan Selesai &amp;
                Bayar pada meja.
              </p>
            </div>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wider text-muted">
                    <th className="py-3 pr-3">Waktu WIB</th>
                    <th className="py-3 pr-3">Meja &amp; Pelanggan</th>
                    <th className="py-3 pr-3">Durasi</th>
                    <th className="py-3 pr-3 text-right">Meja</th>
                    <th className="py-3 pr-3 text-right">F&amp;B</th>
                    <th className="py-3 pr-3 text-right">Diskon</th>
                    <th className="py-3 pr-3 text-right">Total</th>
                    <th className="py-3 pr-3 text-center">Metode</th>
                    <th className="py-3 text-right">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70">
                  {visibleTransactions.map((tx) => (
                    <tr
                      key={tx.id}
                      className="transition hover:bg-background/60"
                    >
                      <td className="tabular-timer py-3 pr-3 text-xs text-muted">
                        <span className="font-semibold text-foreground">
                          {formatIsoTimeWib(tx.end_time)}
                        </span>
                        <br />
                        <span>Mulai {formatIsoTimeWib(tx.start_time)}</span>
                      </td>
                      <td className="py-3 pr-3">
                        <p className="font-semibold text-foreground">
                          {tx.table_name}
                        </p>
                        <p className="text-xs text-muted">
                          {tx.customer_name} •{" "}
                          {tx.billing_mode === "open_table"
                            ? "Open Table"
                            : "Paket"}
                        </p>
                      </td>
                      <td className="tabular-nums py-3 pr-3 text-xs text-muted">
                        {formatDurationShort(tx.duration_minutes)}
                      </td>
                      <td className="tabular-money py-3 pr-3 text-right text-xs text-foreground">
                        {formatRupiah(tx.table_cost)}
                      </td>
                      <td className="tabular-money py-3 pr-3 text-right text-xs text-foreground">
                        {formatRupiah(tx.fnb_cost)}
                      </td>
                      <td className="tabular-money py-3 pr-3 text-right text-xs text-status-booked">
                        {tx.discount_amount > 0
                          ? `-${formatRupiah(tx.discount_amount)}`
                          : "-"}
                      </td>
                      <td className="tabular-money py-3 pr-3 text-right font-heading text-base font-bold text-primary">
                        {formatRupiah(tx.total_amount)}
                      </td>
                      <td className="py-3 pr-3 text-center">
                        <span
                          className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase ${getPaymentBadge(tx.payment_method)}`}
                        >
                          {tx.payment_method}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedTx(tx)}
                          className="min-h-[40px] rounded-xl border border-border bg-background px-3 text-xs font-bold text-foreground hover:border-primary/60 hover:text-primary"
                        >
                          Struk
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {/* Modal Detail Struk Digital Transaksi */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-border bg-surface p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-2 border-b border-border pb-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-primary">
                  Struk Digital Transaksi
                </p>
                <h3 className="mt-0.5 font-heading text-2xl font-bold uppercase text-foreground">
                  {selectedTx.table_name} — {selectedTx.customer_name}
                </h3>
                <p className="tabular-timer mt-1 text-xs text-muted">
                  {formatIsoTimeWib(selectedTx.start_time)} -{" "}
                  {formatIsoTimeWib(selectedTx.end_time)} WIB (
                  {formatDurationShort(selectedTx.duration_minutes)})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTx(null)}
                className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-xl border border-border bg-background text-muted hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-2.5 rounded-2xl border border-border bg-background p-4 text-sm">
              <div className="flex justify-between text-muted">
                <span>Mode Billing</span>
                <span className="font-semibold text-foreground">
                  {selectedTx.billing_mode === "open_table"
                    ? "Open Table (Freetime)"
                    : "Paket Jam"}
                </span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Biaya Sewa Meja</span>
                <span className="tabular-money font-semibold text-foreground">
                  {formatRupiah(selectedTx.table_cost)}
                </span>
              </div>

              {selectedTx.fnb_orders.length > 0 && (
                <div className="space-y-1 border-t border-dashed border-border pt-2">
                  <p className="text-xs font-bold uppercase text-muted">
                    Item F&amp;B
                  </p>
                  {selectedTx.fnb_orders.map((order) => (
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

              {selectedTx.discount_amount > 0 && (
                <div className="flex justify-between text-status-available">
                  <span>Diskon Manual</span>
                  <span className="tabular-money font-semibold">
                    -{formatRupiah(selectedTx.discount_amount)}
                  </span>
                </div>
              )}

              <div className="flex items-baseline justify-between border-t border-border pt-3">
                <span className="font-bold text-foreground">Total Bayar</span>
                <span className="tabular-money font-heading text-2xl font-bold text-primary">
                  {formatRupiah(selectedTx.total_amount)}
                </span>
              </div>

              <div className="flex justify-between text-xs text-muted">
                <span>Metode Pembayaran</span>
                <span className="font-bold uppercase text-foreground">
                  {selectedTx.payment_method}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSelectedTx(null)}
              className="mt-4 flex min-h-[50px] w-full items-center justify-center rounded-2xl bg-primary text-sm font-bold text-white hover:bg-primary-hover"
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
