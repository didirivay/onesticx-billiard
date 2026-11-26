"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Coffee,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import KasirTopBar from "@/components/kasir/KasirTopBar";
import { formatRupiah } from "@/lib/format";
import type { FnbCategory } from "@/types/database";
import type { FnbMenuItem } from "@/types/kasir";

interface FnbManagerProps {
  initialItems: FnbMenuItem[];
}

const CATEGORIES: Array<{ id: FnbCategory; label: string }> = [
  { id: "minuman", label: "Minuman" },
  { id: "makanan", label: "Makanan" },
  { id: "snack", label: "Snack" },
];

function getCategoryLabel(cat: FnbCategory): string {
  switch (cat) {
    case "makanan":
      return "Makanan";
    case "minuman":
      return "Minuman";
    case "snack":
      return "Snack";
  }
}

export default function FnbManager({ initialItems }: FnbManagerProps) {
  const [items, setItems] = useState<FnbMenuItem[]>(initialItems);
  const [filterCat, setFilterCat] = useState<"all" | FnbCategory>("all");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Modal Tambah / Edit
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<FnbMenuItem | null>(null);
  const [formName, setFormName] = useState("");
  const [formCategory, setFormCategory] = useState<FnbCategory>("minuman");
  const [formPrice, setFormPrice] = useState("");
  const [formAvailable, setFormAvailable] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    window.setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 3500);
  };

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (filterCat !== "all" && item.category !== filterCat) return false;
      if (q && !item.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, filterCat, search]);

  const openAddModal = () => {
    setEditingItem(null);
    setFormName("");
    setFormCategory("minuman");
    setFormPrice("");
    setFormAvailable(true);
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (item: FnbMenuItem) => {
    setEditingItem(item);
    setFormName(item.name);
    setFormCategory(item.category);
    setFormPrice(String(item.price));
    setFormAvailable(item.is_available);
    setFormError(null);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const parsedPrice = Number.parseInt(formPrice.replace(/\D/g, ""), 10);
    if (formName.trim().length < 2) {
      setFormError("Nama menu minimal 2 karakter.");
      return;
    }
    if (!Number.isInteger(parsedPrice) || parsedPrice < 0) {
      setFormError("Masukkan harga yang valid dalam Rupiah.");
      return;
    }

    setSaving(true);
    try {
      const url = editingItem
        ? `/api/kasir/fnb/${editingItem.id}`
        : "/api/kasir/fnb";
      const method = editingItem ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          category: formCategory,
          price: parsedPrice,
          is_available: formAvailable,
        }),
      });
      const payload = (await res.json()) as {
        ok?: boolean;
        item?: FnbMenuItem;
        error?: string;
      };

      if (!res.ok || !payload.ok || !payload.item) {
        setFormError(payload.error ?? "Gagal menyimpan menu.");
        return;
      }

      const saved = payload.item;
      setItems((prev) => {
        const next = editingItem
          ? prev.map((it) => (it.id === saved.id ? saved : it))
          : [...prev, saved];
        return next.sort(
          (a, b) =>
            a.category.localeCompare(b.category) ||
            a.name.localeCompare(b.name),
        );
      });

      setModalOpen(false);
      showToast(
        "success",
        editingItem
          ? `Menu "${saved.name}" berhasil diperbarui.`
          : `Menu "${saved.name}" berhasil ditambahkan.`,
      );
    } catch {
      setFormError("Gagal terhubung ke server.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAvailable = async (item: FnbMenuItem) => {
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/kasir/fnb/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_available: !item.is_available }),
      });
      const payload = (await res.json()) as {
        ok?: boolean;
        item?: FnbMenuItem;
        error?: string;
      };
      if (!res.ok || !payload.ok || !payload.item) {
        showToast("error", payload.error ?? "Gagal mengubah status menu.");
        return;
      }
      setItems((prev) =>
        prev.map((it) => (it.id === item.id ? payload.item! : it)),
      );
    } catch {
      showToast("error", "Koneksi bermasalah.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (item: FnbMenuItem) => {
    setBusyId(item.id);
    setConfirmDeleteId(null);
    try {
      const res = await fetch(`/api/kasir/fnb/${item.id}`, {
        method: "DELETE",
      });
      const payload = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !payload.ok) {
        showToast("error", payload.error ?? "Gagal menghapus menu.");
        return;
      }
      setItems((prev) => prev.filter((it) => it.id !== item.id));
      showToast("success", `Menu "${item.name}" telah dihapus.`);
    } catch {
      showToast("error", "Koneksi bermasalah.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <KasirTopBar activeTab="fnb" />

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2">
          <div
            className={`rounded-2xl border px-4 py-3.5 text-sm font-semibold shadow-2xl ${
              toast.type === "error"
                ? "border-status-occupied/50 bg-status-occupied text-white"
                : "border-status-available/50 bg-surface text-status-available"
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-5 p-4 lg:p-6">
        {/* Header & Tombol Tambah */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-primary">
              Manajemen Katalog
            </p>
            <h1 className="mt-0.5 font-heading text-3xl font-bold uppercase tracking-wide text-foreground">
              Menu Makanan &amp; Minuman
            </h1>
            <p className="mt-1 text-xs text-muted">
              Menu yang berstatus <strong>Tersedia</strong> dapat langsung
              ditambahkan ke tagihan meja aktif di Dashboard Meja.
            </p>
          </div>

          <button
            type="button"
            onClick={openAddModal}
            className="flex min-h-[50px] items-center gap-2 rounded-2xl bg-primary px-5 text-sm font-bold text-white shadow-lg shadow-primary/25 transition hover:bg-primary-hover active:scale-[0.98]"
          >
            <Plus className="h-5 w-5" />
            <span>Tambah Menu Baru</span>
          </button>
        </div>

        {/* Filter Kategori & Pencarian */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setFilterCat("all")}
              className={`min-h-[44px] rounded-xl border px-4 text-xs font-bold transition ${
                filterCat === "all"
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-background text-muted hover:text-foreground"
              }`}
            >
              Semua ({items.length})
            </button>
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setFilterCat(cat.id)}
                className={`min-h-[44px] rounded-xl border px-4 text-xs font-bold transition ${
                  filterCat === cat.id
                    ? "border-primary bg-primary text-white"
                    : "border-border bg-background text-muted hover:text-foreground"
                }`}
              >
                {cat.label} (
                {items.filter((it) => it.category === cat.id).length})
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama menu..."
              className="min-h-[46px] w-full rounded-xl border border-border bg-background pl-10 pr-3.5 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        {/* Grid Menu F&B */}
        {filteredItems.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-surface/60 px-6 py-14 text-center">
            <Coffee className="mx-auto h-10 w-10 text-muted" />
            <h2 className="mt-3 font-heading text-xl font-bold uppercase text-foreground">
              {items.length === 0
                ? "Belum Ada Menu F&B"
                : "Menu Tidak Ditemukan"}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {items.length === 0
                ? "Tambahkan menu minuman, makanan, atau snack seperti Es Teh Manis, Kopi, atau Indomie Goreng."
                : "Coba ubah kata kunci pencarian atau pilih kategori lain."}
            </p>
            {items.length === 0 && (
              <button
                type="button"
                onClick={openAddModal}
                className="mt-5 inline-flex min-h-[50px] items-center gap-2 rounded-2xl bg-primary px-5 text-sm font-bold text-white hover:bg-primary-hover"
              >
                <Plus className="h-5 w-5" />
                <span>Tambah Menu Pertama</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredItems.map((item) => {
              const isBusy = busyId === item.id;
              const confirmingDelete = confirmDeleteId === item.id;

              return (
                <article
                  key={item.id}
                  className={`flex flex-col justify-between rounded-2xl border bg-surface p-4 transition ${
                    item.is_available
                      ? "border-border"
                      : "border-border/60 opacity-75"
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="rounded-lg border border-border bg-background px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-muted">
                        {getCategoryLabel(item.category)}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                          item.is_available
                            ? "bg-status-available/15 text-status-available"
                            : "bg-status-occupied/15 text-status-occupied"
                        }`}
                      >
                        {item.is_available ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5" />
                        )}
                        {item.is_available ? "Tersedia" : "Habis"}
                      </span>
                    </div>

                    <h3 className="mt-3 text-lg font-bold text-foreground">
                      {item.name}
                    </h3>
                    <p className="tabular-money mt-1 font-heading text-2xl font-bold text-primary">
                      {formatRupiah(item.price)}
                    </p>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3.5">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleToggleAvailable(item)}
                      className={`flex min-h-[48px] items-center justify-center rounded-xl border px-2 text-xs font-bold transition ${
                        item.is_available
                          ? "border-status-booked/40 bg-status-booked/10 text-status-booked hover:bg-status-booked/20"
                          : "border-status-available/40 bg-status-available/10 text-status-available hover:bg-status-available/20"
                      }`}
                    >
                      {isBusy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : item.is_available ? (
                        "Set Habis"
                      ) : (
                        "Tersedia"
                      )}
                    </button>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => openEditModal(item)}
                      className="flex min-h-[48px] items-center justify-center gap-1 rounded-xl border border-border bg-background px-2 text-xs font-bold text-foreground transition hover:border-primary/60 hover:text-primary"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      <span>Edit</span>
                    </button>

                    {confirmingDelete ? (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleDelete(item)}
                        className="flex min-h-[48px] items-center justify-center rounded-xl bg-status-occupied px-2 text-xs font-extrabold text-white"
                      >
                        Yakin?
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => setConfirmDeleteId(item.id)}
                        className="flex min-h-[48px] items-center justify-center gap-1 rounded-xl border border-border bg-background px-2 text-xs font-bold text-muted transition hover:border-status-occupied/50 hover:text-status-occupied"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Hapus</span>
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      {/* Modal Tambah / Edit Menu */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-border bg-surface p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-2 border-b border-border pb-4">
              <h2 className="font-heading text-2xl font-bold uppercase tracking-wide text-foreground">
                {editingItem ? "Edit Menu F&B" : "Tambah Menu F&B"}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-xl border border-border bg-background text-muted hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="fnb-name"
                  className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted"
                >
                  Nama Menu
                </label>
                <input
                  id="fnb-name"
                  type="text"
                  required
                  maxLength={80}
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Contoh: Es Teh Manis / Indomie Goreng"
                  className="min-h-[50px] w-full rounded-xl border border-border bg-background px-4 text-sm text-foreground placeholder:text-muted/70 focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted">
                  Kategori
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setFormCategory(cat.id)}
                      className={`min-h-[48px] rounded-xl border text-xs font-bold transition ${
                        formCategory === cat.id
                          ? "border-primary bg-primary text-white"
                          : "border-border bg-background text-muted hover:text-foreground"
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label
                  htmlFor="fnb-price"
                  className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted"
                >
                  Harga (Rp)
                </label>
                <input
                  id="fnb-price"
                  type="number"
                  inputMode="numeric"
                  required
                  min={0}
                  step={500}
                  value={formPrice}
                  onChange={(e) => setFormPrice(e.target.value)}
                  placeholder="Contoh: 10000"
                  className="tabular-nums min-h-[50px] w-full rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground placeholder:text-muted/70 focus:border-primary focus:outline-none"
                />
              </div>

              <label className="flex min-h-[48px] cursor-pointer items-center justify-between rounded-xl border border-border bg-background px-4">
                <span className="text-sm font-semibold text-foreground">
                  Tersedia untuk dipesan
                </span>
                <input
                  type="checkbox"
                  checked={formAvailable}
                  onChange={(e) => setFormAvailable(e.target.checked)}
                  className="h-5 w-5 accent-primary"
                />
              </label>

              {formError && (
                <p className="rounded-xl border border-status-occupied/40 bg-status-occupied/10 px-3.5 py-2.5 text-xs font-semibold text-status-occupied">
                  {formError}
                </p>
              )}

              <button
                type="submit"
                disabled={saving}
                className="flex min-h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-base font-bold text-white transition hover:bg-primary-hover disabled:opacity-50"
              >
                {saving && <Loader2 className="h-5 w-5 animate-spin" />}
                <span>{editingItem ? "Simpan Perubahan" : "Tambah Menu"}</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
