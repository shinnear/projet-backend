// À placer dans offre-service/tests/offre.test.js
process.env.JWT_SECRET = 'test_secret';
process.env.SERVICE_TOKEN = 'test_service_token';

jest.mock('axios'); // on simule user-service
const axios = require('axios');
const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');

const app = require('../src/app');
const Recommandation = require('../src/models/Recommandation');

// ⚠️ Adaptez le contenu du payload si votre authMiddleware lit d'autres champs
const makeToken = (id, role) => jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: '1h' });

const R1 = '6af586a2a12776783f1c8a5c';
const R2 = '6af586a2a12776783f1c8a5d';
const C1 = '6af588bda12776783f1c8a64';
const tR1 = makeToken(R1, 'recruteur');
const tR2 = makeToken(R2, 'recruteur');
const tC1 = makeToken(C1, 'candidat');
const auth = (t) => ({ Authorization: `Bearer ${t}` });

const futur = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
const offreBody = {
  titre: 'Développeur Node.js',
  description: "Développement d'API REST",
  domaine: 'Informatique',
  competencesRequises: ['Node.js', 'MongoDB', 'Express'],
  typeContrat: 'CDI',
  localisation: 'Tunis',
  salaire: 2000,
  dateLimite: futur,
};

let mongod;
let offreId;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  // Réponses simulées de user-service
  axios.get.mockImplementation(async (url) => {
    if (url.endsWith('/internal/users')) {
      return { data: [
        { _id: C1, nom: 'Haddad', prenom: 'Amine', competences: ['Node.js', 'MongoDB'] },
        { _id: '6af588bda12776783f1c8a99', nom: 'Autre', prenom: 'Py', competences: ['Python'] },
      ] };
    }
    return { data: { _id: R1 } }; // /internal/users/:id
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('Offres - création et sécurité', () => {
  test('sans token : 401', async () => {
    const res = await request(app).get('/offres');
    expect(res.status).toBe(401);
  });

  test('un candidat ne peut pas créer une offre : 403', async () => {
    const res = await request(app).post('/offres').set(auth(tC1)).send(offreBody);
    expect(res.status).toBe(403);
  });

  test('dateLimite passée : 400', async () => {
    const res = await request(app).post('/offres').set(auth(tR1))
      .send({ ...offreBody, dateLimite: '2020-01-01' });
    expect(res.status).toBe(400);
  });

  test('création valide : 201', async () => {
    const res = await request(app).post('/offres').set(auth(tR1)).send(offreBody);
    expect(res.status).toBe(201);
    expect(res.body.offre.recruteurId).toBe(R1);
    offreId = res.body.offre._id;
  });

  test('id invalide : 400', async () => {
    const res = await request(app).get('/offres/abc').set(auth(tR1));
    expect(res.status).toBe(400);
  });

  test("un autre recruteur ne peut pas modifier l'offre : 403", async () => {
    const res = await request(app).put(`/offres/${offreId}`).set(auth(tR2)).send({ salaire: 9999 });
    expect(res.status).toBe(403);
  });

  test('recruteurId envoyé dans le body est ignoré', async () => {
    const res = await request(app).put(`/offres/${offreId}`).set(auth(tR1))
      .send({ salaire: 2200, recruteurId: 'hacker123' });
    expect(res.status).toBe(200);
    expect(res.body.offre.salaire).toBe(2200);
    expect(res.body.offre.recruteurId).toBe(R1);
  });
});

describe('Offres - lecture, filtres, pagination', () => {
  test('limit est borné à 100 et page invalide vaut 1', async () => {
    const res = await request(app).get('/offres?limit=9999&page=abc').set(auth(tC1));
    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(100);
    expect(res.body.page).toBe(1);
  });

  test('recherche par mot-clé', async () => {
    const res = await request(app).get('/offres?q=node').set(auth(tC1));
    expect(res.body.total).toBeGreaterThanOrEqual(1);
  });

  test('filtre salaire sans résultat', async () => {
    const res = await request(app).get('/offres?salaireMin=99999').set(auth(tC1));
    expect(res.body.total).toBe(0);
  });

  test('tri avec champ inconnu : 200 (tri par défaut)', async () => {
    const res = await request(app).get('/offres?sort=champBidon').set(auth(tC1));
    expect(res.status).toBe(200);
  });
});

describe('Offres - close / reopen', () => {
  test('close par le propriétaire : 200, puis invisible pour le candidat', async () => {
    const r = await request(app).patch(`/offres/${offreId}/close`).set(auth(tR1));
    expect(r.status).toBe(200);
    const liste = await request(app).get('/offres').set(auth(tC1));
    expect(liste.body.offres.find((o) => o._id === offreId)).toBeUndefined();
  });

  test('close par un autre recruteur : 403', async () => {
    const r = await request(app).patch(`/offres/${offreId}/close`).set(auth(tR2));
    expect(r.status).toBe(403);
  });

  test('reopen : 200', async () => {
    const r = await request(app).patch(`/offres/${offreId}/reopen`).set(auth(tR1));
    expect(r.status).toBe(200);
    expect(r.body.offre.statut).toBe('active');
  });
});

describe('Recommandations', () => {
  test("generate par un autre recruteur : 403", async () => {
    const r = await request(app).post(`/recommandations/generate/${offreId}`).set(auth(tR2));
    expect(r.status).toBe(403);
  });

  test('generate par le propriétaire : 201 et scores corrects', async () => {
    const r = await request(app).post(`/recommandations/generate/${offreId}`).set(auth(tR1));
    expect(r.status).toBe(201);
    const liste = await request(app)
      .get(`/recommandations/offre/${offreId}?sort=-score`).set(auth(tR1));
    expect(liste.body.total).toBe(2);
    expect(liste.body.recommandations[0].score).toBe(67); // 2 compétences sur 3
    expect(liste.body.recommandations[1].score).toBe(0);
  });

  test('filtre minScore', async () => {
    const r = await request(app)
      .get(`/recommandations/offre/${offreId}?minScore=50`).set(auth(tR1));
    expect(r.body.total).toBe(1);
  });

  test('/recommandations/me côté candidat : 200', async () => {
    const r = await request(app).get('/recommandations/me').set(auth(tC1));
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(1);
  });

  test('/recommandations/me avec un recruteur : 403', async () => {
    const r = await request(app).get('/recommandations/me').set(auth(tR1));
    expect(r.status).toBe(403);
  });

  test('stats des recommandations : 200', async () => {
    const r = await request(app).get(`/recommandations/stats/offre/${offreId}`).set(auth(tR1));
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(2);
  });
});

describe('Stats offres et cascade', () => {
  test('/offres/stats : 200', async () => {
    const r = await request(app).get('/offres/stats').set(auth(tC1));
    expect(r.status).toBe(200);
    expect(r.body.total).toBeGreaterThanOrEqual(1);
  });

  test('/offres/mes-stats refusé au candidat : 403', async () => {
    const r = await request(app).get('/offres/mes-stats').set(auth(tC1));
    expect(r.status).toBe(403);
  });

  test("supprimer l'offre supprime ses recommandations", async () => {
    const del = await request(app).delete(`/offres/${offreId}`).set(auth(tR1));
    expect(del.status).toBe(200);
    const restantes = await Recommandation.countDocuments({ offreId });
    expect(restantes).toBe(0);
  });
});
