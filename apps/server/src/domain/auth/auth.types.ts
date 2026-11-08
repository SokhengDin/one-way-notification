import type { Effect } from "effect";
import type {
  AccountLocked,
  AdminRecord,
  AuthRepoError,
  InvalidCredentials,
  LoginResult,
} from "@repo/schema";

export interface AdminWithSecret {
  readonly admin:           AdminRecord;
  readonly password_hash:   string;
  readonly failed_attempts: number;
  readonly locked_until:    Date | null;
}

export interface SessionAdmin {
  readonly session_id: string;
  readonly admin:      AdminRecord;
}

export interface CreateSession {
  readonly admin_id:    string;
  readonly token_hash:  string;
  readonly user_agent:  string | null;
  readonly ip:          string | null;
  readonly ttl_seconds: number;
}

export interface AuthRepoService {
  readonly findAdminByEmail: (email: string) => Effect.Effect<AdminWithSecret | null, AuthRepoError>;
  /** Count a wrong password; returns locked_until if this locked the account. */
  readonly recordFailure: (adminId: string, threshold: number, lockMinutes: number) => Effect.Effect<Date | null, AuthRepoError>;
  /** Reset the failure count and open a session; returns its expiry. */
  readonly createSession: (input: CreateSession) => Effect.Effect<Date, AuthRepoError>;
  /** The live session for this token hash, or null (expired, revoked, unknown). */
  readonly findSession: (tokenHash: string) => Effect.Effect<SessionAdmin | null, AuthRepoError>;
  readonly revokeSession: (tokenHash: string) => Effect.Effect<void, AuthRepoError>;
  readonly countAdmins: Effect.Effect<number, AuthRepoError>;
  readonly insertAdmin: (input: { email: string; name: string; password_hash: string }) => Effect.Effect<AdminRecord, AuthRepoError>;
}

export interface LoginInput {
  readonly email:      string;
  readonly password:   string;
  readonly user_agent: string | null;
  readonly ip:         string | null;
}

export interface AuthService {
  readonly login: (input: LoginInput) => Effect.Effect<LoginResult, InvalidCredentials | AccountLocked | AuthRepoError>;
  readonly logout: (token: string) => Effect.Effect<void, AuthRepoError>;
  /** The admin behind a bearer token, or null. */
  readonly authenticate: (token: string) => Effect.Effect<AdminRecord | null, AuthRepoError>;
  /**
   * Create the first administrator if there is none yet. Returns it when
   * created, null when admins already exist.
   */
  readonly adminCount: Effect.Effect<number, AuthRepoError>;
  readonly bootstrapAdmin: (input: { email: string; name: string; password: string }) => Effect.Effect<AdminRecord | null, AuthRepoError>;
}
