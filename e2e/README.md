# E2E

Owner: @phoo3011 (Tester)

Playwright E2E tests (E2E-01) run against the compose stack through the Nginx gateway.

```powershell
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build -d
cd e2e
npm ci
npx playwright install chromium
npm test
```

Set `BASE_URL` when the gateway is exposed on a different host or port.
