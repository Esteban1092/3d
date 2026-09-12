/* Página de donaciones */
function initDonateForm() {
  const form = document.getElementById('donateForm');
  if (!form) return;
  const msg = document.getElementById('donateMsg');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      donor_name: document.getElementById('donorName').value.trim() || undefined,
      amount: document.getElementById('donateAmount').value,
      message: document.getElementById('donateMessage').value.trim() || undefined
    };

    try {
      const data = await API.request('/donations', { method: 'POST', auth: !!API.token(), body });
      msg.textContent = data.message;
      msg.className = 'form-msg success';
      form.reset();
    } catch (err) {
      msg.textContent = err.message;
      msg.className = 'form-msg error';
    }
  });
}

document.addEventListener('DOMContentLoaded', initDonateForm);
