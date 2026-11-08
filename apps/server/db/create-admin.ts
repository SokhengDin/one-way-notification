// Create (or reset the password of) a dashboard administrator.
//
//   bun run admin:create -- <email> [name]      (from the repo root)
//
// The password is read from ADMIN_PASSWORD, or prompted for, never taken as
// an argument (it would end up in the shell history).

import { SQL } from "bun";

const [email, ...nameParts] = process.argv.slice(2);
if (!email || !email.includes("@")) {
  console.error("Usage: bun run admin:create -- <email> [name]");
  process.exit(1);
}
const name = nameParts.join(" ").trim() || email.split("@")[0]!;

let password = process.env.ADMIN_PASSWORD ?? "";
if (!password) {
  password = (prompt("Password (min 12 characters):") ?? "").trim();
}
if (password.length < 12) {
  console.error("The password must be at least 12 characters.");
  process.exit(1);
}

const sql = new SQL({
  hostname: process.env.DB_HOST ?? "localhost",
  port:     Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME ?? "",
  username: process.env.DB_USER ?? "postgres",
  password: process.env.DB_PASS ?? "postgres",
});

const hash = await Bun.password.hash(password);
const [existing] = await sql`SELECT id FROM admins WHERE lower(email) = lower(${email}) AND deleted_at IS NULL`;
if (existing) {
  await sql`UPDATE admins SET password_hash = ${hash}, failed_attempts = 0, locked_until = NULL, updated_at = now() WHERE id = ${existing.id}`;
  await sql`UPDATE admin_sessions SET revoked_at = now() WHERE admin_id = ${existing.id} AND revoked_at IS NULL`;
  console.log(`Password reset for ${email}; their sessions were signed out.`);
} else {
  await sql`INSERT INTO admins (email, name, password_hash) VALUES (${email}, ${name}, ${hash})`;
  console.log(`Created administrator ${email}.`);
}
await sql.close();
