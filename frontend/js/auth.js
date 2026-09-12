/* Lógica de autenticación: registro, login, ojito de contraseña, fuerza, recuperación */

function setupPasswordToggle() {
  document.querySelectorAll('.toggle-eye').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      if (!input) return;
      const isHidden = input.type === 'password';
      input.type = isHidden ? 'text' : 'password';
      btn.classList.toggle('is-visible', isHidden);
      btn.setAttribute('aria-label', isHidden ? 'Ocultar contraseña' : 'Mostrar contraseña');
    });
  });
}

function setupPasswordStrength(inputId, barId) {
  const input = document.getElementById(inputId);
  const bar = document.querySelector(`#${barId} span`);
  if (!input || !bar) return;

  input.addEventListener('input', () => {
    const val = input.value;
    let score = 0;
    if (val.length >= 8) score += 25;
    if (/[a-z]/.test(val)) score += 20;
    if (/[A-Z]/.test(val)) score += 20;
    if (/\d/.test(val)) score += 20;
    if (/[^A-Za-z0-9]/.test(val)) score += 15;

    bar.style.width = `${score}%`;
    bar.style.background = score < 40 ? '#ff5f5f' : score < 75 ? '#ffcc5f' : '#5fffb3';
  });
}

function showMsg(el, text, type = 'error') {
  el.textContent = text;
  el.className = `form-msg ${type}`;
}

// ---------------------------------------------------------
// Registro
// ---------------------------------------------------------
function initRegisterForm() {
  const form = document.getElementById('registerForm');
  if (!form) return;
  const msg = document.getElementById('registerMsg');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;

    try {
      const data = await API.request('/auth/register', { method: 'POST', body: { name, email, password } });
      showMsg(msg, data.message, 'success');
      form.reset();
    } catch (err) {
      showMsg(msg, err.message, 'error');
    }
  });
}

// ---------------------------------------------------------
// Login
// ---------------------------------------------------------
function initLoginForm() {
  const form = document.getElementById('loginForm');
  if (!form) return;
  const msg = document.getElementById('loginMsg');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    try {
      const data = await API.request('/auth/login', { method: 'POST', body: { email, password } });
      API.setToken(data.token);
      API.setUser(data.user);
      showMsg(msg, '¡Bienvenido de nuevo! Redirigiendo...', 'success');
      setTimeout(() => (window.location.href = 'index.html'), 800);
    } catch (err) {
      showMsg(msg, err.message, 'error');
    }
  });
}

// ---------------------------------------------------------
// Olvidé mi contraseña
// ---------------------------------------------------------
function initForgotPasswordForm() {
  const form = document.getElementById('forgotForm');
  if (!form) return;
  const msg = document.getElementById('forgotMsg');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('forgotEmail').value.trim();

    try {
      const data = await API.request('/auth/forgot-password', { method: 'POST', body: { email } });
      showMsg(msg, data.message, 'success');
      form.reset();
    } catch (err) {
      showMsg(msg, err.message, 'error');
    }
  });
}

// ---------------------------------------------------------
// Restablecer contraseña
// ---------------------------------------------------------
function initResetPasswordForm() {
  const form = document.getElementById('resetForm');
  if (!form) return;
  const msg = document.getElementById('resetMsg');
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.getElementById('resetPassword').value;
    const confirm = document.getElementById('resetPasswordConfirm').value;

    if (password !== confirm) {
      showMsg(msg, 'Las contraseñas no coinciden.', 'error');
      return;
    }
    if (!token) {
      showMsg(msg, 'Enlace inválido. Solicita uno nuevo.', 'error');
      return;
    }

    try {
      const data = await API.request('/auth/reset-password', { method: 'POST', body: { token, password } });
      showMsg(msg, data.message, 'success');
      setTimeout(() => (window.location.href = 'login.html'), 1200);
    } catch (err) {
      showMsg(msg, err.message, 'error');
    }
  });
}

// ---------------------------------------------------------
// Verificación de correo (página verify-email.html)
// ---------------------------------------------------------
async function initVerifyEmailPage() {
  const box = document.getElementById('verifyResult');
  if (!box) return;
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');

  if (!token) {
    box.textContent = 'Enlace de verificación inválido.';
    return;
  }

  try {
    const data = await API.request(`/auth/verify-email?token=${encodeURIComponent(token)}`);
    box.textContent = data.message;
    box.className = 'form-msg success';
  } catch (err) {
    box.textContent = err.message;
    box.className = 'form-msg error';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  setupPasswordToggle();
  setupPasswordStrength('regPassword', 'regPasswordStrength');
  setupPasswordStrength('resetPassword', 'resetPasswordStrength');
  initRegisterForm();
  initLoginForm();
  initForgotPasswordForm();
  initResetPasswordForm();
  initVerifyEmailPage();
});
