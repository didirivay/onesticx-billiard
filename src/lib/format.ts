import type {
  BookingStatus,
  TableCategory,
  TableStatus,
} from "@/types/database";

export const WIB_TIMEZONE = "Asia/Jakarta";
export const CLOSING_OPERATIONAL_MINUTES = 26 * 60; // 02:00 WIB dini hari = 26:00

/**
 * Daftar jam mulai operasional Onesticx Billiard (10.00 - 02.00 WIB).
 * Slot terakhir untuk mulai main minimal 1 jam adalah 01:00 WIB (selesai 02:00 WIB).
 */
export const OPERATIONAL_START_SLOTS: readonly string[] = [
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
  "19:00",
  "20:00",
  "21:00",
  "22:00",
  "23:00",
  "00:00",
  "01:00",
] as const;

export const DURATION_OPTIONS = [1, 2, 3, 4, 5, 6] as const;

/**
 * Format nominal ke Rupiah Indonesia tanpa desimal, contoh: "Rp 50.000"
 */
export function formatRupiah(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  const formatted = new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 0,
  }).format(Math.abs(safe));
  return safe < 0 ? `-Rp ${formatted}` : `Rp ${formatted}`;
}

/**
 * Ambil tanggal dan jam saat ini di zona waktu WIB (Asia/Jakarta).
 */
export function getWibNow(now: Date = new Date()): {
  dateYmd: string;
  hour: number;
  minute: number;
  hhmm: string;
  isOpen: boolean;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: WIB_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const lookup = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const year = lookup.year ?? "2026";
  const month = lookup.month ?? "01";
  const day = lookup.day ?? "01";
  const hour = Number(lookup.hour ?? "10");
  const minute = Number(lookup.minute ?? "0");
  const hhmm = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

  return {
    dateYmd: `${year}-${month}-${day}`,
    hour,
    minute,
    hhmm,
    isOpen: hour >= 10 || hour < 2,
  };
}

/**
 * Pangkas waktu dari format PostgreSQL TIME ("19:00:00") menjadi "19:00".
 */
export function formatTimeHHmm(timeStr: string): string {
  const match = timeStr.match(/^(\d{2}):(\d{2})/);
  if (!match) return timeStr;
  return `${match[1]}:${match[2]}`;
}

/**
 * Konversi jam operasional ke menit dari awal hari operasional:
 * 10:00 -> 600, 23:00 -> 1380, 00:00 -> 1440, 01:00 -> 1500, 02:00 -> 1560.
 */
export function toOperationalMinutes(timeStr: string): number {
  const clean = formatTimeHHmm(timeStr);
  const [hStr, mStr] = clean.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return -1;
  const adjustedHour = h < 10 ? h + 24 : h;
  return adjustedHour * 60 + m;
}

/**
 * Hitung jam selesai ("HH:mm") dari jam mulai + durasi jam.
 */
export function calculateEndTimeHHmm(
  startTime: string,
  durationHours: number,
): string {
  const startMinutes = toOperationalMinutes(startTime);
  if (startMinutes < 0) return formatTimeHHmm(startTime);
  const endTotalMinutes = (startMinutes + durationHours * 60) % (24 * 60);
  const h = Math.floor(endTotalMinutes / 60);
  const m = endTotalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Hitung durasi maksimal (jam) yang masih berada di dalam jam operasional (sampai 02:00 WIB).
 */
export function getMaxDurationHoursForStart(startTime: string): number {
  const startMinutes = toOperationalMinutes(startTime);
  if (startMinutes < 600 || startMinutes >= CLOSING_OPERATIONAL_MINUTES) {
    return 0;
  }
  const remainingHours = Math.floor(
    (CLOSING_OPERATIONAL_MINUTES - startMinutes) / 60,
  );
  return Math.min(6, Math.max(0, remainingHours));
}

/**
 * Cek apakah dua rentang booking bentrok pada tanggal operasional yang sama.
 */
export function isTimeRangeOverlap(
  startA: string,
  durationHoursA: number,
  startB: string,
  durationHoursB: number,
): boolean {
  const aStart = toOperationalMinutes(startA);
  const aEnd = aStart + durationHoursA * 60;
  const bStart = toOperationalMinutes(startB);
  const bEnd = bStart + durationHoursB * 60;
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Format tanggal "YYYY-MM-DD" ke tampilan Indonesia, contoh: "Rabu, 25 November 2026".
 */
export function formatIndonesianDate(dateYmd: string): string {
  const [y, m, d] = dateYmd.split("-").map(Number);
  if (!y || !m || !d) return dateYmd;
  const utcDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: WIB_TIMEZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(utcDate);
}

/**
 * Format tanggal pendek "YYYY-MM-DD" -> "25 Nov 2026".
 */
export function formatShortIndonesianDate(dateYmd: string): string {
  const [y, m, d] = dateYmd.split("-").map(Number);
  if (!y || !m || !d) return dateYmd;
  const utcDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: WIB_TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(utcDate);
}

/**
 * Normalisasi nomor WhatsApp Indonesia menjadi format digit `628xxx`.
 */
export function normalizeWhatsappNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0")) {
    return `62${digits.slice(1)}`;
  }
  if (digits.startsWith("8")) {
    return `62${digits}`;
  }
  return digits;
}

/**
 * Masking nama pelanggan di daftar jadwal publik agar tetap rapi & menjaga privasi.
 * Contoh: "Ahmad Maulana" -> "Ahmad M."
 */
export function maskCustomerName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Tamu";
  if (parts.length === 1) {
    return parts[0].length > 14 ? `${parts[0].slice(0, 13)}…` : parts[0];
  }
  return `${parts[0]} ${parts[1][0].toUpperCase()}.`;
}

export function getCategoryLabel(category: TableCategory | string): string {
  switch (category) {
    case "indoor":
      return "Indoor";
    case "outdoor":
      return "Outdoor";
    case "high_table":
      return "High Table";
    default:
      return category;
  }
}

export function getTableStatusLabel(status: TableStatus | string): string {
  switch (status) {
    case "available":
      return "Kosong";
    case "occupied":
      return "Sedang Dipakai";
    case "booked":
      return "Dibooking";
    default:
      return status;
  }
}

export function getBookingStatusLabel(status: BookingStatus | string): string {
  switch (status) {
    case "pending":
      return "Menunggu Konfirmasi";
    case "confirmed":
      return "Terkonfirmasi";
    case "rejected":
      return "Ditolak";
    case "cancelled":
      return "Dibatalkan";
    case "completed":
      return "Selesai";
    default:
      return status;
  }
}

/**
 * Buat tautan WhatsApp Deep Link dengan pesan otomatis detail booking ke kasir.
 */
export function buildWhatsappConfirmationUrl(params: {
  kasirWhatsapp: string;
  bookingCode: string;
  customerName: string;
  tableName: string;
  tableCategory: string;
  bookingDate: string;
  startTime: string;
  durationHours: number;
  totalPrice: number;
}): string {
  const targetPhone = normalizeWhatsappNumber(params.kasirWhatsapp);
  const startHHmm = formatTimeHHmm(params.startTime);
  const endHHmm = calculateEndTimeHHmm(startHHmm, params.durationHours);
  const dateLabel = formatIndonesianDate(params.bookingDate);

  const lines = [
    "Halo Kasir *Onesticx Billiard* 🎱",
    "Saya sudah melakukan transfer pembayaran untuk booking meja dengan detail berikut:",
    "",
    `• Kode Booking: *${params.bookingCode}*`,
    `• Nama: ${params.customerName}`,
    `• Meja: ${params.tableName} (${getCategoryLabel(params.tableCategory)})`,
    `• Tanggal: ${dateLabel}`,
    `• Jam Main: ${startHHmm} - ${endHHmm} WIB (${params.durationHours} Jam)`,
    `• Total Transfer: *${formatRupiah(params.totalPrice)}*`,
    "",
    "Berikut saya lampirkan bukti transfernya. Mohon dibantu konfirmasinya ya. Terima kasih!",
  ];

  return `https://wa.me/${targetPhone}?text=${encodeURIComponent(lines.join("\n"))}`;
}
