"use client";

export const OVERTIME_ALARM_AUDIO_PATH = "/audio/overtime-alarm.mp3";

export interface AlarmAudioSnapshot {
  isOvertimeRinging: boolean;
  isTestPlaying: boolean;
  isAutoplayBlocked: boolean;
}

let sharedAudioCtx: AudioContext | null = null;
let overtimeAudio: HTMLAudioElement | null = null;

let overtimeAlarmDesired = false;
let testAlarmPlaying = false;
let audioPrimed = false;
let primingInFlight = false;
let playAttemptInFlight = false;
let autoplayBlocked = false;

let activeWatcherCount = 0;
let watcherStopTimer: number | null = null;

const stateListeners = new Set<() => void>();

function notifyAlarmState(): void {
  for (const listener of stateListeners) {
    listener();
  }
}

export function getAlarmAudioSnapshot(): AlarmAudioSnapshot {
  return {
    isOvertimeRinging: overtimeAlarmDesired,
    isTestPlaying: testAlarmPlaying,
    isAutoplayBlocked: autoplayBlocked,
  };
}

export function subscribeAlarmAudioState(listener: () => void): () => void {
  stateListeners.add(listener);
  return () => {
    stateListeners.delete(listener);
  };
}

/**
 * Daftarkan komponen kasir aktif (Dashboard / TopBar halaman kasir lain).
 * Menjaga suara alarm tetap mengalir mulus saat pindah tab di dalam /kasir/*,
 * dan otomatis berhenti jika kasir keluar sepenuhnya dari area /kasir.
 */
export function registerKasirAlarmWatcher(): () => void {
  if (typeof window === "undefined") return () => {};

  if (watcherStopTimer !== null) {
    window.clearTimeout(watcherStopTimer);
    watcherStopTimer = null;
  }
  activeWatcherCount += 1;

  return () => {
    activeWatcherCount = Math.max(0, activeWatcherCount - 1);
    if (activeWatcherCount === 0) {
      watcherStopTimer = window.setTimeout(() => {
        watcherStopTimer = null;
        if (activeWatcherCount === 0) {
          stopAllOvertimeAudio();
        }
      }, 400);
    }
  };
}

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new AudioCtx();
  }
  if (sharedAudioCtx.state === "suspended") {
    void sharedAudioCtx.resume().catch(() => {
      // Menunggu interaksi sentuhan pertama dari pengguna
    });
  }
  return sharedAudioCtx;
}

function isAutoplayRestrictionError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = "name" in err ? String((err as { name?: unknown }).name) : "";
  return name === "NotAllowedError";
}

function getOvertimeAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!overtimeAudio) {
    const audio = new Audio(OVERTIME_ALARM_AUDIO_PATH);
    audio.preload = "auto";
    audio.volume = 1;

    audio.addEventListener("ended", () => {
      if (overtimeAlarmDesired) {
        // Pengaman tambahan jika browser mobile tertentu mengabaikan atribut loop
        audio.currentTime = 0;
        void audio.play().catch((err) => {
          if (isAutoplayRestrictionError(err)) {
            autoplayBlocked = true;
            notifyAlarmState();
          }
        });
      } else if (testAlarmPlaying) {
        testAlarmPlaying = false;
        notifyAlarmState();
      }
    });

    overtimeAudio = audio;
  }
  return overtimeAudio;
}

/**
 * Buka kunci AudioContext & elemen audio MP3 pada interaksi pertama kasir di tablet/PC
 * agar alarm waktu habis bisa berbunyi otomatis tanpa diblokir kebijakan autoplay browser.
 */
export function unlockKasirAudio(): void {
  const ctx = getAudioContext();
  if (ctx && ctx.state === "suspended") {
    void ctx.resume().catch(() => {});
  }

  const audio = getOvertimeAudio();
  if (!audio) return;

  // Jika alarm waktu habis seharusnya sedang menyala namun tertahan autoplay, langsung bunyikan!
  if (overtimeAlarmDesired) {
    audio.muted = false;
    audio.loop = true;
    audio.volume = 1;
    if (audio.paused && !playAttemptInFlight) {
      playAttemptInFlight = true;
      void audio
        .play()
        .then(() => {
          playAttemptInFlight = false;
          if (!overtimeAlarmDesired && !testAlarmPlaying) {
            audio.loop = false;
            audio.pause();
            audio.currentTime = 0;
            return;
          }
          audioPrimed = true;
          autoplayBlocked = false;
          notifyAlarmState();
        })
        .catch(() => {
          playAttemptInFlight = false;
        });
    } else if (!audio.paused && autoplayBlocked) {
      autoplayBlocked = false;
      notifyAlarmState();
    }
    return;
  }

  // Prime elemen audio secara senyap sekali saja agar pemutaran otomatis nanti diizinkan iPadOS/Android
  if (!audioPrimed && !testAlarmPlaying && !primingInFlight) {
    primingInFlight = true;
    audio.muted = true;
    audio.loop = false;
    void audio
      .play()
      .then(() => {
        primingInFlight = false;
        if (!overtimeAlarmDesired && !testAlarmPlaying) {
          audio.pause();
          audio.currentTime = 0;
        }
        audio.muted = false;
        audioPrimed = true;
        autoplayBlocked = false;
        notifyAlarmState();
      })
      .catch(() => {
        primingInFlight = false;
        audio.muted = false;
      });
  }
}

/**
 * Suara lembut 2 nada untuk notifikasi booking web baru masuk.
 */
export function playBookingNotificationChime(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [880, 1174.66];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.001, now + idx * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.2, now + idx * 0.14 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.14 + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.14);
      osc.stop(now + idx * 0.14 + 0.3);
    });
  } catch {
    // Abaikan jika browser memblokir audio
  }
}

/**
 * Mulai memutar suara alarm MP3 secara terus-menerus (loop) saat jam bermain habis.
 * Alarm akan terus berbunyi sampai `stopOvertimeAlarmLoop()` dipanggil setelah pembayaran selesai.
 */
export function startOvertimeAlarmLoop(): void {
  const wasDesired = overtimeAlarmDesired;
  overtimeAlarmDesired = true;
  if (testAlarmPlaying) {
    testAlarmPlaying = false;
  }

  const audio = getOvertimeAudio();
  if (!audio) {
    if (!wasDesired) notifyAlarmState();
    return;
  }

  audio.muted = false;
  audio.loop = true;
  audio.volume = 1;

  // Jangan spam ulang audio.play() setiap detik jika sudah berjalan, sedang dimulai, atau tertahan autoplay
  if (wasDesired && (!audio.paused || playAttemptInFlight || autoplayBlocked)) {
    return;
  }

  if (audio.paused && !playAttemptInFlight) {
    if (audio.ended) {
      audio.currentTime = 0;
    }
    playAttemptInFlight = true;
    void audio
      .play()
      .then(() => {
        playAttemptInFlight = false;
        if (!overtimeAlarmDesired && !testAlarmPlaying) {
          audio.loop = false;
          audio.pause();
          audio.currentTime = 0;
          return;
        }
        audioPrimed = true;
        autoplayBlocked = false;
        notifyAlarmState();
      })
      .catch((err) => {
        playAttemptInFlight = false;
        if (!overtimeAlarmDesired) return;
        if (isAutoplayRestrictionError(err)) {
          autoplayBlocked = true;
        }
        notifyAlarmState();
      });
  } else if (!wasDesired) {
    notifyAlarmState();
  }
}

/**
 * Matikan alarm waktu habis (dipanggil otomatis ketika seluruh meja yang habis waktunya
 * sudah selesai dibayar atau diperpanjang jam bermainnya).
 */
export function stopOvertimeAlarmLoop(): void {
  if (!overtimeAlarmDesired && !autoplayBlocked) return;

  overtimeAlarmDesired = false;
  autoplayBlocked = false;

  if (overtimeAudio && !testAlarmPlaying) {
    overtimeAudio.loop = false;
    overtimeAudio.pause();
    overtimeAudio.currentTime = 0;
  }

  notifyAlarmState();
}

/**
 * Uji bunyi alarm MP3 (putar/hentikan pratinjau tanpa mengganggu alarm waktu habis yang aktif).
 * Mengembalikan `true` jika suara sedang diputar, `false` jika dihentikan.
 */
export function toggleTestOvertimeAlarm(): boolean {
  if (overtimeAlarmDesired) {
    // Alarm waktu habis sedang aktif — pastikan tidak tertahan autoplay & jangan dimatikan
    startOvertimeAlarmLoop();
    return true;
  }

  if (testAlarmPlaying) {
    stopTestOvertimeAlarm();
    return false;
  }

  const audio = getOvertimeAudio();
  if (!audio) return false;

  testAlarmPlaying = true;
  autoplayBlocked = false;
  audio.muted = false;
  audio.loop = false;
  audio.volume = 1;
  audio.currentTime = 0;
  notifyAlarmState();

  void audio
    .play()
    .then(() => {
      if (!testAlarmPlaying && !overtimeAlarmDesired) {
        audio.loop = false;
        audio.pause();
        audio.currentTime = 0;
        return;
      }
      audioPrimed = true;
    })
    .catch(() => {
      if (testAlarmPlaying) {
        testAlarmPlaying = false;
        notifyAlarmState();
      }
    });

  return true;
}

export function stopTestOvertimeAlarm(): void {
  if (!testAlarmPlaying) return;
  testAlarmPlaying = false;

  if (overtimeAudio && !overtimeAlarmDesired) {
    overtimeAudio.loop = false;
    overtimeAudio.pause();
    overtimeAudio.currentTime = 0;
  }

  notifyAlarmState();
}

export function stopAllOvertimeAudio(): void {
  overtimeAlarmDesired = false;
  testAlarmPlaying = false;
  autoplayBlocked = false;

  if (overtimeAudio) {
    overtimeAudio.loop = false;
    overtimeAudio.pause();
    overtimeAudio.currentTime = 0;
  }

  notifyAlarmState();
}

export type BrowserNotifPermission =
  | "unsupported"
  | "default"
  | "granted"
  | "denied";

export function getBrowserNotificationPermission(): BrowserNotifPermission {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

export async function requestBrowserNotificationPermission(): Promise<BrowserNotifPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  if (Notification.permission === "granted") {
    return "granted";
  }
  try {
    const result = await Notification.requestPermission();
    return result;
  } catch {
    return Notification.permission;
  }
}

/**
 * Tampilkan notifikasi sistem browser/OS (muncul meski kasir sedang buka tab lain).
 */
export function triggerBrowserNotification(params: {
  title: string;
  body: string;
  tag: string;
}): void {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  try {
    const notif = new Notification(params.title, {
      body: params.body,
      tag: params.tag,
      icon: "/images/onesticx-logo.png",
      badge: "/images/onesticx-logo.png",
      requireInteraction: true,
    });

    notif.onclick = () => {
      window.focus();
      notif.close();
    };
  } catch {
    // Beberapa environment PWA tertentu memerlukan Service Worker untuk Notification
  }
}
