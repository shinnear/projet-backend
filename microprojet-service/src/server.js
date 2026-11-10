require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./app');
const seedDomaines = require('./seed/domaines');

const PORT = process.env.PORT || 3004;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/microprojets_db';

mongoose
  .connect(MONGO_URI)
  .then(async () => {
    console.log('[microprojet-service] Connected to MongoDB:', MONGO_URI);
    await seedDomaines();
    app.listen(PORT, () => {
      console.log(`[microprojet-service] Running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[microprojet-service] MongoDB connection error:', err.message);
    process.exit(1);
  });
