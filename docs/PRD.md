# Product Requirements Document (PRD) - Onesticx Billiard

## 1. Informasi Umum
- **Nama Aplikasi / Tempat:** Onesticx
- **Domain:** `onesticx.diclaude.tech`
- **Jam Operasional:** 10.00 - 02.00 WIB
- **Platform:** Web App / PWA (Mobile untuk Pelanggan, Tablet Landscape untuk Kasir)

## 2. Data Meja & Skema Harga
### Daftar Kategori & Tarif
| Kategori | Jumlah Meja | Tarif Per Jam (Paket/Booking) | Tarif Freetime (Open Table) |
| :--- | :--- | :--- | :--- |
| **Indoor** | 6 Meja (Meja 1 - 6) | Rp 50.000 / jam | Rp 950 / menit |
| **Outdoor** | *(Dapat ditambah di pengaturan)* | Rp 40.000 / jam | Rp 750 / menit |
| **High TABLE** | 1 Meja (High Table 1) | Rp 100.000 / jam | Rp 2.000 / menit |

### Aturan Billing & Diskon
- **Mode Open Table (Freetime):** Timer berjalan maju, biaya dihitung per menit sesuai tarif kategori meja, dibayar saat selesai bermain.
- **Mode Paket Jam:** Digunakan untuk booking online atau walk-in dengan durasi pasti (misal 1 jam, 2 jam).
- **Diskon Manual:** Kasir dapat menginput potongan harga (nominal Rp atau persentase %) secara bebas saat proses pembayaran.

## 3. Alur & Aturan Booking Online
1. Pelanggan memilih meja, tanggal, jam mulai, dan durasi bermain di web.
2. Sistem menampilkan total harga dan informasi rekening pembayaran manual (Contoh: BSI `123456789`).
3. Booking masuk ke sistem kasir dengan status **Pending**.
4. Pelanggan menekan tombol **"Sudah Membayar"** yang mengarahkan ke WhatsApp Kasir (dengan pesan otomatis berisi detail booking).
5. Kasir memverifikasi pembayaran di dashboard tablet dan menekan tombol **Terima**.
6. Setelah dikonfirmasi, sistem menghasilkan **ID Pelanggan / Kode Booking** yang dikirimkan/ditampilkan sebagai bukti sah.
7. **Batas Keterlambatan:** 15 menit dari jam booking (jika lewat tanpa kabar, kasir dapat membatalkan/hangus).

## 4. Fitur Sisi Pelanggan (`onesticx.diclaude.tech`)
- Melihat status seluruh meja secara *real-time* (Kosong / Sedang Dipakai / Dibooking).
- Melihat jadwal booking hari ini untuk mengetahui jam kosong tiap meja.
- Formulir booking meja (Input: Nama, Nomor WhatsApp, Pilih Meja, Tanggal & Jam Mulai, Durasi).
- Halaman ringkasan pembayaran manual (Total + Nomor Rekening) & tombol konfirmasi ke WhatsApp Kasir.
- Tampilan bukti booking / ID Pelanggan setelah dikonfirmasi.

## 5. Fitur Sisi Kasir (`onesticx.diclaude.tech/kasir`)
- **Keamanan:** Login menggunakan PIN sederhana (4-6 digit).
- **Dashboard Meja:** Tampilan *grid* semua meja dengan indikator warna status:
  - **Hijau:** Kosong (Available)
  - **Merah:** Sedang Main (Occupied) + timer berjalan *real-time*
  - **Kuning:** Dibooking (Booked)
- **Aksi Cepat Meja:** Mulai Main (Walk-in: Open Table / Paket Jam), Pindah Meja, Tambah Waktu, Selesai & Bayar.
- **Antrean Booking:** Daftar booking masuk dari web dengan tombol **Terima** (generate ID Pelanggan) atau **Tolak**.
- **F&B (Makanan & Minuman):**
  - Kasir dapat menambahkan pesanan makanan/minuman ke dalam tagihan meja yang sedang berjalan.
  - Manajemen menu F&B (Tambah, Edit, Hapus menu dan harga) langsung di dalam aplikasi.
- **Pembayaran & Laporan:**
  - Pencatatan metode pembayaran: **Tunai, QRIS, Transfer**.
  - Tanpa cetak struk fisik (hanya tampilan ringkasan/struk digital di layar).
  - Rekap pendapatan harian otomatis yang dipisahkan per metode pembayaran.

## 6. Batasan / Non-Goals (Versi 1)
- **Tidak ada** integrasi saklar lampu meja otomatis (IoT).
- **Tidak ada** payment gateway otomatis (pembayaran transfer/QRIS dikonfirmasi manual).
- **Tidak ada** tarif dinamis siang/malam atau *weekend* (ditunda ke versi berikutnya).
- **Tidak ada** sistem membership/poin dan manajemen stok gudang F&B.