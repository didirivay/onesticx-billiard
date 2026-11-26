-- ============================================================================
-- Onesticx Billiard — Skema Database Supabase (PostgreSQL)
-- Mengacu pada: docs/DATABASE_SCHEMA.md, docs/PRD.md, docs/ARCHITECTURE.md
-- Aman dijalankan ulang (idempotent).
-- ============================================================================

-- Ekstensi UUID bawaan PostgreSQL/Supabase
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 1. TABEL: tables (Daftar Meja)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL CHECK (category IN ('indoor', 'outdoor', 'high_table')),
  hourly_rate INTEGER NOT NULL CHECK (hourly_rate >= 0),
  minute_rate INTEGER NOT NULL CHECK (minute_rate >= 0),
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'occupied', 'booked')),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_tables_sort_order
  ON public.tables (sort_order);

-- ============================================================================
-- 2. TABEL: bookings (Booking Online dari Web)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_code TEXT NOT NULL UNIQUE,
  table_id UUID NOT NULL REFERENCES public.tables(id) ON DELETE RESTRICT,
  customer_name TEXT NOT NULL,
  whatsapp_number TEXT NOT NULL,
  booking_date DATE NOT NULL,
  start_time TIME NOT NULL,
  duration_hours INTEGER NOT NULL CHECK (duration_hours > 0),
  total_price INTEGER NOT NULL CHECK (total_price >= 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'rejected', 'cancelled', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookings_date_status
  ON public.bookings (booking_date, status);

CREATE INDEX IF NOT EXISTS idx_bookings_table_id
  ON public.bookings (table_id);

-- ============================================================================
-- 3. TABEL: sessions (Sesi Main & Transaksi Kasir)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES public.tables(id) ON DELETE RESTRICT,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  billing_mode TEXT NOT NULL CHECK (billing_mode IN ('open_table', 'package')),
  start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_time TIMESTAMPTZ,
  duration_minutes INTEGER NOT NULL DEFAULT 0 CHECK (duration_minutes >= 0),
  table_cost INTEGER NOT NULL DEFAULT 0 CHECK (table_cost >= 0),
  fnb_cost INTEGER NOT NULL DEFAULT 0 CHECK (fnb_cost >= 0),
  discount_amount INTEGER NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  total_amount INTEGER NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  payment_method TEXT
    CHECK (payment_method IS NULL OR payment_method IN ('tunai', 'qris', 'transfer')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_status
  ON public.sessions (status);

CREATE INDEX IF NOT EXISTS idx_sessions_table_status
  ON public.sessions (table_id, status);

CREATE INDEX IF NOT EXISTS idx_sessions_created_at
  ON public.sessions (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sessions_booking_id
  ON public.sessions (booking_id);

-- ============================================================================
-- 4. TABEL: fnb_items (Menu Makanan & Minuman)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.fnb_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('makanan', 'minuman', 'snack')),
  price INTEGER NOT NULL CHECK (price >= 0),
  is_available BOOLEAN NOT NULL DEFAULT true
);

-- ============================================================================
-- 5. TABEL: session_fnb_orders (Pesanan F&B per Meja)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.session_fnb_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  fnb_item_id UUID REFERENCES public.fnb_items(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
  subtotal INTEGER NOT NULL CHECK (subtotal >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_fnb_orders_session_id
  ON public.session_fnb_orders (session_id);

CREATE INDEX IF NOT EXISTS idx_session_fnb_orders_fnb_item_id
  ON public.session_fnb_orders (fnb_item_id);

-- ============================================================================
-- 6. TABEL: app_settings (Pengaturan Toko)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ============================================================================
-- 7. ROW LEVEL SECURITY (RLS)
--    - Publik (anon) hanya bisa membaca daftar meja, jadwal booking (untuk
--      Realtime & status meja), serta info pembayaran non-sensitif.
--    - PIN kasir (kasir_pin) TIDAK diekspos ke anon.
--    - Semua penulisan data & akses kasir diproses melalui server Next.js
--      menggunakan SUPABASE_SERVICE_ROLE_KEY.
-- ============================================================================
ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fnb_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_fnb_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON public.tables TO anon, authenticated;
GRANT SELECT, INSERT ON public.bookings TO anon, authenticated;
GRANT SELECT ON public.app_settings TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tables, public.bookings, public.sessions, public.fnb_items, public.session_fnb_orders, public.app_settings TO service_role;

DROP POLICY IF EXISTS "Publik dapat melihat daftar meja" ON public.tables;
CREATE POLICY "Publik dapat melihat daftar meja"
  ON public.tables
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Publik dapat melihat daftar booking" ON public.bookings;
CREATE POLICY "Publik dapat melihat daftar booking"
  ON public.bookings
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Publik dapat membuat booking pending" ON public.bookings;
CREATE POLICY "Publik dapat membuat booking pending"
  ON public.bookings
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    status = 'pending'
    AND duration_hours BETWEEN 1 AND 12
    AND length(trim(customer_name)) >= 2
    AND length(trim(whatsapp_number)) >= 8
    AND booking_code ~ '^ONS-[A-Z0-9]{4,8}$'
    AND EXISTS (
      SELECT 1
      FROM public.tables t
      WHERE t.id = table_id
        AND total_price = t.hourly_rate * duration_hours
    )
  );

DROP POLICY IF EXISTS "Publik dapat melihat pengaturan pembayaran" ON public.app_settings;
CREATE POLICY "Publik dapat melihat pengaturan pembayaran"
  ON public.app_settings
  FOR SELECT
  TO anon, authenticated
  USING (key IN ('whatsapp_kasir', 'bank_name', 'bank_account', 'bank_holder', 'promo_discounts'));

-- ============================================================================
-- 8. AKTIFKAN SUPABASE REALTIME PADA TABEL tables DAN bookings
-- ============================================================================
ALTER TABLE public.tables REPLICA IDENTITY FULL;
ALTER TABLE public.bookings REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'tables'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tables;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'bookings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
  END IF;
END $$;

-- ============================================================================
-- 9. SEED DATA AWAL
--    - 6 Meja Indoor (Rp 50.000/jam, Rp 950/menit)
--    - 1 High Table (Rp 100.000/jam, Rp 2.000/menit)
--    - Pengaturan default di app_settings
-- ============================================================================
INSERT INTO public.tables (name, category, hourly_rate, minute_rate, status, sort_order)
VALUES
  ('Meja 1', 'indoor', 50000, 950, 'available', 1),
  ('Meja 2', 'indoor', 50000, 950, 'available', 2),
  ('Meja 3', 'indoor', 50000, 950, 'available', 3),
  ('Meja 4', 'indoor', 50000, 950, 'available', 4),
  ('Meja 5', 'indoor', 50000, 950, 'available', 5),
  ('Meja 6', 'indoor', 50000, 950, 'available', 6),
  ('High Table 1', 'high_table', 100000, 2000, 'available', 7)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.app_settings (key, value)
VALUES
  ('kasir_pin', '123456'),
  ('whatsapp_kasir', '6281234567890'),
  ('bank_name', 'BSI'),
  ('bank_account', '123456789'),
  ('bank_holder', 'Onesticx Billiard')
ON CONFLICT (key) DO NOTHING;
