const jwt = require('jsonwebtoken');

/**
 * Auth middleware for formation-service.
 * Reads x-user-id / x-user-role injected by the API Gateway.
 * Falls back to direct JWT verification for local dev.
 */
const authMiddleware = (req, res, next) => {
  const userId = req.headers['x-user-id'];
  const userRole = req.headers['x-user-role'];

  if (userId && userRole) {
    req.user = { id: userId, role: userRole };
    return next();
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authentification requise' });
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: decoded.id, role: decoded.role };
    next();
  } catch {
    return res.status(401).json({ message: 'Token invalide ou expiré' });
  }
};

/**
 * Verifies the SERVICE_TOKEN header for internal service-to-service calls.
 */
const serviceAuthMiddleware = (req, res, next) => {
  const token = req.headers['x-service-token'];
  if (!token || token !== process.env.SERVICE_TOKEN) {
    return res.status(403).json({ message: 'Accès interne refusé' });
  }
  next();
};

/**
 * Restricts access to specific roles.
 */
const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ message: 'Accès refusé : rôle insuffisant' });
  }
  next();
};

module.exports = { authMiddleware, serviceAuthMiddleware, authorize };
