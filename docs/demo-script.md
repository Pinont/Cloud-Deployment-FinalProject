# Demo and presentation guide

For ticket #33: a live demo of "push code → pipeline runs → new image on Docker Hub → `docker compose up`",
a short explanation from every member of their own service and pipeline, and the deploy plan and pipeline
diagram ready to show. Background: [`deploy-plan.md`](deploy-plan.md), [`pipeline.md`](pipeline.md),
[`test-spec.md`](test-spec.md).

## Before the demo (checklist)

- [ ] The repository secrets `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` are set, and `main` is green.
- [ ] Docker Hub already has `latest` and a `sha-<commit>` tag for all four images: `auth-service`,
      `restaurant-service`, `review-service`, `favorite-service`.
- [ ] The demo machine has Docker, a browser and `curl`, and port 80 is free.
- [ ] `cp .env.example .env` is done: `DOCKERHUB_USERNAME` set, a `JWT_SECRET` chosen, `IMAGE_TAG=latest`.
- [ ] Pull the images once before presenting: `docker compose pull` (a first pull can be slow).
- [ ] Have open: the repository, the Actions tab, the Docker Hub tags page, `docs/pipeline.md`
      (the Mermaid diagram) and `docs/deploy-plan.md`.
- [ ] Write down an older `sha-<commit>` tag of the service you will change, and check it exists on Docker Hub (rollback, step 9).
- [ ] Pick the small change for step 2 in advance (see below) and have a second finished example run in the
      Actions tab in case the live run is slow.

## Live demo (about 8 to 10 minutes)

| # | Do | Say / show | Expected result |
|---|---|---|---|
| 1 | Show `docs/pipeline.md` | The stages: changes → test → publish (only on `main`) → Docker Hub → compose. One reusable workflow, one thin workflow per service. | The diagram renders |
| 2 | On a branch, make a small visible change in one service (for example a comment or a response message), push it and open a pull request | The path filter starts only that service's workflow. | `Required CI (<service>)` runs lint, then tests with coverage ≥ 70% |
| 3 | Merge the pull request (auto-merge does it once the check and the review pass) | `publish` runs only on `main`. | `Build and push` succeeds |
| 4 | Open Docker Hub | The image has a new `sha-<commit>` tag and `latest` moved to it. | The new tag is listed |
| 5 | On the demo machine: `docker compose pull && docker compose up -d`, then `docker compose ps` | One command runs nginx, the four services and MongoDB. | Every container is running; `mongo` is healthy |
| 6 | Open `http://localhost/`, register, log in | The login page talks to auth-service through the gateway. | The welcome view shows your name and role |
| 7 | Add a restaurant (see the commands below), open **Browse restaurants**, filter by category and price, sort by rating | Search is restaurant-service. | The restaurant is listed |
| 8 | Open the restaurant, post a review, save it to favourites | Review-service updates the restaurant's average rating; favorite-service keeps the list. | The review appears; the average and count update; "Saved to your favourites" |
| 9 | Roll back **one service**: add a `docker-compose.override.yml` that pins only the service you changed in step 2 to an older tag (see below), then `docker compose up -d` | Rollback is pinning an earlier `sha-<commit>` tag. Only that service is recreated. | That service runs the old image; the others are untouched |

The website cannot create restaurants yet, so add one with `curl` after logging in (replace the values):

```bash
# register and log in (skip register if the account exists)
curl -s -X POST http://localhost/api/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"demo@example.com","password":"password123","name":"Demo"}'
TOKEN=$(curl -s -X POST http://localhost/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"demo@example.com","password":"password123"}' | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
echo "$TOKEN"          # must print a long token; if it is empty, the login failed (or paste it: TOKEN='<paste token here>')

curl -s -X POST http://localhost/api/restaurants -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Thai Garden","category":"thai","priceRange":2,"address":"1 Main St"}'
```

A `sha-<commit>` tag exists only for the services that changed (or whose workflow changed) at that commit, so one
old tag is usually **not** available for all four images. Roll back the service you changed in step 2, and look up
its older tag on Docker Hub beforehand:

```yaml
# docker-compose.override.yml (Compose reads it automatically next to docker-compose.yml)
services:
  auth:     # the service you changed in step 2
    image: ${DOCKERHUB_USERNAME}/auth-service:sha-<an older commit that exists on Docker Hub>
```

Do not set `IMAGE_TAG` to an old commit for the whole stack unless you have checked that tag exists for all four images.

If something goes wrong: show the finished run you prepared in the Actions tab for steps 2 to 4; for step 5,
`docker compose logs <service>` shows why a container stopped (a missing `JWT_SECRET` or `DOCKERHUB_USERNAME`
in `.env` is the usual cause).

## One-minute explanation per member

Fact sheets from the code on `main`. Rewrite them in your own words; each person should be able to answer the
questions underneath.

### @Pinont: auth-service (port 3001), gateway, frontend, pipeline
- **Does:** registration, login with a 1-hour JWT (HS256), refresh tokens, profile (`/auth/me`), a 15-minute
  lockout after 5 wrong passwords (423), and `user` / `owner` / `admin` roles carried in the token.
- **Endpoints:** `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `GET /auth/me`, `PUT /auth/me`, and `PUT /auth/users/:id/role` (admin only; after registering the account, make the first admin with `docker compose exec auth npm run set-role -- <email> admin`).
- **Tests:** AU-01 to AU-04 and IT-01 (no token → 401), plus lockout, refresh-token and role tests; Jest with a 70% line-coverage gate.
- **Pipeline:** `auth-service.yml` calls `_service-ci.yml`; the PM owns the reusable workflow, the compose files, nginx and the docs.

### @Hydra07188: restaurant-service (port 3002)
- **Does:** create, search, view, edit and delete restaurants; owner-only changes; an internal endpoint that review-service uses to set `avgRating` and `reviewCount`; "open now" and nearby search.
- **Endpoints:** `GET /restaurants` (`category`, `price`, `sort=rating`, `openNow`, `lat`/`lng`/`radius`), `GET /restaurants/:id`, `POST /restaurants`, `PUT` and `DELETE /restaurants/:id`, `PATCH /restaurants/:id/rating`.
- **Tests:** RS-01 to RS-03; Jest with a 70% gate.
- **Pipeline:** `restaurant-service.yml` and its Dockerfile (plain JavaScript).

### @flogame55: review-service (port 3003)
- **Does:** one review per user per restaurant (rating 1 to 5 and a comment), listing and rating summary, deleting your own review, likes, and recalculating the restaurant's average rating through restaurant-service after a create or delete.
- **Endpoints:** `POST /reviews`, `GET /reviews/restaurant/:id`, `GET /reviews/restaurant/:id/rating`, `DELETE /reviews/:id`, `POST` and `DELETE /reviews/:id/like`.
- **Tests:** RV-01 to RV-03; Jest with a 70% gate. IT-02 (a review updates the restaurant) runs in the compose integration suite.
- **Pipeline:** `review-service.yml`; TypeScript with a two-stage Dockerfile (build, then run `dist/src/server.js`).

### @phoo3011: favorite-service (port 3004), E2E and CI monitoring
- **Does:** save restaurants to named lists, list and remove them, share a list through a read-only link, and revoke it. Favourites and share links are stored in MongoDB.
- **Endpoints:** `POST /favorites`, `GET /favorites/me`, `DELETE /favorites/:restaurantId`, `POST` and `DELETE /favorites/share`, `GET /favorites/shared/:token`.
- **Tests:** FV-01 to FV-03, and the integration tests IT-01 to IT-03 against the compose stack; a 70% gate.
- **Pipeline:** `favorite-service.yml`; TypeScript. E2E-01 (Playwright) and the E2E workflow are still open (#30, #31).

### Questions everyone should be able to answer
1. What starts the pipeline, and why does only your service's workflow run? (path filter)
2. What stops a bad build from reaching Docker Hub? (lint and tests with the coverage gate; `publish` only on `main`)
3. How do I run the whole system, and how do I roll back? (`docker compose up -d`; pin the service's image to an earlier `sha-<commit>` tag)
4. How does your service know who the user is? (the shared `JWT_SECRET`; each service verifies the token itself)
5. Which services call each other? (review → restaurant for the existence check and rating update; favorite → restaurant for the existence check)

## Things to be honest about
- IT-01 to IT-03 run in the compose integration job, and E2E-01 runs with the Playwright workflow.
- The publish job pushes `sha-<commit>` and `latest` right after the unit tests; the planned step that promotes images only after the integration and E2E tests pass does not exist yet (`pipeline.md`).
- The website cannot add restaurants or show the favourites list; use the API for that.
