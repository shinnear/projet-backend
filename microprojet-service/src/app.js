
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const domaineRoutes = require('./routes/domaineRoutes');
const microprojetRoutes = require('./routes/microprojetRoutes');

const categorieLocalRoutes = require('./routes/categorieLocalRoutes');
const microprojetLocalRoutes = require('./routes/microprojetLocalRoutes');

const app = express();

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Vérification du service
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'microprojet-service' });
});

// Routes existantes de l'équipe
app.use('/', domaineRoutes);
app.use('/', microprojetRoutes);

// Tes routes CRUD
app.use('/api/categories', categorieLocalRoutes);
app.use('/api/microprojets', microprojetLocalRoutes);

// Route non trouvée
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Gestion des erreurs
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error'
  });
});

module.exports = app;
