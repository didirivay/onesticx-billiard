# UI/UX Guidelines - Onesticx Billiard

## 1. Identitas Visual & Branding
- **Nama Brand:** 1St!cx Billiard (Onesticx)
- **Lokasi:** Jl. Darussalam, Samping Distro DBS, Kampung Jawa Baru, Kota Lhokseumawe
- **Instagram:** @onesticx.lhokseumawe
- **Path Logo:** `/images/onesticx-logo.png` (Bentuk bulat, gunakan `rounded-full` jika masih ada sudut kotak)
- **Nuansa:** Sporty, elegan, modern, dan maskulin dengan dominasi Dark Mode.

## 2. Palet Warna (Color Palette)
Gunakan tema **Dark Mode** sebagai default di seluruh halaman (Pelanggan & Kasir).

| Peran Warna | Kode HEX | Penggunaan |
| :--- | :--- | :--- |
| **Background Utama** | `#121212` | Latar belakang utama aplikasi (Charcoal gelap) |
| **Surface / Card** | `#1E1E22` | Latar kartu meja, modal, sidebar, dan form |
| **Border / Garis** | `#2E2E36` | Garis pemisah tipis antar kartu atau tabel |
| **Primary (Brand Purple)** | `#9B51E0` | Tombol utama (Booking, Mulai Main, Bayar), highlight aktif |
| **Primary Hover** | `#7E3AF2` | Warna tombol utama saat disentuh/di-hover |
| **Teks Utama** | `#F3F4F6` | Judul, nama meja, harga, dan angka timer |
| **Teks Sekunder** | `#9CA3AF` | Label kecil, jam operasional, alamat, dan keterangan |

### Warna Status Meja (Semantik)
Khusus untuk indikator status meja di halaman Pelanggan dan Dashboard Kasir:
- **Kosong (Available):** Hijau Emerald (`#10B981`)
- **Sedang Main (Occupied):** Merah Coral (`#EF4444`)
- **Dibooking (Booked):** Kuning Amber (`#F59E0B`)

## 3. Tipografi
- **Heading / Judul & Angka Timer:** Font tegas dan tebal (seperti `Oswald`, `Barlow Condensed`, atau `Montserrat Bold`) agar mirip dengan gaya poster Onesticx.
- **Body / Teks Biasa:** Font bersih dan mudah dibaca di layar kecil (seperti `Inter` atau `Plus Jakarta Sans`).
- **Format Angka:** Gunakan `tabular-nums` pada timer berjalan dan nominal Rupiah (`Rp 50.000`) agar angka tidak bergeser saat detik berubah.

## 4. Aturan Tata Letak (2 Perangkat)

### A. Tampilan Pelanggan (`onesticx.diclaude.tech`) — Mobile First
- **Header:** Logo Onesticx di kiri/tengah, nama tempat, dan badge status "Buka (10.00 - 02.00 WIB)".
- **Ketersediaan Meja:** Tampilkan kartu meja secara ringkas (Indoor 1-6, High Table 1) dengan badge warna status real-time.
- **Form Booking:** Input besar dan mudah diisi dengan satu tangan di HP. Tombol **"Konfirmasi via WhatsApp"** berwarna hijau WhatsApp (`#25D366`) atau Primary Purple (`#9B51E0`) dengan lebar penuh (`w-full`).
- **Footer:** Tampilkan alamat lengkap (`Jl. Darussalam, Samping Distro DBS, Kampung Jawa Baru, Kota Lhokseumawe`) dan tautan Instagram `@onesticx.lhokseumawe`.

### B. Tampilan Kasir (`onesticx.diclaude.tech/kasir`) — Tablet Landscape
- **Touch-Friendly:** Semua tombol aksi minimal memiliki tinggi `48px` agar tidak salah pencet di layar tablet.
- **Grid Meja:** Gunakan grid 3 atau 4 kolom di layar landscape. Setiap kartu meja wajib langsung menampilkan:
  1. Nama & Kategori Meja (misal: `Meja 1 - Indoor`, `High Table 1`).
  2. Status warna di bagian atas kartu.
  3. Timer berjalan real-time (besar & jelas) + estimasi tagihan sementara.
- **Panel Samping / Notifikasi:** Sediakan tab atau drawer khusus untuk **Antrean Booking Web** dengan badge angka merah jika ada booking berstatus `Pending`.
- **Minim Pop-up Bertumpuk:** Proses tambah F&B, input diskon manual, dan pembayaran harus bisa selesai dalam maksimal 2-3 kali ketuk.