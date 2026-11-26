"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Coffee,
  Loader2,
  Minus,
  Plus,
  ShoppingBag,
  Trash2,
  X,
} from "lucide-react";
import { formatRupiah } from "@/lib/format";
import type { BilliardTable, FnbCategory } from "@/types/database";
import type {
  FnbMenuItem,
  KasirActiveSession,
  SessionFnbOrderItem,
} from "@/types/kasir";

interface TableFnbModalProps {
  table: BilliardTable;
  session: KasirActiveSession;
  onClose: () => void;
  onUpdated: () => Promise<void>;
}

const FNB_TABS: Array<{ id: "all" | FnbCategory; label: string }> = [
  { id: "all", label: "Semua" },
  { id: "minuman", label: "Minuman" },
  { id: "makanan", label: "Makanan" },
  { id: "snack", label: "Snack" },
];

function getFnbCategoryLabel(cat: FnbCategory | string): string {
  switch (cat) {
    case "makanan":
      return "Makanan";
    case "minuman":
      return "Minuman";
    case "snack":
      return "Snack";
    default:
      return cat;
  }
}

export default function TableFnbModal({
  table,
  session,
  onClose,
  onUpdated,
}: TableFnbModalProps) {
  const [menu, setMenu] = useState<FnbMenuItem[]>([]);
  const [orders, setOrders] = useState<SessionFnbOrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<"all" | FnbCategory>(
    "all",
  );
  const [cart, setCart] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/kasir/sessions/${session.id}/fnb`, {
        cache: "no-store",
      });
      const payload = (await res.json()) as {
        menu?: FnbMenuItem[];
        orders?: SessionFnbOrderItem[];
        error?: string;
      };
      if (!res.ok) {
        setError(payload.error ?? "Gagal memuat data F&B.");
        return;
      }
      setMenu(payload.menu ?? []);
      setOrders(payload.orders ?? []);
    } catch {
      setError("Koneksi bermasalah saat memuat menu F&B.");
    } finally {
      setLoading(false);
    }
  }, [session.id]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const filteredMenu = useMemo(() => {
    if (categoryFilter === "all") return menu;
    return menu.filter((item) => item.category === categoryFilter);
  }, [menu, categoryFilter]);

  const menuById = useMemo(
    () => new Map(menu.map((item) => [item.id, item])),
    [menu],
  );

  const cartEntries = useMemo(() => {
    return Object.entries(cart)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => {
        const item = menuById.get(id);
        return item ? { item, qty, subtotal: item.price * qty } : null;
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  }, [cart, menuById]);

  const cartTotal = useMemo(
    () => cartEntries.reduce((sum, entry) => sum + entry.subtotal, 0),
    [cartEntries],
  );

  const existingTotal = useMemo(
    () => orders.reduce((sum, order) => sum + order.subtotal, 0),
    [orders],
  );

  const updateCartQty = (itemId: string, delta: number) => {
    setCart((prev) => {
      const next = Math.max(0, Math.min(50, (prev[itemId] ?? 0) + delta));
      if (next === 0) {
        const copy = { ...prev };
        delete copy[itemId];
        return copy;
      }
      return { ...prev, [itemId]: next };
    });
  };

  const handleSubmitCart = async () => {
    if (cartEntries.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/kasir/sessions/${session.id}/fnb`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cartEntries.map((entry) => ({
            fnbItemId: entry.item.id,
            quantity: entry.qty,
          })),
        }),
      });
      const payload = (await res.json()) as {
        ok?: boolean;
        orders?: SessionFnbOrderItem[];
        error?: string;
      };
      if (!res.ok || !payload.ok) {
        setError(payload.error ?? "Gagal menambahkan pesanan F&B.");
        return;
      }
      setCart({});
      setOrders(payload.orders ?? []);
      await onUpdated();
    } catch {
      setError("Koneksi bermasalah saat menyimpan pesanan.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    setDeletingOrderId(orderId);
    setError(null);
    try {
      const res = await fetch(
        `/api/kasir/sessions/${session.id}/fnb?orderId=${encodeURIComponent(orderId)}`,
        { method: "DELETE" },
      );
      const payload = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !payload.ok) {
        setError(payload.error ?? "Gagal menghapus pesanan F&B.");
        return;
      }
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
      await onUpdated();
    } catch {
      setError("Koneksi bermasalah saat menghapus item.");
    } finally {
      setDeletingOrderId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-5">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-border bg-surface shadow-2xl">
        {/* Header Modal */}
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <Coffee className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-primary">
                Pesanan F&amp;B • {session.customer_name}
              </p>
              <h3 className="font-heading text-2xl font-bold uppercase tracking-wide text-foreground">
                Tambah Makanan &amp; Minuman — {table.name}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-xl border border-border bg-background text-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body 2 Kolom (Tablet Landscape) */}
        <div className="grid flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-12">
          {/* Kiri: Pilihan Menu Tersedia */}
          <div className="flex flex-col border-b border-border p-4 lg:col-span-7 lg:border-b-0 lg:border-r">
            <div className="flex flex-wrap items-center gap-2">
              {FNB_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCategoryFilter(tab.id)}
                  className={`min-h-[44px] rounded-xl border px-3.5 text-xs font-bold transition ${
                    categoryFilter === tab.id
                      ? "border-primary bg-primary text-white"
                      : "border-border bg-background text-muted hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="flex flex-1 items-center justify-center py-14 text-muted">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : menu.length === 0 ? (
              <div className="mt-4 flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-background/50 p-8 text-center">
                <Coffee className="h-8 w-8 text-muted" />
                <p className="mt-2 text-sm font-bold text-foreground">
                  Belum ada menu F&amp;B yang tersedia
                </p>
                <p className="mt-1 text-xs text-muted">
                  Tambahkan daftar minuman, makanan, atau snack di halaman Menu
                  F&amp;B terlebih dahulu.
                </p>
                <Link
                  href="/kasir/fnb"
                  className="mt-4 inline-flex min-h-[48px] items-center justify-center rounded-xl bg-primary px-4 text-sm font-bold text-white hover:bg-primary-hover"
                >
                  Buka Manajemen Menu F&amp;B →
                </Link>
              </div>
            ) : filteredMenu.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-border bg-background/50 p-8 text-center text-sm text-muted">
                Tidak ada menu tersedia di kategori ini.
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {filteredMenu.map((item) => {
                  const qty = cart[item.id] ?? 0;
                  return (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between gap-2 rounded-2xl border p-3 transition ${
                        qty > 0
                          ? "border-primary bg-primary/10"
                          : "border-border bg-background"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => updateCartQty(item.id, 1)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="truncate text-sm font-bold text-foreground">
                          {item.name}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted">
                          {getFnbCategoryLabel(item.category)}
                        </p>
                        <p className="tabular-money mt-1 font-heading text-base font-bold text-primary">
                          {formatRupiah(item.price)}
                        </p>
                      </button>

                      <div className="flex shrink-0 items-center gap-1.5">
                        {qty > 0 && (
                          <>
                            <button
                              type="button"
                              onClick={() => updateCartQty(item.id, -1)}
                              aria-label={`Kurangi ${item.name}`}
                              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-border bg-surface text-foreground active:scale-95"
                            >
                              <Minus className="h-4 w-4" />
                            </button>
                            <span className="tabular-nums w-6 text-center font-heading text-lg font-bold text-foreground">
                              {qty}
                            </span>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => updateCartQty(item.id, 1)}
                          aria-label={`Tambah ${item.name}`}
                          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-primary text-white active:scale-95"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Kanan: Keranjang Baru + Pesanan Tercatat di Meja */}
          <div className="flex flex-col justify-between gap-4 p-4 lg:col-span-5">
            <div className="space-y-4">
              {/* Keranjang Pesanan Baru */}
              <div className="rounded-2xl border border-primary/35 bg-background p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary">
                    <ShoppingBag className="h-4 w-4" />
                    <span>Pesanan Baru</span>
                  </span>
                  <span className="tabular-money font-heading text-lg font-bold text-primary">
                    {formatRupiah(cartTotal)}
                  </span>
                </div>

                {cartEntries.length === 0 ? (
                  <p className="mt-2 text-xs text-muted">
                    Ketuk tombol <strong>+</strong> pada menu di kiri untuk
                    menambah pesanan.
                  </p>
                ) : (
                  <ul className="mt-2.5 space-y-1.5 text-xs">
                    {cartEntries.map(({ item, qty, subtotal }) => (
                      <li
                        key={item.id}
                        className="flex items-center justify-between gap-2"
                      >
                        <span className="truncate text-foreground">
                          <strong className="tabular-nums text-primary">
                            {qty}×
                          </strong>{" "}
                          {item.name}
                        </span>
                        <span className="tabular-money shrink-0 font-semibold text-foreground">
                          {formatRupiah(subtotal)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {error && (
                  <p className="mt-2.5 rounded-xl border border-status-occupied/40 bg-status-occupied/10 px-3 py-2 text-xs font-semibold text-status-occupied">
                    {error}
                  </p>
                )}

                <button
                  type="button"
                  disabled={saving || cartEntries.length === 0}
                  onClick={() => void handleSubmitCart()}
                  className="mt-3 flex min-h-[50px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white transition hover:bg-primary-hover active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  <span>
                    Masukkan ke Tagihan ({formatRupiah(cartTotal)})
                  </span>
                </button>
              </div>

              {/* Daftar F&B yang Sudah Masuk di Meja */}
              <div className="rounded-2xl border border-border bg-background p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted">
                    Tercatat di Meja Ini ({orders.length})
                  </span>
                  <span className="tabular-money font-heading text-base font-bold text-foreground">
                    {formatRupiah(existingTotal)}
                  </span>
                </div>

                {orders.length === 0 ? (
                  <p className="mt-2 text-xs text-muted">
                    Belum ada pesanan F&amp;B pada sesi ini.
                  </p>
                ) : (
                  <ul className="mt-2.5 max-h-52 divide-y divide-border overflow-y-auto">
                    {orders.map((order) => (
                      <li
                        key={order.id}
                        className="flex items-center justify-between gap-2 py-2 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-foreground">
                            <span className="tabular-nums text-primary">
                              {order.quantity}×
                            </span>{" "}
                            {order.item_name}
                          </p>
                          <p className="tabular-money text-[11px] text-muted">
                            @ {formatRupiah(order.unit_price)} ={" "}
                            <strong className="text-foreground">
                              {formatRupiah(order.subtotal)}
                            </strong>
                          </p>
                        </div>

                        <button
                          type="button"
                          disabled={deletingOrderId === order.id}
                          onClick={() => void handleDeleteOrder(order.id)}
                          aria-label={`Hapus ${order.item_name}`}
                          className="flex min-h-[40px] min-w-[40px] shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-muted transition hover:border-status-occupied/50 hover:text-status-occupied disabled:opacity-40"
                        >
                          {deletingOrderId === order.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="flex min-h-[48px] w-full items-center justify-center rounded-xl border border-border bg-background text-sm font-bold text-foreground hover:border-primary/60"
            >
              Selesai / Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
