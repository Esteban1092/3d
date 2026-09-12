-- =========================================================
-- 3D Market - Esquema Postgres para Supabase
-- (tablas propias con login/JWT manejado por nuestro backend,
--  NO usa Supabase Auth; así el backend puede seguir emitiendo
--  sus propios tokens y correos de verificación por Gmail)
-- Ejecuta esto completo en el SQL Editor de Supabase.
-- =========================================================

-- Limpia cualquier intento anterior (p.ej. el esquema basado en Supabase Auth)
-- que no coincide con lo que usa el backend actual.
DROP TABLE IF EXISTS chatbot_messages CASCADE;
DROP TABLE IF EXISTS quote_requests CASCADE;
DROP TABLE IF EXISTS donations CASCADE;
DROP TABLE IF EXISTS comments CASCADE;
DROP TABLE IF EXISTS likes CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS password_resets CASCADE;
DROP TABLE IF EXISTS email_verifications CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE users (
  id              BIGSERIAL PRIMARY KEY,
  name            VARCHAR(100) NOT NULL,
  email           VARCHAR(150) NOT NULL UNIQUE,
  password_hash   VARCHAR(255) NOT NULL,
  avatar_url      VARCHAR(255),
  role            VARCHAR(20) NOT NULL DEFAULT 'cliente' CHECK (role IN ('cliente','admin')),
  is_verified     BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE email_verifications (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       VARCHAR(255) NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE password_resets (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       VARCHAR(255) NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used        BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE categories (
  id    BIGSERIAL PRIMARY KEY,
  name  VARCHAR(80) NOT NULL UNIQUE
);

CREATE TABLE products (
  id                  BIGSERIAL PRIMARY KEY,
  user_id             BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id         BIGINT REFERENCES categories(id) ON DELETE SET NULL,
  title               VARCHAR(150) NOT NULL,
  description         TEXT,
  image_url           VARCHAR(255) NOT NULL,
  base_price          NUMERIC(10,2) NOT NULL CHECK (base_price >= 0),
  discount_percent    NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (discount_percent BETWEEN 0 AND 100),
  iva_rate            NUMERIC(4,3) NOT NULL DEFAULT 0.160,
  shipping_cost       NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  local_delivery_only BOOLEAN NOT NULL DEFAULT false,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE likes (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id  BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);

CREATE TABLE comments (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id  BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  content     VARCHAR(500) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE donations (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT REFERENCES users(id) ON DELETE SET NULL,
  donor_name    VARCHAR(120),
  amount        NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  message       VARCHAR(300),
  status        VARCHAR(20) NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente','completada','fallida')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE quote_requests (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT REFERENCES users(id) ON DELETE SET NULL,
  product_id      BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  full_name       VARCHAR(120) NOT NULL,
  phone           VARCHAR(20) NOT NULL,
  delivery_type   VARCHAR(20) NOT NULL CHECK (delivery_type IN ('local_chalco','envio')),
  address         VARCHAR(255),
  total_estimate  NUMERIC(10,2) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'nueva' CHECK (status IN ('nueva','contactada','cerrada')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE chatbot_messages (
  id          BIGSERIAL PRIMARY KEY,
  session_id  VARCHAR(100) NOT NULL,
  role        VARCHAR(20) NOT NULL CHECK (role IN ('user','assistant')),
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- El backend usa la service role key (bypassa RLS), así que dejamos RLS
-- activado con "sin políticas" para bloquear cualquier acceso directo
-- con la anon key desde el navegador.
ALTER TABLE users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_resets     ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories          ENABLE ROW LEVEL SECURITY;
ALTER TABLE products            ENABLE ROW LEVEL SECURITY;
ALTER TABLE likes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE donations            ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_requests        ENABLE ROW LEVEL SECURITY;
ALTER TABLE chatbot_messages       ENABLE ROW LEVEL SECURITY;

-- Datos base
INSERT INTO categories (name) VALUES
  ('Figuras coleccionables'), ('Piezas funcionales'), ('Decoración'), ('Prototipos')
ON CONFLICT (name) DO NOTHING;

-- Usuario admin "sistema" para que los productos publicados desde el panel
-- tengan un autor válido (coincide con ADMIN_USER_ID=1 en .env)
INSERT INTO users (id, name, email, password_hash, role, is_verified)
VALUES (1, 'Admin 3D Market', 'admin@3dmarket.com', 'no-login-desde-este-usuario', 'admin', true)
ON CONFLICT (id) DO NOTHING;
SELECT setval(pg_get_serial_sequence('users','id'), GREATEST((SELECT MAX(id) FROM users), 1));
