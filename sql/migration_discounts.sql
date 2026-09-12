-- =========================================================
-- Migración: agrega descuentos a productos existentes
-- =========================================================

-- --- MySQL ---
-- ALTER TABLE products
--   ADD COLUMN discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0.00 AFTER base_price;

-- --- PostgreSQL / Supabase ---
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0.00
  CHECK (discount_percent BETWEEN 0 AND 100);
