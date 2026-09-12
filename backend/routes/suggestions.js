const express = require('express');
const rateLimit = require('express-rate-limit');
const supabase = require('../config/db');

const router = express.Router();
const suggestionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados consejos enviados. Intenta más tarde.' }
});

router.post('/', suggestionLimiter, async (req, res) => {
  try {
    const { name, email, message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Escribe tu consejo antes de enviarlo.' });
    }
    if (message.trim().length > 1000) {
      return res.status(400).json({ error: 'El consejo no puede superar 1000 caracteres.' });
    }

    const { data, error } = await supabase
      .from('suggestions')
      .insert({ name: name?.trim() || null, email: email?.trim() || null, message: message.trim() })
      .select('id')
      .single();
    if (error) throw error;

    res.status(201).json({ id: data.id, message: 'Consejo recibido. Gracias por ayudar a mejorar 3D Market.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo guardar el consejo.' });
  }
});

module.exports = router;
