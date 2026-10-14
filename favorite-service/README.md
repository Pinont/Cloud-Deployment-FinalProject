# favorite-service

Owner: @phoo3011 (Tester)

Port 3004. See issues labelled `service:favorite`. Start from `docs/templates/Dockerfile` and `docs/templates/.dockerignore`.

## Integration test

Start the Compose stack with the gateway available at `http://localhost`, then
provide a valid JWT issued by `auth-service` and run IT-03:

```powershell
$env:INTEGRATION_JWT = '<valid JWT>'
npm run test:integration
```

The runner uses `http://localhost/api` by default. Set
`INTEGRATION_BASE_URL` when the gateway uses another URL. It fails when
`INTEGRATION_JWT` is missing instead of silently skipping the integration test.
