import { spawnSync } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { resolve } from 'node:path';

const token = process.env.INTEGRATION_JWT;
if (!token) {
  console.error('INTEGRATION_JWT must be set to run IT-03 against Docker Compose');
  process.exit(1);
}

const baseUrl = process.env.INTEGRATION_BASE_URL || 'http://localhost/api';
const tsxCli = resolve('node_modules/tsx/dist/cli.mjs');
accessSync(tsxCli, constants.R_OK);

const result = spawnSync(
  process.execPath,
  [tsxCli, '--test', 'test/favorites-compose.test.ts'],
  {
    env: {
      ...process.env,
      INTEGRATION_BASE_URL: baseUrl,
      INTEGRATION_JWT: token,
      INTEGRATION_REQUIRED: '1'
    },
    stdio: 'inherit'
  }
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
