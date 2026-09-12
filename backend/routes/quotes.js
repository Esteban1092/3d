const express = require('express');
const pool = require('../config/db');
const { authOptional } = require('../middleware/auth');

const router = express.Router();

// ---------------------------------------------------------
// POST /api/quotes  (solicitud de cotización -> luego contacto por WhatsApp)
// ---------------------------------------------------------
router.post('/', authOptional, async (req, res) => {
  try {
    const { product_id, full_name, phone, delivery_type, address } = req.body;

    if (!product_id || !full_name || !phone || !delivery_type) {
      return res.status(400).json({ error: 'Faltan datos obligatorios para la cotización.' });
    }
    if (!['local_chalco', 'envio'].includes(delivery_type)) {
      return res.status(400).json({ error: 'Tipo de entrega inválido.' });
    }
    if (delivery_type === 'envio' && !address) {
      return res.status(400).json({ error: 'La dirección es obligatoria para envío.' });
    }

    const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [product_id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Proyecto no encontrado.' });

    const product = rows[0];
    const base = Number(product.base_price);
    const discountPercent = Number(product.discount_percent) || 0;
    const discountedBase = base * (1 - discountPercent / 100);
    const iva = Number(product.iva_rate);
    const shipping = delivery_type === 'local_chalco' ? 0 : Number(product.shipping_cost);
    const total = +(discountedBase + discountedBase * iva + shipping).toFixed(2);

    const userId = req.user ? req.user.id : null;
    const [result] = await pool.query(
      `INSERT INTO quote_requests
       (user_id, product_id, full_name, phone, delivery_type, address, total_estimate)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, product_id, full_name, phone, delivery_type, address || null, total]
    );

    res.status(201).json({
      id: result.insertId,
      total_estimate: total,
      whatsapp_link: `https://wa.me/${process.env.WHATSAPP_NUMBER}?text=${encodeURIComponent(
        `Hola, quiero cotizar el proyecto "${product.title}" (folio #${result.insertId}). Total estimado: $${total} MXN.`
      )}`,
      message: 'Cotización registrada. Contáctanos por WhatsApp para confirmar tu pedido.'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al generar la cotización.' });
  }
});

module.exports = router;
