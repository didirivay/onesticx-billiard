# Architecture & Tech Stack - Onesticx Billiard

## 1. Tech Stack (Gratis & Ramah Vibecoding)
- **Framework:** Next.js (App Router) + TypeScript
- **Styling:** Tailwind CSS (mengikuti palet warna di `UI_UX_GUIDELINES.md`)
- **Database & Real-time:** Supabase (PostgreSQL + Supabase Realtime)
  - *Alasan:* Gratis untuk skala 1 tempat billiard, dan memiliki fitur *Realtime* agar status meja (Kosong/Main/Booking) di HP pelanggan dan tablet kasir otomatis berubah tanpa perlu refresh halaman.
- **Hosting & Domain:** Vercel (Free Tier) dihubungkan ke custom domain `onesticx.diclaude.tech` via DNS (CNAME/A Record).
- **PWA (Progressive Web App):** Konfigurasi `manifest.json` agar halaman kasir di tablet bisa dibuka dalam mode layar penuh (*Add to Home Screen*) seperti aplikasi native.

## 2. Struktur Rute (Routing)
| Rute URL | Pengguna | Fungsi |
| :--- | :--- | :--- |
| `/` | Pelanggan (Mobile) | Melihat status meja real-time, jadwal booking hari ini, dan form booking meja. |
| `/booking/[code]` | Pelanggan (Mobile) | Halaman bukti booking / ID Pelanggan & instruksi pembayaran manual + tombol WA Kasir. |
| `/kasir` | Kasir (Tablet) | Dashboard utama grid meja, timer berjalan, antrean booking pending, dan aksi cepat meja. |
| `/kasir/fnb` | Kasir (Tablet) | Manajemen menu makanan & minuman (Tambah, Edit, Hapus, Set Tersedia/Habis). |
| `/kasir/laporan` | Kasir (Tablet) | Rekap transaksi & pendapatan harian (dipisah per Tunai, QRIS, Transfer). |
| `/kasir/pengaturan` | Kasir (Tablet) | Atur PIN kasir, nomor WhatsApp kasir, dan informasi rekening bank. |

## 3. Keamanan & Autentikasi
- **Halaman Pelanggan (`/`):** Publik, tanpa login.
- **Halaman Kasir (`/kasir/*`):** Dilindungi layar kunci **PIN (4-6 digit)** yang disimpan di database (`app_settings`) dan divalidasi lewat session/cookie lokal di browser tablet.

## 4. Alur Real-time & Integrasi WhatsApp
- **Supabase Realtime:** Subscribe ke perubahan tabel `tables` dan `bookings`. Saat pelanggan submit booking, badge notifikasi di `/kasir` langsung berbunyi/muncul angka merah.
- **WhatsApp Deep Link:** Menggunakan format `https://wa.me/628xxx?text=...` untuk mengirim pesan otomatis berisi detail booking (Nama, Meja, Jam, Total) ke WhatsApp kasir.