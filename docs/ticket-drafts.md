# Ticket drafts (CREATED on GitHub as issues #2–#43; spec is #1)

Repo: Pinont/Cloud-Deployment-FinalProject · 42 tickets · create in the order below
so "Depends on" can be filled with real `#n`. Format: **title** · labels · owner.
Assignees: PM = Pinont, Dev 1 (restaurant) = Hydra07188, Dev 2 (review) = flogame55, Tester (favorite, E2E, CI monitoring) = phoo3011.

## 1. Platform (PM) — label `platform`, `core`
1. **[platform] Monorepo structure + CODEOWNERS + Dockerfile template**
   - [ ] folders for 4 services, frontend, nginx, e2e, docs
   - [ ] CODEOWNERS maps each folder to its owner; `_service-ci.yml` owned by PM
   - [ ] Dockerfile + .dockerignore template in `docs/templates/`
2. **[platform] CI/CD reusable workflow + push to Docker Hub** · Depends on: 1
   - [ ] `_service-ci.yml`: Node 20, `npm ci`, ESLint, Jest coverage ≥ 70%
   - [ ] on `main` only: push `latest` and `sha-<commit>`
   - [ ] Secrets set: DOCKERHUB_USERNAME, DOCKERHUB_TOKEN, JWT_SECRET
   - [ ] branch protection: CI must pass before merge to `main`
3. **[platform] Nginx gateway routing** · Depends on: 1
   - [ ] `/api/auth|restaurants|reviews|favorites` → ports 3001–3004; `/` serves frontend
4. **[platform] docker-compose (+ dev override) with MongoDB** · Depends on: 3
   - [ ] images from Docker Hub, one DB per service, `.env.example`
   - [ ] `docker-compose.dev.yml` builds from local folders
5. **[platform] Login + Register page** · Depends on: auth login, 3
   - [ ] login → `/api/auth/login`, token in localStorage, shows `/api/auth/me`
6. **[platform] Restaurant search page + restaurant/review page** · Depends on: restaurant list, review create
7. **[platform] Deploy plan, rollback, pipeline diagram** · Depends on: 2, 4
   - [ ] `docs/deploy-plan.md`, `docs/pipeline.md` (Mermaid), rollback via `sha-` tag
8. **[platform] Test Spec** (12 unit, 3 integration, 1 E2E)
   - [ ] `docs/test-spec.md`, owners per new role mapping, pass criteria 100% / ≥ 70%

## 2. auth-service (PM) — label `service:auth`
9. **[auth] POST /auth/register** · core · Tests AU-03, AU-04
   - [ ] 201, no `passwordHash` in response; duplicate email 409; invalid input 400
   - [ ] bcrypt; role always `user`
10. **[auth] POST /auth/login** · core · Tests AU-01, AU-02 · Depends on: register
    - [ ] 200 + JWT (HS256, 1h, `{sub,email,role}`); wrong credentials 401 with generic message
11. **[auth] GET/PUT /auth/me + JWT middleware** · core · Depends on: login
    - [ ] 401 without/invalid/expired token; PUT updates `name` only, 400 on empty
12. **[auth] Unit tests + coverage ≥ 70% + CI workflow** · core · Depends on: 2
    - [ ] AU-01..AU-04 + `/auth/me` without token; `auth-service.yml` with path filter
13. **[auth] Lock account after 5 failed logins (15 min)** · extra
14. **[auth] Refresh token** · extra
15. **[auth] owner/admin roles** · extra

## 3. restaurant-service (Dev 1) — label `service:restaurant`
16. **[restaurant] POST /restaurants** · core · Test RS-01
    - [ ] login required; name required (400); priceRange 1–4
17. **[restaurant] GET /restaurants search/filter/sort** · core · Test RS-02
    - [ ] `category`, `price`, `sort=rating`
18. **[restaurant] GET /restaurants/:id** · core
19. **[restaurant] PUT/DELETE /restaurants/:id (owner only)** · core · Test RS-03
    - [ ] non-owner token → 403
20. **[restaurant] PATCH /restaurants/:id/rating (internal)** · core
    - [ ] sets `avgRating`, `reviewCount`; called by review-service
21. **[restaurant] Unit tests + CI workflow** · core · RS-01..03; `restaurant-service.yml`
22. **[restaurant] Filter "open now"** · extra
23. **[restaurant] Nearby search by coordinates** · extra

## 4. review-service (Dev 2) — label `service:review`
24. **[review] POST /reviews** · core · Tests RV-01, RV-03
    - [ ] rating 1–5 else 400; one review per user per restaurant else 409; restaurant must exist
25. **[review] GET reviews by restaurant + rating summary** · core
26. **[review] DELETE /reviews/:id (own only)** · core
    - [ ] after delete, recalculate average and count and update restaurant-service (agreed with Dev 1, Hydra07188)
    - [ ] deleting the last review sets avgRating 0 and reviewCount 0
27. **[review] Calculate average rating and update restaurant-service (on create and delete)** · core · Tests RV-02, IT-02 · Depends on: restaurant rating PATCH
    - [ ] 4,5,3 → 4.0; failure of restaurant-service handled gracefully
28. **[review] Unit tests + CI workflow** · core · RV-01..03; `review-service.yml`
29. **[review] Like a review** · extra
30. **[review] Owner reply** · extra
31a. **[review] Review images** · extra · agreed with Dev 2 (flogame55): text-only reviews first, images only if time allows
    - [ ] optional images on a review (start with image URLs; file upload only if storage is added to compose)
    - [ ] size/type limits; images removed when the review is deleted
    - [ ] extra tests for the image rules

## 5. favorite-service (Tester) — label `service:favorite`
31. **[favorite] POST /favorites** · core · Tests FV-01, FV-02, IT-03
    - [ ] 201; duplicate 409; unknown restaurant 404
32. **[favorite] GET /favorites/me** · core · Test FV-03
33. **[favorite] DELETE /favorites/:restaurantId** · core
34. **[favorite] Unit tests + CI workflow** · core · FV-01..03; `favorite-service.yml`
35. **[favorite] Integration tests IT-01, IT-03** · core
    - [ ] IT-01: no token → 401 on every service
36. **[favorite] E2E-01 Playwright** · core · Login → search → review → favorite
37. **[platform] E2E workflow** · core · owner Tester; pull 4 images, compose up, run Playwright
38. **[favorite] Multiple lists** · extra
39. **[favorite] Share list** · extra

## 6. Tester cross-cutting
40. **[platform] Monitor CI across services and notify owners** · core · owner Tester

## 7. PM
41. **[platform] Explain/demo pipeline + presentation prep** · core · week 5
