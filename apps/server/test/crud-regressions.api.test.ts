// Regressions for bugs that made the dashboard's basic CRUD fail:
//  - record schemas typed timestamps as strings while Postgres returns Dates,
//    so creating a user/contact/notification 500'd after the row was written
//  - the external-systems repo returned plain rows instead of record
//    instances, so creating a system failed response encoding (400)
//  - malformed ids reached Postgres and came back as 500s
import { beforeEach, describe, expect, test } from "bun:test";
import { Api } from "@repo/schema";
import { OpenApi } from "effect/unstable/httpapi";
import { api, createSystem, createUser, resetDb } from "./support";

const NIL_UUID = "00000000-0000-4000-8000-000000000000";
const isIsoDate = (value: unknown) => typeof value === "string" && !Number.isNaN(Date.parse(value));

beforeEach(resetDb);

describe("users", () => {
  test("create, get, list, delete", async () => {
    const created = await api("POST", "/api/user", {});
    expect(created.status).toBe(200);
    const user = created.json.data;
    expect(isIsoDate(user.created_at)).toBe(true);

    expect((await api("GET", `/api/user/${user.id}`)).json.data.id).toBe(user.id);
    expect((await api("GET", "/api/user")).json.data.total).toBe(1);
    expect((await api("DELETE", `/api/user/${user.id}`)).status).toBe(204);
    expect((await api("GET", `/api/user/${user.id}`)).status).toBe(404);
  });

  test("contacts: add and edit", async () => {
    const user  = await createUser();
    const added = await api("POST", `/api/user/${user.id}/contacts`, {
      channel: "email", address: "a@x.test", linked: false, verified: false,
    });
    expect(added.status).toBe(200);
    expect(isIsoDate(added.json.data.updated_at)).toBe(true);

    const edited = await api("PATCH", `/api/user/${user.id}/contacts/email`, { verified: true });
    expect(edited.status).toBe(200);
    expect(edited.json.data).toMatchObject({ address: "a@x.test", verified: true });
  });

  test("malformed ids → 400", async () => {
    expect((await api("GET", "/api/user/nope")).status).toBe(400);
    expect((await api("DELETE", "/api/user/nope")).status).toBe(400);
  });
});

describe("external systems", () => {
  test("create, get, update, list, delete", async () => {
    const created = await api("POST", "/api/external-system", { name: "shop", api_key: "k1" });
    expect(created.status).toBe(200);
    const system = created.json.data;
    expect(system).toMatchObject({ name: "shop", api_key: "k1" });

    expect((await api("GET", `/api/external-system/${system.id}`)).json.data.name).toBe("shop");

    const updated = await api("PATCH", `/api/external-system/${system.id}`, { name: "shop-2" });
    expect(updated.status).toBe(200);
    expect(updated.json.data.name).toBe("shop-2");

    expect((await api("GET", "/api/external-system?name=shop")).json.data.total).toBe(1);
    expect((await api("DELETE", `/api/external-system/${system.id}`)).status).toBe(204);
    expect((await api("GET", `/api/external-system/${system.id}`)).status).toBe(404);
  });

  test("duplicate name → 409", async () => {
    await createSystem("dup");
    expect((await api("POST", "/api/external-system", { name: "dup", api_key: "other" })).status).toBe(409);
  });

  test("user links: add", async () => {
    const system = await createSystem();
    const user   = await createUser();
    const res    = await api("POST", `/api/external-system/${system.id}/link`, {
      external_user_id: "ext-1", user_id: user.id,
    });
    expect(res.status).toBe(200);
    expect(res.json.data).toMatchObject({ external_user_id: "ext-1", user_id: user.id });
  });

  test("unknown id → 404, malformed → 400", async () => {
    expect((await api("GET", `/api/external-system/${NIL_UUID}`)).status).toBe(404);
    expect((await api("GET", "/api/external-system/x")).status).toBe(400);
  });
});

describe("notifications", () => {
  test("create with a JSON payload, get and list", async () => {
    const system  = await createSystem();
    const user    = await createUser();
    const payload = { order: { id: 7, items: ["a", "b"] }, flag: true };
    const created = await api("POST", "/api/notification", {
      external_system_id: system.id, user_id: user.id, event_type: "order.shipped", payload,
    });
    expect(created.status).toBe(200);
    expect(created.json.data.payload).toEqual(payload);
    expect(isIsoDate(created.json.data.created_at)).toBe(true);

    const id = created.json.data.id;
    expect((await api("GET", `/api/notification/${id}`)).json.data.payload).toEqual(payload);
    expect((await api("GET", "/api/notification")).json.data.total).toBe(1);
    expect((await api("GET", `/api/notification/${id}/delivery`)).json.data.items).toEqual([]);
  });

  test("idempotency key returns the original notification", async () => {
    const system = await createSystem();
    const user   = await createUser();
    const body   = {
      external_system_id: system.id, user_id: user.id, event_type: "e", payload: { n: 1 }, idempotency_key: "k-1",
    };
    const first  = await api("POST", "/api/notification", body);
    const second = await api("POST", "/api/notification", { ...body, payload: { n: 2 } });
    expect(second.status).toBe(200);
    expect(second.json.data.id).toBe(first.json.data.id);
    expect(second.json.data.payload).toEqual({ n: 1 });
    expect((await api("GET", "/api/notification")).json.data.total).toBe(1);
  });

  test("malformed ids → 400", async () => {
    expect((await api("GET", "/api/notification/x")).status).toBe(400);
    expect((await api("POST", "/api/notification", {
      external_system_id: "x", user_id: "y", event_type: "e", payload: {},
    })).status).toBe(400);
  });
});

describe("channel providers", () => {
  test("create, get, update, delete", async () => {
    const created = await api("POST", "/api/channel-provider", {
      channel: "email", name: "ses", kind: "amazon_ses",
      config:  { region: "eu-west-3", access_key_id: "AKIA1", from_email: "a@acme.test" },
      secrets: { secret_access_key: "s" },
    });
    expect(created.status).toBe(200);
    const provider = created.json.data;
    expect(provider.is_active).toBe(true);

    const updated = await api("PATCH", `/api/channel-provider/${provider.id}`, { is_active: false });
    expect(updated.json.data.is_active).toBe(false);
    expect((await api("DELETE", `/api/channel-provider/${provider.id}`)).status).toBe(204);
  });
});

describe("system", () => {
  test("health", async () => {
    expect((await api("GET", "/api/health")).status).toBe(204);
  });

  test("Swagger UI is served", async () => {
    const res = await api("GET", "/docs");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  test("the OpenAPI spec documents the new endpoints", () => {
    const paths = Object.keys(OpenApi.fromApi(Api).paths);
    expect(paths).toContain("/api/notification-template/{id}/render");
    expect(paths).toContain("/api/external-system/{id}/asset/{kind}");
    expect(paths).toContain("/api/asset/{id}");
  });
});
