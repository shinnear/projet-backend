const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Generate a signed JWT token for a user.
 */
const signToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

/**
 * POST /auth/register
 * Register a new user and return a JWT.
 */
const register = async (req, res) => {
  try {
    const { nom, prenom, email, password, role, competences } = req.body;

    // Check if email already exists
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: 'Cet email est déjà utilisé' });
    }

    const user = await User.create({ nom, prenom, email, password, role, competences });
    const token = signToken(user);

    res.status(201).json({
      message: 'Inscription réussie',
      token,
      user: {
        id: user._id,
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
        role: user.role,
        competences: user.competences,
      },
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'Cet email est déjà utilisé' });
    }
    res.status(500).json({ message: err.message });
  }
};

/**
 * POST /auth/login
 * Authenticate a user and return a JWT.
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email et mot de passe requis' });
    }

    // Explicitly select password (it has select: false on schema)
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({ message: 'Identifiants incorrects' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Identifiants incorrects' });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: 'Compte désactivé' });
    }

    const token = signToken(user);

    res.json({
      message: 'Connexion réussie',
      token,
      user: {
        id: user._id,
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
        role: user.role,
        competences: user.competences,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /users/:id
 * Get a user by ID (without password).
 */
const getUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /users
 * Get all users (admin/internal use).
 */
const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({ isActive: true }).select('-password');
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * PUT /users/:id
 * Update allowed fields for the authenticated user.
 */
const updateUser = async (req, res) => {
  try {
    // A user can only update their own profile
    if (req.user.id !== req.params.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Vous ne pouvez modifier que votre propre profil' });
    }

    const allowedFields = ['nom', 'prenom', 'avatar', 'competences'];
    const updates = {};
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const user = await User.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });

    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    res.json({ message: 'Profil mis à jour', user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * DELETE /users/:id
 * Soft-delete a user (set isActive = false).
 */
const deleteUser = async (req, res) => {
  try {
    if (req.user.id !== req.params.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Accès refusé' });
    }

    await User.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ message: 'Compte désactivé avec succès' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { register, login, getUser, getAllUsers, updateUser, deleteUser };
