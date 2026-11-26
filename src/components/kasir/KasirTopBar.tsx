"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Coffee,
  FileBarChart2,
  LayoutGrid,
  LogOut,
  Percent,
  Radio,
  Settings,
} from "lucide-react";
import { WIB_TIMEZONE } from "@/lib/format";

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

function formatWibClockHMS(ms: number): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: WIB_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date(ms));
}

export default function KasirTopBar({
  activeTab,
  realtimeConnected,
  rightActions,
}: KasirTopBarProps) {
  const router = useRouter();
  const [clockText, setClockText] = useState<string>("--:--:--");

  useEffect(() => {
    const sync = () => setClockText(formatWibClockHMS(Date.now()));
    sync();
    const id = window.setInterval(sync, 1000);
    return () => window.clearInterval(id);
  }, []);

  const handleLogout = async () => {
    await fetch("/api/kasir/auth/logout", { method: "POST" });
    router.refresh();
  };

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
    </header>
  );
}
