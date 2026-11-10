# Microservices Backend

A polyrepo-style microservices backend built with **Node.js + Express + MongoDB**, orchestrated with **Docker Compose** and fronted by a custom **API Gateway**.

---

## Architecture

```
Client (Postman)
      │
      ▼
API Gateway :3000  ──── JWT validation ────► forward with x-user-id / x-user-role
      │
      ├──► user-service        :3001  → users_db
      ├──► offre-service       :3002  → offres_db
      ├──► formation-service   :3003  → formations_db
      ├──► microprojet-service :3004  → microprojets_db
      └──► candidature-service :3005  → candidatures_db
```

### Inter-service communication (REST + SERVICE_TOKEN)

| Caller               | Calls                                        | Purpose                              |
|----------------------|----------------------------------------------|--------------------------------------|
| offre-service        | `GET /internal/users/:id`                    | Verify recruiter exists              |
| offre-service        | `GET /internal/users` (all candidats)        | Generate match-based recommendations |
| formation-service    | `GET /internal/users/:id`                    | Verify user before inscription       |
| microprojet-service  | `GET /internal/users/:id`                    | Verify participant before joining    |
| candidature-service  | `GET /internal/users/:id`                    | Verify candidate exists              |
| candidature-service  | `GET /internal/offres/:id`                   | Verify offer is active               |

---

## Services & Models

| Service              | Port | Models                        |
|----------------------|------|-------------------------------|
| api-gateway          | 3000 | —                             |
| user-service         | 3001 | User, Avis                    |
| offre-service        | 3002 | Offre, Recommandation         |
| formation-service    | 3003 | Formation, Quizz              |
| microprojet-service  | 3004 | Domaine, MicroProjet          |
| candidature-service  | 3005 | CV, Candidature               |

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- [Postman](https://www.postman.com/downloads/) for API testing

---

## Quick Start

### 1. Clone / open the project

```
cd "backend project"
```

### 2. (Optional) Create a root `.env` to override secrets

Create a `.env` file at the workspace root:

```env
JWT_SECRET=your_strong_jwt_secret_here
SERVICE_TOKEN=your_internal_service_token_here
```

If you skip this, the defaults in `docker-compose.yml` are used (fine for local dev, **not for production**).

### 3. Build and start all services

```bash
docker-compose up --build
```

This starts **11 containers**:
- 6 application containers (gateway + 5 services)
- 5 MongoDB containers (one per service)

First build takes ~2–3 minutes. Subsequent starts are instant.

### 4. Verify all services are healthy

```
GET http://localhost:3000/health   → { "status": "ok", "service": "api-gateway" }
GET http://localhost:3001/health   → { "status": "ok", "service": "user-service" }
GET http://localhost:3002/health   → { "status": "ok", "service": "offre-service" }
GET http://localhost:3003/health   → { "status": "ok", "service": "formation-service" }
GET http://localhost:3004/health   → { "status": "ok", "service": "microprojet-service" }
GET http://localhost:3005/health   → { "status": "ok", "service": "candidature-service" }
```

### 5. Import Postman collection

1. Open Postman
2. Click **Import**
3. Select `postman_collection.json` from this folder
4. Run the collection folders in order (01 → 11)

---

## API Routes (via Gateway on port 3000)

All routes except register/login require `Authorization: Bearer <token>`.

### Auth & Users (`/api/auth`, `/api/users`, `/api/avis`)

| Method | Path                        | Role      | Description                     |
|--------|-----------------------------|-----------|---------------------------------|
| POST   | /api/auth/register          | Public    | Register a new user             |
| POST   | /api/auth/login             | Public    | Login, returns JWT              |
| GET    | /api/users                  | Any       | List all active users           |
| GET    | /api/users/:id              | Any       | Get user by ID                  |
| PUT    | /api/users/:id              | Owner     | Update profile / competences    |
| DELETE | /api/users/:id              | Owner     | Soft-delete account             |
| POST   | /api/avis                   | Any       | Leave a review for a user       |
| GET    | /api/avis/user/:userId      | Any       | Get all reviews for a user      |
| PUT    | /api/avis/:id               | Author    | Update own review               |
| DELETE | /api/avis/:id               | Author    | Delete own review               |

### Offres & Recommandations (`/api/offres`, `/api/recommandations`)

| Method | Path                                   | Role       | Description                        |
|--------|----------------------------------------|------------|------------------------------------|
| GET    | /api/offres                            | Any        | List offers (filter by domaine, statut, typeContrat) |
| GET    | /api/offres/:id                        | Any        | Get offer by ID                    |
| POST   | /api/offres                            | recruteur  | Create an offer                    |
| PUT    | /api/offres/:id                        | Owner      | Update own offer                   |
| DELETE | /api/offres/:id                        | Owner      | Delete own offer                   |
| POST   | /api/recommandations/generate/:offreId | recruteur  | Generate ranked recommendations    |
| GET    | /api/recommandations/offre/:offreId    | Any        | Get recommendations for an offer   |

### Formations & Quizz (`/api/formations`, `/api/quizz`)

| Method | Path                               | Role       | Description                       |
|--------|------------------------------------|------------|-----------------------------------|
| GET    | /api/formations                    | Any        | List formations                   |
| GET    | /api/formations/:id                | Any        | Get formation by ID               |
| POST   | /api/formations                    | formateur  | Create a formation                |
| PUT    | /api/formations/:id                | Owner      | Update own formation              |
| DELETE | /api/formations/:id                | Owner      | Delete own formation              |
| POST   | /api/formations/:id/inscrire       | Any        | Enroll in a formation             |
| POST   | /api/formations/:id/desinscrire    | Any        | Unenroll from a formation         |
| GET    | /api/formations/:id/inscrits       | Any        | Get enrolled users                |
| GET    | /api/quizz/formation/:formationId  | Any        | Get quizzes for a formation       |
| GET    | /api/quizz/:id                     | Any        | Get quizz (hides answers for non-owner) |
| POST   | /api/quizz                         | formateur  | Create a quizz                    |
| PUT    | /api/quizz/:id                     | Owner      | Update own quizz                  |
| DELETE | /api/quizz/:id                     | Owner      | Delete own quizz                  |
| POST   | /api/quizz/:id/submit              | Any        | Submit answers, get graded score  |

### Domaines & MicroProjets (`/api/domaines`, `/api/microprojets`)

| Method | Path                                | Role  | Description                          |
|--------|-------------------------------------|-------|--------------------------------------|
| GET    | /api/domaines                       | Any   | List all domains (10 seeded on start) |
| GET    | /api/domaines/:id                   | Any   | Get domain by ID                     |
| POST   | /api/domaines                       | Any   | Create a domain                      |
| PUT    | /api/domaines/:id                   | Any   | Update a domain                      |
| DELETE | /api/domaines/:id                   | Any   | Delete a domain (blocked if in use)  |
| GET    | /api/microprojets                   | Any   | List microprojets (filter by domaine, statut) |
| GET    | /api/microprojets/:id               | Any   | Get microprojet by ID                |
| POST   | /api/microprojets                   | Any   | Create a microprojet                 |
| PUT    | /api/microprojets/:id               | Owner | Update own microprojet               |
| DELETE | /api/microprojets/:id               | Owner | Delete own microprojet               |
| POST   | /api/microprojets/:id/rejoindre     | Any   | Join a microprojet                   |
| POST   | /api/microprojets/:id/quitter       | Any   | Leave a microprojet                  |
| GET    | /api/microprojets/:id/participants  | Any   | Get participants list                |

### CVs & Candidatures (`/api/cvs`, `/api/candidatures`)

| Method | Path                                   | Role       | Description                          |
|--------|----------------------------------------|------------|--------------------------------------|
| POST   | /api/cvs                               | Any        | Create a CV                          |
| GET    | /api/cvs/user/:userId                  | Any        | Get all CVs for a user               |
| GET    | /api/cvs/:id                           | Owner/recruteur | Get CV by ID                   |
| PUT    | /api/cvs/:id                           | Owner      | Update own CV                        |
| DELETE | /api/cvs/:id                           | Owner      | Delete CV (blocked if candidatures use it) |
| POST   | /api/candidatures                      | candidat   | Submit a candidature                 |
| GET    | /api/candidatures/candidat/:candidatId | Any        | Get own candidatures                 |
| GET    | /api/candidatures/offre/:offreId       | recruteur  | Get candidatures for an offer        |
| GET    | /api/candidatures/:id                  | Owner/recruteur | Get candidature by ID           |
| PUT    | /api/candidatures/:id/statut           | recruteur  | Update status (vue/acceptée/rejetée) |
| DELETE | /api/candidatures/:id                  | candidat   | Withdraw candidature (only if 'envoyée') |

---

## User Roles

| Role      | Key permissions                                                      |
|-----------|----------------------------------------------------------------------|
| candidat  | Browse offres, inscribe to formations, submit quizz, create/submit CVs & candidatures, join microprojets |
| recruteur | Create/manage offres, generate recommendations, view candidatures, update candidature status |
| formateur | Create/manage formations and quizz                                   |

---

## Project Structure

```
backend project/
├── docker-compose.yml
├── postman_collection.json
├── README.md
│
├── api-gateway/
│   ├── Dockerfile
│   ├── package.json
│   ├── .env
│   └── src/
│       ├── index.js
│       ├── middleware/auth.js
│       └── routes/index.js
│
├── user-service/
│   ├── Dockerfile
│   ├── package.json
│   ├── .env
│   └── src/
│       ├── app.js / server.js
│       ├── models/       User.js, Avis.js
│       ├── controllers/  userController.js, avisController.js
│       ├── routes/       userRoutes.js, avisRoutes.js, internalRoutes.js
│       └── middleware/   auth.js
│
├── offre-service/         # Offre.js, Recommandation.js
├── formation-service/     # Formation.js, Quizz.js
├── microprojet-service/   # Domaine.js, MicroProjet.js (+ seed/)
└── candidature-service/   # CV.js, Candidature.js
```

---

## Stopping Services

```bash
docker-compose down          # stop containers, keep data volumes
docker-compose down -v       # stop and delete all MongoDB data
```

---

## Environment Variables

Each service's `.env` file (for local dev without Docker):

| Variable            | Description                                    |
|---------------------|------------------------------------------------|
| `PORT`              | Service port                                   |
| `MONGO_URI`         | MongoDB connection string                      |
| `JWT_SECRET`        | Secret for signing/verifying JWTs              |
| `SERVICE_TOKEN`     | Shared secret for internal service calls       |
| `USER_SERVICE_URL`  | URL of user-service (offre/formation/microprojet/candidature services) |
| `OFFRE_SERVICE_URL` | URL of offre-service (candidature-service only)|

> **Security note:** Change `JWT_SECRET` and `SERVICE_TOKEN` to strong random values before any deployment. Never commit secrets to version control.

---

## Contributing — Git Workflow

### First time setup (project owner)

```bash
# 1. Initialize git in the project root
cd "backend project"
git init

# 2. Stage everything (gitignore already excludes node_modules and .env)
git add .

# 3. First commit
git commit -m "initial: microservices backend with 5 services + API gateway"

# 4. Create repo on GitHub (github.com → New repository → copy the URL)
#    Then link and push:
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git branch -M main
git push -u origin main
```

---

### For teammates — cloning and running the project

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
cd YOUR_REPO_NAME

# 2. Create the .env file from the example
copy .env.example .env
# Then open .env and set your own JWT_SECRET and SERVICE_TOKEN values
# (or leave the defaults for local development)

# 3. Make sure Docker Desktop is running, then:
docker-compose up --build

# That's it — all 11 containers start automatically.
# First build takes ~3 minutes, subsequent starts are instant.
```

### After pulling new changes

```bash
git pull

# If any service code changed, rebuild:
docker-compose up --build

# If only docker-compose.yml or config changed (no code changes):
docker-compose up
```

### Stopping the project

```bash
# Stop containers but keep your database data:
docker-compose down

# Stop AND delete all database data (fresh start):
docker-compose down -v
```
