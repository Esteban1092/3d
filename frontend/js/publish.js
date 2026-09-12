/* Publicar un nuevo proyecto 3D */
function initPublishForm() {
  const form = document.getElementById('publishForm');
  if (!form) return;

  if (!API.token()) {
    window.location.href = 'login.html';
    return;
  }

  const msg = document.getElementById('publishMsg');
  const localCheckbox = document.getElementById('pubLocalOnly');
  const shippingField = document.getElementById('pubShippingField');

  localCheckbox.addEventListener('change', () => {
    shippingField.style.display = localCheckbox.checked ? 'none' : 'block';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      title: document.getElementById('pubTitle').value.trim(),
      description: document.getElementById('pubDescription').value.trim(),
      image_url: document.getElementById('pubImageUrl').value.trim(),
      base_price: document.getElementById('pubPrice').value,
      shipping_cost: localCheckbox.checked ? 0 : (document.getElementById('pubShipping').value || 0),
      local_delivery_only: localCheckbox.checked ? 1 : 0
    };

    try {
      await API.request('/products', { method: 'POST', auth: true, body });
      msg.textContent = 'Proyecto publicado con éxito.';
      msg.className = 'form-msg success';
      setTimeout(() => (window.location.href = 'index.html'), 900);
    } catch (err) {
      msg.textContent = err.message;
      msg.className = 'form-msg error';
    }
  });
}

document.addEventListener('DOMContentLoaded', initPublishForm);
