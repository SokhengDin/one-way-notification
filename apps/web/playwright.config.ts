import { defineConfig, devices } from "@playwright/test";

// End-to-end tests drive the real dashboard against the real API and a
// throwaway Postgres database, rebuilt from the migrations every run by the
// API test suite's setup script just before the API starts.
//
//   bun run e2e
//
// Uses the API's DB_* settings from apps/server/.env; only DB_NAME is
// overridden. Ports are offset from the dev defaults so a running
// `dev:server` / `dev:web` doesn't clash.
const API_PORT = Number(process.env.E2E_API_PORT ?? 3101);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 3201);
const DB_NAME  = process.env.E2E_DB_NAME ?? "notification_e2e_test";

const API_URL = `http://localhost:${API_PORT}`;
const WEB_URL = `http://localhost:${WEB_PORT}`;

export default defineConfig({
  testDir:       "./e2e",
  fullyParallel: false,
  workers:       1,
  retries:       0,
  timeout:       60_000,
  expect:        { timeout: 10_000 },
  reporter:      [["list"]],
  use: {
    baseURL: WEB_URL,
    trace:         "retain-on-failure",
    actionTimeout: 10_000,
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 1000 },
  },
  metadata: { apiUrl: API_URL },
  webServer: [
    {
      // test/setup.ts refuses any database whose name lacks "test"
      command: "bun test/setup.ts && bun src/index.ts",
      cwd:     "../server",
      url:     `${API_URL}/api/health`,
      env: {
        TEST_DB_NAME: DB_NAME,
        DB_NAME,
        APP_PORT:     String(API_PORT),
        CORS_ORIGINS: WEB_URL,
        PUBLIC_URL:   API_URL,
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `bunx next dev -p ${WEB_PORT}`,
      url:     WEB_URL,
      env:     { NEXT_PUBLIC_API_BASE_URL: API_URL },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});

export { API_URL, DB_NAME };
