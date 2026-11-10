const jwt = require('jsonwebtoken');

/**
 * Public routes that do NOT require a JWT.
 * Exact method+path matches.
 */
const PUBLIC_ROUTES = [
  { method: 'POST', path: '/api/auth/register' },
  { method: 'POST', path: '/api/auth/login' },
  { method: 'GET',  path: '/health' },
];

const isPublicRoute = (method, path) => {
  return PUBLIC_ROUTES.some(
    (r) => r.method === method && path.startsWith(r.path)
  );
};

/**
 * JWT authentication middleware for the gateway.
 *
 * - Skips auth for public routes.
 * - Verifies the Bearer token from the Authorization header.
 * - On success, forwards x-user-id and x-user-role headers downstream
 *   so services can use them without re-verifying the JWT.
 */
const authMiddleware = (req, res, next) => {
  if (isPublicRoute(req.method, req.path)) {
    return next();
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      message: 'Authentification requise. Fournissez un token Bearer.',
    });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Attach user info as headers so downstream services can read them
    req.headers['x-user-id'] = decoded.id;
    req.headers['x-user-role'] = decoded.role;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Token invalide ou expiré' });
  }
};

module.exports = authMiddleware;
