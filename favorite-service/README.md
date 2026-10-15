# favorite-service

Owner: @phoo3011 (Tester)

Port 3004. See issues labelled `service:favorite`. Start from `docs/templates/Dockerfile` and `docs/templates/.dockerignore`.

## Unit tests

Run the unit tests with the coverage threshold used by CI:

```powershell
npm test
```

The tests cover FV-01, FV-02, and FV-03. The command fails when line coverage
for the application source is below 70%.

## Integration test

Start the Compose stack with the gateway available at `http://localhost`, then
provide a valid JWT issued by `auth-service` and run IT-03:

```powershell
$env:INTEGRATION_JWT = '<valid JWT>'
npm run test:integration
```

The runner executes IT-01, IT-02, and IT-03. IT-02 registers a temporary user,
creates a restaurant, posts and deletes a review, and verifies the restaurant's
rating and review count after each operation. The runner uses
`http://localhost/api` by default. Set
`INTEGRATION_BASE_URL` when the gateway uses another URL. It fails when
`INTEGRATION_JWT` is missing instead of silently skipping the integration test.

## Favorite lists

Favorites are stored in the default list `ร้านโปรด` when `listName` is omitted.
Pass a non-empty `listName` to `POST /favorites` to save a restaurant in a
named list. The same restaurant can be saved in multiple lists, but only once
per list. Filter the current user's favorites with
`GET /favorites/me?listName=<name>`.
Use the same `listName` query parameter with
`DELETE /favorites/:restaurantId?listName=<name>` to remove a favorite from a
specific list. If omitted, the default list is used.

## Sharing a favorite list

An authenticated owner can create a read-only share link for a list:

```http
POST /favorites/share
Authorization: Bearer <JWT>
Content-Type: application/json

{"listName":"คาเฟ่อยากไป"}
```

The response contains an opaque `token` and a relative `url`. Anyone with the
token can read the current contents with `GET /favorites/shared/:token`; the
response contains the list name and restaurant IDs, but not the owner's user ID.
The owner can revoke sharing with
`DELETE /favorites/share?listName=<name>`. If `listName` is omitted, the
default list is used.
