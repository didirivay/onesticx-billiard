# AI Agent Rules - Onesticx Billiard

## 1. Sumber Kebenaran (Source of Truth)
Sebelum menulis atau mengubah kode apa pun, WAJIB membaca dokumen di folder `docs/`:
- `docs/PRD.md` (Aturan bisnis, tarif, alur booking & kasir)
- `docs/UI_UX_GUIDELINES.md` (Palet warna Dark Mode, font, layout Mobile vs Tablet)
- `docs/ARCHITECTURE.md` (Tech stack, routing, Supabase Realtime)
- `docs/DATABASE_SCHEMA.md` (Struktur tabel & relasi database)

## 2. Aturan Bahasa & Format
- Gunakan **Bahasa Indonesia** untuk seluruh teks antarmuka (UI), tombol, label, dan pesan error.
- Format mata uang wajib menggunakan Rupiah Indonesia tanpa desimal (contoh: `Rp 50.000`).
- Format waktu menggunakan zona waktu WIB (`HH:mm`).
- Gunakan font `tabular-nums` untuk semua timer dan nominal uang.

## 3. Aturan Pengerjaan (Anti-Error)
- **Kerjakan secara bertahap (Step-by-step):** Jangan pernah membuat semua halaman sekaligus dalam satu respons. Tunggu konfirmasi sebelum lanjut ke tahap berikutnya.
- **Jangan mengubah skema database** secara sepihak tanpa persetujuan.
- **Prioritaskan fungsionalitas inti (MVP):** Patuhi bagian *Non-Goals* di `PRD.md` (jangan tambahkan payment gateway otomatis, IoT, atau sistem member).
- Pastikan tampilan `/kasir` ramah sentuhan jari di tablet landscape (tombol minimal tinggi `48px`) dan tampilan `/` rapi di layar HP.
- Gunakan file logo dari `/images/onesticx-logo.png` dengan styling `rounded-full`.