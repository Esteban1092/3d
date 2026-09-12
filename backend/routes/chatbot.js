const express = require('express');
const fetch = require('node-fetch');
const rateLimit = require('express-rate-limit');
const pool = require('../config/db');

const router = express.Router();

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  message: { error: 'Demasiados mensajes, espera un momento.' }
});

async function buildSystemPrompt() {
  const [products] = await pool.query(
    `SELECT title, base_price, shipping_cost, local_delivery_only
     FROM products WHERE is_active = 1 ORDER BY created_at DESC LIMIT 30`
  );

  const catalogText = products.length
    ? products
        .map((p) => {
          const iva = Number(process.env.IVA_RATE) || 0.16;
          const totalLocal = +(p.base_price * (1 + iva)).toFixed(2);
          const totalEnvio = +(p.base_price * (1 + iva) + Number(p.shipping_cost)).toFixed(2);
          return `- ${p.title}: $${Number(p.base_price).toFixed(2)} MXN + IVA. Entrega local Chalco: $${totalLocal} MXN. Con envío: $${totalEnvio} MXN.`;
        })
        .join('\n')
    : 'Aún no hay proyectos publicados en el catálogo.';

  return `Eres el asistente virtual de "3D Market", una red social/marketplace de proyectos e impresiones 3D.

QUIÉN SOY:
3D Market es un espacio donde los creadores publican sus proyectos 3D (fotos, precio, likes y comentarios), y los clientes pueden ver, comentar, dar like, cotizar y comprar piezas impresas en 3D, o donar para apoyar el proyecto.

REGLAS DE PRECIOS Y ENVÍOS:
- Todos los precios llevan IVA (${((Number(process.env.IVA_RATE) || 0.16) * 100).toFixed(0)}%).
- La entrega LOCAL es únicamente en el Centro de Chalco, Estado de México (EDOMEX), y NO tiene costo de envío.
- Cualquier entrega fuera del centro de Chalco se considera "envío" y tiene un costo adicional de envío (varía según el proyecto).
- Para cualquier cotización personalizada, el cliente debe contactar por WhatsApp al número 55 2947 6336 (enlace: https://wa.me/525529476336).

CATÁLOGO ACTUAL:
${catalogText}

INSTRUCCIONES:
- Responde en español, de forma breve, amable y clara.
- Si te preguntan por un precio, aclara que incluye IVA y que el envío se cobra aparte si no es entrega local en Chalco.
- Si el usuario quiere comprar o cotizar, invítalo a usar el botón de "Cotizar" en el proyecto o a escribir por WhatsApp al 55 2947 6336.
- No inventes productos que no estén en el catálogo.`;
}

// ---------------------------------------------------------
// POST /api/chatbot  { message, history: [{role, content}] }
// ---------------------------------------------------------
router.post('/', chatLimiter, async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'El mensaje no puede estar vacío.' });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey || apiKey.includes('coloca_aqui')) {
      return res.status(503).json({ error: 'El chatbot no está configurado todavía (falta OPENROUTER_API_KEY).' });
    }

    const systemPrompt = await buildSystemPrompt();

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-10).map((h) => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: String(h.content).slice(0, 1000) })),
      { role: 'user', content: message.slice(0, 1000) }
    ];

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.FRONTEND_URL || 'http://localhost',
        'X-Title': '3D Market'
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
        messages,
        temperature: 0.4
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('OpenRouter error:', errText);
      return res.status(502).json({ error: 'El asistente no está disponible en este momento.' });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content?.trim() || 'No pude generar una respuesta, intenta de nuevo.';

    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al procesar el mensaje del chatbot.' });
  }
});

module.exports = router;
