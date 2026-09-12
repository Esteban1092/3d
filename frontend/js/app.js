/* Feed de proyectos 3D: tarjetas, likes, comentarios y cotización */

function fmtMoney(n) {
  return Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function productCardHtml(p) {
  return `
    <article class="card glass" data-id="${p.id}">
      <img class="card-img" src="${p.image_url}" alt="${p.title}" loading="lazy">
      <div class="card-body">
        <h3>${p.title}</h3>
        <p class="desc">${p.description || ''}</p>
        ${p.local_delivery_only ? '<span class="badge">Solo entrega local · Chalco</span>' : '<span class="badge">Con opción de envío</span>'}
        ${p.discount_percent > 0 ? `<span class="badge" style="margin-left:6px; border-color:#ff5f9e; color:#ff9fc4;">-${p.discount_percent}% OFF</span>` : ''}
        <div class="price-box">
          <span>Precio base: ${p.discount_percent > 0 ? `<s>${fmtMoney(p.base_price)}</s> ${fmtMoney(p.discounted_base_price)}` : fmtMoney(p.base_price)}</span>
          <span>IVA: ${fmtMoney(p.iva_amount)}</span>
          ${p.shipping_cost > 0 ? `<span>Envío: ${fmtMoney(p.shipping_cost)}</span>` : '<span>Envío: incluido (entrega local)</span>'}
          <span class="total">Total: ${fmtMoney(p.total_price)}</span>
        </div>
        <div class="card-actions">
          <button class="icon-btn like-btn ${p.liked_by_me ? 'liked' : ''}" data-id="${p.id}">
            ${p.liked_by_me ? '❤️' : '🤍'} <span class="like-count">${p.likes_count}</span>
          </button>
          <button class="icon-btn comment-btn" data-id="${p.id}">💬 <span>${p.comments_count}</span></button>
          <button class="icon-btn quote-btn" data-id="${p.id}" data-title="${p.title}">🛒 Cotizar</button>
        </div>
      </div>
    </article>`;
}

let allProducts = [];

function renderFeed(products) {
  const grid = document.getElementById('feedGrid');
  const emptyState = document.getElementById('emptyState');
  if (!grid) return;

  grid.innerHTML = products.map(productCardHtml).join('');
  if (emptyState) emptyState.hidden = products.length > 0;
  if (products.length > 0) attachFeedEvents();
}

async function loadFeed() {
  const grid = document.getElementById('feedGrid');
  if (!grid) return;

  try {
    allProducts = await API.request('/products', { auth: true });
    renderFeed(allProducts);
  } catch (err) {
    grid.innerHTML = `<p class="form-msg error" style="display:block">${err.message}</p>`;
  }
}

function initCatalogSearch() {
  const input = document.getElementById('productSearch');
  if (!input) return;
  input.addEventListener('input', () => {
    const query = input.value.trim().toLowerCase();
    const filtered = allProducts.filter((product) =>
      `${product.title} ${product.description || ''}`.toLowerCase().includes(query)
    );
    renderFeed(filtered);
  });
}

function initSuggestionForm() {
  const form = document.getElementById('suggestionForm');
  if (!form) return;
  const msg = document.getElementById('suggestionMsg');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const data = await API.request('/suggestions', {
        method: 'POST',
        body: {
          name: document.getElementById('suggestionName').value,
          email: document.getElementById('suggestionEmail').value,
          message: document.getElementById('suggestionMessage').value
        }
      });
      msg.textContent = data.message;
      msg.className = 'form-msg success';
      form.reset();
    } catch (err) {
      msg.textContent = err.message;
      msg.className = 'form-msg error';
    }
  });
}

function attachFeedEvents() {
  document.querySelectorAll('.like-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!API.token()) return (window.location.href = 'login.html');
      try {
        const res = await API.request(`/products/${btn.dataset.id}/like`, { method: 'POST', auth: true });
        const countEl = btn.querySelector('.like-count');
        let count = Number(countEl.textContent);
        count += res.liked ? 1 : -1;
        countEl.textContent = count;
        btn.classList.toggle('liked', res.liked);
        btn.firstChild.textContent = res.liked ? '❤️ ' : '🤍 ';
      } catch (err) {
        alert(err.message);
      }
    });
  });

  document.querySelectorAll('.comment-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      window.location.href = `product.html?id=${btn.dataset.id}`;
    });
  });

  document.querySelectorAll('.quote-btn').forEach((btn) => {
    btn.addEventListener('click', () => openQuoteModal(btn.dataset.id, btn.dataset.title));
  });
}

// ---------------------------------------------------------
// Modal de cotización
// ---------------------------------------------------------
function openQuoteModal(productId, title) {
  const overlay = document.getElementById('quoteModalOverlay');
  if (!overlay) return;
  document.getElementById('quoteProductId').value = productId;
  document.getElementById('quoteProductTitle').textContent = title;
  overlay.classList.add('open');
}

function closeQuoteModal() {
  document.getElementById('quoteModalOverlay').classList.remove('open');
}

function initQuoteModal() {
  const overlay = document.getElementById('quoteModalOverlay');
  if (!overlay) return;

  document.getElementById('quoteModalClose').addEventListener('click', closeQuoteModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeQuoteModal(); });

  const deliverySelect = document.getElementById('quoteDeliveryType');
  const addressField = document.getElementById('quoteAddressField');
  deliverySelect.addEventListener('change', () => {
    addressField.style.display = deliverySelect.value === 'envio' ? 'block' : 'none';
  });

  document.getElementById('quoteForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('quoteMsg');
    const body = {
      product_id: document.getElementById('quoteProductId').value,
      full_name: document.getElementById('quoteName').value.trim(),
      phone: document.getElementById('quotePhone').value.trim(),
      delivery_type: deliverySelect.value,
      address: document.getElementById('quoteAddress').value.trim()
    };

    try {
      const data = await API.request('/quotes', { method: 'POST', auth: true, body });
      msg.textContent = `${data.message} Total estimado: ${fmtMoney(data.total_estimate)}`;
      msg.className = 'form-msg success';
      const waLink = document.getElementById('quoteWhatsappLink');
      waLink.href = data.whatsapp_link;
      waLink.style.display = 'inline-flex';
    } catch (err) {
      msg.textContent = err.message;
      msg.className = 'form-msg error';
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadFeed();
  initCatalogSearch();
  initSuggestionForm();
  initQuoteModal();
});
