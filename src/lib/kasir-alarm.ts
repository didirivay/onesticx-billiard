"use client";

let sharedAudioCtx: AudioContext | null = null;

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

/**
 * Buka kunci AudioContext pada interaksi pertama kasir di tablet/PC
 * agar alarm waktu habis bisa berbunyi otomatis tanpa diblokir browser.
 */
export function unlockKasirAudio(): void {
  const ctx = getAudioContext();
  if (ctx && ctx.state === "suspended") {
    void ctx.resume().catch(() => {});
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
 * Suara alarm tegas (3 ketukan ganda) ketika waktu bermain Paket Jam habis (00:00:00).
 * Dirancang agar tetap terdengar jelas di ruangan billiard yang ramai.
 */
export function playOvertimeAlarmSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // 3 pulsa alarm tegas: "BIP-BIP! ... BIP-BIP! ... BIP-BIP!"
    const pattern = [
      { offset: 0.0, freq: 1046.5, duration: 0.14 },
      { offset: 0.17, freq: 1318.5, duration: 0.16 },
      { offset: 0.44, freq: 1046.5, duration: 0.14 },
      { offset: 0.61, freq: 1318.5, duration: 0.16 },
      { offset: 0.88, freq: 1046.5, duration: 0.14 },
      { offset: 1.05, freq: 1318.5, duration: 0.22 },
    ];

    for (const step of pattern) {
      const start = now + step.offset;
      const end = start + step.duration;

      const osc = ctx.createOscillator();
      const oscHarmonic = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(step.freq, start);

      oscHarmonic.type = "sine";
      oscHarmonic.frequency.setValueAtTime(step.freq * 1.5, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.32, start + 0.015);
      gain.gain.setValueAtTime(0.28, end - 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, end);

      osc.connect(gain);
      oscHarmonic.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      oscHarmonic.start(start);
      osc.stop(end + 0.02);
      oscHarmonic.stop(end + 0.02);
    }
  } catch {
    // Abaikan jika browser memblokir audio
  }
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
