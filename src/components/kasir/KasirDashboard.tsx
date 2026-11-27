"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlarmClock,
  ArrowRightLeft,
  Bell,
  BellOff,
  BellRing,
  Clock,
  Coffee,
  Lock,
  Play,
  Plus,
  Receipt,
  RefreshCw,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
} from "lucide-react";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  WIB_TIMEZONE,
  calculateEndTimeHHmm,
  formatRupiah,
  formatTimeHHmm,
  getCategoryLabel,
  getTableStatusLabel,
} from "@/lib/format";
import { getSessionExtendConstraint } from "@/lib/booking-conflict";
import {
  formatPromoShortTag,
  getBestTablePromoForTable,
} from "@/lib/promo-discounts";
import {
  getAlarmAudioSnapshot,
  getBrowserNotificationPermission,
  playBookingNotificationChime,
  registerKasirAlarmWatcher,
  requestBrowserNotificationPermission,
  startOvertimeAlarmLoop,
  stopOvertimeAlarmLoop,
  subscribeAlarmAudioState,
  toggleTestOvertimeAlarm,
  triggerBrowserNotification,
  unlockKasirAudio,
  type AlarmAudioSnapshot,
  type BrowserNotifPermission,
} from "@/lib/kasir-alarm";
import type { BilliardTable, TableCategory, TableStatus } from "@/types/database";
import type {
  KasirActiveSession,
  KasirBookingItem,
  KasirDashboardData,
} from "@/types/kasir";
import KasirTopBar from "@/components/kasir/KasirTopBar";
import BookingQueuePanel from "@/components/kasir/BookingQueuePanel";
import TableFnbModal from "@/components/kasir/TableFnbModal";
import {
  CheckoutModal,
  ExtendTimeModal,
  MoveTableModal,
  StartSessionModal,
} from "@/components/kasir/KasirModals";

interface KasirDashboardProps {
  initialData: KasirDashboardData;
}

function formatSecondsHMS(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatTargetEndWib(startIso: string, durationMinutes: number): string {
  const endMs = new Date(startIso).getTime() + durationMinutes * 60_000;
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: WIB_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(endMs));
}

function getCardStatusAccent(status: TableStatus, isOvertime: boolean) {
  if (isOvertime) {
    return {
      bar: "bg-status-occupied animate-pulse",
      badge:
        "border-status-occupied/50 bg-status-occupied text-white animate-pulse",
      border: "border-status-occupied/80 ring-2 ring-status-occupied/35",
    };
  }
  switch (status) {
    case "available":
      return {
        bar: "bg-status-available",
        badge:
          "border-status-available/30 bg-status-available/15 text-status-available",
        border: "border-border hover:border-status-available/50",
      };
    case "occupied":
      return {
        bar: "bg-status-occupied",
        badge:
          "border-status-occupied/30 bg-status-occupied/15 text-status-occupied",
        border: "border-status-occupied/40",
      };
    case "booked":
      return {
        bar: "bg-status-booked",
        badge: "border-status-booked/30 bg-status-booked/15 text-status-booked",
        border: "border-status-booked/45",
      };
  }
}

export default function KasirDashboard({ initialData }: KasirDashboardProps) {
  const router = useRouter();
  const [data, setData] = useState<KasirDashboardData>(initialData);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [notifPermission, setNotifPermission] =
    useState<BrowserNotifPermission>("default");
  const [alarmAudioState, setAlarmAudioState] = useState<AlarmAudioSnapshot>({
    isOvertimeRinging: false,
    isTestPlaying: false,
    isAutoplayBlocked: false,
  });
  const [categoryFilter, setCategoryFilter] = useState<"all" | TableCategory>(
    "all",
  );
  const [refreshing, setRefreshing] = useState(false);
  const [busyBookingId, setBusyBookingId] = useState<string | null>(null);
  const [mobileQueueOpen, setMobileQueueOpen] = useState(false);
  const [toast, setToast] = useState<{
    type: "info" | "error" | "success";
    message: string;
  } | null>(null);

  // Modal states (maksimal 1 modal aktif)
  const [startModalTable, setStartModalTable] = useState<BilliardTable | null>(
    null,
  );
  const [fnbModalTarget, setFnbModalTarget] = useState<{
    table: BilliardTable;
    session: KasirActiveSession;
  } | null>(null);
  const [moveModalTarget, setMoveModalTarget] = useState<{
    table: BilliardTable;
    session: KasirActiveSession;
  } | null>(null);
  const [extendModalTarget, setExtendModalTarget] = useState<{
    table: BilliardTable;
    session: KasirActiveSession;
  } | null>(null);
  const [checkoutModalTarget, setCheckoutModalTarget] = useState<{
    table: BilliardTable;
    session: KasirActiveSession;
  } | null>(null);

  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;

  // Pelacak notifikasi browser per sesi overtime agar tidak spam tiap detik
  const browserNotifiedIdsRef = useRef<Set<string>>(new Set());

  const showToast = useCallback(
    (type: "info" | "error" | "success", message: string) => {
      setToast({ type, message });
      window.setTimeout(() => {
        setToast((prev) => (prev?.message === message ? null : prev));
      }, 4500);
    },
    [],
  );

  // Daftarkan watcher alarm kasir & sinkronkan status audio MP3
  useEffect(() => {
    setAlarmAudioState(getAlarmAudioSnapshot());
    const unsubAudio = subscribeAlarmAudioState(() => {
      setAlarmAudioState(getAlarmAudioSnapshot());
    });
    const unregWatcher = registerKasirAlarmWatcher();
    return () => {
      unsubAudio();
      unregWatcher();
    };
  }, []);

  // Baca status izin Notifikasi Browser saat mount
  useEffect(() => {
    setNotifPermission(getBrowserNotificationPermission());
  }, []);

  // Ticker 1 detik untuk timer real-time di semua kartu meja
  useEffect(() => {
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const refreshDashboard = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/kasir/dashboard", { cache: "no-store" });
      if (res.status === 401) {
        router.refresh();
        return;
      }
      if (!res.ok) return;
      const next = (await res.json()) as KasirDashboardData;
      setData(next);
    } finally {
      setRefreshing(false);
    }
  }, [router]);

  // Supabase Realtime: subscribe ke tabel `tables` dan `bookings`
  useEffect(() => {
    const supabase = getBrowserSupabaseClient();

    const channel = supabase
      .channel("onesticx-kasir-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tables" },
        () => {
          void refreshDashboard();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const created = payload.new as {
              customer_name?: string;
              status?: string;
            };
            if (created.status === "pending") {
              if (soundEnabledRef.current) {
                playBookingNotificationChime();
              }
              triggerBrowserNotification({
                title: "🎱 Booking Web Baru Masuk!",
                body: `Booking baru dari ${created.customer_name ?? "Pelanggan"} menunggu konfirmasi kasir.`,
                tag: `booking-new-${Date.now()}`,
              });
              showToast(
                "info",
                `Booking web baru masuk dari ${created.customer_name ?? "Pelanggan"}!`,
              );
            }
          }
          void refreshDashboard();
        },
      )
      .subscribe((status) => {
        setRealtimeConnected(status === "SUBSCRIBED");
      });

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refreshDashboard();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      void supabase.removeChannel(channel);
    };
  }, [refreshDashboard, showToast]);

  const activeSessionByTableId = useMemo(
    () => new Map(data.activeSessions.map((s) => [s.table_id, s])),
    [data.activeSessions],
  );

  const tableById = useMemo(
    () => new Map(data.tables.map((t) => [t.id, t])),
    [data.tables],
  );

  // Semua booking confirmed hari ini per meja (untuk blokir tambah jam)
  const confirmedBookingsByTableId = useMemo(() => {
    const map = new Map<string, KasirBookingItem[]>();
    for (const b of data.confirmedTodayBookings) {
      const list = map.get(b.table_id) ?? [];
      list.push(b);
      map.set(b.table_id, list);
    }
    return map;
  }, [data.confirmedTodayBookings]);

  // Booking confirmed terdekat hari ini (belum check-in) per meja
  const nextConfirmedByTableId = useMemo(() => {
    const map = new Map<string, KasirBookingItem>();
    for (const b of data.confirmedTodayBookings) {
      if (!b.checked_in && !map.has(b.table_id)) {
        map.set(b.table_id, b);
      }
    }
    return map;
  }, [data.confirmedTodayBookings]);

  // Daftar seluruh sesi Paket Jam yang waktunya sudah HABIS (remainingSec <= 0)
  const overtimeAlerts = useMemo(() => {
    const list: Array<{
      table: BilliardTable;
      session: KasirActiveSession;
      overtimeSec: number;
      extendBlocked: boolean;
    }> = [];

    for (const session of data.activeSessions) {
      if (session.billing_mode !== "package") continue;
      const table = tableById.get(session.table_id);
      if (!table) continue;

      const startMs = new Date(session.start_time).getTime();
      const elapsedSec = Math.max(0, Math.floor((nowMs - startMs) / 1000));
      const totalSec = session.duration_minutes * 60;
      const remainingSec = totalSec - elapsedSec;

      if (remainingSec <= 0) {
        const tableConfirmed = confirmedBookingsByTableId.get(table.id) ?? [];
        const constraint = getSessionExtendConstraint(
          session.start_time,
          session.duration_minutes,
          tableConfirmed,
          session.booking_id,
          4,
        );
        list.push({
          table,
          session,
          overtimeSec: Math.abs(remainingSec),
          extendBlocked: constraint.maxAddableHours === 0,
        });
      }
    }

    return list.sort((a, b) => a.table.sort_order - b.table.sort_order);
  }, [confirmedBookingsByTableId, data.activeSessions, nowMs, tableById]);

  // Mesin Alarm & Notifikasi Waktu Habis (putar MP3 terus-menerus hingga pembayaran selesai)
  useEffect(() => {
    const activeOvertimeIds = new Set(overtimeAlerts.map((a) => a.session.id));

    // Bersihkan pelacak notifikasi jika sesi sudah selesai dibayar atau diperpanjang
    for (const notifiedId of Array.from(browserNotifiedIdsRef.current)) {
      if (!activeOvertimeIds.has(notifiedId)) {
        browserNotifiedIdsRef.current.delete(notifiedId);
      }
    }

    if (overtimeAlerts.length === 0) {
      stopOvertimeAlarmLoop();
      return;
    }

    for (const item of overtimeAlerts) {
      const sid = item.session.id;

      // Notifikasi Browser & Toast seketika pertama kali meja mencapai 00:00:00
      if (!browserNotifiedIdsRef.current.has(sid)) {
        browserNotifiedIdsRef.current.add(sid);
        triggerBrowserNotification({
          title: `⏰ WAKTU HABIS — ${item.table.name}!`,
          body: `Waktu bermain ${item.session.customer_name} di ${item.table.name} telah habis. Selesaikan pembayaran untuk mematikan alarm.`,
          tag: `overtime-${sid}`,
        });
        showToast(
          "error",
          `⏰ WAKTU HABIS! ${item.table.name} (${item.session.customer_name}) — alarm aktif hingga pembayaran selesai.`,
        );
      }
    }

    startOvertimeAlarmLoop();
  }, [overtimeAlerts, showToast]);

  const handleToggleBrowserNotifications = async () => {
    unlockKasirAudio();
    const current = getBrowserNotificationPermission();
    if (current === "unsupported") {
      showToast(
        "info",
        "Browser ini belum mendukung Notifikasi Sistem, tetapi alarm suara & banner merah tetap aktif.",
      );
      return;
    }
    if (current === "granted") {
      triggerBrowserNotification({
        title: "✅ Notifikasi Kasir Onesticx Aktif",
        body: "Anda akan mendapat pemberitahuan otomatis saat waktu meja habis atau ada booking baru.",
        tag: "notif-test",
      });
      showToast("success", "Notifikasi browser sudah aktif!");
      return;
    }
    const result = await requestBrowserNotificationPermission();
    setNotifPermission(result);
    if (result === "granted") {
      triggerBrowserNotification({
        title: "✅ Notifikasi Kasir Onesticx Aktif",
        body: "Alarm waktu habis meja dan booking baru akan langsung muncul di layar.",
        tag: "notif-enabled",
      });
      showToast("success", "Notifikasi browser berhasil diaktifkan!");
    } else if (result === "denied") {
      showToast(
        "error",
        "Izin notifikasi ditolak browser. Aktifkan lewat ikon gembok di bilah alamat browser.",
      );
    }
  };

  const handleTestAlarm = () => {
    unlockKasirAudio();
    if (overtimeAlerts.length > 0) {
      startOvertimeAlarmLoop();
      showToast(
        "error",
        "Alarm waktu habis sedang aktif — selesaikan pembayaran untuk mematikannya.",
      );
      return;
    }
    const started = toggleTestOvertimeAlarm();
    if (started) {
      triggerBrowserNotification({
        title: "⏰ Tes Alarm — Kasir 1St!cx Billiard",
        body: "Suara alarm MP3 dan notifikasi waktu habis meja berfungsi normal!",
        tag: "alarm-test",
      });
      showToast("info", "Tes suara alarm dibunyikan! Tekan lagi untuk menghentikan.");
    } else {
      showToast("info", "Tes suara alarm dihentikan.");
    }
  };

  const availableTables = useMemo(
    () =>
      data.tables.filter(
        (t) => t.status === "available" && !activeSessionByTableId.has(t.id),
      ),
    [data.tables, activeSessionByTableId],
  );

  const summary = useMemo(() => {
    let available = 0;
    let occupied = 0;
    let booked = 0;
    for (const t of data.tables) {
      if (t.status === "available") available += 1;
      else if (t.status === "occupied") occupied += 1;
      else if (t.status === "booked") booked += 1;
    }
    return { available, occupied, booked };
  }, [data.tables]);

  const presentCategories = useMemo(() => {
    const set = new Set(data.tables.map((t) => t.category));
    return (["indoor", "high_table", "outdoor"] as TableCategory[]).filter((c) =>
      set.has(c),
    );
  }, [data.tables]);

  const visibleTables = useMemo(() => {
    if (categoryFilter === "all") return data.tables;
    return data.tables.filter((t) => t.category === categoryFilter);
  }, [data.tables, categoryFilter]);

  const handleBookingAction = async (
    bookingId: string,
    action: "confirm" | "reject" | "cancel",
  ) => {
    setBusyBookingId(bookingId);
    try {
      const res = await fetch(`/api/kasir/bookings/${bookingId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = (await res.json()) as {
        ok?: boolean;
        booking_code?: string;
        error?: string;
      };
      if (!res.ok || !payload.ok) {
        showToast("error", payload.error ?? "Gagal memproses booking.");
        return;
      }

      if (action === "confirm") {
        showToast(
          "success",
          `Booking ${payload.booking_code ?? ""} diterima! Status di HP pelanggan otomatis terkonfirmasi.`,
        );
      } else if (action === "reject") {
        showToast("info", "Booking telah ditolak.");
      } else {
        showToast("info", "Booking dibatalkan & meja diperbarui.");
      }
      await refreshDashboard();
    } catch {
      showToast("error", "Koneksi bermasalah saat memproses booking.");
    } finally {
      setBusyBookingId(null);
    }
  };

  const handleCheckInBooking = async (booking: KasirBookingItem) => {
    setBusyBookingId(booking.id);
    try {
      const res = await fetch("/api/kasir/sessions/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: booking.id }),
      });
      const payload = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !payload.ok) {
        showToast("error", payload.error ?? "Gagal memulai sesi booking.");
        return;
      }
      showToast(
        "success",
        `${booking.table_name} mulai main (${booking.customer_name} • ${booking.booking_code}).`,
      );
      setMobileQueueOpen(false);
      await refreshDashboard();
    } catch {
      showToast("error", "Koneksi bermasalah saat check-in booking.");
    } finally {
      setBusyBookingId(null);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Shared Top Navigation Bar */}
      <KasirTopBar
        activeTab="meja"
        realtimeConnected={realtimeConnected}
        rightActions={
          <>
            <button
              type="button"
              onClick={() => setMobileQueueOpen(true)}
              className="relative flex min-h-[48px] items-center gap-2 rounded-xl border border-border bg-background px-3.5 text-sm font-bold text-foreground transition hover:border-primary/60 lg:hidden"
            >
              <Bell className="h-4 w-4 text-primary" />
              <span>Antrean</span>
              {data.pendingBookings.length > 0 && (
                <span className="tabular-nums flex h-6 min-w-[24px] items-center justify-center rounded-full bg-status-occupied px-1.5 text-xs font-extrabold text-white">
                  {data.pendingBookings.length}
                </span>
              )}
            </button>

            {/* Tombol Izin Notifikasi Browser */}
            <button
              type="button"
              onClick={() => void handleToggleBrowserNotifications()}
              title={
                notifPermission === "granted"
                  ? "Notifikasi browser aktif (klik untuk tes)"
                  : "Aktifkan notifikasi browser saat waktu habis"
              }
              className={`flex min-h-[48px] items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition ${
                notifPermission === "granted"
                  ? "border-status-available/40 bg-status-available/10 text-status-available"
                  : "border-border bg-background text-muted hover:border-primary/60 hover:text-foreground"
              }`}
            >
              {notifPermission === "granted" ? (
                <BellRing className="h-4 w-4" />
              ) : (
                <BellOff className="h-4 w-4" />
              )}
              <span className="hidden xl:inline">
                {notifPermission === "granted" ? "Notif Aktif" : "Aktifkan Notif"}
              </span>
            </button>

            {/* Tombol Tes Alarm (Memudahkan Uji Volume Speaker Tablet) */}
            <button
              type="button"
              onClick={handleTestAlarm}
              title={
                alarmAudioState.isTestPlaying
                  ? "Hentikan pratinjau suara alarm"
                  : "Uji bunyi alarm waktu habis"
              }
              className={`hidden min-h-[48px] items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition sm:flex ${
                alarmAudioState.isTestPlaying
                  ? "border-status-occupied bg-status-occupied text-white hover:brightness-110"
                  : "border-border bg-background text-foreground hover:border-primary/60 hover:text-primary"
              }`}
            >
              {alarmAudioState.isTestPlaying ? (
                <Square className="h-3.5 w-3.5 fill-current" />
              ) : (
                <AlarmClock className="h-4 w-4 text-primary" />
              )}
              <span className="hidden xl:inline">
                {alarmAudioState.isTestPlaying ? "Stop Tes" : "Tes Alarm"}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                unlockKasirAudio();
                setSoundEnabled((v) => !v);
              }}
              title={
                soundEnabled
                  ? "Suara notifikasi booking aktif (alarm waktu habis tetap menyala hingga dibayar)"
                  : "Suara notifikasi booking dimatikan (alarm waktu habis tetap menyala hingga dibayar)"
              }
              className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-xl border border-border bg-background text-foreground transition hover:border-primary/60"
            >
              {soundEnabled ? (
                <Volume2 className="h-5 w-5 text-status-available" />
              ) : (
                <VolumeX className="h-5 w-5 text-status-occupied" />
              )}
            </button>

            <button
              type="button"
              onClick={() => void refreshDashboard()}
              title="Muat ulang data"
              className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-xl border border-border bg-background text-foreground transition hover:border-primary/60"
            >
              <RefreshCw
                className={`h-5 w-5 ${refreshing ? "animate-spin text-primary" : ""}`}
              />
            </button>
          </>
        }
      />

      {/* Toast Notifikasi */}
      {toast && (
        <div className="fixed bottom-5 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2">
          <div
            className={`rounded-2xl border px-4 py-3.5 text-sm font-semibold shadow-2xl ${
              toast.type === "error"
                ? "border-status-occupied/50 bg-status-occupied text-white"
                : toast.type === "success"
                  ? "border-status-available/50 bg-surface text-status-available"
                  : "border-primary/50 bg-surface text-foreground"
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}

      {/* Main Split Layout (Tablet Landscape: Grid Meja + Panel Antrean Samping) */}
      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-y-auto p-4 lg:p-5">
          {/* Banner Alarm Peringatan Waktu Habis (Otomatis muncul saat ada meja 00:00:00) */}
          {overtimeAlerts.length > 0 && (
            <section
              role="alert"
              className="mb-4 rounded-2xl border-2 border-status-occupied bg-status-occupied/15 p-4 shadow-lg shadow-status-occupied/20"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-status-occupied/30 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-status-occupied text-white">
                    <AlarmClock className="h-6 w-6 animate-bounce" />
                  </div>
                  <div>
                    <p className="font-heading text-lg font-bold uppercase tracking-wide text-status-occupied">
                      Alarm Waktu Habis ({overtimeAlerts.length} Meja)
                    </p>
                    <p className="text-xs text-foreground/85">
                      {alarmAudioState.isAutoplayBlocked
                        ? "Browser menahan suara otomatis. Ketuk tombol di kanan atau layar mana saja untuk membunyikan alarm."
                        : "Alarm berbunyi terus hingga pembayaran diselesaikan (atau waktu ditambah)."}
                    </p>
                  </div>
                </div>

                {alarmAudioState.isAutoplayBlocked ? (
                  <button
                    type="button"
                    onClick={() => {
                      unlockKasirAudio();
                      startOvertimeAlarmLoop();
                    }}
                    className="flex min-h-[48px] items-center gap-2 rounded-xl bg-status-occupied px-4 text-xs font-extrabold uppercase tracking-wide text-white transition hover:brightness-110 active:scale-95"
                  >
                    <Volume2 className="h-4 w-4" />
                    <span>Bunyikan Alarm</span>
                  </button>
                ) : (
                  <span className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-status-occupied/50 bg-status-occupied/20 px-3.5 text-xs font-extrabold uppercase tracking-wide text-status-occupied">
                    <Volume2 className="h-4 w-4 animate-pulse" />
                    <span>Menunggu Pembayaran</span>
                  </span>
                )}
              </div>

              <div className="mt-3 space-y-2.5">
                {overtimeAlerts.map(
                  ({ table, session, overtimeSec, extendBlocked }) => (
                    <div
                      key={session.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-status-occupied/40 bg-background/90 px-3.5 py-2.5"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-heading text-lg font-bold text-foreground">
                            {table.name}
                          </span>
                          <span className="text-xs font-semibold text-muted">
                            • {session.customer_name}
                          </span>
                          <span className="tabular-timer rounded-md bg-status-occupied/20 px-2 py-0.5 text-xs font-extrabold text-status-occupied">
                            Lewat +{formatSecondsHMS(overtimeSec)}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {!extendBlocked && (
                          <button
                            type="button"
                            onClick={() =>
                              setExtendModalTarget({ table, session })
                            }
                            className="flex min-h-[48px] items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 text-xs font-bold text-foreground hover:border-primary/60 hover:text-primary"
                          >
                            <Plus className="h-4 w-4" />
                            <span>Tambah Jam</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            setCheckoutModalTarget({ table, session })
                          }
                          className="flex min-h-[48px] items-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-bold text-white hover:bg-primary-hover"
                        >
                          <Receipt className="h-4 w-4" />
                          <span>Selesai &amp; Bayar</span>
                        </button>
                      </div>
                    </div>
                  ),
                )}
              </div>
            </section>
          )}

          {/* Strip Ringkasan & Filter Kategori */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="tabular-nums inline-flex items-center gap-2 rounded-xl border border-status-available/30 bg-status-available/10 px-3 py-2 text-xs font-bold text-status-available">
                <span className="h-2.5 w-2.5 rounded-full bg-status-available" />
                Kosong: {summary.available}
              </span>
              <span className="tabular-nums inline-flex items-center gap-2 rounded-xl border border-status-occupied/30 bg-status-occupied/10 px-3 py-2 text-xs font-bold text-status-occupied">
                <span className="h-2.5 w-2.5 rounded-full bg-status-occupied" />
                Main: {summary.occupied}
              </span>
              <span className="tabular-nums inline-flex items-center gap-2 rounded-xl border border-status-booked/30 bg-status-booked/10 px-3 py-2 text-xs font-bold text-status-booked">
                <span className="h-2.5 w-2.5 rounded-full bg-status-booked" />
                Dibooking: {summary.booked}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCategoryFilter("all")}
                className={`min-h-[42px] rounded-xl border px-3.5 text-xs font-bold transition ${
                  categoryFilter === "all"
                    ? "border-primary bg-primary text-white"
                    : "border-border bg-surface text-muted hover:text-foreground"
                }`}
              >
                Semua ({data.tables.length})
              </button>
              {presentCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`min-h-[42px] rounded-xl border px-3.5 text-xs font-bold transition ${
                    categoryFilter === cat
                      ? "border-primary bg-primary text-white"
                      : "border-border bg-surface text-muted hover:text-foreground"
                  }`}
                >
                  {getCategoryLabel(cat)}
                </button>
              ))}
            </div>
          </div>

          {/* Grid Meja 3 - 4 Kolom Tablet Landscape */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {visibleTables.map((table) => {
              const session = activeSessionByTableId.get(table.id) ?? null;
              const nextBooking = nextConfirmedByTableId.get(table.id) ?? null;
              const tableConfirmedBookings =
                confirmedBookingsByTableId.get(table.id) ?? [];

              const extendConstraint =
                session && session.billing_mode === "package"
                  ? getSessionExtendConstraint(
                      session.start_time,
                      session.duration_minutes,
                      tableConfirmedBookings,
                      session.booking_id,
                      4,
                    )
                  : null;
              const extendBlocked =
                extendConstraint !== null &&
                extendConstraint.maxAddableHours === 0;

              let timerLabel = "00:00:00";
              let timerSubtext = `${formatRupiah(table.hourly_rate)}/jam • ${formatRupiah(table.minute_rate)}/mnt`;
              let liveBillEstimate = 0;
              let isOvertime = false;

              const tablePromoMatch = getBestTablePromoForTable(
                data.promoDiscounts,
                table.id,
                table.category,
                table.hourly_rate,
              );
              const tablePromoTag = tablePromoMatch.rule
                ? formatPromoShortTag(tablePromoMatch.rule)
                : "";

              if (session) {
                const startMs = new Date(session.start_time).getTime();
                const elapsedSec = Math.max(
                  0,
                  Math.floor((nowMs - startMs) / 1000),
                );
                const elapsedMin = Math.max(1, Math.ceil(elapsedSec / 60));

                let rawTableCost = session.table_cost;
                if (session.billing_mode === "open_table") {
                  timerLabel = formatSecondsHMS(elapsedSec);
                  timerSubtext = `Open Table • ${elapsedMin} mnt berjalan`;
                  rawTableCost = elapsedMin * table.minute_rate;
                } else {
                  const totalSec = session.duration_minutes * 60;
                  const remainingSec = totalSec - elapsedSec;
                  if (remainingSec > 0) {
                    timerLabel = formatSecondsHMS(remainingSec);
                    timerSubtext = `Paket • Selesai ${formatTargetEndWib(session.start_time, session.duration_minutes)} WIB`;
                  } else {
                    isOvertime = true;
                    timerLabel = `+${formatSecondsHMS(Math.abs(remainingSec))}`;
                    timerSubtext = "WAKTU HABIS — Menunggu Pembayaran!";
                  }
                }

                const sessionDurationHours =
                  session.billing_mode === "open_table"
                    ? Math.floor(elapsedMin / 60)
                    : Math.floor(session.duration_minutes / 60);
                const estTableDisc =
                  session.booking_id && session.discount_amount > 0
                    ? Math.min(rawTableCost, session.discount_amount)
                    : getBestTablePromoForTable(
                        data.promoDiscounts,
                        table.id,
                        table.category,
                        rawTableCost,
                        sessionDurationHours,
                      ).discountAmount;
                const estFnbDisc = session.fnb_promo_discount ?? 0;
                liveBillEstimate = Math.max(
                  0,
                  rawTableCost + session.fnb_cost - estTableDisc - estFnbDisc,
                );
              }

              const accent = getCardStatusAccent(table.status, isOvertime);

              return (
                <article
                  key={table.id}
                  className={`relative flex flex-col justify-between overflow-hidden rounded-2xl border bg-surface p-4 shadow-md shadow-black/25 transition ${accent.border}`}
                >
                  <span
                    className={`absolute inset-x-0 top-0 h-1.5 ${accent.bar}`}
                  />

                  <div>
                    {/* Baris 1: Nama, Kategori & Badge Status */}
                    <div className="flex items-start justify-between gap-2 pt-1">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h2 className="font-heading text-xl font-bold tracking-wide text-foreground">
                            {table.name}
                          </h2>
                          {table.category === "high_table" && (
                            <Sparkles className="h-4 w-4 text-primary" />
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="text-xs font-medium text-muted">
                            {getCategoryLabel(table.category)}
                          </p>
                          {tablePromoTag && (
                            <span className="rounded-md bg-status-available/15 px-1.5 py-0.5 text-[10px] font-bold text-status-available">
                              {tablePromoTag}
                            </span>
                          )}
                        </div>
                      </div>

                      <span
                        className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${accent.badge}`}
                      >
                        {isOvertime
                          ? "Waktu Habis"
                          : getTableStatusLabel(table.status)}
                      </span>
                    </div>

                    {/* Baris 2: Timer Berjalan Real-time & Estimasi Tagihan */}
                    {session ? (
                      <div className="mt-3 rounded-xl border border-border bg-background p-3.5">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate font-semibold text-foreground">
                            {session.customer_name}
                          </span>
                          <span className="shrink-0 rounded-md bg-surface px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
                            {session.billing_mode === "open_table"
                              ? "Open Table"
                              : "Paket"}
                          </span>
                        </div>

                        <div className="mt-2 flex items-center justify-between gap-2">
                          <p
                            className={`tabular-timer font-heading text-3xl font-bold tracking-wider ${
                              isOvertime
                                ? "text-status-occupied"
                                : "text-foreground"
                            }`}
                          >
                            {timerLabel}
                          </p>

                          {isOvertime && (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-status-occupied/20 px-2.5 py-1 text-[11px] font-bold text-status-occupied">
                              <Volume2 className="h-3.5 w-3.5 animate-pulse" />
                              <span>Alarm Aktif</span>
                            </span>
                          )}
                        </div>

                        <p
                          className={`mt-0.5 text-[11px] ${
                            isOvertime
                              ? "font-bold text-status-occupied"
                              : "text-muted"
                          }`}
                        >
                          {timerSubtext}
                        </p>

                        {/* Penanda F&B aktif */}
                        {session.fnb_item_count > 0 && (
                          <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary/15 px-2.5 py-1 text-[11px] font-semibold text-primary">
                            <Coffee className="h-3.5 w-3.5" />
                            <span className="tabular-money">
                              {session.fnb_item_count} item F&amp;B •{" "}
                              {formatRupiah(session.fnb_cost)}
                            </span>
                          </div>
                        )}

                        {/* Peringatan jika sudah ada booking terkonfirmasi berikutnya */}
                        {nextBooking && (
                          <p className="mt-2 rounded-lg border border-status-booked/35 bg-status-booked/10 px-2.5 py-1.5 text-[11px] font-semibold text-status-booked">
                            Dibooking berikutnya:{" "}
                            <span className="tabular-timer font-bold">
                              {formatTimeHHmm(nextBooking.start_time)} WIB
                            </span>{" "}
                            ({nextBooking.customer_name})
                          </p>
                        )}

                        <div className="mt-3 flex items-baseline justify-between border-t border-border pt-2.5">
                          <span className="text-xs text-muted">
                            Estimasi Tagihan
                          </span>
                          <span className="tabular-money font-heading text-xl font-bold text-primary">
                            {formatRupiah(liveBillEstimate)}
                          </span>
                        </div>
                      </div>
                    ) : nextBooking ? (
                      <div className="mt-3 rounded-xl border border-status-booked/35 bg-status-booked/10 p-3.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold uppercase tracking-wide text-status-booked">
                            Booking Hari Ini
                          </span>
                          <span className="tabular-nums font-heading text-xs font-bold tracking-wider text-foreground">
                            {nextBooking.booking_code}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-sm font-bold text-foreground">
                          {nextBooking.customer_name}
                        </p>
                        <p className="tabular-timer mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                          <Clock className="h-3.5 w-3.5 text-status-booked" />
                          <span>
                            {nextBooking.start_time} -{" "}
                            {calculateEndTimeHHmm(
                              nextBooking.start_time,
                              nextBooking.duration_hours,
                            )}{" "}
                            WIB ({nextBooking.duration_hours} Jam)
                          </span>
                        </p>
                      </div>
                    ) : (
                      <div className="mt-3 rounded-xl border border-border/70 bg-background/60 p-3.5">
                        <p className="tabular-timer font-heading text-3xl font-bold tracking-wider text-muted/40">
                          00:00:00
                        </p>
                        <p className="tabular-money mt-1 text-xs text-muted">
                          {timerSubtext}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Baris 3: Aksi Cepat Meja (Semua Tombol >= 48px) */}
                  <div className="mt-4 space-y-2">
                    {session ? (
                      <>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setFnbModalTarget({ table, session })
                            }
                            className="flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl border border-primary/50 bg-primary/15 px-3 text-xs font-bold text-primary transition hover:bg-primary/25 active:scale-[0.98]"
                          >
                            <Coffee className="h-4 w-4" />
                            <span>
                              + F&amp;B
                              {session.fnb_item_count > 0
                                ? ` (${session.fnb_item_count})`
                                : ""}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setCheckoutModalTarget({ table, session })
                            }
                            className="flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-bold text-white transition hover:bg-primary-hover active:scale-[0.98]"
                          >
                            <Receipt className="h-4 w-4" />
                            <span>Selesai &amp; Bayar</span>
                          </button>
                        </div>

                        <div
                          className={
                            session.billing_mode === "package"
                              ? "grid grid-cols-2 gap-2"
                              : "grid grid-cols-1 gap-2"
                          }
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setMoveModalTarget({ table, session })
                            }
                            className="flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-3 text-xs font-bold text-foreground transition hover:border-primary/60 hover:text-primary active:scale-[0.98]"
                          >
                            <ArrowRightLeft className="h-4 w-4" />
                            <span>Pindah Meja</span>
                          </button>

                          {session.billing_mode === "package" && (
                            <button
                              type="button"
                              disabled={extendBlocked}
                              title={
                                extendBlocked &&
                                extendConstraint?.blockingBooking
                                  ? `Tidak bisa tambah jam: dibooking pukul ${formatTimeHHmm(extendConstraint.blockingBooking.start_time)} WIB`
                                  : "Tambah durasi paket jam"
                              }
                              onClick={() =>
                                setExtendModalTarget({ table, session })
                              }
                              className={`flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition ${
                                extendBlocked
                                  ? "cursor-not-allowed border-status-booked/35 bg-status-booked/10 text-status-booked/80"
                                  : "border-border bg-background text-foreground hover:border-primary/60 hover:text-primary active:scale-[0.98]"
                              }`}
                            >
                              {extendBlocked ? (
                                <>
                                  <Lock className="h-3.5 w-3.5 shrink-0" />
                                  <span className="truncate">
                                    Terbooking{" "}
                                    {extendConstraint?.blockingBooking
                                      ? formatTimeHHmm(
                                          extendConstraint.blockingBooking
                                            .start_time,
                                        )
                                      : ""}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <Plus className="h-4 w-4" />
                                  <span>Tambah Jam</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        {nextBooking && (
                          <button
                            type="button"
                            disabled={busyBookingId === nextBooking.id}
                            onClick={() =>
                              void handleCheckInBooking(nextBooking)
                            }
                            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-status-booked px-3 text-sm font-extrabold text-[#1F1400] transition hover:brightness-105 active:scale-[0.98] disabled:opacity-50"
                          >
                            <Play className="h-4 w-4 fill-current" />
                            <span>Check-in {nextBooking.booking_code}</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setStartModalTable(table)}
                          className={`flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl px-3 text-sm font-bold transition active:scale-[0.98] ${
                            nextBooking
                              ? "border border-border bg-background text-foreground hover:border-primary/60"
                              : "bg-primary text-white hover:bg-primary-hover"
                          }`}
                        >
                          <Play className="h-4 w-4 fill-current" />
                          <span>Mulai Main (Walk-in)</span>
                        </button>
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </main>

        {/* Panel Samping Kanan: Antrean Booking Web */}
        <aside className="hidden w-[350px] shrink-0 border-l border-border lg:block xl:w-[380px]">
          <BookingQueuePanel
            pendingBookings={data.pendingBookings}
            confirmedTodayBookings={data.confirmedTodayBookings}
            todayWib={data.todayWib}
            busyBookingId={busyBookingId}
            onBookingAction={handleBookingAction}
            onCheckInBooking={handleCheckInBooking}
          />
        </aside>
      </div>

      {/* Drawer Antrean Booking untuk Layar < lg */}
      {mobileQueueOpen && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/70 backdrop-blur-sm lg:hidden">
          <div className="h-full w-full max-w-sm border-l border-border shadow-2xl">
            <BookingQueuePanel
              pendingBookings={data.pendingBookings}
              confirmedTodayBookings={data.confirmedTodayBookings}
              todayWib={data.todayWib}
              busyBookingId={busyBookingId}
              onBookingAction={handleBookingAction}
              onCheckInBooking={handleCheckInBooking}
              onCloseMobileDrawer={() => setMobileQueueOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Modals Aksi Meja (1 Level, Tidak Bertumpuk) */}
      {startModalTable && (
        <StartSessionModal
          table={startModalTable}
          onClose={() => setStartModalTable(null)}
          onSuccess={async () => {
            showToast("success", `${startModalTable.name} mulai bermain!`);
            await refreshDashboard();
          }}
        />
      )}

      {fnbModalTarget && (
        <TableFnbModal
          table={fnbModalTarget.table}
          session={fnbModalTarget.session}
          onClose={() => setFnbModalTarget(null)}
          onUpdated={async () => {
            showToast("success", "Pesanan F&B meja berhasil diperbarui.");
            await refreshDashboard();
          }}
        />
      )}

      {moveModalTarget && (
        <MoveTableModal
          sourceTable={moveModalTarget.table}
          session={moveModalTarget.session}
          availableTables={availableTables}
          onClose={() => setMoveModalTarget(null)}
          onSuccess={async () => {
            showToast("success", "Sesi berhasil dipindahkan ke meja baru.");
            await refreshDashboard();
          }}
        />
      )}

      {extendModalTarget && (
        <ExtendTimeModal
          table={extendModalTarget.table}
          session={extendModalTarget.session}
          confirmedBookings={
            confirmedBookingsByTableId.get(extendModalTarget.table.id) ?? []
          }
          onClose={() => setExtendModalTarget(null)}
          onSuccess={async () => {
            showToast("success", "Durasi waktu meja berhasil ditambahkan.");
            await refreshDashboard();
          }}
        />
      )}

      {checkoutModalTarget && (
        <CheckoutModal
          table={checkoutModalTarget.table}
          session={checkoutModalTarget.session}
          promoDiscounts={data.promoDiscounts}
          nowMs={nowMs}
          onClose={() => setCheckoutModalTarget(null)}
          onSuccess={async () => {
            const paidSessionId = checkoutModalTarget.session.id;
            const paidTableName = checkoutModalTarget.table.name;
            // Hapus sesi dari daftar aktif seketika agar alarm langsung mati saat pembayaran lunas
            setData((prev) => ({
              ...prev,
              activeSessions: prev.activeSessions.filter(
                (s) => s.id !== paidSessionId,
              ),
            }));
            showToast(
              "success",
              `Pembayaran ${paidTableName} tercatat lunas.`,
            );
            await refreshDashboard();
          }}
        />
      )}
    </div>
  );
}
