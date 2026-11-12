require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./app');

const PORT = process.env.PORT || 3002;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/offres_db';

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log('[offre-service] Connected to MongoDB:', MONGO_URI);
    app.listen(PORT, () => {
      console.log(`[offre-service] Running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[offre-service] MongoDB connection error:', err.message);
    process.exit(1);
  });
const Offre = require('./models/Offre');

const closeExpired = async () => {
  const r = await Offre.updateMany(
    { statut: 'active', dateLimite: { $lt: new Date() } },
    { statut: 'fermée' }
  );
  if (r.modifiedCount) console.log(`[offre-service] ${r.modifiedCount} offre(s) expirée(s) fermée(s)`);
};
closeExpired();
setInterval(closeExpired, 60 * 60 * 1000);   // toutes les heures