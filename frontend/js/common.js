/* Comportamiento compartido: navbar responsive, whatsapp fab, sesión */
function initCommonUI() {
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.navbar nav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => nav.classList.toggle('open'));
  }

  const waFab = document.getElementById('whatsappFab');
  if (waFab) {
    waFab.href = `https://wa.me/${window.APP_CONFIG.WHATSAPP_NUMBER}?text=${encodeURIComponent('Hola, quiero información sobre un proyecto de 3D Market.')}`;
  }

  renderSessionState();
}

function renderSessionState() {
  const user = API.getUser();
  const loginLink = document.getElementById('navLoginLink');
  const userMenu = document.getElementById('navUserMenu');
  const userNameEl = document.getElementById('navUserName');

  if (user && API.token()) {
    if (loginLink) loginLink.style.display = 'none';
    if (userMenu) userMenu.style.display = 'inline-flex';
    if (userNameEl) userNameEl.textContent = user.name;
  } else {
    if (loginLink) loginLink.style.display = 'inline-flex';
    if (userMenu) userMenu.style.display = 'none';
  }

  const logoutBtn = document.getElementById('navLogoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      API.clearToken();
      window.location.href = 'index.html';
    });
  }
}

document.addEventListener('DOMContentLoaded', initCommonUI);
