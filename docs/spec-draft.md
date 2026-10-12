# Spec draft: Restaurant review system (NOT published — awaiting PM approval)

## Problem Statement

A student group must plan and deploy a multi-service system with automated
CI/CD, a login page, unit/integration/E2E tests, and images in a container
registry. Without a shared contract, four people building four services will
integrate late and break each other's pipelines. Diners want to find
restaurants, read and write reviews, and keep a list of favourites.

## Solution

A restaurant review web app made of four independently deployable services
(auth, restaurant, review, favorite) behind one gateway, in one monorepo.
Every merge to `main` that passes tests builds and publishes that service's
image to the registry; the whole system runs with one compose command.
Diners register and log in, search and filter restaurants, post one rating
and comment per restaurant, and save restaurants to a favourites list.

## User Stories

1. As a diner, I want to register with email, password and name, so that I have an account
2. As a diner, I want registration to reject an email that is already used, so that accounts stay unique
3. As a diner, I want registration to reject passwords shorter than 8 characters, so that my account is safer
4. As a diner, I want to log in and receive a token valid for 1 hour, so that I can use the app
5. As a diner, I want a wrong password to be rejected without revealing whether the email exists, so that my account is not probed
6. As a diner, I want to see and edit my profile name, so that my reviews show the right name
7. As a diner, I want a login page on the website, so that I can sign in without using the API directly
8. As a diner, I want to search restaurants by category and price range, so that I find a place that fits me
9. As a diner, I want to sort restaurants by rating, so that I see the best first
10. As a diner, I want a restaurant page with details and its reviews, so that I can decide where to eat
11. As a restaurant owner, I want to add my restaurant (name required, price range 1–4), so that diners can find it
12. As a restaurant owner, I want to edit or delete only my own restaurant, so that nobody else changes it
13. As a diner, I want to rate a restaurant 1–5 with a comment, so that I share my experience
14. As a diner, I want only one review per restaurant, so that ratings are fair
15. As a diner, I want reviews only for restaurants that exist, so that data stays valid
16. As a diner, I want to delete my own review, so that I can retract it
17. As a diner, I want a restaurant's average rating and review count to update after a review is added or deleted, so that the score is current
18. As a diner, I want to save a restaurant to my favourites, so that I can find it again
19. As a diner, I want saving the same restaurant twice to be rejected, so that my list has no duplicates
20. As a diner, I want to save only restaurants that exist, so that my list has no dead entries
21. As a diner, I want to see only my own favourites and remove one, so that my list is private and tidy
22. As any user, I want every protected API to reject requests without a valid token, so that data is protected
23. As a developer, I want my service's tests and image build to run automatically on push/PR, so that I get fast feedback
24. As a developer, I want only passing code on `main` to publish an image, so that the registry holds working builds
25. As the PM, I want a documented deploy and rollback procedure, so that the team can recover from a bad release
26. As the Tester, I want a written Test Spec mapped to automated tests, so that quality is verifiable
27. As a team member, I want to explain my own service and pipeline, so that I can present my part

(Extras, later: account lockout after 5 failed logins, refresh token,
owner/admin roles, "open now" filter, nearby search, review likes and owner
replies, multiple/shared favourite lists.)

## Implementation Decisions

- Four services (auth, restaurant, review, favorite), each with its own
  database, behind one Nginx gateway that exposes `/api/<service>`.
- Shared stack: Node 20 + Express, MongoDB, JWT (HS256) with one shared
  secret verified locally by every service; passwords hashed with bcrypt.
- Token carries user id, email and role; lifetime 1 hour.
- Service-to-service calls: review → restaurant (existence check and rating
  update); favorite → restaurant (existence check). Restaurant rating update
  endpoint is internal.
- Monorepo, one folder per service plus frontend, gateway and compose; CI is
  a reusable workflow with one thin, path-filtered workflow per service.
- Images published as `latest` and `sha-<commit>` only from `main`;
  rollback means pinning a previous `sha-` tag.
- Ownership: PM auth + platform; Dev 1 restaurant; Dev 2 review; Tester
  favorite + E2E. Details in the design spec and ticket drafts.

## Testing Decisions

- A good test checks external behaviour (HTTP status and response body, the
  stored effect), not internals.
- **Seams (proposed):** one per service at its HTTP boundary — the exported
  Express app exercised with Supertest against an in-memory Mongo. One
  additional seam at the gateway for cross-service integration and E2E.
- Tested: every service's endpoints and rules per the Test Spec (12 unit,
  3 integration IT-01..03, 1 E2E-01); gate = 100% pass and ≥ 70% coverage per
  service, otherwise no image is pushed.
- Prior art: none yet (empty repo); the auth-service tests become the
  reference for the other services.

## Out of Scope

Payments, image uploads, real-time features, mobile apps, production-grade
hosting/orchestration (Kubernetes), and the "extra" features until week 4.

## Further Notes

Source: assignment sheet and the "โครงสร้างระบบรีวิวร้านอาหาร (แบบวงใน)"
design doc. Role mapping follows the user (PM = auth, Tester = favorite).
Supporting drafts: `docs/superpowers/specs/...design.md`, `docs/ticket-drafts.md`.
