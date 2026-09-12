require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const donationRoutes = require('./routes/donations');
const quoteRoutes = require('./routes/quotes');
const chatbotRoutes = require('./routes/chatbot');

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/donations', donationRoutes);
app.use('/api/quotes', quoteRoutes);
app.use('/api/chatbot', chatbotRoutes);

// Manejador de errores genérico (evita filtrar detalles internos al cliente)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`3D Market API escuchando en el puerto ${PORT}`));
