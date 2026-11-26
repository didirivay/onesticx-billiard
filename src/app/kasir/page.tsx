import type { Metadata } from "next";
import KasirDashboard from "@/components/kasir/KasirDashboard";
import KasirPinGate from "@/components/kasir/KasirPinGate";
import { loadKasirDashboardData } from "@/lib/kasir-dashboard";
import { isKasirAuthenticated } from "@/lib/kasir-auth";
import { isAdminSupabaseConfigured } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard Kasir",
  description:
    "Panel kasir tablet landscape 1St!cx Billiard — manajemen meja, timer real-time, dan antrean booking.",
};

export default async function KasirPage() {
  const serverKeyReady = isAdminSupabaseConfigured();
  if (!serverKeyReady) {
    return <KasirPinGate isServerKeyConfigured={false} />;
  }

  const authenticated = await isKasirAuthenticated();
  if (!authenticated) {
    return <KasirPinGate isServerKeyConfigured={true} />;
  }

  const initialData = await loadKasirDashboardData();
  return <KasirDashboard initialData={initialData} />;
}
