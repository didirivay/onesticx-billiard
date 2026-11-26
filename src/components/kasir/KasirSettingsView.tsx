"use client";

import { useState } from "react";
import {
  Building2,
  KeyRound,
  LayoutGrid,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import KasirTopBar from "@/components/kasir/KasirTopBar";
import { formatRupiah, getCategoryLabel } from "@/lib/format";
import type { BilliardTable, TableCategory } from "@/types/database";
import type { KasirStoreSettings } from "@/types/kasir";

interface KasirSettingsViewProps {
  initialSettings: KasirStoreSettings;
  initialTables: BilliardTable[];
}

const DEFAULT_RATES_BY_CATEGORY: Record<
  TableCategory,
  { hourly: number; minute: number }
> = {
  indoor: { hourly: 50000, minute: 950 },
  outdoor: { hourly: 40000, minute: 750 },
  high_table: { hourly: 100000, minute: 2000 },
};

export default function KasirSettingsView({
  initialSettings,
  initialTables,
}: KasirSettingsViewProps) {
  // Pengaturan WA & Rekening
  const [settings, setSettings] = useState<KasirStoreSettings>(initialSettings);
  const [savingStore, setSavingStore] = useState(false);

  // Ubah PIN
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [savingPin, setSavingPin] = useState(false);

  // Manajemen Meja (termasuk tambah meja Outdoor sesuai PRD)
  const [tables, setTables] = useState<BilliardTable[]>(initialTables);
  const [tableModalOpen, setTableModalOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<BilliardTable | null>(null);
  const [tableName, setTableName] = useState("");
  const [tableCategory, setTableCategory] = useState<TableCategory>("outdoor");
  const [tableHourly, setTableHourly] = useState("40000");
  const [tableMinute, setTableMinute] = useState("750");
  const [savingTable, setSavingTable] = useState(false);
  const [tableError, setTableError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingTableId, setDeletingTableId] = useState<string | null>(null);

  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    window.setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 4000);
  };

  const handleSaveStoreSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingStore(true);
    try {
      const res = await fetch("/api/kasir/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "store",
          ...settings,
        }),
      });
      const payload = (await res.json()) as {
        ok?: boolean;
        settings?: KasirStoreSettings;
        error?: string;
      };
      if (!res.ok || !payload.ok) {
        showToast("error", payload.error ?? "Gagal menyimpan pengaturan.");
        return;
      }
      if (payload.settings) {
        setSettings(payload.settings);
      }
      showToast(
        "success",
        "Pengaturan WhatsApp & Rekening Bank berhasil disimpan!",
      );
    } catch {
      showToast("error", "Koneksi bermasalah.");
    } finally {
      setSavingStore(false);
    }
  };

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4,6}$/.test(newPin)) {
      showToast("error", "PIN baru harus berupa 4 sampai 6 digit angka.");
      return;
    }
    if (newPin !== confirmPin) {
      showToast("error", "Konfirmasi PIN baru tidak cocok.");
      return;
    }

    setSavingPin(true);
    try {
      const res = await fetch("/api/kasir/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "pin",
          currentPin,
          newPin,
        }),
      });
      const payload = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !payload.ok) {
        showToast("error", payload.error ?? "Gagal mengubah PIN kasir.");
        return;
      }
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
      showToast("success", "PIN kasir berhasil diperbarui!");
    } catch {
      showToast("error", "Koneksi bermasalah.");
    } finally {
      setSavingPin(false);
    }
  };

  const openAddTableModal = () => {
    setEditingTable(null);
    const outdoorCount = tables.filter((t) => t.category === "outdoor").length;
    setTableCategory("outdoor");
    setTableName(`Outdoor ${outdoorCount + 1}`);
    setTableHourly(String(DEFAULT_RATES_BY_CATEGORY.outdoor.hourly));
    setTableMinute(String(DEFAULT_RATES_BY_CATEGORY.outdoor.minute));
    setTableError(null);
    setTableModalOpen(true);
  };

  const openEditTableModal = (tbl: BilliardTable) => {
    setEditingTable(tbl);
    setTableCategory(tbl.category);
    setTableName(tbl.name);
    setTableHourly(String(tbl.hourly_rate));
    setTableMinute(String(tbl.minute_rate));
    setTableError(null);
    setTableModalOpen(true);
  };

  const handleCategoryPick = (cat: TableCategory) => {
    setTableCategory(cat);
    if (!editingTable) {
      setTableHourly(String(DEFAULT_RATES_BY_CATEGORY[cat].hourly));
      setTableMinute(String(DEFAULT_RATES_BY_CATEGORY[cat].minute));
    }
  };

  const handleSaveTable = async (e: React.FormEvent) => {
    e.preventDefault();
    setTableError(null);
    setSavingTable(true);
    try {
      const url = editingTable
        ? `/api/kasir/tables/${editingTable.id}`
        : "/api/kasir/tables";
      const method = editingTable ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: tableName.trim(),
          category: tableCategory,
          hourly_rate: Number.parseInt(tableHourly, 10),
          minute_rate: Number.parseInt(tableMinute, 10),
        }),
      });
      const payload = (await res.json()) as {
        ok?: boolean;
        table?: BilliardTable;
        error?: string;
      };
      if (!res.ok || !payload.ok || !payload.table) {
        setTableError(payload.error ?? "Gagal menyimpan data meja.");
        return;
      }

      const saved = payload.table;
      setTables((prev) =>
        editingTable
          ? prev.map((t) => (t.id === saved.id ? saved : t))
          : [...prev, saved].sort((a, b) => a.sort_order - b.sort_order),
      );
      setTableModalOpen(false);
      showToast(
        "success",
        editingTable
          ? `${saved.name} berhasil diperbarui.`
          : `${saved.name} berhasil ditambahkan.`,
      );
    } catch {
      setTableError("Koneksi bermasalah.");
    } finally {
      setSavingTable(false);
    }
  };

  const handleDeleteTable = async (tbl: BilliardTable) => {
    setDeletingTableId(tbl.id);
    setConfirmDeleteId(null);
    try {
      const res = await fetch(`/api/kasir/tables/${tbl.id}`, {
        method: "DELETE",
      });
      const payload = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !payload.ok) {
        showToast("error", payload.error ?? "Gagal menghapus meja.");
        return;
      }
      setTables((prev) => prev.filter((t) => t.id !== tbl.id));
      showToast("success", `${tbl.name} berhasil dihapus.`);
    } catch {
      showToast("error", "Koneksi bermasalah.");
    } finally {
      setDeletingTableId(null);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <KasirTopBar activeTab="pengaturan" />

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

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 p-4 lg:p-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-primary">
            Konfigurasi Toko
          </p>
          <h1 className="mt-0.5 font-heading text-3xl font-bold uppercase tracking-wide text-foreground">
            Pengaturan Onesticx Billiard
          </h1>
          <p className="mt-1 text-xs text-muted">
            Perubahan WhatsApp, rekening bank, dan daftar meja langsung aktif di
            halaman pelanggan tanpa perlu ubah kode.
          </p>
        </div>

        {/* Baris 1: Pengaturan Pembayaran/WA + Keamanan PIN */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Panel Rekening & WhatsApp */}
          <section className="rounded-2xl border border-border bg-surface p-5">
            <div className="flex items-center gap-2.5 border-b border-border pb-3.5">
              <Building2 className="h-5 w-5 text-primary" />
              <h2 className="font-heading text-xl font-bold uppercase tracking-wide text-foreground">
                WhatsApp Kasir &amp; Rekening Bank
              </h2>
            </div>

            <form onSubmit={handleSaveStoreSettings} className="mt-4 space-y-4">
              <div>
                <label
                  htmlFor="set-wa"
                  className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted"
                >
                  Nomor WhatsApp Kasir (Format 628xxx)
                </label>
                <input
                  id="set-wa"
                  type="tel"
                  required
                  value={settings.whatsapp_kasir}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      whatsapp_kasir: e.target.value,
                    }))
                  }
                  placeholder="Contoh: 6281234567890"
                  className="tabular-nums min-h-[50px] w-full rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground focus:border-primary focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="set-bank"
                    className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted"
                  >
                    Nama Bank
                  </label>
                  <input
                    id="set-bank"
                    type="text"
                    required
                    value={settings.bank_name}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, bank_name: e.target.value }))
                    }
                    placeholder="Contoh: BSI / BCA / Mandiri"
                    className="min-h-[50px] w-full rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground focus:border-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="set-account"
                    className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted"
                  >
                    Nomor Rekening
                  </label>
                  <input
                    id="set-account"
                    type="text"
                    required
                    value={settings.bank_account}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        bank_account: e.target.value,
                      }))
                    }
                    placeholder="Contoh: 123456789"
                    className="tabular-nums min-h-[50px] w-full rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="set-holder"
                  className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted"
                >
                  Nama Pemilik Rekening
                </label>
                <input
                  id="set-holder"
                  type="text"
                  required
                  value={settings.bank_holder}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, bank_holder: e.target.value }))
                  }
                  placeholder="Contoh: Onesticx Billiard"
                  className="min-h-[50px] w-full rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground focus:border-primary focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={savingStore}
                className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-sm font-bold text-white transition hover:bg-primary-hover disabled:opacity-50"
              >
                {savingStore ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                <span>Simpan Info Pembayaran &amp; WA</span>
              </button>
            </form>
          </section>

          {/* Panel Ubah PIN Kasir */}
          <section className="rounded-2xl border border-border bg-surface p-5">
            <div className="flex items-center gap-2.5 border-b border-border pb-3.5">
              <KeyRound className="h-5 w-5 text-primary" />
              <h2 className="font-heading text-xl font-bold uppercase tracking-wide text-foreground">
                Keamanan PIN Kasir
              </h2>
            </div>

            <form onSubmit={handleSavePin} className="mt-4 space-y-4">
              <div>
                <label
                  htmlFor="pin-old"
                  className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted"
                >
                  PIN Lama
                </label>
                <input
                  id="pin-old"
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={currentPin}
                  onChange={(e) =>
                    setCurrentPin(e.target.value.replace(/\D/g, ""))
                  }
                  placeholder="Masukkan PIN saat ini"
                  className="tabular-nums min-h-[50px] w-full rounded-xl border border-border bg-background px-4 text-sm font-semibold tracking-widest text-foreground focus:border-primary focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="pin-new"
                    className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted"
                  >
                    PIN Baru (4–6 Digit)
                  </label>
                  <input
                    id="pin-new"
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    value={newPin}
                    onChange={(e) =>
                      setNewPin(e.target.value.replace(/\D/g, ""))
                    }
                    placeholder="4–6 digit angka"
                    className="tabular-nums min-h-[50px] w-full rounded-xl border border-border bg-background px-4 text-sm font-semibold tracking-widest text-foreground focus:border-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="pin-confirm"
                    className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted"
                  >
                    Konfirmasi PIN Baru
                  </label>
                  <input
                    id="pin-confirm"
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    value={confirmPin}
                    onChange={(e) =>
                      setConfirmPin(e.target.value.replace(/\D/g, ""))
                    }
                    placeholder="Ulangi PIN baru"
                    className="tabular-nums min-h-[50px] w-full rounded-xl border border-border bg-background px-4 text-sm font-semibold tracking-widest text-foreground focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <p className="rounded-xl border border-border bg-background px-3.5 py-2.5 text-xs text-muted">
                Disarankan segera mengganti PIN default (<code>123456</code>)
                sebelum operasional toko dimulai.
              </p>

              <button
                type="submit"
                disabled={savingPin}
                className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl border border-primary/50 bg-primary/15 px-5 text-sm font-bold text-primary transition hover:bg-primary hover:text-white disabled:opacity-50"
              >
                {savingPin ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="h-4 w-4" />
                )}
                <span>Perbarui PIN Kasir</span>
              </button>
            </form>
          </section>
        </div>

        {/* Baris 2: Daftar & Manajemen Meja Billiard */}
        <section className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <div className="flex items-center gap-2.5">
              <LayoutGrid className="h-5 w-5 text-primary" />
              <div>
                <h2 className="font-heading text-xl font-bold uppercase tracking-wide text-foreground">
                  Daftar Meja &amp; Tarif ({tables.length})
                </h2>
                <p className="text-xs text-muted">
                  Anda dapat menambah meja baru (termasuk kategori{" "}
                  <strong>Outdoor</strong> Rp 40.000/jam) atau menyesuaikan
                  tarif di sini.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={openAddTableModal}
              className="flex min-h-[48px] items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white transition hover:bg-primary-hover"
            >
              <Plus className="h-4 w-4" />
              <span>Tambah Meja</span>
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tables.map((tbl) => {
              const confirmingDelete = confirmDeleteId === tbl.id;
              const isDeleting = deletingTableId === tbl.id;

              return (
                <div
                  key={tbl.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background p-4"
                >
                  <div className="min-w-0">
                    <p className="font-heading text-lg font-bold text-foreground">
                      {tbl.name}
                    </p>
                    <p className="text-xs text-primary">
                      {getCategoryLabel(tbl.category)}
                    </p>
                    <p className="tabular-money mt-1 text-xs text-muted">
                      Paket:{" "}
                      <strong className="text-foreground">
                        {formatRupiah(tbl.hourly_rate)}/jam
                      </strong>
                    </p>
                    <p className="tabular-money text-xs text-muted">
                      Open Table:{" "}
                      <strong className="text-foreground">
                        {formatRupiah(tbl.minute_rate)}/mnt
                      </strong>
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => openEditTableModal(tbl)}
                      className="flex min-h-[42px] items-center justify-center gap-1 rounded-xl border border-border bg-surface px-3 text-xs font-bold text-foreground hover:border-primary/60 hover:text-primary"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      <span>Edit</span>
                    </button>

                    {confirmingDelete ? (
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => void handleDeleteTable(tbl)}
                        className="flex min-h-[42px] items-center justify-center rounded-xl bg-status-occupied px-3 text-xs font-extrabold text-white"
                      >
                        Yakin?
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => setConfirmDeleteId(tbl.id)}
                        className="flex min-h-[42px] items-center justify-center gap-1 rounded-xl border border-border bg-surface px-3 text-xs font-bold text-muted hover:border-status-occupied/50 hover:text-status-occupied"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Hapus</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>

      {/* Modal Tambah / Edit Meja */}
      {tableModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-border bg-surface p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-2 border-b border-border pb-4">
              <h2 className="font-heading text-2xl font-bold uppercase text-foreground">
                {editingTable ? `Edit ${editingTable.name}` : "Tambah Meja Baru"}
              </h2>
              <button
                type="button"
                onClick={() => setTableModalOpen(false)}
                className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-xl border border-border bg-background text-muted hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTable} className="mt-5 space-y-4">
              <div>
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted">
                  Kategori Meja
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {(["indoor", "outdoor", "high_table"] as TableCategory[]).map(
                    (cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => handleCategoryPick(cat)}
                        className={`min-h-[48px] rounded-xl border text-xs font-bold transition ${
                          tableCategory === cat
                            ? "border-primary bg-primary text-white"
                            : "border-border bg-background text-muted hover:text-foreground"
                        }`}
                      >
                        {getCategoryLabel(cat)}
                      </button>
                    ),
                  )}
                </div>
              </div>

              <div>
                <label
                  htmlFor="tbl-name"
                  className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted"
                >
                  Nama Meja
                </label>
                <input
                  id="tbl-name"
                  type="text"
                  required
                  maxLength={40}
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  placeholder="Contoh: Outdoor 1 / Meja 7"
                  className="min-h-[50px] w-full rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground focus:border-primary focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="tbl-hourly"
                    className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted"
                  >
                    Tarif / Jam (Rp)
                  </label>
                  <input
                    id="tbl-hourly"
                    type="number"
                    inputMode="numeric"
                    required
                    min={0}
                    value={tableHourly}
                    onChange={(e) => setTableHourly(e.target.value)}
                    className="tabular-nums min-h-[50px] w-full rounded-xl border border-border bg-background px-3.5 text-sm font-semibold text-foreground focus:border-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="tbl-minute"
                    className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted"
                  >
                    Freetime / Menit (Rp)
                  </label>
                  <input
                    id="tbl-minute"
                    type="number"
                    inputMode="numeric"
                    required
                    min={0}
                    value={tableMinute}
                    onChange={(e) => setTableMinute(e.target.value)}
                    className="tabular-nums min-h-[50px] w-full rounded-xl border border-border bg-background px-3.5 text-sm font-semibold text-foreground focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              {tableError && (
                <p className="rounded-xl border border-status-occupied/40 bg-status-occupied/10 px-3.5 py-2.5 text-xs font-semibold text-status-occupied">
                  {tableError}
                </p>
              )}

              <button
                type="submit"
                disabled={savingTable}
                className="flex min-h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-base font-bold text-white transition hover:bg-primary-hover disabled:opacity-50"
              >
                {savingTable && <Loader2 className="h-5 w-5 animate-spin" />}
                <span>
                  {editingTable ? "Simpan Perubahan Meja" : "Tambahkan Meja"}
                </span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
