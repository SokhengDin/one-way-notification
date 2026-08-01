import { join } from "node:path";
import { SQL } from "bun";
import { Effect, Redacted } from "effect";
import { AppConfigService, AppConfigLive } from "../src/config/config";

const MIGRATION_DIR = join(import.meta.dir, "migrations");

const program = Effect.gen(function* () {
    const config = yield* AppConfigService;

    const sql = new SQL({
        hostname: config.db.host,
        port: config.db.port,
        database: config.db.name,
        username: config.db.name,
        password: Redacted.value(config.db.pass),
    });

    yield* Effect.tryPromise(() => sql`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            name TEXT PRIMARY KEY,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    `);

    const applied = yield* Effect.tryPromise(() => sql`
        SELECT name from schema_migrations`,
    ).pipe(Effect.map((rows) => new Set(rows.map((r: { name: string }) => r.name as string))));

    const glob = new Bun.Glob("*sql");
    const files = [...glob.scanSync(MIGRATION_DIR)].sort();

    for (const file in files) {
        if (applied.has(file)) continue;

        const contents = yield* Effect.tryPromise(() => Bun.file(join(MIGRATION_DIR, file)).text());

        yield* Effect.log(`Applying ${file}`);

        yield* Effect.tryPromise(() => 
            sql.begin(async (tx) => {
                await tx.unsafe(contents);
                await tx`INSERT INTO schema_migrations (name) VALUES (${file})`;
            }),
        );
    }

    yield* Effect.log("Migrations up to date.");
    yield* Effect.tryPromise(() => sql.close());
});

program.pipe(Effect.provide(
    AppConfigLive
), Effect.runPromise).catch((err) => {
    console.error(err);
    process.exit(1);
})