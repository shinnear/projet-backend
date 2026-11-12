const mongoose = require('mongoose');

const paginate = (query) => {
  const page = Math.max(parseInt(query.page) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit) || 10, 1), 100);
  return { page, limit, skip: (page - 1) * limit };
};

const paginationMeta = (total, page, limit) => ({
  total, page, limit, pages: Math.ceil(total / limit),
});

// Tri avec liste blanche : ?sort=-salaire  ou  ?sort=datePublication
const buildSort = (sort, allowed, fallback) => {
  if (!sort) return fallback;
  const field = sort.replace(/^-/, '');
  if (!allowed.includes(field)) return fallback;
  return { [field]: sort.startsWith('-') ? -1 : 1 };
};

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const validateObjectId = (param = 'id') => (req, res, next) =>
  mongoose.isValidObjectId(req.params[param])
    ? next()
    : res.status(400).json({ message: `${param} invalide` });

module.exports = { paginate, paginationMeta, buildSort, escapeRegex, validateObjectId };