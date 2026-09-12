-- =========================================================
-- 3D Market - Esquema de Base de Datos (MySQL 8+)
-- =========================================================
CREATE DATABASE IF NOT EXISTS marketplace3d
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE marketplace3d;

-- ---------------------------------------------------------
-- Usuarios
-- ---------------------------------------------------------
CREATE TABLE users (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  name              VARCHAR(100)  NOT NULL,
  email             VARCHAR(150)  NOT NULL UNIQUE,
  password_hash     VARCHAR(255)  NOT NULL,
  avatar_url        VARCHAR(255)  DEFAULT NULL,
  role              ENUM('cliente','admin') NOT NULL DEFAULT 'cliente',
  is_verified       TINYINT(1)    NOT NULL DEFAULT 0,
  created_at        TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Tokens de verificación de correo (registro)
CREATE TABLE email_verifications (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  token       VARCHAR(255) NOT NULL,
  expires_at  DATETIME NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Tokens de recuperación de contraseña ("olvidé mi contraseña")
CREATE TABLE password_resets (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  token       VARCHAR(255) NOT NULL,
  expires_at  DATETIME NOT NULL,
  used        TINYINT(1) NOT NULL DEFAULT 0,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------
-- Categorías de proyectos 3D (opcional, para el catálogo del bot)
-- ---------------------------------------------------------
CREATE TABLE categories (
  id    INT AUTO_INCREMENT PRIMARY KEY,
  name  VARCHAR(80) NOT NULL UNIQUE
) ENGINE=InnoDB;

-- ---------------------------------------------------------
-- Productos / Proyectos 3D
-- ---------------------------------------------------------
CREATE TABLE products (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  user_id             INT NOT NULL,               -- autor/publicador del proyecto
  category_id         INT DEFAULT NULL,
  title               VARCHAR(150) NOT NULL,
  description         TEXT,
  image_url           VARCHAR(255) NOT NULL,
  base_price          DECIMAL(10,2) NOT NULL,      -- precio del producto sin envío ni iva
  discount_percent    DECIMAL(5,2)  NOT NULL DEFAULT 0.00, -- % de descuento sobre el precio base
  iva_rate            DECIMAL(4,3)  NOT NULL DEFAULT 0.160, -- 16% IVA México por defecto
  shipping_cost       DECIMAL(10,2) NOT NULL DEFAULT 0.00,  -- costo de envío foráneo
  local_delivery_only TINYINT(1)   NOT NULL DEFAULT 0,      -- 1 = solo entrega local Chalco
  is_active           TINYINT(1)   NOT NULL DEFAULT 1,
  created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Columna calculada de solo lectura para precio total (precio con descuento + iva + envío)
-- (se calcula en la app; se deja documentado aquí)
-- total = base_price * (1 - discount_percent/100) * (1 + iva_rate) + shipping_cost

-- ---------------------------------------------------------
-- Likes
-- ---------------------------------------------------------
CREATE TABLE likes (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  product_id  INT NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_like (user_id, product_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------
-- Comentarios
-- ---------------------------------------------------------
CREATE TABLE comments (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  product_id  INT NOT NULL,
  content     VARCHAR(500) NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------
-- Donaciones
-- ---------------------------------------------------------
CREATE TABLE donations (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT DEFAULT NULL,           -- NULL = donación anónima
  donor_name    VARCHAR(120) DEFAULT NULL,
  amount        DECIMAL(10,2) NOT NULL,
  message       VARCHAR(300) DEFAULT NULL,
  status        ENUM('pendiente','completada','fallida') NOT NULL DEFAULT 'pendiente',
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------
-- Cotizaciones / pedidos (envío + iva calculados, contacto por WhatsApp)
-- ---------------------------------------------------------
CREATE TABLE quote_requests (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  user_id         INT DEFAULT NULL,
  product_id      INT NOT NULL,
  full_name       VARCHAR(120) NOT NULL,
  phone           VARCHAR(20)  NOT NULL,
  delivery_type   ENUM('local_chalco','envio') NOT NULL,
  address         VARCHAR(255) DEFAULT NULL,
  total_estimate  DECIMAL(10,2) NOT NULL,
  status          ENUM('nueva','contactada','cerrada') NOT NULL DEFAULT 'nueva',
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------
-- Historial del chatbot (opcional, para auditoría)
-- ---------------------------------------------------------
CREATE TABLE chatbot_messages (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  session_id  VARCHAR(100) NOT NULL,
  role        ENUM('user','assistant') NOT NULL,
  content     TEXT NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------------------------------------------------------
-- Datos de ejemplo (seed)
-- ---------------------------------------------------------
INSERT INTO categories (name) VALUES
  ('Figuras coleccionables'),
  ('Piezas funcionales'),
  ('Decoración'),
  ('Prototipos');

INSERT INTO users (name, email, password_hash, role, is_verified) VALUES
  ('Admin 3D Market', 'admin@3dmarket.com', '$2b$10$CHANGE_THIS_HASH', 'admin', 1);
