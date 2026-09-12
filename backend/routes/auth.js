const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const supabase = require('../config/db');
const { sendMail, verificationEmailHtml, resetPasswordEmailHtml } = require('../utils/mailer');

const router = express.Router();

// Limita intentos de login/registro para mitigar fuerza bruta
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos, intenta de nuevo más tarde.' }
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Mínimo 8 caracteres, una mayúscula, una minúscula y un número
const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

function signToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

// ---------------------------------------------------------
// POST /api/auth/register
// ---------------------------------------------------------
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nombre, correo y contraseña son obligatorios.' });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Correo inválido.' });
    }
    if (!PASSWORD_RE.test(password)) {
      return res.status(400).json({
        error: 'La contraseña debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número.'
      });
    }

    const { data: existing, error: existingErr } = await supabase
      .from('users').select('id').eq('email', email).maybeSingle();
    if (existingErr) throw existingErr;
    if (existing) {
      return res.status(409).json({ error: 'Ese correo ya está registrado.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const { data: newUser, error: insertErr } = await supabase
      .from('users')
      .insert({ name, email, password_hash: passwordHash })
      .select('id')
      .single();
    if (insertErr) throw insertErr;

    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24h
    const { data: verification, error: verifErr } = await supabase
      .from('email_verifications')
      .insert({ user_id: newUser.id, token, expires_at: expiresAt })
      .select('id')
      .single();
    if (verifErr) throw verifErr;

    const link = `${process.env.FRONTEND_URL}/verify-email.html?token=${token}`;
    try {
      await sendMail({
        to: email,
        subject: 'Verifica tu correo - 3D Market',
        html: verificationEmailHtml(name, link)
      });
    } catch (mailError) {
      await supabase.from('email_verifications').delete().eq('id', verification.id);
      await supabase.from('users').delete().eq('id', newUser.id);
      throw mailError;
    }

    res.status(201).json({ message: 'Cuenta creada. Revisa tu correo para verificarla.' });
  } catch (err) {
    console.error(err);
    if (err.code === 'MAIL_NOT_CONFIGURED' || err.code === 'EAUTH' || err.responseCode === 535) {
      return res.status(503).json({ error: 'Gmail no está configurado correctamente en Render. Revisa GMAIL_USER y GMAIL_APP_PASSWORD.' });
    }
    res.status(500).json({ error: 'Error al registrar el usuario.' });
  }
});

// ---------------------------------------------------------
// GET /api/auth/verify-email?token=...
// ---------------------------------------------------------
router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'Token faltante.' });

    const { data: rows, error } = await supabase
      .from('email_verifications')
      .select('*')
      .eq('token', token)
      .gt('expires_at', new Date().toISOString());
    if (error) throw error;
    if (!rows || rows.length === 0) {
      return res.status(400).json({ error: 'Token inválido o expirado.' });
    }

    const verification = rows[0];
    const { error: updErr } = await supabase.from('users').update({ is_verified: true }).eq('id', verification.user_id);
    if (updErr) throw updErr;
    await supabase.from('email_verifications').delete().eq('id', verification.id);

    res.json({ message: 'Correo verificado correctamente. Ya puedes iniciar sesión.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al verificar el correo.' });
  }
});

// ---------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Correo y contraseña son obligatorios.' });
    }

    const { data: user, error } = await supabase.from('users').select('*').eq('email', email).maybeSingle();
    if (error) throw error;
    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }
    if (!user.is_verified) {
      return res.status(403).json({ error: 'Debes verificar tu correo antes de iniciar sesión.' });
    }

    const token = signToken(user);
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, avatar_url: user.avatar_url }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al iniciar sesión.' });
  }
});

// ---------------------------------------------------------
// POST /api/auth/forgot-password
// ---------------------------------------------------------
router.post('/forgot-password', authLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Correo obligatorio.' });

    const { data: user, error } = await supabase.from('users').select('*').eq('email', email).maybeSingle();
    if (error) throw error;

    // Respuesta genérica: no revela si el correo existe o no (evita enumeración de usuarios)
    const genericResponse = { message: 'Si el correo existe, se envió un enlace de recuperación.' };
    if (!user) return res.json(genericResponse);

    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1h

    const { error: insertErr } = await supabase
      .from('password_resets')
      .insert({ user_id: user.id, token, expires_at: expiresAt });
    if (insertErr) throw insertErr;

    const link = `${process.env.FRONTEND_URL}/reset-password.html?token=${token}`;
    await sendMail({
      to: email,
      subject: 'Recupera tu contraseña - 3D Market',
      html: resetPasswordEmailHtml(user.name, link)
    });

    res.json(genericResponse);
  } catch (err) {
    console.error(err);
    if (err.code === 'MAIL_NOT_CONFIGURED' || err.code === 'EAUTH') {
      return res.status(503).json({ error: 'El correo no está configurado en el servidor. Agrega GMAIL_USER y GMAIL_APP_PASSWORD en Render.' });
    }
    if (err.responseCode === 535) {
      return res.status(503).json({ error: 'Gmail rechazó las credenciales. Genera una nueva contraseña de aplicación y actualiza Render.' });
    }
    res.status(500).json({ error: 'Error al procesar la solicitud.' });
  }
});

// ---------------------------------------------------------
// POST /api/auth/reset-password
// ---------------------------------------------------------
router.post('/reset-password', authLimiter, async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ error: 'Token y nueva contraseña son obligatorios.' });
    }
    if (!PASSWORD_RE.test(password)) {
      return res.status(400).json({
        error: 'La contraseña debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número.'
      });
    }

    const { data: rows, error } = await supabase
      .from('password_resets')
      .select('*')
      .eq('token', token)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString());
    if (error) throw error;
    if (!rows || rows.length === 0) {
      return res.status(400).json({ error: 'Token inválido o expirado.' });
    }

    const reset = rows[0];
    const passwordHash = await bcrypt.hash(password, 10);
    const { error: updErr } = await supabase.from('users').update({ password_hash: passwordHash }).eq('id', reset.user_id);
    if (updErr) throw updErr;
    await supabase.from('password_resets').update({ used: true }).eq('id', reset.id);

    res.json({ message: 'Contraseña actualizada. Ya puedes iniciar sesión.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al restablecer la contraseña.' });
  }
});

// ---------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------
router.get('/me', require('../middleware/auth').authRequired, async (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
