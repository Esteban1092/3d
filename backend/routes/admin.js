const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const pool = require('../config/db');
const adminAuth = require('../middleware/adminAuth');

const router = express.Router();

// Limita intentos de código admin para dificultar fuerza bruta sobre el PIN
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Demasiados intentos, intenta de nuevo más tarde.' }
});

router.use(adminLimiter, adminAuth);

// ---------------------------------------------------------
// Subida de imágenes
// ---------------------------------------------------------
const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      return cb(new Error('Formato de imagen no permitido (usa JPG, PNG, WEBP o GIF).'));
    }
    cb(null, true);
  }
});

router.post('/upload', (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna imagen.' });

    const publicUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    res.status(201).json({ image_url: publicUrl });
  });
});

// ---------------------------------------------------------
// Listado completo (incluye inactivos) para el panel
// ---------------------------------------------------------
router.get('/products', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.*, u.name AS author_name
       FROM products p JOIN users u ON u.id = p.user_id
       ORDER BY p.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener los proyectos.' });
  }
});

// ---------------------------------------------------------
// Crear producto (como admin)
// ---------------------------------------------------------
router.post('/products', async (req, res) => {
  try {
    const {
      title, description, image_url, base_price,
      discount_percent = 0, shipping_cost = 0,
      local_delivery_only = 0, category_id = null
    } = req.body;

    if (!title || !image_url || base_price === undefined) {
      return res.status(400).json({ error: 'Título, imagen y precio son obligatorios.' });
    }
    if (isNaN(Number(base_price)) || Number(base_price) < 0) {
      return res.status(400).json({ error: 'El precio debe ser un número válido.' });
    }
    if (isNaN(Number(discount_percent)) || Number(discount_percent) < 0 || Number(discount_percent) > 100) {
      return res.status(400).json({ error: 'El descuento debe ser un porcentaje entre 0 y 100.' });
    }

    const ivaRate = Number(process.env.IVA_RATE) || 0.16;
    const adminUserId = Number(process.env.ADMIN_USER_ID) || 1;

    const [result] = await pool.query(
      `INSERT INTO products
       (user_id, category_id, title, description, image_url, base_price, discount_percent, iva_rate, shipping_cost, local_delivery_only)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [adminUserId, category_id, title, description || '', image_url, base_price, discount_percent, ivaRate, shipping_cost, local_delivery_only ? 1 : 0]
    );

    res.status(201).json({ id: result.insertId, message: 'Proyecto publicado.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al publicar el proyecto.' });
  }
});

// ---------------------------------------------------------
// Editar producto: precio, descuento, envío, estado, etc.
// ---------------------------------------------------------
router.patch('/products/:id', async (req, res) => {
  try {
    const allowedFields = [
      'title', 'description', 'image_url', 'base_price',
      'discount_percent', 'shipping_cost', 'local_delivery_only', 'is_active', 'category_id'
    ];
    const updates = [];
    const values = [];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(req.body[field]);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No se enviaron campos para actualizar.' });
    }
    if (req.body.discount_percent !== undefined) {
      const d = Number(req.body.discount_percent);
      if (isNaN(d) || d < 0 || d > 100) {
        return res.status(400).json({ error: 'El descuento debe ser un porcentaje entre 0 y 100.' });
      }
    }
    if (req.body.base_price !== undefined) {
      const p = Number(req.body.base_price);
      if (isNaN(p) || p < 0) {
        return res.status(400).json({ error: 'El precio debe ser un número válido.' });
      }
    }

    values.push(req.params.id);
    const [result] = await pool.query(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`, values);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Proyecto no encontrado.' });
    }
    res.json({ message: 'Proyecto actualizado.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar el proyecto.' });
  }
});

// ---------------------------------------------------------
// Eliminar producto
// ---------------------------------------------------------
router.delete('/products/:id', async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM products WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Proyecto no encontrado.' });
    }
    res.json({ message: 'Proyecto eliminado.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar el proyecto.' });
  }
});

module.exports = router;
