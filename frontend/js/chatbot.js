/* Chatbot flotante: informa catálogo, envíos, entrega local y contacto */
let chatHistory = [];

function toggleChat() {
  const win = document.getElementById('chatWindow');
  win.classList.toggle('open');
}

function appendChatMsg(role, text) {
  const body = document.getElementById('chatBody');
  const div = document.createElement('div');
  div.className = `chat-msg ${role === 'user' ? 'user' : 'bot'}`;
  div.textContent = text;
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
}

async function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;

  appendChatMsg('user', text);
  chatHistory.push({ role: 'user', content: text });
  input.value = '';

  appendChatMsg('bot', 'Escribiendo...');
  const body = document.getElementById('chatBody');
  const typingEl = body.lastChild;

  try {
    const data = await API.request('/chatbot', { method: 'POST', body: { message: text, history: chatHistory } });
    typingEl.textContent = data.reply;
    chatHistory.push({ role: 'assistant', content: data.reply });
  } catch (err) {
    typingEl.textContent = 'Lo siento, no puedo responder en este momento. Escríbenos por WhatsApp.';
  }
}

function initChatbot() {
  const fab = document.getElementById('chatFab');
  const closeBtn = document.getElementById('chatClose');
  const sendBtn = document.getElementById('chatSend');
  const input = document.getElementById('chatInput');
  if (!fab) return;

  fab.addEventListener('click', toggleChat);
  closeBtn.addEventListener('click', toggleChat);
  sendBtn.addEventListener('click', sendChatMessage);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChatMessage(); });

  appendChatMsg('bot', '¡Hola! Soy el asistente de 3D Market 🤖. Pregúntame sobre precios, envíos o el catálogo.');
}

document.addEventListener('DOMContentLoaded', initChatbot);
