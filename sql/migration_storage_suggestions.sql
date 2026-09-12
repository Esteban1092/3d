-- Ejecuta esto en Supabase SQL Editor.

-- Bucket público para que las imágenes no se borren al hacer redeploy en Render.
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Consejos de la comunidad.
CREATE TABLE IF NOT EXISTS suggestions (
  id          BIGSERIAL PRIMARY KEY,
  name        VARCHAR(100),
  email       VARCHAR(150),
  message     VARCHAR(1000) NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'nuevo' CHECK (status IN ('nuevo', 'leido', 'archivado')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "suggestions_insert_public" ON suggestions;
CREATE POLICY "suggestions_insert_public" ON suggestions
  FOR INSERT WITH CHECK (true);

-- El admin consulta mediante service_role desde el backend.
