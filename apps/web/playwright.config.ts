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

// created by the API on first start (ADMIN_EMAIL / ADMIN_PASSWORD)
export const ADMIN = { email: "e2e-admin@example.com", password: "e2e-admin-password-123" };
const AUTH_FILE    = "e2e/.auth/admin.json";
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
  projects: [
    // signs in once; every other test reuses the session cookie
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "dashboard", dependencies: ["setup"], use: { storageState: AUTH_FILE } },
  ],
  webServer: [
    {
      // test/setup.ts refuses any database whose name lacks "test";
      // seed-demo.ts adds deterministic traffic for the dashboard tests
      command: "bun test/setup.ts && bun db/seed-demo.ts && bun src/index.ts",
      cwd:     "../server",
      url:     `${API_URL}/api/health`,
      env: {
        TEST_DB_NAME: DB_NAME,
        DB_NAME,
        // test-only key so provider credentials can be saved in e2e runs
        PROVIDER_SECRET_KEY: "e2e-only-provider-secret-key",
        APP_PORT:     String(API_PORT),
        CORS_ORIGINS: WEB_URL,
        PUBLIC_URL:   API_URL,
        ADMIN_EMAIL:    ADMIN.email,
        ADMIN_PASSWORD: ADMIN.password,
        ADMIN_NAME:     "E2E Admin",
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `bunx next dev -p ${WEB_PORT}`,
      url:     WEB_URL,
      env:     { NOTIFY_API_URL: API_URL },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});

export { API_URL, DB_NAME };
