# Database Schema - Onesticx Billiard (Supabase / PostgreSQL)

## 1. Tabel `tables` (Daftar Meja)
Menyimpan daftar meja billiard beserta tarif per jam dan freetime per menit.
- `id`: UUID (Primary Key)
- `name`: TEXT (Contoh: "Meja 1", "Meja 2", "High Table 1")
- `category`: TEXT (`indoor` | `outdoor` | `high_table`)
- `hourly_rate`: INTEGER (Indoor: 50000, Outdoor: 40000, High Table: 100000)
- `minute_rate`: INTEGER (Indoor: 950, Outdoor: 750, High Table: 2000)
- `status`: TEXT (`available` | `occupied` | `booked`) - Default: `available`
- `sort_order`: INTEGER (Untuk urutan tampilan di grid)

## 2. Tabel `bookings` (Booking Online dari Web)
Menyimpan pesanan meja dari pelanggan sebelum maupun sesudah dikonfirmasi kasir.
- `id`: UUID (Primary Key)
- `booking_code`: TEXT (Unique, contoh: `ONS-1024` — berfungsi sebagai ID Pelanggan)
- `table_id`: UUID (Foreign Key -> `tables.id`)
- `customer_name`: TEXT
- `whatsapp_number`: TEXT
- `booking_date`: DATE
- `start_time`: TIME
- `duration_hours`: INTEGER
- `total_price`: INTEGER
- `status`: TEXT (`pending` | `confirmed` | `rejected` | `cancelled` | `completed`) - Default: `pending`
- `created_at`: TIMESTAMP

## 3. Tabel `sessions` (Sesi Main & Transaksi Kasir)
Mencatat setiap sesi permainan yang berjalan (baik Walk-in maupun dari Booking) hingga selesai bayar.
- `id`: UUID (Primary Key)
- `table_id`: UUID (Foreign Key -> `tables.id`)
- `booking_id`: UUID (Nullable, Foreign Key -> `bookings.id`)
- `customer_name`: TEXT
- `billing_mode`: TEXT (`open_table` | `package`)
- `start_time`: TIMESTAMP (Waktu mulai timer)
- `end_time`: TIMESTAMP (Nullable, diisi saat selesai main)
- `duration_minutes`: INTEGER (Total menit bermain)
- `table_cost`: INTEGER (Biaya sewa meja)
- `fnb_cost`: INTEGER (Total biaya F&B) - Default: 0
- `discount_amount`: INTEGER (Diskon manual dari kasir dalam Rupiah) - Default: 0
- `total_amount`: INTEGER (`table_cost + fnb_cost - discount_amount`)
- `payment_method`: TEXT (Nullable: `tunai` | `qris` | `transfer`)
- `status`: TEXT (`active` | `completed`) - Default: `active`
- `created_at`: TIMESTAMP

## 4. Tabel `fnb_items` (Menu Makanan & Minuman)
- `id`: UUID (Primary Key)
- `name`: TEXT (Contoh: "Es Teh Manis", "Indomie Goreng")
- `category`: TEXT (`makanan` | `minuman` | `snack`)
- `price`: INTEGER
- `is_available`: BOOLEAN - Default: `true`

## 5. Tabel `session_fnb_orders` (Pesanan F&B per Meja)
Menghubungkan pesanan F&B ke tagihan meja yang sedang aktif.
- `id`: UUID (Primary Key)
- `session_id`: UUID (Foreign Key -> `sessions.id`, ON DELETE CASCADE)
- `fnb_item_id`: UUID (Foreign Key -> `fnb_items.id`)
- `item_name`: TEXT (Snapshot nama menu saat dipesan)
- `quantity`: INTEGER
- `unit_price`: INTEGER (Snapshot harga saat dipesan)
- `subtotal`: INTEGER (`quantity * unit_price`)
- `created_at`: TIMESTAMP

## 6. Tabel `app_settings` (Pengaturan Toko)
Menyimpan konfigurasi dinamis agar kasir bisa ubah tanpa edit kode.
- `key`: TEXT (Primary Key: `kasir_pin`, `whatsapp_kasir`, `bank_name`, `bank_account`, `bank_holder`)
- `value`: TEXT