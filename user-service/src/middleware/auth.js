const jwt = require('jsonwebtoken');

/**
 * Verifies the JWT from the Authorization header.
 * Attaches req.user = { id, role } if valid.
 */
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token manquant ou invalide' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: decoded.id, role: decoded.role };
    next();
  } catch (err) {
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
 * Usage: authorize('recruteur', 'formateur')
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Accès refusé : rôle insuffisant' });
    }
    next();
  };
};

module.exports = { authMiddleware, serviceAuthMiddleware, authorize };
