const { createProxyMiddleware } = require('http-proxy-middleware');

/**
 * Build proxy options for a target service.
 *
 * Mounting on '/' and using pathFilter means Express does NOT strip any
 * prefix — the proxy receives the full path e.g. /api/auth/register and
 * pathRewrite removes /api so the service receives /auth/register.
 */
const makeProxy = (target, pathPrefix, serviceName) =>
  createProxyMiddleware({
    target,
    changeOrigin: true,
    pathFilter: pathPrefix, // array or string of prefixes to match
    pathRewrite: { '^/api': '' },
    on: {
      error: (err, req, res) => {
        console.error(`[gateway] Proxy error → ${serviceName}:`, err.message);
        if (!res.headersSent) {
          res.status(502).json({
            message: `Service ${serviceName} indisponible`,
            error: err.message,
          });
        }
      },
      proxyReq: (proxyReq, req) => {
        if (req.headers['x-user-id'])   proxyReq.setHeader('x-user-id',   req.headers['x-user-id']);
        if (req.headers['x-user-role']) proxyReq.setHeader('x-user-role', req.headers['x-user-role']);
      },
    },
  });

/**
 * All proxies are mounted at root ('/') so Express does NOT strip any path
 * prefix. pathFilter decides which requests each proxy handles, and
 * pathRewrite strips '/api' before forwarding to the downstream service.
 *
 * Example flow:
 *   Client  → GET  /api/users/123
 *   Gateway → pathFilter matches /api/users, pathRewrite → /users/123
 *   user-service receives GET /users/123  ✓
 */
const registerRoutes = (app) => {
  const USER_SERVICE_URL        = process.env.USER_SERVICE_URL        || 'http://localhost:3001';
  const OFFRE_SERVICE_URL       = process.env.OFFRE_SERVICE_URL       || 'http://localhost:3002';
  const FORMATION_SERVICE_URL   = process.env.FORMATION_SERVICE_URL   || 'http://localhost:3003';
  const MICROPROJET_SERVICE_URL = process.env.MICROPROJET_SERVICE_URL || 'http://localhost:3004';
  const CANDIDATURE_SERVICE_URL = process.env.CANDIDATURE_SERVICE_URL || 'http://localhost:3005';

  // ── User Service ──────────────────────────────────────────────────
  app.use('/', makeProxy(
    USER_SERVICE_URL,
    ['/api/auth', '/api/users', '/api/avis'],
    'user-service'
  ));

  // ── Offre Service ─────────────────────────────────────────────────
  app.use('/', makeProxy(
    OFFRE_SERVICE_URL,
    ['/api/offres', '/api/recommandations'],
    'offre-service'
  ));

  // ── Formation Service ─────────────────────────────────────────────
  app.use('/', makeProxy(
    FORMATION_SERVICE_URL,
    ['/api/formations', '/api/quizz'],
    'formation-service'
  ));

  // ── MicroProjet Service ───────────────────────────────────────────
  app.use('/', makeProxy(
    MICROPROJET_SERVICE_URL,
    ['/api/domaines', '/api/microprojets'],
    'microprojet-service'
  ));

  // ── Candidature Service ───────────────────────────────────────────
  app.use('/', makeProxy(
    CANDIDATURE_SERVICE_URL,
    ['/api/cvs', '/api/candidatures'],
    'candidature-service'
  ));
};

module.exports = registerRoutes;
