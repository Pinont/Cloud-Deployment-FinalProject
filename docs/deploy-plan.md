# Deploy plan

How the system is built, released, run and rolled back. For the pipeline stages and a diagram see
[`pipeline.md`](pipeline.md).

## Environments

| Environment | What runs | Images come from |
|---|---|---|
| **CI** (GitHub Actions) | Lint and unit tests of the changed service; on `main` also the image build and push | Built from the commit |
| **Local development** | `docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build` | Built from the local folders |
| **Run / release** | `docker compose up -d` on any host with Docker (nginx on port 80, 4 services, one MongoDB) | Docker Hub: `<DOCKERHUB_USERNAME>/<service>:<IMAGE_TAG>` |

There is no hosted environment; "deploy" means running the compose stack with the published images.
Services are `auth-service`, `restaurant-service`, `review-service` and `favorite-service`.

> `docker-compose.yml`, `docker-compose.dev.yml` and `.env.example` come from ticket #20 (PR #58). The
> run and rollback steps below apply once that has merged.

## Branch flow

`feature/*` → pull request → `develop` → pull request → `main`.

- `main` requires the `Required CI (<service>)` check and one approving review (branch protection).
- Only a push to `main` publishes images. Pull requests and other branches stop after the tests.
- In practice the team has so far opened pull requests straight to `main`, which also works: the
  workflows run on pushes and pull requests to both `main` and `develop`. Pull requests get auto-merge
  turned on (`.github/workflows/auto-merge.yml`), so they merge by themselves once the check and the
  review are in.

## Secrets

| Secret | Where | Used for |
|---|---|---|
| `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN` | GitHub repository secrets | Logging in to Docker Hub and naming the images in `_service-ci.yml` |
| `AUTO_MERGE_TOKEN` | GitHub repository secret | Fine-grained token that turns on auto-merge. The default token is not used on purpose, because a merge made with it does not start the workflows that publish the images |
| `JWT_SECRET` | `.env` on the host running compose | Signing and verifying tokens. All four services must use the same value |
| `DOCKERHUB_USERNAME`, `IMAGE_TAG` | `.env` on the host | Which images compose pulls (see `.env.example`) |

The real `.env` is git-ignored. Never commit it.

## Deploy steps

1. Make sure CI is green on `main` for the services you want. The images exist only after a push to `main`
   succeeded: check the `Build and push` job, or the tags on Docker Hub.
2. On the host: `cp .env.example .env`, then set `DOCKERHUB_USERNAME` and a strong `JWT_SECRET`.
   Leave `IMAGE_TAG=latest`.
3. `docker compose pull` then `docker compose up -d`.
4. Check it:
   - `docker compose ps` shows every container running and `mongo` healthy.
   - Open `http://localhost/`: the login page loads.
   - `POST /api/auth/register` and `POST /api/auth/login` work through the gateway.
5. Create the first admin (optional, for owner/admin roles):
   `docker compose exec auth npm run set-role -- <email> admin`.

## Rollback

Every image published from `main` has an immutable tag `sha-<commit>`, and `latest` only moves to the newest
`main` commit. To go back to an earlier release:

1. Find the commit that was good: `git log --oneline main`, or the tag list of the image on Docker Hub.
2. In `.env`, set `IMAGE_TAG=sha-<that commit>` (the full 40-character commit hash, as pushed by CI).
3. `docker compose pull` then `docker compose up -d`. Compose recreates the containers with those images.
4. Run the checks from step 4 of the deploy steps.

Notes:

- `IMAGE_TAG` applies to all four services. To roll back only one service, put that tag on its `image:` line
  in a local override file and leave the others on `latest`.
- Tags are only available for services whose `main` build succeeded at that commit.
- A rollback does not undo data changes in MongoDB. There are no migrations; the services do not change
  stored data shapes between releases without a note in the pull request.
- To go forward again, remove or update any per-service `image:` override, set `IMAGE_TAG=latest`, and run `docker compose pull && docker compose up -d`.
- A bad release can also be undone in Git by reverting the commit on `main`; the pipeline then publishes a
  fresh image for the revert.

## 5-week plan

Weeks follow the ticket plan (extras in week 4, demo in week 5).

- [x] **Week 1, foundation:** monorepo, CODEOWNERS and templates (#2), reusable CI/CD and Docker Hub push (#12), Nginx gateway (#13), Test Spec (#3)
- [ ] **Week 2, core services:** auth register, login and `/auth/me` (done); restaurant, review and favorite endpoints (in progress, owners per CODEOWNERS)
- [ ] **Week 3, tests and CI per service:** auth unit tests, coverage ≥ 70% and workflow (done); the same for restaurant, review and favorite; docker-compose (#20, in review); login and register page (done); restaurant and review pages
- [ ] **Week 4, extras and integration:** auth lockout, refresh token and roles (done or in review); service extras; integration tests IT-01 to IT-03; E2E workflow and E2E-01 with Playwright
- [ ] **Week 5, delivery:** this deploy plan and the pipeline doc (#28); demo and presentation prep (#33): push code, pipeline runs, new image on Docker Hub, `docker compose up`; every member can explain their own service and pipeline

Tick a box when the matching tickets are closed.
