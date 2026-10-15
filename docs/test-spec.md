# Test Spec: Restaurant review system

Spec: #1 · Ticket: #3 · Owner: PM · Handed to: Tester (`phoo3011`)

## 1. Scope and pass criteria

| Level | Count | IDs |
|---|---|---|
| Unit | 12 (+2 PM additions) | AU-01..05, RS-01..03, RV-01..03, FV-01..03 |
| Integration | 3 | IT-01..03 |
| E2E | 1 | E2E-01 |

A release passes when **both** hold, per service:

1. 100% of the tests of that service pass.
2. Line coverage is at least **70%** (Jest `coverageThreshold`).

If either fails, the reusable workflow `_service-ci.yml` stops before the
Docker Hub push, so no image is published (user story 24).

## 2. Conventions

- Tooling: Jest + Supertest against the exported Express app, MongoDB via
  `mongodb-memory-server`. No real network, no shared database.
- A test asserts external behaviour only: HTTP status, response body, stored
  effect. Not internals.
- Test names start with the Test ID, for example `AU-03 rejects duplicate email`.
- Calls to another service are replaced by a stub in unit tests and run for
  real in the integration tests.
- Unless stated, a request is authenticated with a valid token for a user with
  role `user`. The shared `JWT_SECRET` is set by the test setup.

## 3. Owners

| Prefix | Service | Owner (role) | GitHub |
|---|---|---|---|
| AU | auth-service | PM | `Pinont` |
| RS | restaurant-service | Dev 1 | `Hydra07188` |
| RV | review-service | Dev 2 | `flogame55` |
| FV | favorite-service | Tester | `phoo3011` |
| IT, E2E | cross-service | Tester | `phoo3011` |

## 4. Unit tests

### auth-service (PM) — tickets #4, #14, #23, #24, #93

| ID | Input | Expected result |
|---|---|---|
| AU-01 | `POST /auth/login` with a registered email and the correct password | 200; body has `token` (HS256, payload `sub`, `email`, `role`, expires in 1h) and `user` without `passwordHash` |
| AU-02 | `POST /auth/login` with a registered email and a wrong password | 401; generic message, the same as for an unknown email |
| AU-03 | `POST /auth/register` with an email that already exists | 409; no second user stored |
| AU-04 | `POST /auth/register` with a password shorter than 8 characters (added by PM) | 400; no user stored |
| AU-05 | `npm run set-role -- <email> <role>` (`scripts/set-role.js`, added by PM) with (a) a registered email and `admin`, (b) an unknown email, (c) a role other than `user`, `owner`, `admin`, (d) no arguments | (a) exit 0; the stored role is `admin`. (b), (c), (d) exit non-zero with an error message; no user changed |

### restaurant-service (Dev 1)

| ID | Input | Expected result |
|---|---|---|
| RS-01 | `POST /restaurants` with a valid token and `{name, category, priceRange: 2}` | 201; `ownerId` equals the token `sub`. Without token: 401. Empty `name` or `priceRange` outside 1–4: 400 |
| RS-02 | `GET /restaurants?category=thai&price=2&sort=rating` on a seeded list | 200; only matching restaurants, ordered by `avgRating` descending |
| RS-03 | `PUT` and `DELETE /restaurants/:id` with a token of a user who is not the owner | 403; restaurant unchanged. Owner token: 200 |

### review-service (Dev 2)

| ID | Input | Expected result |
|---|---|---|
| RV-01 | `POST /reviews` with `{restaurantId, rating: 6}` and a valid token | 400. With `rating` 1–5 and an existing restaurant (stub): 201 |
| RV-02 | Reviews with ratings 4, 5 and 3 for one restaurant | Average is 4.0 and `reviewCount` is 3; the value sent to restaurant-service (stub) is `avgRating: 4.0, reviewCount: 3` |
| RV-03 | Same user posts a second review for the same restaurant | 409; one review stored |

### favorite-service (Tester)

| ID | Input | Expected result |
|---|---|---|
| FV-01 | `POST /favorites` with `{restaurantId}` for an existing restaurant (stub) | 201; entry stored for the token user |
| FV-02 | `POST /favorites` twice with the same `restaurantId` | Second call 409; one entry stored |
| FV-03 | `GET /favorites/me` when two users have favourites | 200; only entries of the token user. Without token: 401 |

## 5. Integration tests (run against `docker compose`, Tester)

| ID | Scenario | Expected result |
|---|---|---|
| IT-01 | Call one protected endpoint of every service without a token | 401 from auth, restaurant, review and favorite |
| IT-02 | Post a review through review-service, then read the restaurant from restaurant-service | `avgRating` and `reviewCount` match the review. Open point: this sits with Dev 2's rating ticket (#16); it can move to the Tester |
| IT-03 | `POST /favorites` with a `restaurantId` that does not exist in restaurant-service | 404; no entry stored |

## 6. End-to-end test (Playwright, Tester)

| ID | Flow | Expected result |
|---|---|---|
| E2E-01 | Register → log in on the login page → search a restaurant by category → open it and post a review → add it to favourites → open the favourites list | Each step succeeds in the browser through the Nginx gateway; the restaurant shows the new rating and appears in the favourites list |

## 7. Extra case (pending Tester agreement)

| ID | Input | Expected result |
|---|---|---|
| RV-04 | `DELETE /reviews/:id` of the owner's review | 200; restaurant-service receives the recalculated `avgRating` and `reviewCount`. Deleting the last review sends `avgRating: 0, reviewCount: 0`. Counted as an extra until the Tester agrees |

Source: ticket #15 (`[review] DELETE /reviews/:id`).

## 8. Mapping to the pipeline

| Stage | Runs | Gate |
|---|---|---|
| PR and push, path-filtered per service | Unit tests of that service with coverage | 100% pass, coverage ≥ 70% |
| `main` only, after the unit gate | Docker build and push with a candidate tag | Unit tests 100% pass, coverage ≥ 70% |
| `e2e.yml` | IT-01..03 and E2E-01 on the pulled candidate images; then promote those same images to `latest` and `sha-<commit>` | Publish release tags only after all integration and E2E tests pass |
