const Domaine = require('../models/Domaine');

const DEFAULT_DOMAINES = [
  { nom: 'Développement Web', description: 'Applications et sites web', icone: '🌐' },
  { nom: 'Développement Mobile', description: 'Applications iOS et Android', icone: '📱' },
  { nom: 'Data Science', description: 'Analyse de données et machine learning', icone: '📊' },
  { nom: 'DevOps', description: 'CI/CD, infrastructure et déploiement', icone: '⚙️' },
  { nom: 'Design UI/UX', description: 'Design d\'interfaces et expérience utilisateur', icone: '🎨' },
  { nom: 'Marketing Digital', description: 'SEO, réseaux sociaux et campagnes digitales', icone: '📣' },
  { nom: 'Finance', description: 'Comptabilité, analyse financière et investissement', icone: '💰' },
  { nom: 'Intelligence Artificielle', description: 'IA, NLP et vision par ordinateur', icone: '🤖' },
  { nom: 'Cybersécurité', description: 'Sécurité des systèmes et réseaux', icone: '🔒' },
  { nom: 'Blockchain', description: 'Technologies décentralisées et smart contracts', icone: '🔗' },
];

/**
 * Seeds default domaines if the collection is empty.
 * Safe to call on every startup.
 */
const seedDomaines = async () => {
  try {
    const count = await Domaine.countDocuments();
    if (count === 0) {
      await Domaine.insertMany(DEFAULT_DOMAINES);
      console.log(`[microprojet-service] Seeded ${DEFAULT_DOMAINES.length} domaines`);
    } else {
      console.log(`[microprojet-service] Domaines already seeded (${count} found)`);
    }
  } catch (err) {
    console.error('[microprojet-service] Seed error:', err.message);
  }
};

module.exports = seedDomaines;
