import {
  calculateEndTimeHHmm,
  formatTimeHHmm,
  toOperationalMinutes,
} from "@/lib/format";

export interface ScheduledBookingRange {
  id: string;
  booking_code: string;
  customer_name: string;
  booking_date: string;
  start_time: string;
  duration_hours: number;
}

/**
 * Konversi (booking_date YYYY-MM-DD, start_time HH:mm) menjadi timestamp epoch (ms)
 * sesuai hari operasional Onesticx (10:00 - 02:00 WIB).
 * Contoh: ("2026-11-25", "15:00") -> 2026-11-25 15:00 WIB
 *         ("2026-11-25", "00:00") -> 2026-11-26 00:00 WIB
 */
export function wibOperationalDateTimeToMs(
  bookingDateYmd: string,
  startTime: string,
): number {
  const baseMidnightMs = Date.parse(`${bookingDateYmd}T00:00:00+07:00`);
  if (Number.isNaN(baseMidnightMs)) return Number.NaN;
  const opMin = toOperationalMinutes(startTime);
  if (opMin < 0) return Number.NaN;
  return baseMidnightMs + opMin * 60_000;
}

/**
 * Cek apakah rentang waktu [startMs, endMs) bentrok dengan daftar booking terkonfirmasi.
 * Mengembalikan booking pertama yang bentrok (diurutkan paling awal), atau null jika aman.
 */
export function findConflictingConfirmedBooking<
  T extends ScheduledBookingRange,
>(
  rangeStartMs: number,
  rangeEndMs: number,
  confirmedBookings: T[],
  excludeBookingId?: string | null,
): T | null {
  const sorted = [...confirmedBookings]
    .filter((b) => !excludeBookingId || b.id !== excludeBookingId)
    .map((b) => {
      const startMs = wibOperationalDateTimeToMs(b.booking_date, b.start_time);
      const endMs = startMs + b.duration_hours * 3_600_000;
      return { booking: b, startMs, endMs };
    })
    .filter((item) => !Number.isNaN(item.startMs))
    .sort((a, b) => a.startMs - b.startMs);

  for (const item of sorted) {
    // Bentrok jika kedua interval terbuka [rangeStartMs, rangeEndMs) & [startMs, endMs) beririsan
    if (rangeStartMs < item.endMs && item.startMs < rangeEndMs) {
      return item.booking;
    }
  }
  return null;
}

/**
 * Hitung maksimal tambahan jam (0..maxCandidateHours) yang diizinkan untuk suatu sesi paket
 * tanpa menabrak booking terkonfirmasi berikutnya di meja yang sama.
 */
export function getSessionExtendConstraint<T extends ScheduledBookingRange>(
  sessionStartIso: string,
  currentDurationMinutes: number,
  confirmedBookings: T[],
  excludeBookingId?: string | null,
  maxCandidateHours = 4,
): {
  maxAddableHours: number;
  blockingBooking: T | null;
} {
  const sessionStartMs = new Date(sessionStartIso).getTime();
  const currentEndMs = sessionStartMs + currentDurationMinutes * 60_000;

  let maxAddableHours = 0;
  let blockingBooking: T | null = null;

  for (let h = 1; h <= maxCandidateHours; h += 1) {
    const proposedEndMs = currentEndMs + h * 3_600_000;
    const conflict = findConflictingConfirmedBooking(
      sessionStartMs,
      proposedEndMs,
      confirmedBookings,
      excludeBookingId,
    );
    if (conflict) {
      blockingBooking = conflict;
      break;
    }
    maxAddableHours = h;
  }

  return { maxAddableHours, blockingBooking };
}

export function formatBookingConflictMessage(
  tableName: string,
  booking: ScheduledBookingRange,
): string {
  const start = formatTimeHHmm(booking.start_time);
  const end = calculateEndTimeHHmm(start, booking.duration_hours);
  return `${tableName} sudah dibooking & dibayar oleh ${booking.customer_name} (${booking.booking_code}) pada jam ${start} - ${end} WIB.`;
}
