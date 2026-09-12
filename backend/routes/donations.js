const express = require('express');
const supabase = require('../config/db');
const { authOptional } = require('../middleware/auth');

const router = express.Router();

// ---------------------------------------------------------
// POST /api/donations  (donación libre, con o sin sesión)
// ---------------------------------------------------------
router.post('/', authOptional, async (req, res) => {
  try {
    const { donor_name, amount, message } = req.body;
    const parsedAmount = Number(amount);

    if (!parsedAmount || parsedAmount <= 0) {
      return res.status(400).json({ error: 'El monto de la donación debe ser mayor a 0.' });
    }

    const userId = req.user ? req.user.id : null;

    // NOTA: aquí solo se registra la intención de donar.
    // Para cobrar de verdad debes integrar una pasarela de pago real
    // (Stripe, Mercado Pago, PayPal, etc.) y actualizar "status" desde su webhook.
    const { data, error } = await supabase
      .from('donations')
      .insert({ user_id: userId, donor_name: donor_name || 'Anónimo', amount: parsedAmount, message: message || null, status: 'pendiente' })
      .select('id')
      .single();
    if (error) throw error;

    res.status(201).json({ id: data.id, message: '¡Gracias por tu intención de donar! Te contactaremos para completar el pago.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al registrar la donación.' });
  }
});


module.exports = router;
