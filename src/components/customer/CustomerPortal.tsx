"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Instagram,
  Loader2,
  MapPin,
  Phone,
  Radio,
  Search,
  Sparkles,
  User,
} from "lucide-react";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  MIN_BOOKING_DURATION_HOURS,
  OPERATIONAL_START_SLOTS,
  PRESET_DURATION_OPTIONS,
  calculateEndTimeHHmm,
  formatIndonesianDate,
  formatRupiah,
  formatShortIndonesianDate,
  formatTimeHHmm,
  getCategoryLabel,
  getMaxDurationHoursForStart,
  getTableStatusLabel,
  getWibNow,
  isTimeRangeOverlap,
  maskCustomerName,
  parseStrictDurationHours,
  toOperationalMinutes,
} from "@/lib/format";
import type {
  BilliardTable,
  BookingStatus,
  PublicBookingSlot,
  TableCategory,
  TableStatus,
} from "@/types/database";
import {
  formatPromoShortTag,
  getBestTablePromoForTable,
  type PromoDiscountsConfig,
} from "@/lib/promo-discounts";

interface CustomerPortalProps {
  initialTables: BilliardTable[];
  initialTodayBookings: PublicBookingSlot[];
  initialPromoDiscounts: PromoDiscountsConfig;
  initialTodayWib: string;
  initialIsOpen: boolean;
  initialCurrentHHmm: string;
}

const CATEGORY_ORDER: TableCategory[] = ["indoor", "high_table", "outdoor"];

function getNextDefaultStartSlot(todayWib: string, selectedDate: string): string {
  if (selectedDate !== todayWib) {
    return "19:00";
  }
  const now = getWibNow();
  if (now.hour < 10) {
    return "10:00";
  }
  const nextHour = now.minute > 15 ? (now.hour + 1) % 24 : now.hour;
  const candidate = `${String(nextHour).padStart(2, "0")}:00`;
  if (OPERATIONAL_START_SLOTS.includes(candidate)) {
    return candidate;
  }
  return "19:00";
}

function getStatusStyles(status: TableStatus) {
  switch (status) {
    case "available":
      return {
        bar: "bg-status-available",
        badge:
          "bg-status-available/15 text-status-available border-status-available/30",
        dot: "bg-status-available",
      };
    case "occupied":
      return {
        bar: "bg-status-occupied",
        badge:
          "bg-status-occupied/15 text-status-occupied border-status-occupied/30",
        dot: "bg-status-occupied",
      };
    case "booked":
      return {
        bar: "bg-status-booked",
        badge: "bg-status-booked/15 text-status-booked border-status-booked/30",
        dot: "bg-status-booked",
      };
  }
}

export default function CustomerPortal({
  initialTables,
  initialTodayBookings,
  initialPromoDiscounts,
  initialTodayWib,
  initialIsOpen,
  initialCurrentHHmm,
}: CustomerPortalProps) {
  const router = useRouter();
  const bookingFormRef = useRef<HTMLElement | null>(null);
  const customDurationInputRef = useRef<HTMLInputElement | null>(null);

  // Live state
  const [tables, setTables] = useState<BilliardTable[]>(initialTables);
  const [todayBookings, setTodayBookings] =
    useState<PublicBookingSlot[]>(initialTodayBookings);
  const [realtimeConnected, setRealtimeConnected] = useState<boolean>(false);
  const [wibClock, setWibClock] = useState({
    dateYmd: initialTodayWib,
    isOpen: initialIsOpen,
    hhmm: initialCurrentHHmm,
  });

  // Lookup kode booking
  const [showLookup, setShowLookup] = useState(false);
  const [lookupCode, setLookupCode] = useState("");

  // Form booking state
  const [selectedTableId, setSelectedTableId] = useState<string>(
    initialTables[0]?.id ?? "",
  );
  const [bookingDate, setBookingDate] = useState<string>(initialTodayWib);
  const [selectedDateBookings, setSelectedDateBookings] =
    useState<PublicBookingSlot[]>(initialTodayBookings);
  const [loadingDateSchedule, setLoadingDateSchedule] = useState(false);
  const [startTime, setStartTime] = useState<string>(() =>
    getNextDefaultStartSlot(initialTodayWib, initialTodayWib),
  );
  const [durationHours, setDurationHours] = useState<number>(1);
  const [isCustomDuration, setIsCustomDuration] = useState<boolean>(false);
  const [customDurationInput, setCustomDurationInput] = useState<string>("");
  const [customInputHint, setCustomInputHint] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState<string>("");
  const [whatsappNumber, setWhatsappNumber] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Perbarui jam WIB setiap 30 detik agar status buka/tutup selalu akurat
  useEffect(() => {
    const syncClock = () => {
      const now = getWibNow();
      setWibClock({
        dateYmd: now.dateYmd,
        isOpen: now.isOpen,
        hhmm: now.hhmm,
      });
    };
    syncClock();
    const timer = window.setInterval(syncClock, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // Muat ulang jadwal tanggal tertentu dari endpoint publik (aman tanpa ekspos WA)
  const fetchScheduleForDate = useCallback(async (dateYmd: string) => {
    const res = await fetch(
      `/api/bookings/schedule?date=${encodeURIComponent(dateYmd)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    const payload = (await res.json()) as { slots?: PublicBookingSlot[] };
    return payload.slots ?? [];
  }, []);

  // Sinkronkan slot tanggal yang dipilih di form saat user ganti tanggal
  useEffect(() => {
    if (bookingDate === wibClock.dateYmd) {
      setSelectedDateBookings(todayBookings);
      return;
    }

    let cancelled = false;
    setLoadingDateSchedule(true);
    fetchScheduleForDate(bookingDate)
      .then((slots) => {
        if (!cancelled && slots) {
          setSelectedDateBookings(slots);
        }
      })
      .catch(() => {
        // Pertahankan state terakhir jika offline sementara
      })
      .finally(() => {
        if (!cancelled) setLoadingDateSchedule(false);
      });

    return () => {
      cancelled = true;
    };
  }, [bookingDate, todayBookings, wibClock.dateYmd, fetchScheduleForDate]);

  // Supabase Realtime: subscribe ke perubahan tabel `tables` dan `bookings`
  useEffect(() => {
    const supabase = getBrowserSupabaseClient();

    const refreshTables = async () => {
      const { data } = await supabase
        .from("tables")
        .select("id, name, category, hourly_rate, minute_rate, status, sort_order")
        .order("sort_order", { ascending: true });
      if (data) {
        setTables(
          data.map((row) => ({
            ...row,
            category: row.category as TableCategory,
            status: row.status as TableStatus,
          })),
        );
      }
    };

    const refreshBookings = async () => {
      const todaySlots = await fetchScheduleForDate(wibClock.dateYmd);
      if (todaySlots) {
        setTodayBookings(todaySlots);
        if (bookingDate === wibClock.dateYmd) {
          setSelectedDateBookings(todaySlots);
        }
      }
      if (bookingDate !== wibClock.dateYmd) {
        const chosenSlots = await fetchScheduleForDate(bookingDate);
        if (chosenSlots) {
          setSelectedDateBookings(chosenSlots);
        }
      }
    };

    const channel = supabase
      .channel("onesticx-customer-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tables" },
        (payload) => {
          if (payload.eventType === "UPDATE" || payload.eventType === "INSERT") {
            const next = payload.new as {
              id: string;
              name: string;
              category: string;
              hourly_rate: number;
              minute_rate: number;
              status: string;
              sort_order: number;
            };
            setTables((prev) => {
              const mapped: BilliardTable = {
                id: next.id,
                name: next.name,
                category: next.category as TableCategory,
                hourly_rate: next.hourly_rate,
                minute_rate: next.minute_rate,
                status: next.status as TableStatus,
                sort_order: next.sort_order,
              };
              const exists = prev.some((t) => t.id === mapped.id);
              const merged = exists
                ? prev.map((t) => (t.id === mapped.id ? mapped : t))
                : [...prev, mapped];
              return merged.sort((a, b) => a.sort_order - b.sort_order);
            });
          } else {
            void refreshTables();
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        (payload) => {
          // Update langsung jika relevan dengan tanggal hari ini, lalu pastikan sinkron
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            const row = payload.new as {
              id: string;
              table_id: string;
              customer_name: string;
              booking_date: string;
              start_time: string;
              duration_hours: number;
              status: string;
            };
            const isActive =
              row.status === "pending" || row.status === "confirmed";
            const mappedSlot: PublicBookingSlot = {
              id: row.id,
              table_id: row.table_id,
              customer_label: maskCustomerName(row.customer_name),
              booking_date: row.booking_date,
              start_time: formatTimeHHmm(row.start_time),
              duration_hours: row.duration_hours,
              status: row.status as BookingStatus,
            };

            const applySlot = (prev: PublicBookingSlot[]) => {
              const filtered = prev.filter((item) => item.id !== mappedSlot.id);
              if (!isActive) return filtered;
              return [...filtered, mappedSlot].sort(
                (a, b) =>
                  toOperationalMinutes(a.start_time) -
                  toOperationalMinutes(b.start_time),
              );
            };

            if (row.booking_date === wibClock.dateYmd) {
              setTodayBookings(applySlot);
            }
            if (row.booking_date === bookingDate) {
              setSelectedDateBookings(applySlot);
            }
          } else {
            void refreshBookings();
          }
        },
      )
      .subscribe((status) => {
        setRealtimeConnected(status === "SUBSCRIBED");
      });

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void refreshTables();
        void refreshBookings();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      void supabase.removeChannel(channel);
    };
  }, [bookingDate, wibClock.dateYmd, fetchScheduleForDate]);

  // Hitungan status ringkas
  const statusSummary = useMemo(() => {
    let available = 0;
    let occupied = 0;
    let booked = 0;
    for (const t of tables) {
      if (t.status === "available") available += 1;
      else if (t.status === "occupied") occupied += 1;
      else if (t.status === "booked") booked += 1;
    }
    return { available, occupied, booked };
  }, [tables]);

  // Pengelompokan meja per kategori (Indoor, High Table, Outdoor)
  const groupedTables = useMemo(() => {
    return CATEGORY_ORDER.map((category) => ({
      category,
      label: getCategoryLabel(category),
      items: tables.filter((t) => t.category === category),
    })).filter((group) => group.items.length > 0);
  }, [tables]);

  const tableById = useMemo(
    () => new Map(tables.map((t) => [t.id, t])),
    [tables],
  );

  const selectedTable = useMemo(
    () => tables.find((t) => t.id === selectedTableId) ?? tables[0] ?? null,
    [tables, selectedTableId],
  );

  // Jadwal aktif pada meja & tanggal terpilih
  const selectedTableDayBookings = useMemo(
    () =>
      selectedDateBookings.filter(
        (slot) => slot.table_id === (selectedTable?.id ?? ""),
      ),
    [selectedDateBookings, selectedTable?.id],
  );

  // Evaluasi ketersediaan setiap slot jam mulai
  const slotAvailability = useMemo(() => {
    const isToday = bookingDate === wibClock.dateYmd;
    const nowParts = getWibNow();
    const currentOperationalMin =
      nowParts.hour >= 10 ? nowParts.hour * 60 + nowParts.minute : -1;

    return OPERATIONAL_START_SLOTS.map((slot) => {
      const slotMin = toOperationalMinutes(slot);
      const isPast =
        isToday && currentOperationalMin >= 600 && slotMin + 15 < currentOperationalMin;

      const isBooked = selectedTableDayBookings.some((existing) =>
        isTimeRangeOverlap(
          slot,
          1,
          existing.start_time,
          existing.duration_hours,
        ),
      );

      return {
        slot,
        isPast,
        isBooked,
        disabled: isPast || isBooked,
      };
    });
  }, [bookingDate, wibClock.dateYmd, selectedTableDayBookings]);

  // Jika slot terpilih tidak tersedia lagi (karena ganti meja/tanggal), pilih slot kosong pertama
  useEffect(() => {
    const currentInfo = slotAvailability.find((s) => s.slot === startTime);
    if (!currentInfo || currentInfo.disabled) {
      const firstOpen = slotAvailability.find((s) => !s.disabled);
      if (firstOpen) {
        setStartTime(firstOpen.slot);
      }
    }
  }, [slotAvailability, startTime]);

  // Hitung durasi maksimal yang valid (1..10 jam, tidak melewati 02:00 WIB & tidak menabrak booking berikutnya)
  const durationAvailability = useMemo(() => {
    const maxByClosing = getMaxDurationHoursForStart(startTime);

    const checkDuration = (hours: number) => {
      const exceedsClosing = hours > maxByClosing;
      const overlapsBooking = selectedTableDayBookings.some((existing) =>
        isTimeRangeOverlap(
          startTime,
          hours,
          existing.start_time,
          existing.duration_hours,
        ),
      );
      return {
        exceedsClosing,
        overlapsBooking,
        disabled: exceedsClosing || overlapsBooking,
      };
    };

    let maxContiguous = 0;
    for (let h = MIN_BOOKING_DURATION_HOURS; h <= maxByClosing; h += 1) {
      if (checkDuration(h).overlapsBooking) break;
      maxContiguous = h;
    }

    const presets = PRESET_DURATION_OPTIONS.map((hours) => ({
      hours,
      ...checkDuration(hours),
    }));

    return {
      maxByClosing,
      maxContiguous,
      presets,
      checkDuration,
    };
  }, [startTime, selectedTableDayBookings]);

  useEffect(() => {
    if (isCustomDuration) return;
    const chosen = durationAvailability.presets.find(
      (d) => d.hours === durationHours,
    );
    if (chosen?.disabled) {
      const fallback = durationAvailability.presets.find((d) => !d.disabled);
      if (fallback) {
        setDurationHours(fallback.hours);
      }
    }
  }, [durationAvailability.presets, durationHours, isCustomDuration]);

  const customDurationState = useMemo(() => {
    if (!isCustomDuration) {
      return {
        parsedHours: durationHours,
        error: null as string | null,
        valid: true,
      };
    }

    const trimmed = customDurationInput.trim();
    if (!trimmed) {
      return {
        parsedHours: null as number | null,
        error: null as string | null,
        valid: false,
      };
    }

    if (!/^\d+$/.test(trimmed)) {
      return {
        parsedHours: null,
        error: "Durasi hanya boleh diisi angka bulat.",
        valid: false,
      };
    }

    if (trimmed.startsWith("0")) {
      return {
        parsedHours: null,
        error: "Durasi harus angka bulat minimal 1 jam.",
        valid: false,
      };
    }

    const parsed = parseStrictDurationHours(
      trimmed,
      MIN_BOOKING_DURATION_HOURS,
    );
    if (parsed === null) {
      return {
        parsedHours: null,
        error: "Durasi harus angka bulat minimal 1 jam.",
        valid: false,
      };
    }

    const check = durationAvailability.checkDuration(parsed);
    if (check.exceedsClosing) {
      return {
        parsedHours: null,
        error: `Melebihi jam tutup (02.00 WIB). Maksimal mulai ${startTime} WIB adalah ${durationAvailability.maxByClosing} jam.`,
        valid: false,
      };
    }
    if (check.overlapsBooking) {
      return {
        parsedHours: null,
        error: `Durasi ${parsed} jam bentrok dengan jadwal booking lain. Maksimal tersedia ${durationAvailability.maxContiguous} jam.`,
        valid: false,
      };
    }

    return {
      parsedHours: parsed,
      error: null,
      valid: true,
    };
  }, [
    customDurationInput,
    durationAvailability,
    durationHours,
    isCustomDuration,
    startTime,
  ]);

  const effectiveDurationHours = isCustomDuration
    ? customDurationState.parsedHours
    : durationHours;

  const baseBookingPrice =
    selectedTable && effectiveDurationHours !== null
      ? selectedTable.hourly_rate * effectiveDurationHours
      : 0;
  const selectedTablePromoMatch =
    selectedTable && effectiveDurationHours !== null
      ? getBestTablePromoForTable(
          initialPromoDiscounts,
          selectedTable.id,
          selectedTable.category,
          baseBookingPrice,
          effectiveDurationHours,
        )
      : { rule: null, discountAmount: 0 };
  const selectedTablePromo = selectedTablePromoMatch.rule;
  const bookingPromoDiscount = selectedTablePromoMatch.discountAmount;
  const estimatedTotal = Math.max(0, baseBookingPrice - bookingPromoDiscount);
  const endTimeHHmm =
    effectiveDurationHours !== null
      ? calculateEndTimeHHmm(startTime, effectiveDurationHours)
      : null;

  const selectedSlotInvalid = useMemo(() => {
    const s = slotAvailability.find((x) => x.slot === startTime);
    if (!s || s.disabled) return true;
    if (isCustomDuration) {
      return !customDurationState.valid || effectiveDurationHours === null;
    }
    const d = durationAvailability.presets.find((x) => x.hours === durationHours);
    return !d || d.disabled;
  }, [
    slotAvailability,
    startTime,
    isCustomDuration,
    customDurationState.valid,
    effectiveDurationHours,
    durationAvailability.presets,
    durationHours,
  ]);

  const handleCustomDurationKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.length === 1 && !/^\d$/.test(e.key)) {
      e.preventDefault();
      setCustomInputHint("Durasi hanya boleh diisi angka bulat.");
    }
  };

  const handleCustomDurationChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const raw = e.target.value;
    if (raw === "") {
      setCustomDurationInput("");
      setCustomInputHint(null);
      setFormError(null);
      return;
    }
    if (/[^0-9]/.test(raw)) {
      setCustomInputHint("Durasi hanya boleh diisi angka bulat.");
      return;
    }
    if (raw.length > 3) return;
    setCustomInputHint(null);
    setCustomDurationInput(raw);
    setFormError(null);
  };

  const handleSelectTableCard = (tableId: string) => {
    setSelectedTableId(tableId);
    setFormError(null);
    bookingFormRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const handleLookupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = lookupCode.trim().toUpperCase();
    if (!clean) return;
    router.push(`/booking/${encodeURIComponent(clean)}`);
  };

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!selectedTable) {
      setFormError("Silakan pilih meja terlebih dahulu.");
      return;
    }
    if (customerName.trim().length < 2) {
      setFormError("Masukkan nama lengkap atau panggilan (minimal 2 huruf).");
      return;
    }
    if (whatsappNumber.replace(/\D/g, "").length < 9) {
      setFormError(
        "Masukkan nomor WhatsApp yang valid (contoh: 081234567890).",
      );
      return;
    }
    if (effectiveDurationHours === null) {
      setFormError(
        customDurationState.error ??
          "Masukkan durasi bermain berupa angka bulat minimal 1 jam.",
      );
      return;
    }
    if (selectedSlotInvalid) {
      setFormError(
        customDurationState.error ??
          "Jam atau durasi yang dipilih tidak tersedia. Silakan pilih jadwal lain.",
      );
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableId: selectedTable.id,
          customerName: customerName.trim(),
          whatsappNumber: whatsappNumber.trim(),
          bookingDate,
          startTime,
          durationHours: effectiveDurationHours,
        }),
      });

      const data = (await response.json()) as {
        booking_code?: string;
        error?: string;
      };

      if (!response.ok || !data.booking_code) {
        setFormError(
          data.error ?? "Gagal mengirim booking. Silakan periksa data Anda.",
        );
        // Segarkan slot jika terjadi bentrok (409)
        if (response.status === 409) {
          const fresh = await fetchScheduleForDate(bookingDate);
          if (fresh) setSelectedDateBookings(fresh);
        }
        return;
      }

      router.push(`/booking/${encodeURIComponent(data.booking_code)}`);
    } catch {
      setFormError(
        "Koneksi bermasalah. Pastikan internet Anda aktif lalu coba lagi.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header Sticky Mobile-First */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full ring-2 ring-primary/70">
              <Image
                src="/images/onesticx-logo.png"
                alt="Logo 1St!cx Billiard Onesticx"
                width={44}
                height={44}
                priority
                className="h-full w-full rounded-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate font-heading text-xl font-bold uppercase tracking-wide text-foreground">
                  1St!cx Billiard
                </h1>
                <span
                  title={
                    realtimeConnected
                      ? "Tersambung Real-time"
                      : "Menghubungkan Real-time..."
                  }
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
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
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                <span
                  className={`inline-flex items-center gap-1.5 font-medium ${
                    wibClock.isOpen
                      ? "text-status-available"
                      : "text-status-booked"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      wibClock.isOpen
                        ? "bg-status-available"
                        : "bg-status-booked"
                    }`}
                  />
                  {wibClock.isOpen ? "Buka" : "Tutup"} (10.00 - 02.00 WIB)
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowLookup((v) => !v)}
            className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-foreground transition hover:border-primary/60 hover:text-primary"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Cek Booking</span>
          </button>
        </div>

        {/* Bar Pencarian Kode Booking */}
        {showLookup && (
          <div className="border-t border-border bg-surface/95 px-4 py-3">
            <form
              onSubmit={handleLookupSubmit}
              className="mx-auto flex max-w-2xl items-center gap-2"
            >
              <input
                type="text"
                value={lookupCode}
                onChange={(e) => setLookupCode(e.target.value)}
                placeholder="Masukkan kode booking (contoh: ONS-4829)"
                className="min-h-[44px] flex-1 rounded-xl border border-border bg-background px-3.5 text-sm uppercase tracking-wider text-foreground placeholder:normal-case placeholder:tracking-normal placeholder:text-muted focus:border-primary focus:outline-none"
              />
              <button
                type="submit"
                className="min-h-[44px] rounded-xl bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary-hover"
              >
                Cari
              </button>
            </form>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-2xl space-y-8 px-4 pb-16 pt-5">
        {/* Hero Ringkas + Ringkasan Status Real-time */}
        <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                Status Meja Real-time
              </p>
              <h2 className="mt-1 font-heading text-2xl font-bold uppercase tracking-wide text-foreground">
                Pilih Meja &amp; Booking Cepat
              </h2>
              <p className="mt-1 text-xs text-muted">
                Ketuk kartu meja di bawah untuk langsung mengisi formulir
                booking. Jam saat ini:{" "}
                <span className="tabular-timer font-semibold text-foreground">
                  {wibClock.hhmm} WIB
                </span>
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2.5">
            <div className="rounded-xl border border-status-available/25 bg-status-available/10 px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-status-available">
                <span className="h-2 w-2 rounded-full bg-status-available" />
                Kosong
              </div>
              <p className="mt-1 font-heading text-2xl font-bold tabular-nums text-foreground">
                {statusSummary.available}
              </p>
            </div>

            <div className="rounded-xl border border-status-occupied/25 bg-status-occupied/10 px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-status-occupied">
                <span className="h-2 w-2 rounded-full bg-status-occupied" />
                Sedang Main
              </div>
              <p className="mt-1 font-heading text-2xl font-bold tabular-nums text-foreground">
                {statusSummary.occupied}
              </p>
            </div>

            <div className="rounded-xl border border-status-booked/25 bg-status-booked/10 px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-status-booked">
                <span className="h-2 w-2 rounded-full bg-status-booked" />
                Dibooking
              </div>
              <p className="mt-1 font-heading text-2xl font-bold tabular-nums text-foreground">
                {statusSummary.booked}
              </p>
            </div>
          </div>
        </section>

        {/* Daftar Ketersediaan Meja */}
        <section className="space-y-5">
          {groupedTables.map((group) => {
            const sample = group.items[0];
            return (
              <div key={group.category} className="space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-heading text-lg font-bold uppercase tracking-wide text-foreground">
                      {group.label}
                    </h3>
                    {group.category === "high_table" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/20 px-2 py-0.5 text-[11px] font-semibold text-primary">
                        <Sparkles className="h-3 w-3" />
                        VIP
                      </span>
                    )}
                  </div>
                  {sample && (
                    <p className="tabular-money text-xs text-muted">
                      <span className="font-semibold text-foreground">
                        {formatRupiah(sample.hourly_rate)}
                      </span>
                      /jam • Freetime{" "}
                      <span className="text-foreground">
                        {formatRupiah(sample.minute_rate)}
                      </span>
                      /mnt
                    </p>
                  )}
                </div>

                <div
                  className={
                    group.items.length === 1
                      ? "grid grid-cols-1 gap-3"
                      : "grid grid-cols-2 gap-3 sm:grid-cols-3"
                  }
                >
                  {group.items.map((table) => {
                    const styles = getStatusStyles(table.status);
                    const isSelected = selectedTable?.id === table.id;
                    const tableTodaySlots = todayBookings.filter(
                      (b) => b.table_id === table.id,
                    );
                    const tablePromo = getBestTablePromoForTable(
                      initialPromoDiscounts,
                      table.id,
                      table.category,
                      table.hourly_rate,
                    );
                    const tablePromoTag = tablePromo.rule
                      ? formatPromoShortTag(tablePromo.rule)
                      : "";
                    const discountedHourly = Math.max(
                      0,
                      table.hourly_rate - tablePromo.discountAmount,
                    );

                    return (
                      <button
                        key={table.id}
                        type="button"
                        onClick={() => handleSelectTableCard(table.id)}
                        className={`group relative overflow-hidden rounded-2xl border bg-surface p-3.5 text-left transition active:scale-[0.98] ${
                          isSelected
                            ? "border-primary ring-2 ring-primary/40"
                            : "border-border hover:border-primary/50"
                        }`}
                      >
                        {/* Bar Indikator Warna Status di Bagian Atas Kartu */}
                        <span
                          className={`absolute inset-x-0 top-0 h-1 ${styles.bar}`}
                        />

                        <div className="flex items-start justify-between gap-2 pt-1">
                          <span className="font-heading text-lg font-bold tracking-wide text-foreground">
                            {table.name}
                          </span>
                          {isSelected ? (
                            <span className="rounded-md bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                              Dipilih
                            </span>
                          ) : tablePromoTag ? (
                            <span className="rounded-md bg-status-available/15 px-1.5 py-0.5 text-[10px] font-bold text-status-available">
                              {tablePromoTag}
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-2">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${styles.badge}`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${styles.dot} ${
                                table.status === "occupied"
                                  ? "animate-pulse"
                                  : ""
                              }`}
                            />
                            {getTableStatusLabel(table.status)}
                          </span>
                        </div>

                        <div className="mt-3 flex items-center justify-between border-t border-border/70 pt-2.5 text-xs">
                          <span className="tabular-money font-semibold text-foreground">
                            {tablePromo.discountAmount > 0 ? (
                              <>
                                <span className="mr-1 text-[10px] font-normal text-muted line-through">
                                  {formatRupiah(table.hourly_rate)}
                                </span>
                                <span className="text-status-available">
                                  {formatRupiah(discountedHourly)}
                                </span>
                              </>
                            ) : (
                              formatRupiah(table.hourly_rate)
                            )}
                            <span className="font-normal text-muted">/jam</span>
                          </span>
                          <span className="text-[11px] font-medium text-primary group-hover:underline">
                            Booking →
                          </span>
                        </div>

                        {tableTodaySlots.length > 0 && (
                          <p className="mt-2 truncate text-[11px] text-status-booked">
                            Jadwal hari ini:{" "}
                            <span className="tabular-timer font-semibold">
                              {tableTodaySlots[0].start_time} -{" "}
                              {calculateEndTimeHHmm(
                                tableTodaySlots[0].start_time,
                                tableTodaySlots[0].duration_hours,
                              )}{" "}
                              WIB
                            </span>
                            {tableTodaySlots.length > 1
                              ? ` (+${tableTodaySlots.length - 1})`
                              : ""}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>

        {/* Jadwal Booking Hari Ini (WIB) */}
        <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-heading text-lg font-bold uppercase tracking-wide text-foreground">
                Jadwal Booking Hari Ini
              </h3>
              <p className="text-xs text-muted">
                {formatIndonesianDate(wibClock.dateYmd)} • Zona WIB
              </p>
            </div>
            <span className="tabular-nums rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold text-muted">
              {todayBookings.length} jadwal aktif
            </span>
          </div>

          {todayBookings.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-border bg-background/60 px-4 py-6 text-center">
              <CheckCircle2 className="mx-auto h-6 w-6 text-status-available" />
              <p className="mt-2 text-sm font-medium text-foreground">
                Belum ada booking masuk hari ini
              </p>
              <p className="mt-1 text-xs text-muted">
                Semua slot jam operasional (10.00 - 02.00 WIB) masih tersedia.
              </p>
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border bg-background">
              {todayBookings.map((slot) => {
                const tbl = tableById.get(slot.table_id);
                const endHHmm = calculateEndTimeHHmm(
                  slot.start_time,
                  slot.duration_hours,
                );
                const isConfirmed = slot.status === "confirmed";

                return (
                  <li
                    key={slot.id}
                    className="flex items-center justify-between gap-3 px-3.5 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-heading text-base font-bold text-foreground">
                          {tbl?.name ?? "Meja"}
                        </span>
                        <span className="text-xs text-muted">
                          • {slot.customer_label}
                        </span>
                      </div>
                      <p className="tabular-timer mt-0.5 text-xs text-muted">
                        {slot.start_time} - {endHHmm} WIB ({slot.duration_hours}{" "}
                        Jam)
                      </p>
                    </div>

                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                        isConfirmed
                          ? "border-status-available/30 bg-status-available/15 text-status-available"
                          : "border-status-booked/30 bg-status-booked/15 text-status-booked"
                      }`}
                    >
                      {isConfirmed ? "Terkonfirmasi" : "Pending"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Formulir Booking Online */}
        <section
          id="form-booking"
          ref={bookingFormRef}
          className="scroll-mt-20 rounded-2xl border border-primary/40 bg-surface p-4 shadow-lg shadow-black/30 sm:p-6"
        >
          <div className="border-b border-border pb-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              Reservasi Online
            </p>
            <h2 className="mt-1 font-heading text-2xl font-bold uppercase tracking-wide text-foreground">
              Form Booking Meja
            </h2>
            <p className="mt-1 text-xs text-muted">
              Pilih meja, tanggal, jam mulai, dan durasi. Setelah submit, Anda
              akan mendapat instruksi transfer manual &amp; tombol konfirmasi
              WhatsApp kasir.
            </p>
          </div>

          <form onSubmit={handleBookingSubmit} className="mt-5 space-y-5">
            {/* 1. Pilih Meja */}
            <div>
              <label
                htmlFor="booking-table"
                className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted"
              >
                1. Pilih Meja
              </label>
              <select
                id="booking-table"
                value={selectedTable?.id ?? ""}
                onChange={(e) => {
                  setSelectedTableId(e.target.value);
                  setFormError(null);
                }}
                className="min-h-[50px] w-full rounded-xl border border-border bg-background px-3.5 text-sm font-semibold text-foreground focus:border-primary focus:outline-none"
              >
                {tables.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({getCategoryLabel(t.category)}) —{" "}
                    {formatRupiah(t.hourly_rate)}/jam
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Pilih Tanggal */}
            <div>
              <label
                htmlFor="booking-date"
                className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted"
              >
                <Calendar className="h-3.5 w-3.5 text-primary" />
                <span>2. Tanggal Bermain</span>
              </label>
              <input
                id="booking-date"
                type="date"
                min={wibClock.dateYmd}
                value={bookingDate}
                onChange={(e) => {
                  if (e.target.value) {
                    setBookingDate(e.target.value);
                    setFormError(null);
                  }
                }}
                required
                className="min-h-[50px] w-full rounded-xl border border-border bg-background px-3.5 text-sm font-medium text-foreground focus:border-primary focus:outline-none"
              />
              <p className="mt-1.5 text-xs text-muted">
                Jadwal dipilih:{" "}
                <span className="font-medium text-foreground">
                  {formatIndonesianDate(bookingDate)}
                </span>
                {loadingDateSchedule && " • Memuat jadwal..."}
              </p>
            </div>

            {/* 3. Pilih Jam Mulai (WIB) */}
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
                  <Clock className="h-3.5 w-3.5 text-primary" />
                  <span>3. Jam Mulai (WIB)</span>
                </span>
                <span className="text-[11px] text-muted">
                  Tutup 02.00 WIB
                </span>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {slotAvailability.map(({ slot, isBooked, isPast, disabled }) => {
                  const active = startTime === slot && !disabled;
                  return (
                    <button
                      key={slot}
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        setStartTime(slot);
                        setFormError(null);
                      }}
                      className={`tabular-timer flex min-h-[48px] flex-col items-center justify-center rounded-xl border text-sm font-semibold transition ${
                        active
                          ? "border-primary bg-primary text-white shadow-md shadow-primary/25"
                          : isBooked
                            ? "cursor-not-allowed border-status-booked/30 bg-status-booked/10 text-status-booked/70"
                            : isPast
                              ? "cursor-not-allowed border-border/50 bg-background/40 text-muted/40 line-through"
                              : "border-border bg-background text-foreground hover:border-primary/60"
                      }`}
                    >
                      <span>{slot}</span>
                      {isBooked && (
                        <span className="text-[10px] font-medium uppercase">
                          Terisi
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 4. Pilih Durasi Bermain */}
            <div>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted">
                4. Durasi Bermain (Paket Jam)
              </span>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {durationAvailability.presets.map(({ hours, disabled }) => {
                  const active =
                    !isCustomDuration && durationHours === hours && !disabled;
                  const presetPromo = selectedTable
                    ? getBestTablePromoForTable(
                        initialPromoDiscounts,
                        selectedTable.id,
                        selectedTable.category,
                        selectedTable.hourly_rate * hours,
                        hours,
                      )
                    : { rule: null, discountAmount: 0 };
                  const presetPromoLabel =
                    presetPromo.rule &&
                    presetPromo.rule.type === "duration_percent" &&
                    presetPromo.discountAmount > 0
                      ? formatPromoShortTag(presetPromo.rule, hours).replace(
                          "Diskon ",
                          "-",
                        )
                      : "";
                  return (
                    <button
                      key={hours}
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        setIsCustomDuration(false);
                        setDurationHours(hours);
                        setCustomInputHint(null);
                        setFormError(null);
                      }}
                      className={`tabular-nums flex min-h-[48px] flex-col items-center justify-center rounded-xl border px-1 text-sm font-semibold transition ${
                        active
                          ? "border-primary bg-primary text-white shadow-md shadow-primary/25"
                          : disabled
                            ? "cursor-not-allowed border-border/50 bg-background/40 text-muted/40"
                            : "border-border bg-background text-foreground hover:border-primary/60"
                      }`}
                    >
                      <span>{hours} Jam</span>
                      {presetPromoLabel && !disabled && (
                        <span
                          className={`text-[10px] font-bold ${
                            active ? "text-white/90" : "text-status-available"
                          }`}
                        >
                          {presetPromoLabel}
                        </span>
                      )}
                    </button>
                  );
                })}

                {(() => {
                  const customPromo = selectedTable
                    ? getBestTablePromoForTable(
                        initialPromoDiscounts,
                        selectedTable.id,
                        selectedTable.category,
                        selectedTable.hourly_rate * 6,
                        6,
                      )
                    : { rule: null, discountAmount: 0 };
                  const customPromoLabel =
                    customPromo.rule &&
                    customPromo.rule.type === "duration_percent" &&
                    customPromo.discountAmount > 0
                      ? formatPromoShortTag(customPromo.rule, 6).replace(
                          "Diskon ",
                          "-",
                        )
                      : "";
                  const customDisabled = durationAvailability.maxContiguous < 1;
                  return (
                    <button
                      type="button"
                      disabled={customDisabled}
                      onClick={() => {
                        setIsCustomDuration(true);
                        setCustomInputHint(null);
                        setFormError(null);
                        window.requestAnimationFrame(() => {
                          customDurationInputRef.current?.focus();
                          customDurationInputRef.current?.select();
                        });
                      }}
                      className={`flex min-h-[48px] flex-col items-center justify-center rounded-xl border px-1 text-sm font-semibold transition ${
                        isCustomDuration
                          ? "border-primary bg-primary text-white shadow-md shadow-primary/25"
                          : customDisabled
                            ? "cursor-not-allowed border-border/50 bg-background/40 text-muted/40"
                            : "border-border bg-background text-foreground hover:border-primary/60"
                      }`}
                    >
                      <span>Custom</span>
                      {customPromoLabel && !customDisabled && (
                        <span
                          className={`text-[10px] font-bold ${
                            isCustomDuration
                              ? "text-white/90"
                              : "text-status-available"
                          }`}
                        >
                          {customPromoLabel}
                        </span>
                      )}
                    </button>
                  );
                })()}
              </div>

              {isCustomDuration && (
                <div className="mt-3 rounded-xl border border-primary/40 bg-background p-3.5">
                  <label
                    htmlFor="booking-custom-duration"
                    className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold text-foreground"
                  >
                    <span>Masukkan Durasi</span>
                    <span className="tabular-nums text-[11px] font-medium text-muted">
                      Tersedia maks. {durationAvailability.maxContiguous} jam
                    </span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      ref={customDurationInputRef}
                      id="booking-custom-duration"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="off"
                      maxLength={3}
                      value={customDurationInput}
                      onKeyDown={handleCustomDurationKeyDown}
                      onChange={handleCustomDurationChange}
                      placeholder="Contoh: 6"
                      className={`tabular-nums min-h-[48px] flex-1 rounded-xl border bg-surface px-3.5 text-sm font-semibold text-foreground placeholder:font-normal placeholder:text-muted/70 focus:outline-none ${
                        customInputHint || customDurationState.error
                          ? "border-status-occupied focus:border-status-occupied"
                          : "border-border focus:border-primary"
                      }`}
                    />
                    <span className="flex min-h-[48px] items-center rounded-xl border border-border bg-surface px-3.5 text-sm font-bold text-muted">
                      Jam
                    </span>
                  </div>
                  {(customInputHint || customDurationState.error) && (
                    <p className="mt-2 text-xs font-semibold text-status-occupied">
                      {customInputHint ?? customDurationState.error}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* 5. Data Pelanggan */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="customer-name"
                  className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted"
                >
                  <User className="h-3.5 w-3.5 text-primary" />
                  <span>5. Nama Lengkap / Panggilan</span>
                </label>
                <input
                  id="customer-name"
                  type="text"
                  autoComplete="name"
                  required
                  maxLength={80}
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Contoh: Rizky Pratama"
                  className="min-h-[50px] w-full rounded-xl border border-border bg-background px-3.5 text-sm text-foreground placeholder:text-muted/70 focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="customer-wa"
                  className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted"
                >
                  <Phone className="h-3.5 w-3.5 text-primary" />
                  <span>6. Nomor WhatsApp</span>
                </label>
                <input
                  id="customer-wa"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  required
                  maxLength={20}
                  value={whatsappNumber}
                  onChange={(e) => setWhatsappNumber(e.target.value)}
                  placeholder="Contoh: 081234567890"
                  className="tabular-nums min-h-[50px] w-full rounded-xl border border-border bg-background px-3.5 text-sm text-foreground placeholder:text-muted/70 focus:border-primary focus:outline-none"
                />
              </div>
            </div>

            {/* Ringkasan Harga & Aturan Keterlambatan */}
            <div className="rounded-xl border border-border bg-background p-4">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>Meja</span>
                <span className="font-semibold text-foreground">
                  {selectedTable
                    ? `${selectedTable.name} (${getCategoryLabel(selectedTable.category)})`
                    : "-"}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-muted">
                <span>Jadwal</span>
                <span className="tabular-timer font-semibold text-foreground">
                  {effectiveDurationHours !== null && endTimeHHmm
                    ? `${formatShortIndonesianDate(bookingDate)} • ${startTime} - ${endTimeHHmm} WIB (${effectiveDurationHours} Jam)`
                    : `${formatShortIndonesianDate(bookingDate)} • Mulai ${startTime} WIB (Masukkan durasi)`}
                </span>
              </div>
              {bookingPromoDiscount > 0 && selectedTablePromo && (
                <>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted">
                    <span>Harga Normal</span>
                    <span className="tabular-money line-through">
                      {formatRupiah(baseBookingPrice)}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-xs text-status-available">
                    <span>
                      {selectedTablePromo.label ||
                        `Promo ${selectedTable ? getCategoryLabel(selectedTable.category) : ""}`}{" "}
                      (
                      {formatPromoShortTag(
                        selectedTablePromo,
                        effectiveDurationHours ?? undefined,
                      )}
                      )
                    </span>
                    <span className="tabular-money font-semibold">
                      -{formatRupiah(bookingPromoDiscount)}
                    </span>
                  </div>
                </>
              )}
              <div className="mt-3 flex items-baseline justify-between border-t border-border pt-3">
                <span className="text-sm font-semibold text-foreground">
                  Total Pembayaran
                </span>
                <span className="tabular-money font-heading text-2xl font-bold text-primary">
                  {formatRupiah(estimatedTotal)}
                </span>
              </div>
              <p className="mt-3 rounded-lg border border-status-booked/25 bg-status-booked/10 px-3 py-2 text-[11px] leading-relaxed text-status-booked">
                <strong>Aturan Booking:</strong> Batas keterlambatan{" "}
                <strong>15 menit</strong> dari jam booking. Booking sah setelah
                pembayaran diverifikasi oleh kasir via WhatsApp.
              </p>
            </div>

            {formError && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-xl border border-status-occupied/40 bg-status-occupied/10 p-3.5 text-sm text-status-occupied"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || selectedSlotInvalid || !selectedTable}
              className="flex min-h-[54px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-base font-bold text-white shadow-lg shadow-primary/25 transition hover:bg-primary-hover active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Memproses Booking...</span>
                </>
              ) : (
                <span>Booking Meja &amp; Lihat Pembayaran</span>
              )}
            </button>
          </form>
        </section>
      </main>

      {/* Footer Resmi Onesticx */}
      <footer className="border-t border-border bg-surface/60">
        <div className="mx-auto max-w-2xl space-y-4 px-4 py-8">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full ring-1 ring-border">
              <Image
                src="/images/onesticx-logo.png"
                alt="Logo Onesticx Billiard"
                width={44}
                height={44}
                className="h-full w-full rounded-full object-cover"
              />
            </div>
            <div>
              <p className="font-heading text-lg font-bold uppercase tracking-wide text-foreground">
                1St!cx Billiard (Onesticx)
              </p>
              <p className="text-xs text-muted">
                Buka Setiap Hari • 10.00 - 02.00 WIB
              </p>
            </div>
          </div>

          <div className="space-y-2 text-xs text-muted">
            <p className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                Jl. Darussalam, Samping Distro DBS, Kampung Jawa Baru, Kota
                Lhokseumawe
              </span>
            </p>
            <p className="flex items-center gap-2">
              <Instagram className="h-4 w-4 shrink-0 text-primary" />
              <Link
                href="https://instagram.com/onesticx.lhokseumawe"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-foreground transition hover:text-primary"
              >
                @onesticx.lhokseumawe
              </Link>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
