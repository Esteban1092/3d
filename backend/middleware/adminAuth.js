// Protege el panel de administración con un código simple (no reemplaza un login real)
function adminAuth(req, res, next) {
  const code = req.headers['x-admin-code'];
  const expected = process.env.ADMIN_ACCESS_CODE;

  if (!expected) {
    return res.status(503).json({ error: 'El panel de administración no está configurado (falta ADMIN_ACCESS_CODE).' });
  }
  if (!code || code !== expected) {
    return res.status(403).json({ error: 'Código de administrador inválido.' });
  }
  next();
}

module.exports = adminAuth;
