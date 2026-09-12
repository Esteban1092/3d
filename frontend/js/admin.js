/* Panel de administración: gate por código, subir imagen, crear/editar/eliminar proyectos */

const ADMIN_CODE_KEY = '3dm_admin_code';

function adminHeaders(json = true) {
  const headers = { 'x-admin-code': sessionStorage.getItem(ADMIN_CODE_KEY) || '' };
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
}

async function adminFetch(path, options = {}) {
  const res = await fetch(`${window.APP_CONFIG.API_BASE_URL}${path}`, {
    ...options,
    headers: { ...adminHeaders(!(options.body instanceof FormData)), ...(options.headers || {}) }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Ocurrió un error inesperado.');
  return data;
}

function fmtMoneyAdmin(n) {
  return Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

// ---------------------------------------------------------
// Puerta de acceso
// ---------------------------------------------------------
function showAdminPanel() {
  document.getElementById('adminGate').style.display = 'none';
  document.getElementById('adminPanel').style.display = 'block';
  loadAdminProducts();
}

async function tryStoredCode() {
  const stored = sessionStorage.getItem(ADMIN_CODE_KEY);
  if (!stored) return;
  try {
    await adminFetch('/admin/products');
    showAdminPanel();
  } catch {
    sessionStorage.removeItem(ADMIN_CODE_KEY);
  }
}

function initAdminGate() {
  const form = document.getElementById('adminGateForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('adminGateMsg');
    const code = document.getElementById('adminCodeInput').value.trim();
    sessionStorage.setItem(ADMIN_CODE_KEY, code);

    try {
      await adminFetch('/admin/products');
      showAdminPanel();
    } catch (err) {
      sessionStorage.removeItem(ADMIN_CODE_KEY);
      msg.textContent = err.message;
      msg.className = 'form-msg error';
    }
  });
}

// ---------------------------------------------------------
// Crear proyecto (con subida de imagen)
// ---------------------------------------------------------
function initAdminCreateForm() {
  const form = document.getElementById('adminCreateForm');
  const localCheckbox = document.getElementById('acLocalOnly');
  const shippingField = document.getElementById('acShippingField');
  const fileInput = document.getElementById('acImageFile');
  const preview = document.getElementById('acImagePreview');

  localCheckbox.addEventListener('change', () => {
    shippingField.style.display = localCheckbox.checked ? 'none' : 'block';
  });

  fileInput.addEventListener('change', () => {
    preview.innerHTML = '';
    const file = fileInput.files[0];
    if (!file) return;
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    img.style.maxHeight = '140px';
    img.style.borderRadius = '10px';
    preview.appendChild(img);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('adminCreateMsg');
    const file = fileInput.files[0];
    if (!file) {
      msg.textContent = 'Selecciona una imagen.';
      msg.className = 'form-msg error';
      return;
    }

    try {
      const formData = new FormData();
      formData.append('image', file);
      const uploadRes = await adminFetch('/admin/upload', { method: 'POST', body: formData });

      await adminFetch('/admin/products', {
        method: 'POST',
        body: JSON.stringify({
          title: document.getElementById('acTitle').value.trim(),
          description: document.getElementById('acDescription').value.trim(),
          image_url: uploadRes.image_url,
          base_price: document.getElementById('acPrice').value,
          discount_percent: document.getElementById('acDiscount').value || 0,
          shipping_cost: localCheckbox.checked ? 0 : (document.getElementById('acShipping').value || 0),
          local_delivery_only: localCheckbox.checked ? 1 : 0
        })
      });

      msg.textContent = 'Proyecto publicado con éxito.';
      msg.className = 'form-msg success';
      form.reset();
      preview.innerHTML = '';
      loadAdminProducts();
    } catch (err) {
      msg.textContent = err.message;
      msg.className = 'form-msg error';
    }
  });
}

// ---------------------------------------------------------
// Listado + edición + eliminación
// ---------------------------------------------------------
function adminProductCardHtml(p) {
  return `
    <article class="card glass" data-id="${p.id}">
      <img class="card-img" src="${p.image_url}" alt="${p.title}">
      <div class="card-body">
        <h3>${p.title}</h3>
        ${!p.is_active ? '<span class="badge" style="border-color:#ff5f5f; color:#ff9f9f;">Inactivo</span>' : ''}
        <div class="field">
          <label>Precio base</label>
          <input type="number" class="edit-price" min="0" step="0.01" value="${p.base_price}">
        </div>
        <div class="field">
          <label>Descuento (%)</label>
          <input type="number" class="edit-discount" min="0" max="100" step="0.01" value="${p.discount_percent || 0}">
        </div>
        <div class="field">
          <label>Envío</label>
          <input type="number" class="edit-shipping" min="0" step="0.01" value="${p.shipping_cost}" ${p.local_delivery_only ? 'disabled' : ''}>
        </div>
        <div class="field" style="display:flex; align-items:center; gap:8px;">
          <input type="checkbox" class="edit-local" style="width:auto;" ${p.local_delivery_only ? 'checked' : ''}>
          <label style="margin:0;">Solo local (Chalco)</label>
        </div>
        <div class="field" style="display:flex; align-items:center; gap:8px;">
          <input type="checkbox" class="edit-active" style="width:auto;" ${p.is_active ? 'checked' : ''}>
          <label style="margin:0;">Activo (visible en el sitio)</label>
        </div>
        <div class="field">
          <label>Cambiar imagen</label>
          <input type="file" class="edit-image-file" accept="image/*">
        </div>
        <div class="card-actions">
          <button class="btn secondary save-btn" data-id="${p.id}">Guardar</button>
          <button class="icon-btn delete-btn" data-id="${p.id}">🗑️ Eliminar</button>
        </div>
        <div class="form-msg" id="rowMsg-${p.id}"></div>
      </div>
    </article>`;
}

async function loadAdminProducts() {
  const list = document.getElementById('adminProductsList');
  try {
    const products = await adminFetch('/admin/products');
    list.innerHTML = products.length
      ? products.map(adminProductCardHtml).join('')
      : '<p class="page-subtitle">Aún no hay proyectos.</p>';
    attachAdminProductEvents();
  } catch (err) {
    list.innerHTML = `<p class="form-msg error" style="display:block">${err.message}</p>`;
  }
}

function attachAdminProductEvents() {
  document.querySelectorAll('.edit-local').forEach((chk) => {
    chk.addEventListener('change', () => {
      const shippingInput = chk.closest('.card').querySelector('.edit-shipping');
      shippingInput.disabled = chk.checked;
    });
  });

  document.querySelectorAll('.save-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('.card');
      const msg = document.getElementById(`rowMsg-${btn.dataset.id}`);
      try {
        const imageFile = card.querySelector('.edit-image-file').files[0];
        let image_url;
        if (imageFile) {
          const formData = new FormData();
          formData.append('image', imageFile);
          const uploadRes = await adminFetch('/admin/upload', { method: 'POST', body: formData });
          image_url = uploadRes.image_url;
        }

        await adminFetch(`/admin/products/${btn.dataset.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            ...(image_url ? { image_url } : {}),
            base_price: card.querySelector('.edit-price').value,
            discount_percent: card.querySelector('.edit-discount').value,
            shipping_cost: card.querySelector('.edit-shipping').value,
            local_delivery_only: card.querySelector('.edit-local').checked ? 1 : 0,
            is_active: card.querySelector('.edit-active').checked ? 1 : 0
          })
        });
        msg.textContent = 'Guardado ✅';
        msg.className = 'form-msg success';
        loadAdminProducts();
      } catch (err) {
        msg.textContent = err.message;
        msg.className = 'form-msg error';
      }
    });
  });

  document.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Eliminar este proyecto? Esta acción no se puede deshacer.')) return;
      try {
        await adminFetch(`/admin/products/${btn.dataset.id}`, { method: 'DELETE' });
        loadAdminProducts();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initAdminGate();
  initAdminCreateForm();
  tryStoredCode();
});
