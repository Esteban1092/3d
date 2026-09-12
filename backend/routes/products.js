const express = require('express');
const supabase = require('../config/db');
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

// Agrega autor, conteos de likes/comentarios y si el usuario actual dio like
async function enrichProducts(products, userId) {
  const ids = products.map((p) => p.id);
  if (ids.length === 0) return [];

  const authorIds = [...new Set(products.map((p) => p.user_id))];
  const [{ data: authors }, { data: likeRows }, { data: commentRows }, { data: myLikes }] = await Promise.all([
    supabase.from('users').select('id, name, avatar_url').in('id', authorIds),
    supabase.from('likes').select('product_id').in('product_id', ids),
    supabase.from('comments').select('product_id').in('product_id', ids),
    userId ? supabase.from('likes').select('product_id').eq('user_id', userId).in('product_id', ids) : { data: [] }
  ]);

  const authorMap = new Map((authors || []).map((a) => [a.id, a]));
  const likeCounts = new Map();
  (likeRows || []).forEach((l) => likeCounts.set(l.product_id, (likeCounts.get(l.product_id) || 0) + 1));
  const commentCounts = new Map();
  (commentRows || []).forEach((c) => commentCounts.set(c.product_id, (commentCounts.get(c.product_id) || 0) + 1));
  const myLikedIds = new Set((myLikes || []).map((l) => l.product_id));

  return products.map((p) => {
    const author = authorMap.get(p.user_id) || {};
    return withPricing({
      ...p,
      author_name: author.name,
      author_avatar: author.avatar_url,
      likes_count: likeCounts.get(p.id) || 0,
      comments_count: commentCounts.get(p.id) || 0,
      liked_by_me: myLikedIds.has(p.id)
    });
  });
}

// ---------------------------------------------------------
// GET /api/products  (feed tipo red social)
// ---------------------------------------------------------
router.get('/', authOptional, async (req, res) => {
  try {
    const userId = req.user ? req.user.id : null;
    const { data: products, error } = await supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    if (error) throw error;

    res.json(await enrichProducts(products, userId));
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
    const userId = req.user ? req.user.id : null;
    const { data: product, error } = await supabase
      .from('products').select('*').eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!product) return res.status(404).json({ error: 'Proyecto no encontrado.' });

    const [enriched] = await enrichProducts([product], userId);

    const { data: comments, error: commentsErr } = await supabase
      .from('comments')
      .select('id, content, created_at, user_id')
      .eq('product_id', req.params.id)
      .order('created_at', { ascending: true });
    if (commentsErr) throw commentsErr;

    const commenterIds = [...new Set((comments || []).map((c) => c.user_id))];
    const { data: commenters } = commenterIds.length
      ? await supabase.from('users').select('id, name, avatar_url').in('id', commenterIds)
      : { data: [] };
    const commenterMap = new Map((commenters || []).map((u) => [u.id, u]));

    const commentsWithAuthor = (comments || []).map((c) => ({
      ...c,
      author_name: commenterMap.get(c.user_id)?.name,
      author_avatar: commenterMap.get(c.user_id)?.avatar_url
    }));

    res.json({ ...enriched, comments: commentsWithAuthor });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener el proyecto.' });
  }
});

// ---------------------------------------------------------
// POST /api/products  (publicar un proyecto 3D)
// ---------------------------------------------------------
// La creación de proyectos es exclusiva del panel de administración (ver routes/admin.js).
// Los usuarios normales solo pueden ver, dar like, comentar y cotizar.

// ---------------------------------------------------------
// POST /api/products/:id/like  (toggle like)
// ---------------------------------------------------------
router.post('/:id/like', authRequired, async (req, res) => {
  try {
    const productId = req.params.id;
    const { data: existing, error } = await supabase
      .from('likes').select('id').eq('user_id', req.user.id).eq('product_id', productId).maybeSingle();
    if (error) throw error;

    if (existing) {
      await supabase.from('likes').delete().eq('id', existing.id);
      return res.json({ liked: false });
    }

    const { error: insertErr } = await supabase.from('likes').insert({ user_id: req.user.id, product_id: productId });
    if (insertErr) throw insertErr;
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

    const { data, error } = await supabase
      .from('comments')
      .insert({ user_id: req.user.id, product_id: req.params.id, content: content.trim() })
      .select('id')
      .single();
    if (error) throw error;

    res.status(201).json({ id: data.id, message: 'Comentario agregado.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al agregar el comentario.' });
  }
});

module.exports = router;

