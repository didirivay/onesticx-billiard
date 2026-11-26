import { NextResponse } from "next/server";
import { isKasirAuthenticated } from "@/lib/kasir-auth";
import { loadKasirDashboardData } from "@/lib/kasir-dashboard";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isKasirAuthenticated())) {
    return NextResponse.json(
      { error: "Sesi kasir tidak aktif. Silakan masuk dengan PIN." },
      { status: 401 },
    );
  }

  try {
    const data = await loadKasirDashboardData();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Gagal memuat data dashboard kasir." },
      { status: 500 },
    );
  }
}
