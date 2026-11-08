// Dashboard sign-in. Passwords are Argon2id (Bun.password); sessions are
// opaque bearer tokens of which only a SHA-256 is stored. Five wrong
// passwords in a row lock the account for 15 minutes.

import { AccountLocked, InvalidCredentials, LoginResult } from "@repo/schema";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import { createHash, randomBytes } from "node:crypto";
import { makeSqlAuthRepo } from "./auth.sql";
import type { AuthRepoService, AuthService } from "./auth.types";

export const SESSION_TTL_SECONDS = 12 * 60 * 60;
export const LOCK_THRESHOLD      = 5;
export const LOCK_MINUTES        = 15;
export const TOKEN_PREFIX        = "own_";

export const hashToken = (token: string) => createHash("sha256").update(token, "utf8").digest("hex");
const newToken         = () => `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;

const INVALID = "Invalid email or password";

// Verifying against a throwaway hash when the email is unknown keeps the
// response time the same, so timing doesn't reveal which emails exist.
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= Bun.password.hash("not-a-real-password-just-for-timing"));

export class AuthRepo extends Context.Service<AuthRepo, AuthRepoService>()("app/domain/auth/AuthRepo") {
  static readonly layer = Layer.effect(
    AuthRepo,
    Effect.gen(function* () {
      const sql = yield* SqlClient;
      return makeSqlAuthRepo(sql);
    }),
  );
}

export class Auth extends Context.Service<Auth, AuthService>()("app/domain/auth/Auth") {
  static readonly layer = Layer.effect(
    Auth,
    Effect.gen(function* () {
      const repo = yield* AuthRepo;

      const login: AuthService["login"] = Effect.fn("Auth.login")(function* (input) {
        const email    = input.email.trim();
        const password = input.password;
        if (email === "" || password === "" || password.length > 256) {
          return yield* new InvalidCredentials({ message: INVALID });
        }

        const found = yield* repo.findAdminByEmail(email);
        if (found === null) {
          yield* Effect.promise(async () => Bun.password.verify(password, await getDummyHash()));
          return yield* new InvalidCredentials({ message: INVALID });
        }

        if (found.locked_until && found.locked_until.getTime() > Date.now()) {
          return yield* new AccountLocked({
            message:      "Too many failed attempts. Try again later.",
            locked_until: found.locked_until,
          });
        }

        const ok = yield* Effect.promise(() => Bun.password.verify(password, found.password_hash));
        if (!ok) {
          const lockedUntil = yield* repo.recordFailure(found.admin.id, LOCK_THRESHOLD, LOCK_MINUTES);
          if (lockedUntil && lockedUntil.getTime() > Date.now()) {
            return yield* new AccountLocked({
              message:      `Too many failed attempts. Sign-in is locked for ${LOCK_MINUTES} minutes.`,
              locked_until: lockedUntil,
            });
          }
          return yield* new InvalidCredentials({ message: INVALID });
        }

        const token     = newToken();
        const expiresAt = yield* repo.createSession({
          admin_id:    found.admin.id,
          token_hash:  hashToken(token),
          user_agent:  input.user_agent?.slice(0, 500) ?? null,
          ip:          input.ip?.slice(0, 100) ?? null,
          ttl_seconds: SESSION_TTL_SECONDS,
        });
        return new LoginResult({ token, expires_at: expiresAt, admin: found.admin });
      });

      const logout: AuthService["logout"] = (token) => repo.revokeSession(hashToken(token));

      const authenticate: AuthService["authenticate"] = (token) =>
        !token.startsWith(TOKEN_PREFIX)
          ? Effect.succeed(null)
          : repo.findSession(hashToken(token)).pipe(Effect.map((session) => session?.admin ?? null));

      const bootstrapAdmin: AuthService["bootstrapAdmin"] = Effect.fn("Auth.bootstrapAdmin")(function* (input) {
        if ((yield* repo.countAdmins) > 0) return null;
        const passwordHash = yield* Effect.promise(() => Bun.password.hash(input.password));
        return yield* repo.insertAdmin({ email: input.email.trim(), name: input.name.trim(), password_hash: passwordHash });
      });

      return { login, logout, authenticate, adminCount: repo.countAdmins, bootstrapAdmin };
    }),
  ).pipe(Layer.provide(AuthRepo.layer));
}
