require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./app');

const PORT = process.env.PORT || 3003;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/formations_db';

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log('[formation-service] Connected to MongoDB:', MONGO_URI);
    app.listen(PORT, () => {
      console.log(`[formation-service] Running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[formation-service] MongoDB connection error:', err.message);
    process.exit(1);
  });
