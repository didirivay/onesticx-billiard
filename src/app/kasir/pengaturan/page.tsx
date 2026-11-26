import type { Metadata } from "next";
import KasirPinGate from "@/components/kasir/KasirPinGate";
import KasirSettingsView from "@/components/kasir/KasirSettingsView";
import { isKasirAuthenticated } from "@/lib/kasir-auth";
import { loadKasirSettingsPageData } from "@/lib/kasir-settings";
import { isAdminSupabaseConfigured } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pengaturan Kasir",
  description:
    "Atur PIN kasir, nomor WhatsApp kasir, rekening bank, serta daftar meja billiard Onesticx.",
};

export default async function KasirPengaturanPage() {
  if (!isAdminSupabaseConfigured()) {
    return <KasirPinGate isServerKeyConfigured={false} />;
  }

  if (!(await isKasirAuthenticated())) {
    return <KasirPinGate isServerKeyConfigured={true} />;
  }

  const { settings, tables } = await loadKasirSettingsPageData();

  return (
    <KasirSettingsView initialSettings={settings} initialTables={tables} />
  );
}
