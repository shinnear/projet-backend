const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const cvRoutes = require('./routes/cvRoutes');
const candidatureRoutes = require('./routes/candidatureRoutes');

const app = express();

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'candidature-service' });
});

// Routes
app.use('/', cvRoutes);
app.use('/', candidatureRoutes);

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
