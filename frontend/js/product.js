/* Página de detalle de proyecto: info completa + comentarios */

function fmtMoneyDetail(n) {
  return Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function getProductId() {
  return new URLSearchParams(window.location.search).get('id');
}

function commentHtml(c) {
  const date = new Date(c.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return `
    <div class="glass" style="padding:12px 14px; margin-bottom:10px;">
      <strong>${c.author_name}</strong>
      <span style="color:var(--text-muted); font-size:0.78rem; margin-left:8px;">${date}</span>
      <p style="margin:6px 0 0;">${c.content}</p>
    </div>`;
}

async function loadProductDetail() {
  const container = document.getElementById('productDetail');
  if (!container) return;
  const id = getProductId();
  if (!id) { container.innerHTML = '<p>Proyecto no encontrado.</p>'; return; }

  try {
    const p = await API.request(`/products/${id}`, { auth: true });

    container.innerHTML = `
      <div class="glass" style="overflow:hidden;">
        <img src="${p.image_url}" alt="${p.title}" style="width:100%; max-height:420px; object-fit:cover;">
        <div style="padding:24px;">
          <h1 style="margin:0 0 8px;">${p.title}</h1>
          <p style="color:var(--text-muted);">Publicado por ${p.author_name}</p>
          <p>${p.description || ''}</p>
          ${p.local_delivery_only ? '<span class="badge">Solo entrega local · Chalco EDOMEX</span>' : '<span class="badge">Con opción de envío</span>'}
          <div class="price-box" style="margin-top:16px;">
            <span>Precio base: ${fmtMoneyDetail(p.base_price)}</span>
            <span>IVA: ${fmtMoneyDetail(p.iva_amount)}</span>
            ${p.shipping_cost > 0 ? `<span>Envío: ${fmtMoneyDetail(p.shipping_cost)}</span>` : '<span>Envío: incluido (entrega local)</span>'}
            <span class="total">Total: ${fmtMoneyDetail(p.total_price)}</span>
          </div>
          <div class="card-actions">
            <button class="icon-btn like-btn ${p.liked_by_me ? 'liked' : ''}" data-id="${p.id}">
              ${p.liked_by_me ? '❤️' : '🤍'} <span class="like-count">${p.likes_count}</span>
            </button>
            <button class="btn quote-btn" data-id="${p.id}" data-title="${p.title}">🛒 Cotizar este proyecto</button>
          </div>
        </div>
      </div>

      <h2 class="page-title" style="font-size:1.3rem;">Comentarios</h2>
      <div id="commentsList">${p.comments.map(commentHtml).join('') || '<p class="page-subtitle">Sé el primero en comentar.</p>'}</div>

      <form id="commentForm" class="glass" style="padding:16px; display:flex; gap:10px; margin-top:10px;">
        <input id="commentInput" placeholder="Escribe un comentario..." style="flex:1; padding:10px 14px; border-radius:999px; border:1px solid var(--glass-border); background:rgba(255,255,255,0.05); color:var(--text-main);" maxlength="500" required>
        <button class="btn" type="submit">Enviar</button>
      </form>
    `;

    attachDetailEvents(p);
  } catch (err) {
    container.innerHTML = `<p class="form-msg error" style="display:block">${err.message}</p>`;
  }
}

function attachDetailEvents(p) {
  document.querySelectorAll('.like-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!API.token()) return (window.location.href = 'login.html');
      const res = await API.request(`/products/${btn.dataset.id}/like`, { method: 'POST', auth: true });
      const countEl = btn.querySelector('.like-count');
      countEl.textContent = Number(countEl.textContent) + (res.liked ? 1 : -1);
      btn.classList.toggle('liked', res.liked);
      btn.firstChild.textContent = res.liked ? '❤️ ' : '🤍 ';
    });
  });

  document.querySelectorAll('.quote-btn').forEach((btn) => {
    btn.addEventListener('click', () => openQuoteModal(btn.dataset.id, btn.dataset.title));
  });

  const commentForm = document.getElementById('commentForm');
  commentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!API.token()) return (window.location.href = 'login.html');
    const input = document.getElementById('commentInput');
    try {
      await API.request(`/products/${p.id}/comments`, { method: 'POST', auth: true, body: { content: input.value } });
      input.value = '';
      loadProductDetail();
    } catch (err) {
      alert(err.message);
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadProductDetail();
  initQuoteModal();
});
