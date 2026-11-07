// Preloaded by `bun test` (see bunfig.toml). Points the app at a dedicated
// test database and rebuilds its schema from the migrations, so every run
// starts from the same state as a fresh `bun run migrate`.
import { join } from "node:path";
import { SQL } from "bun";

const testDbName = process.env.TEST_DB_NAME ?? "notification_test";

// This file drops the whole public schema. Never let it near a real database.
if (!/test/i.test(testDbName)) {
  throw new Error(`Refusing to run tests against "${testDbName}": the test database name must contain "test"`);
}

process.env.DB_NAME    = testDbName;
process.env.PUBLIC_URL = "https://notify.test";
// fixed test key; never a real one
process.env.PROVIDER_SECRET_KEY = "test-only-provider-secret-key";

const connection = {
  hostname: process.env.DB_HOST ?? "localhost",
  port:     Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USER ?? "postgres",
  password: process.env.DB_PASS ?? "postgres",
};

// create the test database on first run
const admin  = new SQL({ ...connection, database: "postgres" });
const exists = await admin`SELECT 1 FROM pg_database WHERE datname = ${testDbName}`;
if (exists.length === 0) {
  await admin.unsafe(`CREATE DATABASE "${testDbName.replace(/"/g, '""')}"`);
}
await admin.close();

const sql = new SQL({ ...connection, database: testDbName });

await sql.unsafe("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");

const migrationDir = join(import.meta.dir, "..", "db", "migrations");
const files        = [...new Bun.Glob("*.sql").scanSync(migrationDir)].sort();
for (const file of files) {
  await sql.unsafe(await Bun.file(join(migrationDir, file)).text());
}

await sql.close();
