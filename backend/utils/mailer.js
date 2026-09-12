const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

async function sendMail({ to, subject, html }) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_APP_PASSWORD.includes('xxxx')) {
    const error = new Error('Correo no configurado: agrega GMAIL_USER y GMAIL_APP_PASSWORD en Render.');
    error.code = 'MAIL_NOT_CONFIGURED';
    throw error;
  }

  return transporter.sendMail({
    from: `"3D Market" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html
  });
}

function verificationEmailHtml(name, link) {
  return `
    <div style="font-family: Arial, sans-serif; background:#0b0b12; color:#fff; padding:24px; border-radius:12px;">
      <h2 style="color:#7ee7ff;">¡Hola ${name}!</h2>
      <p>Gracias por registrarte en <strong>3D Market</strong>. Confirma tu correo para activar tu cuenta:</p>
      <p><a href="${link}" style="background:linear-gradient(135deg,#7ee7ff,#b389ff);color:#0b0b12;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Verificar mi correo</a></p>
      <p>Si no creaste esta cuenta, ignora este mensaje.</p>
    </div>`;
}

function resetPasswordEmailHtml(name, link) {
  return `
    <div style="font-family: Arial, sans-serif; background:#0b0b12; color:#fff; padding:24px; border-radius:12px;">
      <h2 style="color:#7ee7ff;">Recuperación de contraseña</h2>
      <p>Hola ${name}, solicitaste restablecer tu contraseña en 3D Market.</p>
      <p><a href="${link}" style="background:linear-gradient(135deg,#7ee7ff,#b389ff);color:#0b0b12;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Restablecer contraseña</a></p>
      <p>Este enlace expira en 1 hora. Si no lo solicitaste, ignora este correo.</p>
    </div>`;
}

module.exports = { sendMail, verificationEmailHtml, resetPasswordEmailHtml };
