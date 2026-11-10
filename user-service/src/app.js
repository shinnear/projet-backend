const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const userRoutes = require('./routes/userRoutes');
const avisRoutes = require('./routes/avisRoutes');
const internalRoutes = require('./routes/internalRoutes');

const app = express();

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'user-service' });
});

// Routes
app.use('/', userRoutes);
app.use('/', avisRoutes);
app.use('/', internalRoutes);

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
