"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Delete,
  KeyRound,
  Loader2,
  Lock,
} from "lucide-react";
import { unlockKasirAudio } from "@/lib/kasir-alarm";

interface KasirPinGateProps {
  isServerKeyConfigured: boolean;
}

const KEYPAD_DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

export default function KasirPinGate({
  isServerKeyConfigured,
}: KasirPinGateProps) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleDigit = useCallback((digit: string) => {
    setError(null);
    setPin((prev) => (prev.length < 6 ? prev + digit : prev));
  }, []);

  const handleBackspace = useCallback(() => {
    setError(null);
    setPin((prev) => prev.slice(0, -1));
  }, []);

  const handleClear = useCallback(() => {
    setError(null);
    setPin("");
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!isServerKeyConfigured || loading) return;
    if (pin.length < 4) {
      setError("Masukkan minimal 4 digit PIN kasir.");
      return;
    }

    unlockKasirAudio();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/kasir/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });

      const data = (await response.json()) as { ok?: boolean; error?: string };

      if (!response.ok || !data.ok) {
        setError(data.error ?? "PIN salah. Silakan coba lagi.");
        setPin("");
        return;
      }

      router.refresh();
    } catch {
      setError("Gagal terhubung ke server. Periksa koneksi Anda.");
    } finally {
      setLoading(false);
    }
  }, [isServerKeyConfigured, loading, pin, router]);

  // Mendukung input dari keyboard fisik selain sentuhan tablet
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isServerKeyConfigured || loading) return;
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleClear();
      } else if (e.key === "Enter") {
        e.preventDefault();
        void handleSubmit();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    isServerKeyConfigured,
    loading,
    handleDigit,
    handleBackspace,
    handleClear,
    handleSubmit,
  ]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-8 text-foreground">
      <div className="w-full max-w-md rounded-3xl border border-border bg-surface p-6 shadow-2xl shadow-black/50 sm:p-8">
        {/* Header Brand */}
        <div className="flex flex-col items-center text-center">
          <div className="h-16 w-16 overflow-hidden rounded-full ring-2 ring-primary/80">
            <Image
              src="/images/onesticx-logo.png"
              alt="Logo Onesticx Billiard"
              width={64}
              height={64}
              priority
              className="h-full w-full rounded-full object-cover"
            />
          </div>
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
            <Lock className="h-3.5 w-3.5" />
            <span>Akses Kasir Tablet</span>
          </div>
          <h1 className="mt-2 font-heading text-3xl font-bold uppercase tracking-wide text-foreground">
            1St!cx Billiard
          </h1>
          <p className="mt-1 text-xs text-muted">
            Masukkan PIN kasir (4–6 digit) untuk membuka Dashboard Meja
          </p>
        </div>

        {/* Peringatan jika SUPABASE_SERVICE_ROLE_KEY belum diisi */}
        {!isServerKeyConfigured && (
          <div className="mt-5 rounded-2xl border border-status-booked/40 bg-status-booked/10 p-4 text-left text-xs leading-relaxed text-status-booked">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="space-y-1.5">
                <p className="font-bold uppercase tracking-wide">
                  Kunci Server Supabase Belum Diatur
                </p>
                <p className="text-foreground/90">
                  Untuk keamanan validasi PIN &amp; transaksi kasir, tambahkan{" "}
                  <code className="rounded bg-background px-1.5 py-0.5 text-primary">
                    SUPABASE_SERVICE_ROLE_KEY
                  </code>{" "}
                  di file <code className="rounded bg-background px-1.5 py-0.5">.env.local</code>.
                </p>
                <p className="text-muted">
                  Buka Supabase Dashboard → Project Settings → API Keys → salin{" "}
                  <strong>Secret key / service_role</strong>, simpan ke{" "}
                  <code>.env.local</code>, lalu restart server.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Indikator PIN 6 Titik */}
        <div className="mt-6 flex items-center justify-center gap-3">
          {[0, 1, 2, 3, 4, 5].map((index) => {
            const filled = index < pin.length;
            return (
              <div
                key={index}
                className={`flex h-12 w-11 items-center justify-center rounded-xl border text-lg font-bold transition ${
                  filled
                    ? "border-primary bg-primary/20 text-primary"
                    : "border-border bg-background text-muted/40"
                }`}
              >
                {filled ? "●" : "•"}
              </div>
            );
          })}
        </div>

        {/* Pesan Error */}
        <div className="mt-3 min-h-[24px] text-center">
          {error && (
            <p className="text-xs font-semibold text-status-occupied">
              {error}
            </p>
          )}
        </div>

        {/* Keypad Sentuh Tablet (min-h-[56px]) */}
        <div className="mt-3 grid grid-cols-3 gap-3">
          {KEYPAD_DIGITS.map((digit) => (
            <button
              key={digit}
              type="button"
              disabled={!isServerKeyConfigured || loading}
              onClick={() => handleDigit(digit)}
              className="tabular-nums flex min-h-[58px] items-center justify-center rounded-2xl border border-border bg-background font-heading text-2xl font-bold text-foreground transition hover:border-primary/60 hover:bg-surface active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {digit}
            </button>
          ))}

          <button
            type="button"
            disabled={!isServerKeyConfigured || loading || pin.length === 0}
            onClick={handleClear}
            className="flex min-h-[58px] items-center justify-center rounded-2xl border border-border bg-background text-xs font-bold uppercase tracking-wider text-muted transition hover:border-status-occupied/60 hover:text-status-occupied active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Hapus
          </button>

          <button
            type="button"
            disabled={!isServerKeyConfigured || loading}
            onClick={() => handleDigit("0")}
            className="tabular-nums flex min-h-[58px] items-center justify-center rounded-2xl border border-border bg-background font-heading text-2xl font-bold text-foreground transition hover:border-primary/60 hover:bg-surface active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            0
          </button>

          <button
            type="button"
            disabled={!isServerKeyConfigured || loading || pin.length === 0}
            onClick={handleBackspace}
            aria-label="Hapus satu digit"
            className="flex min-h-[58px] items-center justify-center rounded-2xl border border-border bg-background text-muted transition hover:border-primary/60 hover:text-foreground active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Delete className="h-6 w-6" />
          </button>
        </div>

        {/* Tombol Masuk */}
        <button
          type="button"
          disabled={!isServerKeyConfigured || loading || pin.length < 4}
          onClick={() => void handleSubmit()}
          className="mt-4 flex min-h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-base font-bold text-white shadow-lg shadow-primary/25 transition hover:bg-primary-hover active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {loading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Memeriksa PIN...</span>
            </>
          ) : (
            <>
              <KeyRound className="h-5 w-5" />
              <span>Buka Dashboard Kasir</span>
            </>
          )}
        </button>

        <div className="mt-5 flex items-center justify-between border-t border-border pt-4 text-xs text-muted">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 font-medium text-muted transition hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Halaman Pelanggan</span>
          </Link>
          <span>PIN default: 123456</span>
        </div>
      </div>
    </div>
  );
}
