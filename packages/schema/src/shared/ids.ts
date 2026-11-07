import { Schema } from "effect";

// Every primary/foreign key in the database is a UUID. Validating at the
// contract level turns a malformed id into a 400 from HttpApi instead of a
// Postgres `invalid_text_representation` (22P02) surfacing as a 500.
export const Uuid = Schema.String.check(Schema.isUUID());
