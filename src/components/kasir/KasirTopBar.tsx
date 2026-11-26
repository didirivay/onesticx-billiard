"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlarmClock,
  Coffee,
  FileBarChart2,
  LayoutGrid,
  LogOut,
  Percent,
  Radio,
  Settings,
  VolumeX,
} from "lucide-react";
import { WIB_TIMEZONE } from "@/lib/format";
import {
  playOvertimeAlarmSound,
  triggerBrowserNotification,
  unlockKasirAudio,
} from "@/lib/kasir-alarm";
import type { KasirDashboardData } from "@/types/kasir";

export type KasirNavTab =
  | "meja"
  | "fnb"
  | "diskon"
  | "laporan"
  | "pengaturan";

interface KasirTopBarProps {
  activeTab: KasirNavTab;
  realtimeConnected?: boolean;
  rightActions?: React.ReactNode;
}

const NAV_ITEMS: Array<{
  id: KasirNavTab;
  href: string;
  label: string;
  Icon: typeof LayoutGrid;
}> = [
  { id: "meja", href: "/kasir", label: "Meja", Icon: LayoutGrid },
  { id: "fnb", href: "/kasir/fnb", label: "F&B", Icon: Coffee },
  { id: "diskon", href: "/kasir/diskon", label: "Diskon", Icon: Percent },
  {
    id: "laporan",
    href: "/kasir/laporan",
    label: "Laporan",
    Icon: FileBarChart2,
  },
  {
    id: "pengaturan",
    href: "/kasir/pengaturan",
    label: "Pengaturan",
    Icon: Settings,
  },
];

const BG_ALARM_REPEAT_MS = 25_000;

function formatWibClockHMS(ms: number): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: WIB_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date(ms));
}

function formatOvertimeHMS(overtimeSec: number): string {
  const safe = Math.max(0, Math.floor(overtimeSec));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return `+${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function KasirTopBar({
  activeTab,
  realtimeConnected,
  rightActions,
}: KasirTopBarProps) {
  const router = useRouter();
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [clockReady, setClockReady] = useState(false);

  // Watcher ringan saat kasir sedang berada di halaman selain /kasir (F&B, Diskon, Laporan, Pengaturan)
  const [bgSnapshot, setBgSnapshot] = useState<KasirDashboardData | null>(null);
  const [bgMutedIds, setBgMutedIds] = useState<Set<string>>(() => new Set());
  const bgLastAlarmRef = useRef<Map<string, number>>(new Map());
  const bgNotifiedRef = useRef<Set<string>>(new Set());

  // Buka kunci AudioContext otomatis saat interaksi sentuhan/klik pertama kasir
  useEffect(() => {
    const handleUnlock = () => unlockKasirAudio();
    window.addEventListener("pointerdown", handleUnlock, { passive: true });
    window.addEventListener("keydown", handleUnlock);
    return () => {
      window.removeEventListener("pointerdown", handleUnlock);
      window.removeEventListener("keydown", handleUnlock);
    };
  }, []);

  useEffect(() => {
    setClockReady(true);
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const fetchBgSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/kasir/dashboard", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as KasirDashboardData;
      setBgSnapshot(data);
    } catch {
      // Abaikan jika offline sementara
    }
  }, []);

  useEffect(() => {
    if (activeTab === "meja") return;
    void fetchBgSessions();
    const id = window.setInterval(() => {
      void fetchBgSessions();
    }, 15_000);
    return () => window.clearInterval(id);
  }, [activeTab, fetchBgSessions]);

  const bgOvertimeAlerts = useMemo(() => {
    if (activeTab === "meja" || !bgSnapshot) return [];
    const tableById = new Map(bgSnapshot.tables.map((t) => [t.id, t]));
    const list: Array<{
      sessionId: string;
      tableName: string;
      customerName: string;
      overtimeSec: number;
    }> = [];

    for (const sess of bgSnapshot.activeSessions) {
      if (sess.billing_mode !== "package") continue;
      const startMs = new Date(sess.start_time).getTime();
      const totalSec = sess.duration_minutes * 60;
      const elapsedSec = Math.floor((nowMs - startMs) / 1000);
      const remainingSec = totalSec - elapsedSec;
      if (remainingSec <= 0) {
        list.push({
          sessionId: sess.id,
          tableName: tableById.get(sess.table_id)?.name ?? "Meja",
          customerName: sess.customer_name,
          overtimeSec: Math.abs(remainingSec),
        });
      }
    }
    return list;
  }, [activeTab, bgSnapshot, nowMs]);

  useEffect(() => {
    if (activeTab === "meja" || bgOvertimeAlerts.length === 0) return;

    let shouldRing = false;
    for (const item of bgOvertimeAlerts) {
      if (!bgNotifiedRef.current.has(item.sessionId)) {
        bgNotifiedRef.current.add(item.sessionId);
        triggerBrowserNotification({
          title: `⏰ WAKTU HABIS — ${item.tableName}!`,
          body: `Sesi Paket ${item.customerName} di ${item.tableName} telah berakhir. Klik untuk kembali ke Dashboard Meja.`,
          tag: `overtime-${item.sessionId}`,
        });
      }

      if (bgMutedIds.has(item.sessionId)) continue;
      const lastFired = bgLastAlarmRef.current.get(item.sessionId) ?? 0;
      if (nowMs - lastFired >= BG_ALARM_REPEAT_MS) {
        bgLastAlarmRef.current.set(item.sessionId, nowMs);
        shouldRing = true;
      }
    }

    if (shouldRing) {
      playOvertimeAlarmSound();
    }
  }, [activeTab, bgMutedIds, bgOvertimeAlerts, nowMs]);

  const handleMuteBgAll = () => {
    setBgMutedIds((prev) => {
      const next = new Set(prev);
      for (const item of bgOvertimeAlerts) {
        next.add(item.sessionId);
      }
      return next;
    });
  };

  const handleLogout = async () => {
    await fetch("/api/kasir/auth/logout", { method: "POST" });
    router.refresh();
  };

  const clockText = clockReady ? formatWibClockHMS(nowMs) : "--:--:--";

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur-md">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
        {/* Kiri: Brand + Jam WIB */}
        <div className="flex items-center gap-3">
          <Link
            href="/kasir"
            className="h-11 w-11 shrink-0 overflow-hidden rounded-full ring-2 ring-primary/80"
          >
            <Image
              src="/images/onesticx-logo.png"
              alt="Logo Onesticx Billiard"
              width={44}
              height={44}
              priority
              className="h-full w-full rounded-full object-cover"
            />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-heading text-xl font-bold uppercase tracking-wide text-foreground">
                Kasir 1St!cx
              </span>
              {typeof realtimeConnected === "boolean" && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                    realtimeConnected
                      ? "bg-status-available/15 text-status-available"
                      : "bg-background text-muted"
                  }`}
                >
                  <Radio
                    className={`h-2.5 w-2.5 ${realtimeConnected ? "animate-pulse" : ""}`}
                  />
                  Live
                </span>
              )}
            </div>
            <p className="tabular-timer text-xs text-muted">{clockText} WIB</p>
          </div>
        </div>

        {/* Tengah: Navigasi Modul Kasir (Tablet Landscape) */}
        <nav
          aria-label="Navigasi Kasir"
          className="hidden items-center gap-1 rounded-2xl border border-border bg-background p-1 md:flex"
        >
          {NAV_ITEMS.map(({ id, href, label, Icon }) => {
            const active = activeTab === id;
            return (
              <Link
                key={id}
                href={href}
                className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3.5 text-sm font-bold transition ${
                  active
                    ? "bg-primary text-white shadow-md shadow-primary/25"
                    : "text-muted hover:bg-surface hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Kanan: Aksi Halaman + Kunci PIN */}
        <div className="flex items-center gap-2">
          {rightActions}

          <button
            type="button"
            onClick={() => void handleLogout()}
            className="flex min-h-[48px] items-center gap-2 rounded-xl border border-border bg-background px-3.5 text-sm font-bold text-muted transition hover:border-status-occupied/50 hover:text-status-occupied"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Kunci</span>
          </button>
        </div>
      </div>

      {/* Bar Navigasi Layar Sempit (< md) */}
      <nav
        aria-label="Navigasi Kasir Ringkas"
        className="grid grid-cols-5 gap-1 border-t border-border bg-background/80 p-1.5 md:hidden"
      >
        {NAV_ITEMS.map(({ id, href, label, Icon }) => {
          const active = activeTab === id;
          return (
            <Link
              key={id}
              href={href}
              className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-bold transition ${
                active
                  ? "bg-primary text-white"
                  : "text-muted hover:bg-surface hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Strip Peringatan Alarm Waktu Habis Saat Kasir Berada di Halaman Lain */}
      {activeTab !== "meja" && bgOvertimeAlerts.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-status-occupied/50 bg-status-occupied px-4 py-2.5 text-white">
          <div className="flex items-center gap-2 text-xs font-extrabold sm:text-sm">
            <AlarmClock className="h-5 w-5 shrink-0 animate-bounce" />
            <span>
              WAKTU HABIS:{" "}
              {bgOvertimeAlerts
                .map(
                  (a) =>
                    `${a.tableName} (${a.customerName} ${formatOvertimeHMS(a.overtimeSec)})`,
                )
                .join(" • ")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleMuteBgAll}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-black/25 px-3 text-xs font-bold text-white hover:bg-black/40"
            >
              <VolumeX className="h-4 w-4" />
              <span>Senyapkan</span>
            </button>
            <Link
              href="/kasir"
              className="inline-flex min-h-[40px] items-center rounded-xl bg-white px-3.5 text-xs font-extrabold text-[#121212] hover:bg-white/90"
            >
              Buka Meja →
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
