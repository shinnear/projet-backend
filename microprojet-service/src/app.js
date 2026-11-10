const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const domaineRoutes = require('./routes/domaineRoutes');
const microprojetRoutes = require('./routes/microprojetRoutes');

const app = express();

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'microprojet-service' });
});

// Routes
app.use('/', domaineRoutes);
app.use('/', microprojetRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ message: err.message || 'Internal server error' });
});

module.exports = app;
