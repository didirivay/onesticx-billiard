import type { Metadata } from "next";
import DailyReportView from "@/components/kasir/DailyReportView";
import KasirPinGate from "@/components/kasir/KasirPinGate";
import { isKasirAuthenticated } from "@/lib/kasir-auth";
import { loadDailyReportData } from "@/lib/kasir-report";
import { isAdminSupabaseConfigured } from "@/lib/supabase/admin";
import { getWibNow } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Laporan Harian Kasir",
  description:
    "Rekap pendapatan harian Onesticx Billiard dipisahkan per metode pembayaran Tunai, QRIS, dan Transfer.",
};

export default async function KasirLaporanPage() {
  if (!isAdminSupabaseConfigured()) {
    return <KasirPinGate isServerKeyConfigured={false} />;
  }

  if (!(await isKasirAuthenticated())) {
    return <KasirPinGate isServerKeyConfigured={true} />;
  }

  const todayWib = getWibNow().dateYmd;
  const initialReport = await loadDailyReportData(todayWib, "calendar");

  return <DailyReportView initialReport={initialReport} todayWib={todayWib} />;
}
