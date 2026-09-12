const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const pool = require('../config/db');
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

    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Ese correo ya está registrado.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
      [name, email, passwordHash]
    );

    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
    await pool.query(
      'INSERT INTO email_verifications (user_id, token, expires_at) VALUES (?, ?, ?)',
      [result.insertId, token, expiresAt]
    );

    const link = `${process.env.FRONTEND_URL}/verify-email.html?token=${token}`;
    await sendMail({
      to: email,
      subject: 'Verifica tu correo - 3D Market',
      html: verificationEmailHtml(name, link)
    });

    res.status(201).json({ message: 'Cuenta creada. Revisa tu correo para verificarla.' });
  } catch (err) {
    console.error(err);
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

    const [rows] = await pool.query(
      'SELECT * FROM email_verifications WHERE token = ? AND expires_at > NOW()',
      [token]
    );
    if (rows.length === 0) {
      return res.status(400).json({ error: 'Token inválido o expirado.' });
    }

    await pool.query('UPDATE users SET is_verified = 1 WHERE id = ?', [rows[0].user_id]);
    await pool.query('DELETE FROM email_verifications WHERE id = ?', [rows[0].id]);

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

    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    const user = rows[0];
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

    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);

    // Respuesta genérica: no revela si el correo existe o no (evita enumeración de usuarios)
    const genericResponse = { message: 'Si el correo existe, se envió un enlace de recuperación.' };

    if (rows.length === 0) {
      return res.json(genericResponse);
    }

    const user = rows[0];
    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h

    await pool.query(
      'INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)',
      [user.id, token, expiresAt]
    );

    const link = `${process.env.FRONTEND_URL}/reset-password.html?token=${token}`;
    await sendMail({
      to: email,
      subject: 'Recupera tu contraseña - 3D Market',
      html: resetPasswordEmailHtml(user.name, link)
    });

    res.json(genericResponse);
  } catch (err) {
    console.error(err);
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

    const [rows] = await pool.query(
      'SELECT * FROM password_resets WHERE token = ? AND used = 0 AND expires_at > NOW()',
      [token]
    );
    if (rows.length === 0) {
      return res.status(400).json({ error: 'Token inválido o expirado.' });
    }

    const reset = rows[0];
    const passwordHash = await bcrypt.hash(password, 10);
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, reset.user_id]);
    await pool.query('UPDATE password_resets SET used = 1 WHERE id = ?', [reset.id]);

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
