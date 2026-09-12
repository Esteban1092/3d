const express = require('express');
const pool = require('../config/db');
const { authRequired, authOptional } = require('../middleware/auth');

const router = express.Router();

function withPricing(product) {
  const base = Number(product.base_price);
  const discountPercent = Number(product.discount_percent) || 0;
  const iva = Number(product.iva_rate);
  const shipping = product.local_delivery_only ? 0 : Number(product.shipping_cost);
  const discountedBase = +(base * (1 - discountPercent / 100)).toFixed(2);
  const ivaAmount = +(discountedBase * iva).toFixed(2);
  const total = +(discountedBase + ivaAmount + shipping).toFixed(2);
  return {
    ...product,
    base_price: base,
    discount_percent: discountPercent,
    discounted_base_price: discountedBase,
    iva_amount: ivaAmount,
    shipping_cost: shipping,
    total_price: total
  };
}

// ---------------------------------------------------------
// GET /api/products  (feed tipo red social)
// ---------------------------------------------------------
router.get('/', authOptional, async (req, res) => {
  try {
    const userId = req.user ? req.user.id : 0;
    const [rows] = await pool.query(
      `SELECT p.*, u.name AS author_name, u.avatar_url AS author_avatar,
              (SELECT COUNT(*) FROM likes l WHERE l.product_id = p.id) AS likes_count,
              (SELECT COUNT(*) FROM comments c WHERE c.product_id = p.id) AS comments_count,
              EXISTS(SELECT 1 FROM likes l2 WHERE l2.product_id = p.id AND l2.user_id = ?) AS liked_by_me
       FROM products p
       JOIN users u ON u.id = p.user_id
       WHERE p.is_active = 1
       ORDER BY p.created_at DESC`,
      [userId]
    );
    res.json(rows.map(withPricing));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener los proyectos.' });
  }
});

// ---------------------------------------------------------
// GET /api/products/:id
// ---------------------------------------------------------
router.get('/:id', authOptional, async (req, res) => {
  try {
    const userId = req.user ? req.user.id : 0;
    const [rows] = await pool.query(
      `SELECT p.*, u.name AS author_name, u.avatar_url AS author_avatar,
              (SELECT COUNT(*) FROM likes l WHERE l.product_id = p.id) AS likes_count,
              (SELECT COUNT(*) FROM comments c WHERE c.product_id = p.id) AS comments_count,
              EXISTS(SELECT 1 FROM likes l2 WHERE l2.product_id = p.id AND l2.user_id = ?) AS liked_by_me
       FROM products p
       JOIN users u ON u.id = p.user_id
       WHERE p.id = ?`,
      [userId, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Proyecto no encontrado.' });

    const [comments] = await pool.query(
      `SELECT c.id, c.content, c.created_at, u.name AS author_name, u.avatar_url AS author_avatar
       FROM comments c JOIN users u ON u.id = c.user_id
       WHERE c.product_id = ? ORDER BY c.created_at ASC`,
      [req.params.id]
    );

    res.json({ ...withPricing(rows[0]), comments });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener el proyecto.' });
  }
});

// ---------------------------------------------------------
// POST /api/products  (publicar un proyecto 3D)
// ---------------------------------------------------------
router.post('/', authRequired, async (req, res) => {
  try {
    const {
      title, description, image_url, base_price,
      shipping_cost = 0, local_delivery_only = 0, category_id = null
    } = req.body;

    if (!title || !image_url || base_price === undefined) {
      return res.status(400).json({ error: 'Título, imagen y precio son obligatorios.' });
    }
    if (isNaN(Number(base_price)) || Number(base_price) < 0) {
      return res.status(400).json({ error: 'El precio debe ser un número válido.' });
    }

    const ivaRate = Number(process.env.IVA_RATE) || 0.16;

    const [result] = await pool.query(
      `INSERT INTO products
       (user_id, category_id, title, description, image_url, base_price, iva_rate, shipping_cost, local_delivery_only)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, category_id, title, description || '', image_url, base_price, ivaRate, shipping_cost, local_delivery_only ? 1 : 0]
    );

    res.status(201).json({ id: result.insertId, message: 'Proyecto publicado.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al publicar el proyecto.' });
  }
});

// ---------------------------------------------------------
// POST /api/products/:id/like  (toggle like)
// ---------------------------------------------------------
router.post('/:id/like', authRequired, async (req, res) => {
  try {
    const productId = req.params.id;
    const [existing] = await pool.query(
      'SELECT id FROM likes WHERE user_id = ? AND product_id = ?',
      [req.user.id, productId]
    );

    if (existing.length > 0) {
      await pool.query('DELETE FROM likes WHERE id = ?', [existing[0].id]);
      return res.json({ liked: false });
    }

    await pool.query('INSERT INTO likes (user_id, product_id) VALUES (?, ?)', [req.user.id, productId]);
    res.json({ liked: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al procesar el like.' });
  }
});

// ---------------------------------------------------------
// POST /api/products/:id/comments
// ---------------------------------------------------------
router.post('/:id/comments', authRequired, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'El comentario no puede estar vacío.' });
    }
    if (content.length > 500) {
      return res.status(400).json({ error: 'El comentario es demasiado largo.' });
    }

    const [result] = await pool.query(
      'INSERT INTO comments (user_id, product_id, content) VALUES (?, ?, ?)',
      [req.user.id, req.params.id, content.trim()]
    );

    res.status(201).json({ id: result.insertId, message: 'Comentario agregado.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al agregar el comentario.' });
  }
});

module.exports = router;
