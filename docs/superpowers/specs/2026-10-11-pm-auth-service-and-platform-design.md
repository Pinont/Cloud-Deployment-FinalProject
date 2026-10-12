# Design: PM scope — auth-service + platform/CI-CD (monorepo)

Date: 2026-10-11 · Owner: PM · Status: draft for review

## 1. Context and intent

Group project: a restaurant review system built as 4 microservices, deployed
via automated CI/CD to Docker Hub. Source documents: the assignment sheet and
the "โครงสร้างระบบรีวิวร้านอาหาร (แบบวงใน)" design doc.

Decisions made with the user:

- **Monorepo** (one GitHub repo) instead of the 5 repos in the original doc.
- **Role mapping differs from the original doc:** PM owns `auth-service`;
  Tester owns `favorite-service`; Dev 1 → `restaurant-service`;
  Dev 2 → `review-service`. The PM also owns the platform pieces
  (gateway, compose, login page, CI/CD, docs).
- **CI/CD approach 1:** one reusable workflow + one thin workflow per service
  filtered by `paths:`.

Success criteria for this phase:

1. `auth-service` implements the Core endpoints and passes its tests
   (coverage ≥ 70%), and its pipeline pushes an image to Docker Hub on `main`.
2. A login page works end-to-end through the Nginx gateway.
3. PM deliverables exist: deploy/rollback plan, pipeline doc, Test Spec.
4. Other members get ready-to-use templates (workflow, Dockerfile, folder
   skeleton, Test Spec rows) so their services can plug in unchanged.

Out of scope now: code for the other 3 services, Playwright E2E (Tester),
and the auth "extras" (lockout, refresh token, owner/admin) — week 4.

## 2. Repository layout

```
/
├── auth-service/        (PM)   src/{app,server}.js, routes/, models/, middleware/auth.js
│                               tests/{unit,integration}/, Dockerfile, .dockerignore, package.json
├── restaurant-service/  (Dev 1)  README + ownership stub only
├── review-service/      (Dev 2)  README + ownership stub only
├── favorite-service/    (Tester) README + ownership stub only
├── frontend/            login page (static HTML + JS)
├── nginx/nginx.conf
├── docker-compose.yml        images from Docker Hub + MongoDB
├── docker-compose.dev.yml    override: build from local folders
├── e2e/                      stub for Tester (Playwright)
├── docs/                     deploy-plan.md, pipeline.md, test-spec.md
└── .github/
    ├── CODEOWNERS
    └── workflows/
        ├── _service-ci.yml   reusable (workflow_call)
        ├── auth-service.yml  (+ templates for the other 3 under docs/templates/)
        └── e2e.yml
```

## 3. auth-service (port 3001, Node 20 + Express + MongoDB + JWT + bcrypt)

Data (`users`): `email` (unique, lowercased), `passwordHash`, `name`,
`role` (`user` | `owner` | `admin`, default `user`), `failedLogins` (default 0,
unused until the extras phase).

| Endpoint | Behaviour |
|---|---|
| `POST /auth/register` | body `{email, password, name}`. 400 if email invalid, password < 8 chars, or name empty. 409 if email exists. 201 returns the user without `passwordHash`. Hash with bcrypt (cost 10). Role is always `user` (not client-settable). |
| `POST /auth/login` | body `{email, password}`. 200 `{token, user}`; token HS256, payload `{sub, email, role}`, expires in 1h. 401 with the same generic message for unknown email or wrong password. |
| `GET /auth/me` | Bearer token required; 401 if missing/invalid/expired; returns the user. |
| `PUT /auth/me` | Bearer token required; updates `name` only (email and role are immutable here); 400 on empty name. |
| `GET /health` | 200 `{status:"ok"}` for container health checks. |

Shared contract for all services: JWT is verified locally with the same
`JWT_SECRET`; the verification middleware (`middleware/auth.js`) is small
enough for teammates to copy. Config via env: `PORT`, `MONGO_URI`,
`JWT_SECRET` (service refuses to start without it).

Structure: `app.js` builds and exports the Express app (no listen, for
Supertest); `server.js` connects Mongo and listens. Errors go through one
error handler returning `{error: "<message>"}`.

## 4. Gateway, compose, frontend

- `nginx.conf`: `/api/auth/` → `auth:3001/auth/`; `/api/restaurants/`,
  `/api/reviews/`, `/api/favorites/` → ports 3002/3003/3004 (routes defined
  now so teammates only add their image); `/` serves `frontend/`.
- `docker-compose.yml`: nginx (port 80), 4 services from
  `${DOCKERHUB_USERNAME}/<service>:latest`, one MongoDB container with a
  separate database per service; `JWT_SECRET` from `.env` (git-ignored,
  `.env.example` committed). Rollback = pin a `sha-<commit>` tag and
  `docker compose up -d`.
- `frontend/`: login form (email, password) → `POST /api/auth/login`, stores
  the token in `localStorage`, shows the user from `GET /api/auth/me`;
  includes a minimal register form. Static files, no build step.

## 5. CI/CD

- `_service-ci.yml` (inputs: `service`): checkout → Node 20 → `npm ci` →
  ESLint → Jest with coverage (threshold 70%, run in the service dir) →
  on `main` only: Docker Hub login + build/push tags `latest` and
  `sha-<commit>` for `<user>/<service>`.
- `auth-service.yml`: triggers on push/PR to `main`/`develop` with
  `paths: auth-service/**` (and the workflow files), calls the reusable one.
- Secrets: `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`, `JWT_SECRET`.
- Branching: `feature/*` → PR → `develop` → PR → `main`; main requires CI to
  pass (documented; branch protection is a repo setting the user applies).
- `e2e.yml`: pulls the 4 latest images, `docker compose up`, runs Playwright;
  stays a stub until the Tester adds `e2e/`.

## 6. Tests (auth-service)

Jest + Supertest + mongodb-memory-server; ≥ 4 unit tests (assignment: at
least the number of members), all mapped to Test Spec IDs:

- AU-01 login with correct credentials → 200 + token
- AU-02 wrong password → 401
- AU-03 register with existing email → 409
- AU-04 register with password < 8 chars → 400 (added by PM)
- plus `/auth/me` without token → 401 (feeds IT-01)

`docs/test-spec.md` carries the full spec from the source doc (12 unit,
3 integration, 1 E2E) with owners adjusted to the new role mapping, pass
criteria (100% pass, coverage ≥ 70%), and how each maps to the pipeline.

## 7. Docs (PM deliverables)

- `docs/deploy-plan.md`: environments, branch flow, secrets, deploy and
  rollback steps, 5-week plan with checkboxes.
- `docs/pipeline.md`: stages with a diagram (Mermaid), how to add a new
  service workflow, who owns what.
- `docs/test-spec.md`: see section 6.
- `docs/templates/`: workflow, Dockerfile, and `.dockerignore` for teammates.

## 8. Risks and notes

- Docker Hub credentials/secrets and branch protection must be configured by
  the user in GitHub; the pipeline cannot be proven green until then. Local
  verification (lint, tests, `docker build`, compose smoke test) is done here
  where Docker is available.
- Path-filtered workflows mean a docs-only change does not run service CI;
  intended.
- Role mapping differs from the source doc; `test-spec.md` and
  `CODEOWNERS` follow the user's mapping.

## 9. Features and ticket ownership (agreed in discussion)

Issues: one per feature (approach A), granularity decided with the user.
Title format `[service] <feature>` (no feature codes; GitHub `#n` is the ID;
Test Spec IDs such as AU-01 go in the body). Labels: `service:auth|restaurant|review|favorite`
or `platform`, plus `core` or `extra`. No `week-*` labels. Body: description,
acceptance criteria, related Test IDs, "Depends on #n". Create in dependency
order (platform first) so `#n` references resolve. **No issue is created
until the user approves.**

| Owner | Core | Extra |
|---|---|---|
| PM — auth | register, login, `/auth/me` + JWT middleware, unit tests + coverage | lock after 5 failed logins, refresh token, owner/admin roles |
| PM — platform | monorepo + CODEOWNERS + Dockerfile template, CI/CD reusable workflow + Docker Hub push, Nginx gateway, docker-compose (+dev override), Login/Register page, search + restaurant/review pages, deploy plan/rollback/pipeline doc, Test Spec | — |
| Dev 1 — restaurant | `POST`, `GET` list (search/filter/sort), `GET :id`, `PUT/DELETE` (owner only), `PATCH :id/rating` (internal), unit tests RS-01..03, CI workflow | filter "open now", nearby search |
| Dev 2 — review | `POST /reviews`, `GET` by restaurant + rating, `DELETE` own, average rating → restaurant-service, unit tests RV-01..03, CI workflow | like a review, owner reply, review images (text-only first) |
| Tester — favorite | `POST`, `GET /me`, `DELETE :restaurantId`, unit tests FV-01..03, CI workflow, integration IT-01/IT-03, E2E-01 (Playwright), E2E workflow | multiple lists, share list |

Total: 42 tickets. Open point: IT-02 (review → restaurant average) sits with
Dev 2's rating ticket, per the source doc; can move to the Tester if preferred.

## 10. GitHub Actions ownership

- **PM:** `_service-ci.yml` (only PM edits it; enforced via CODEOWNERS),
  `auth-service.yml`, templates, Docker Hub account, repo-level Secrets,
  branch protection, pipeline docs.
- **Dev 1 / Dev 2 / Tester:** their own thin `<service>.yml` (path filter +
  call to the reusable workflow) and their service's Dockerfile; each must be
  able to explain and fix their pipeline.
- **Tester:** `e2e.yml` (pull 4 images, compose up, Playwright), and
  monitors CI results across services, notifying owners of failures.
- **Everyone:** review each other's PRs before merge; help fix Build/Test/Deploy failures.
- Secrets are set once at repo level (monorepo), not per person.
