-- =========================================================
-- 3D Market - Esquema para Supabase (PostgreSQL)
-- Ejecuta esto en el SQL Editor de tu proyecto de Supabase.
-- =========================================================

-- ---------------------------------------------------------
-- Tipos (enums)
-- ---------------------------------------------------------
CREATE TYPE user_role AS ENUM ('cliente', 'admin');
CREATE TYPE donation_status AS ENUM ('pendiente', 'completada', 'fallida');
CREATE TYPE delivery_type AS ENUM ('local_chalco', 'envio');
CREATE TYPE quote_status AS ENUM ('nueva', 'contactada', 'cerrada');
CREATE TYPE chat_role AS ENUM ('user', 'assistant');

-- Función genérica para actualizar updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------
-- Usuarios (perfil propio; el login real lo maneja Supabase Auth)
-- id = mismo UUID que auth.users.id
-- ---------------------------------------------------------
CREATE TABLE profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  avatar_url    VARCHAR(255),
  role          user_role NOT NULL DEFAULT 'cliente',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_profiles_updated_at
BEFORE UPDATE ON profiles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Crea automáticamente el perfil cuando alguien se registra con Supabase Auth
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)), NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ---------------------------------------------------------
-- Categorías
-- ---------------------------------------------------------
CREATE TABLE categories (
  id    BIGSERIAL PRIMARY KEY,
  name  VARCHAR(80) NOT NULL UNIQUE
);

-- ---------------------------------------------------------
-- Productos / Proyectos 3D
-- ---------------------------------------------------------
CREATE TABLE products (
  id                  BIGSERIAL PRIMARY KEY,
  user_id             UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category_id         BIGINT REFERENCES categories(id) ON DELETE SET NULL,
  title               VARCHAR(150) NOT NULL,
  description         TEXT,
  image_url           VARCHAR(255) NOT NULL,
  base_price          NUMERIC(10,2) NOT NULL CHECK (base_price >= 0),
  discount_percent    NUMERIC(5,2)  NOT NULL DEFAULT 0.00 CHECK (discount_percent BETWEEN 0 AND 100),
  iva_rate            NUMERIC(4,3)  NOT NULL DEFAULT 0.160,
  shipping_cost       NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  local_delivery_only BOOLEAN NOT NULL DEFAULT false,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_products_updated_at
BEFORE UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- total = base_price * (1 - discount_percent/100) * (1 + iva_rate) + shipping_cost (se calcula en la app)

-- ---------------------------------------------------------
-- Likes
-- ---------------------------------------------------------
CREATE TABLE likes (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_id  BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);

-- ---------------------------------------------------------
-- Comentarios
-- ---------------------------------------------------------
CREATE TABLE comments (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_id  BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  content     VARCHAR(500) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------
-- Donaciones
-- ---------------------------------------------------------
CREATE TABLE donations (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  donor_name    VARCHAR(120),
  amount        NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  message       VARCHAR(300),
  status        donation_status NOT NULL DEFAULT 'pendiente',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------
-- Cotizaciones / pedidos
-- ---------------------------------------------------------
CREATE TABLE quote_requests (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID REFERENCES profiles(id) ON DELETE SET NULL,
  product_id      BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  full_name       VARCHAR(120) NOT NULL,
  phone           VARCHAR(20) NOT NULL,
  delivery_type   delivery_type NOT NULL,
  address         VARCHAR(255),
  total_estimate  NUMERIC(10,2) NOT NULL,
  status          quote_status NOT NULL DEFAULT 'nueva',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------
-- Historial del chatbot
-- ---------------------------------------------------------
CREATE TABLE chatbot_messages (
  id          BIGSERIAL PRIMARY KEY,
  session_id  VARCHAR(100) NOT NULL,
  role        chat_role NOT NULL,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================================================
-- ROW LEVEL SECURITY
-- Tu URL expone la base directo vía REST (PostgREST), así que
-- SIN estas políticas cualquiera con la anon key podría leer/escribir todo.
-- =========================================================
ALTER TABLE profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories        ENABLE ROW LEVEL SECURITY;
ALTER TABLE products          ENABLE ROW LEVEL SECURITY;
ALTER TABLE likes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE donations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_requests    ENABLE ROW LEVEL SECURITY;
ALTER TABLE chatbot_messages  ENABLE ROW LEVEL SECURITY;

-- Perfiles: lectura pública, edición solo del dueño
CREATE POLICY "profiles_select_public" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Categorías: lectura pública, sin escritura desde el cliente
CREATE POLICY "categories_select_public" ON categories FOR SELECT USING (true);

-- Productos: lectura pública de los activos; solo el dueño crea/edita/borra los suyos
CREATE POLICY "products_select_active" ON products FOR SELECT USING (is_active = true);
CREATE POLICY "products_insert_own" ON products FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "products_update_own" ON products FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "products_delete_own" ON products FOR DELETE USING (auth.uid() = user_id);

-- Likes: lectura pública; el usuario solo gestiona sus propios likes
CREATE POLICY "likes_select_public" ON likes FOR SELECT USING (true);
CREATE POLICY "likes_insert_own" ON likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "likes_delete_own" ON likes FOR DELETE USING (auth.uid() = user_id);

-- Comentarios: lectura pública; solo el autor crea/borra los suyos
CREATE POLICY "comments_select_public" ON comments FOR SELECT USING (true);
CREATE POLICY "comments_insert_own" ON comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "comments_delete_own" ON comments FOR DELETE USING (auth.uid() = user_id);

-- Donaciones: cualquiera autenticado o anónimo puede insertar; solo el dueño ve las suyas
CREATE POLICY "donations_insert_any" ON donations FOR INSERT WITH CHECK (true);
CREATE POLICY "donations_select_own" ON donations FOR SELECT USING (auth.uid() = user_id);

-- Cotizaciones: cualquiera puede insertar; solo el dueño ve las suyas
CREATE POLICY "quotes_insert_any" ON quote_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "quotes_select_own" ON quote_requests FOR SELECT USING (auth.uid() = user_id);

-- Chat: sin acceso directo desde el cliente (solo backend con service role)
-- (no se crean políticas => acceso denegado por defecto para anon/authenticated)

-- ---------------------------------------------------------
-- Datos de ejemplo
-- ---------------------------------------------------------
INSERT INTO categories (name) VALUES
  ('Figuras coleccionables'),
  ('Piezas funcionales'),
  ('Decoración'),
  ('Prototipos');
