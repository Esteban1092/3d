const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const supabase = require('../config/db');
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
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      return cb(new Error('Formato de imagen no permitido (usa JPG, PNG, WEBP o GIF).'));
    }
    cb(null, true);
  }
});

router.post('/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna imagen.' });

    const ext = req.file.originalname.split('.').pop().toLowerCase();
    const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
    const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'product-images';
    const { error } = await supabase.storage.from(bucket).upload(filename, req.file.buffer, {
      contentType: req.file.mimetype,
      cacheControl: '31536000',
      upsert: false
    });
    if (error) throw error;

    const { data } = supabase.storage.from(bucket).getPublicUrl(filename);
    res.status(201).json({ image_url: data.publicUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo guardar la imagen en Supabase Storage.' });
  }
});

// ---------------------------------------------------------
// Listado completo (incluye inactivos) para el panel
// ---------------------------------------------------------
router.get('/products', async (req, res) => {
  try {
    const { data: products, error } = await supabase
      .from('products').select('*').order('created_at', { ascending: false });
    if (error) throw error;

    const authorIds = [...new Set(products.map((p) => p.user_id))];
    const { data: authors } = authorIds.length
      ? await supabase.from('users').select('id, name').in('id', authorIds)
      : { data: [] };
    const authorMap = new Map((authors || []).map((a) => [a.id, a.name]));

    res.json(products.map((p) => ({ ...p, author_name: authorMap.get(p.user_id) })));
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
      discount_percent = 0, shipping_cost = Number(process.env.SHIPPING_COST) || 90,
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

    const { data, error } = await supabase
      .from('products')
      .insert({
        user_id: adminUserId, category_id, title, description: description || '', image_url,
        base_price, discount_percent, iva_rate: ivaRate, shipping_cost,
        local_delivery_only: !!local_delivery_only
      })
      .select('id')
      .single();
    if (error) throw error;

    res.status(201).json({ id: data.id, message: 'Proyecto publicado.' });
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
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No se enviaron campos para actualizar.' });
    }
    if (updates.discount_percent !== undefined) {
      const d = Number(updates.discount_percent);
      if (isNaN(d) || d < 0 || d > 100) {
        return res.status(400).json({ error: 'El descuento debe ser un porcentaje entre 0 y 100.' });
      }
    }
    if (updates.base_price !== undefined) {
      const p = Number(updates.base_price);
      if (isNaN(p) || p < 0) {
        return res.status(400).json({ error: 'El precio debe ser un número válido.' });
      }
    }
    if (updates.local_delivery_only !== undefined) updates.local_delivery_only = !!updates.local_delivery_only;
    if (updates.is_active !== undefined) updates.is_active = !!updates.is_active;

    const { data, error } = await supabase
      .from('products').update(updates).eq('id', req.params.id).select('id');
    if (error) throw error;
    if (!data || data.length === 0) {
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
    const { data, error } = await supabase.from('products').delete().eq('id', req.params.id).select('id');
    if (error) throw error;
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Proyecto no encontrado.' });
    }
    res.json({ message: 'Proyecto eliminado.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar el proyecto.' });
  }
});

router.get('/suggestions', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('suggestions')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudieron cargar los consejos.' });
  }
});

router.patch('/suggestions/:id', async (req, res) => {
  try {
    const allowed = ['nuevo', 'leido', 'archivado'];
    if (!allowed.includes(req.body.status)) {
      return res.status(400).json({ error: 'Estado de consejo inválido.' });
    }
    const { data, error } = await supabase
      .from('suggestions')
      .update({ status: req.body.status })
      .eq('id', req.params.id)
      .select('id')
      .single();
    if (error) throw error;
    res.json({ id: data.id, message: 'Consejo actualizado.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo actualizar el consejo.' });
  }
});

module.exports = router;
