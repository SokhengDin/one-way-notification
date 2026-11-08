// Fills a development database with ~45 days of realistic, deterministic
// notification traffic so the dashboard has something to show:
//
//   bun run seed:demo            (from the repo root)
//
// Writes directly with SQL (faster than going through the API, and it can backdate).
// Refuses to run twice, and refuses anything that looks like production.

import { SQL } from "bun";
import { channelsOf, SYSTEMS, type Channel, type EventSpec, type SystemSpec } from "./seed-catalog";

const dbName = process.env.DB_NAME ?? "";
const dbHost = process.env.DB_HOST ?? "localhost";

// Where are we? APP_ENV wins, then NODE_ENV. Unset means a dev machine.
const appEnv  = (process.env.APP_ENV ?? process.env.NODE_ENV ?? "development").toLowerCase();
const isLocal = ["localhost", "127.0.0.1", "::1", "postgres", "db"].includes(dbHost.toLowerCase());
const isProd  = appEnv === "production" || appEnv === "prod";

// Production never gets fake data. Elsewhere: a local database is fine; a
// remote one needs SEED_ALLOW_REMOTE=1, so a dev laptop pointed at a shared
// server doesn't get seeded by accident.
if (isProd) {
  console.error(`Refusing to seed: APP_ENV/NODE_ENV is "${appEnv}". Demo data never goes into production.`);
  process.exit(1);
}
if (!isLocal && process.env.SEED_ALLOW_REMOTE !== "1") {
  console.error(
    `Refusing to seed "${dbName}" on ${dbHost}: that isn't a local database. ` +
      "Set SEED_ALLOW_REMOTE=1 if this server really is disposable.",
  );
  process.exit(1);
}

const sql = new SQL({
  hostname: dbHost,
  port:     Number(process.env.DB_PORT ?? 5432),
  database: dbName,
  username: process.env.DB_USER ?? "postgres",
  password: process.env.DB_PASS ?? "postgres",
});

const [already] = await sql`SELECT 1 AS x FROM external_systems WHERE name = 'Demo Shop' LIMIT 1`;
if (already) {
  console.log(`"${dbName}" already has demo data — nothing to do.`);
  await sql.close();
  process.exit(0);
}

// ---------- deterministic randomness ----------

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(20261107);
const pick   = <T>(items: ReadonlyArray<T>): T => items[Math.floor(random() * items.length)]!;
const chance = (p: number) => random() < p;
const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
const weighted = <T extends { weight: number }>(items: ReadonlyArray<T>): T => {
  let roll = random() * items.reduce((sum, item) => sum + item.weight, 0);
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1]!;
};

// ---------- fixtures ----------

const PROVIDERS = [
  { name: "Demo Amazon SES", channel: "email",    kind: "amazon_ses",   priority: 10, config: { region: "eu-west-3", access_key_id: "AKIADEMO", from_email: "noreply@demo.test", from_name: "Demo" } },
  { name: "Demo own SMTP",   channel: "email",    kind: "smtp",         priority: 20, config: { host: "smtp.demo.test", port: 587, security: "starttls", from_email: "noreply@demo.test" } },
  { name: "Demo Twilio",     channel: "sms",      kind: "twilio",       priority: 10, config: { account_sid: "ACDEMO", from_number: "+33612345678" } },
  { name: "Demo Telegram",   channel: "telegram", kind: "telegram_bot", priority: 10, config: { parse_mode: "HTML" } },
] as const;

const ERRORS: Record<string, ReadonlyArray<string>> = {
  email:    ["550 5.1.1 Recipient address rejected: user unknown", "Mailbox full", "Throttling: Maximum sending rate exceeded", "421 Service not available, closing channel"],
  sms:      ["21610: Attempt to send to unsubscribed recipient", "30003: Unreachable destination handset", "21211: Invalid 'To' phone number"],
  telegram: ["403: Forbidden: bot was blocked by the user", "400: Bad Request: chat not found"],
};

const FIRST = ["Dara", "Sophea", "Vanna", "Chanthy", "Rithy", "Sokha", "Bopha", "Visal", "Malis", "Piseth", "Camille", "Lucas", "Chloé", "Hugo", "Léa", "Nathan", "Inès", "Louis", "Manon", "Jules"];
const LAST  = ["Sok", "Chan", "Kim", "Lim", "Heng", "Martin", "Bernard", "Dubois", "Moreau", "Laurent"];

const COST: Record<string, number> = { amazon_ses: 0.0001, smtp: 0, twilio: 0.0079, telegram_bot: 0 };

// ---------- seed ----------

const DAYS = 45;
const now  = Date.now();
const DAY  = 86_400_000;

await sql.begin(async (tx) => {
  const systems = await tx`
    INSERT INTO external_systems ${tx(SYSTEMS.map((s) => ({ name: s.name, api_key: `demo-${s.name.toLowerCase().replace(/\W+/g, "-")}` })))}
    RETURNING id, name
  `;
  const systemId = new Map(systems.map((row: { id: string; name: string }) => [row.name, row.id]));

  // every event's template on every channel it uses
  const templates = SYSTEMS.flatMap((system) =>
    system.events.flatMap((spec) =>
      channelsOf(spec).map((channel) => ({
        external_system_id: systemId.get(system.name),
        event_type:         spec.event,
        channel,
        subject:            channel === "email" ? spec.email!.subject : null,
        template:           channel === "email" ? spec.email!.body : channel === "sms" ? spec.sms! : spec.telegram!,
      })),
    ),
  );
  await tx`INSERT INTO notification_templates ${tx(templates)}`;

  const providers = await tx`
    INSERT INTO channel_providers ${tx(PROVIDERS.map((p) => ({ name: p.name, channel: p.channel, kind: p.kind, priority: p.priority, config: p.config })))}
    RETURNING id, name, channel, kind
  `;
  const providersFor = (channel: string) => providers.filter((p: { channel: string }) => p.channel === channel);

  // most users have a name and an email; a few only an email or nothing,
  // so the dashboard's display-name fallbacks show up too
  const people = Array.from({ length: 40 }, (_, i) => {
    const first = FIRST[i % FIRST.length]!;
    const last  = LAST[(i * 7) % LAST.length]!;
    const slug  = `${first}.${last}`.toLowerCase().normalize("NFD").replace(/[^a-z.]/g, "");
    return {
      first,
      name:     i % 9 === 8 ? null : `${first} ${last}`,
      email:    i % 13 === 12 ? null : `${slug}${i}@example.com`,
      phone:    i % 7 === 6 ? null : `+3361234${String(5000 + i)}`,
      telegram: i % 3 !== 2 ? String(700000000 + i * 1371) : null,
    };
  });
  const users: Array<{ id: string }> = await tx`
    INSERT INTO users ${tx(people.map((person) => ({ name: person.name })))} RETURNING id
  `;
  const contacts = people.flatMap((person, i) => [
    ...(person.email ? [{ user_id: users[i]!.id, channel: "email", address: person.email, linked: true, verified: true }] : []),
    ...(person.phone ? [{ user_id: users[i]!.id, channel: "sms", address: person.phone, linked: true, verified: true }] : []),
    ...(person.telegram ? [{ user_id: users[i]!.id, channel: "telegram", address: person.telegram, linked: true, verified: true }] : []),
  ]);
  await tx`INSERT INTO user_contacts ${tx(contacts)}`;
  const personOf    = (userId: string) => people[users.findIndex((user) => user.id === userId)]!;
  const recipientOf = (userId: string, channel: Channel) => {
    const person = personOf(userId);
    return channel === "email" ? person.email : channel === "sms" ? person.phone : person.telegram;
  };

  // each system knows most users under its own id
  const links = SYSTEMS.flatMap((system, s) =>
    users
      .filter((_user, i) => (i + s) % 4 !== 0)
      .map((user, i) => ({ external_system_id: systemId.get(system.name), external_user_id: `${system.name.split(" ")[1]!.toLowerCase()}-${1000 + i}`, user_id: user.id })),
  );
  await tx`INSERT INTO external_user_links ${tx(links)}`;

  const notifications: Array<Record<string, unknown>> = [];
  const deliveries:    Array<Record<string, unknown>> = [];
  const usage:         Array<Record<string, unknown>> = [];

  for (let dayAgo = DAYS - 1; dayAgo >= 0; dayAgo--) {
    const dayStart = now - dayAgo * DAY - (now % DAY);
    const weekday  = new Date(dayStart).getUTCDay();
    const volume   = between(18, 40) + (weekday === 1 || weekday === 2 ? 15 : 0) - (weekday === 0 || weekday === 6 ? 10 : 0);
    // a bad afternoon a week ago: a burst of email failures
    const incident = dayAgo === 7;

    for (let i = 0; i < volume; i++) {
      const created = new Date(Math.min(now - 60_000, dayStart + Math.floor(random() * DAY)));
      const system: SystemSpec = weighted(SYSTEMS);
      const spec:   EventSpec  = weighted(system.events);
      const notificationId     = crypto.randomUUID();

      const userId = pick(users).id;
      notifications.push({
        id:                 notificationId,
        external_system_id: systemId.get(system.name),
        user_id:            userId,
        event_type:         spec.event,
        payload:            spec.payload({ pick, between, first: personOf(userId).first }),
        created_at:         created,
      });

      for (const channel of channelsOf(spec)) {
        const recipient = recipientOf(userId, channel);
        if (!recipient) {
          deliveries.push({
            id: crypto.randomUUID(), notification_id: notificationId, channel, provider_id: null, recipient: null,
            status: "skipped", attempt_count: 0, last_error: `User has no ${channel} contact`,
            sent_at: null, created_at: created, updated_at: created,
          });
          continue;
        }
        const candidates = providersFor(channel);
        const provider   = channel === "email" && candidates.length > 1 && chance(0.3) ? candidates[1] : candidates[0];
        const recent     = now - created.getTime() < 3 * 3_600_000;
        const failP      = incident && channel === "email" ? 0.35 : channel === "sms" ? 0.07 : 0.04;

        const status = recent && chance(0.4) ? pick(["pending", "retrying"]) : chance(failP) ? "failed" : "sent";
        const attempts = status === "pending" ? 0 : status === "failed" ? between(1, 3) : chance(0.08) ? 2 : 1;
        const updated  = new Date(created.getTime() + between(1, 90) * 1000);
        const deliveryId = crypto.randomUUID();

        deliveries.push({
          id:              deliveryId,
          notification_id: notificationId,
          channel,
          provider_id:     provider.id,
          recipient,
          status,
          attempt_count:   attempts,
          last_error:      status === "failed" ? pick(ERRORS[channel]!) : null,
          sent_at:         status === "sent" ? updated : null,
          created_at:      created,
          updated_at:      status === "pending" ? null : updated,
        });

        for (let attempt = 0; attempt < attempts; attempt++) {
          usage.push({
            delivery_id:  deliveryId,
            provider_id:  provider.id,
            status_code:  status === "failed" ? pick([400, 403, 429, 500, 550]) : 202,
            success:      status !== "failed",
            error:        status === "failed" ? pick(ERRORS[channel]!) : null,
            duration_ms:  between(80, 900),
            cost:         (COST[provider.kind] ?? 0).toFixed(4),
            attempted_at: new Date(created.getTime() + attempt * 30_000),
          });
        }
      }
    }
  }

  for (let i = 0; i < notifications.length; i += 500) await tx`INSERT INTO notifications ${tx(notifications.slice(i, i + 500))}`;
  for (let i = 0; i < deliveries.length; i += 500)    await tx`INSERT INTO notification_deliveries ${tx(deliveries.slice(i, i + 500))}`;
  for (let i = 0; i < usage.length; i += 500)         await tx`INSERT INTO provider_usage_log ${tx(usage.slice(i, i + 500))}`;

  console.log(
    `Seeded "${dbName}": ${systems.length} systems, ${templates.length} templates, ${providers.length} providers, ${users.length} users, ` +
    `${notifications.length} notifications, ${deliveries.length} deliveries, ${usage.length} provider attempts.`,
  );
});

await sql.close();
