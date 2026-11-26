import { NextResponse } from "next/server";
import { isKasirAuthenticated } from "@/lib/kasir-auth";
import { loadDailyReportData } from "@/lib/kasir-report";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await isKasirAuthenticated())) {
    return NextResponse.json(
      { error: "Sesi kasir tidak aktif. Silakan masuk kembali." },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") ?? undefined;
  const mode = searchParams.get("mode") === "shift" ? "shift" : "calendar";

  try {
    const report = await loadDailyReportData(date, mode);
    return NextResponse.json(report);
  } catch {
    return NextResponse.json(
      { error: "Gagal memuat laporan harian." },
      { status: 500 },
    );
  }
}
