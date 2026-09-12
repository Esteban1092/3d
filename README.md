# 3D Market

Red social / marketplace de proyectos 3D con likes, comentarios, cotización de envíos (con IVA), donaciones, login seguro y chatbot con IA. Diseño "liquid glass" responsive (móvil, tablet y escritorio).

## ⚠️ Seguridad — importante antes de empezar

- La API key de OpenRouter que compartiste en el chat quedó **expuesta**. Entra a OpenRouter, **revócala** y genera una nueva.
- La nueva key va **solo** en `backend/.env` (nunca en el frontend ni en el HTML/JS que se sirve al navegador).
- `backend/.env` está en `.gitignore`: no lo subas a GitHub.

## Estructura

```
3d-market/
  sql/schema.sql        -> Script de creación de la base de datos (MySQL)
  backend/               -> API en Node.js + Express + MySQL
  frontend/              -> HTML/CSS/JS (sin frameworks), diseño liquid glass
```

## 1. Base de datos

1. Instala MySQL (o usa uno existente).
2. Ejecuta el script:
   ```bash
   mysql -u root -p < sql/schema.sql
   ```
   Esto crea la base `marketplace3d` con tablas de usuarios, productos, likes, comentarios, donaciones, cotizaciones y tokens de verificación/recuperación.

## 2. Backend

```bash
cd backend
cp .env.example .env
# Edita .env con tus datos reales (DB, Gmail, OpenRouter, etc.)
npm install
npm run dev   # o: npm start
```

Variables importantes en `.env`:
- `DB_*`: credenciales de MySQL.
- `JWT_SECRET`: cadena aleatoria larga (usa `openssl rand -hex 32`).
- `GMAIL_USER` / `GMAIL_APP_PASSWORD`: para enviar correos de verificación y recuperación. Genera una "contraseña de aplicación" en tu cuenta de Gmail (con verificación en 2 pasos activada).
- `OPENROUTER_API_KEY`: tu key nueva de OpenRouter (revoca la anterior).
- `WHATSAPP_NUMBER`: ya configurado con `525529476336`.

El servidor corre por defecto en `http://localhost:4000`.

## 3. Frontend

No requiere build. Solo ábrelo con un servidor estático (Live Server de VS Code, o):

```bash
cd frontend
npx serve .
```

Edita `frontend/js/config.js` si tu backend corre en otra URL/puerto.

## Funcionalidades incluidas

- **Login/registro** con verificación por correo (Gmail), contraseña con "ojito" para mostrar/ocultar, medidor de fuerza de contraseña, y flujo de "olvidé mi contraseña".
- **Feed tipo red social**: cada proyecto 3D tiene imagen, descripción, precio base + IVA + envío, likes y comentarios.
- **Reglas de envío**: entrega local gratis solo en el **Centro de Chalco, EDOMEX**; cualquier otra entrega se cobra como envío.
- **Cotización**: formulario que calcula el total y genera un enlace directo de WhatsApp al **55 2947 6336**.
- **Donaciones**: formulario para registrar la intención de donar (para cobros reales, integra una pasarela de pago como Stripe o Mercado Pago).
- **Chatbot con IA** (vía OpenRouter): conoce el catálogo, las reglas de precios/envío/IVA, el área de entrega local y el número de WhatsApp.
- **Diseño "liquid glass"**: navbar flotante con blur y animaciones, tarjetas con glassmorphism, fondo animado, todo responsive (celular, tablet, escritorio).

## Pendientes recomendados para producción

- Integrar una pasarela de pago real para donaciones y compras.
- Subida de imágenes a un storage (ej. Cloudinary/S3) en vez de solo URL.
- HTTPS y dominio propio.
- Panel de administración para moderar productos/comentarios.
