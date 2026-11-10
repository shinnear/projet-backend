require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const authMiddleware = require('./middleware/auth');
const registerRoutes = require('./routes/index');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Global Middleware ───────────────────────────────────────────────
app.use(cors());
app.use(morgan('dev'));

// Gateway health check (no auth required)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'api-gateway' });
});

// JWT authentication (runs before proxying)
app.use(authMiddleware);

// ── Proxy Routes ────────────────────────────────────────────────────
registerRoutes(app);

// ── 404 Fallback ────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.method} ${req.path} introuvable` });
});

// ── Start ────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[api-gateway] Running on port ${PORT}`);
  console.log('[api-gateway] Services:');
  console.log('  → user-service:        ', process.env.USER_SERVICE_URL);
  console.log('  → offre-service:       ', process.env.OFFRE_SERVICE_URL);
  console.log('  → formation-service:   ', process.env.FORMATION_SERVICE_URL);
  console.log('  → microprojet-service: ', process.env.MICROPROJET_SERVICE_URL);
  console.log('  → candidature-service: ', process.env.CANDIDATURE_SERVICE_URL);
});
