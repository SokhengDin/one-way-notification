import { beforeEach, describe, expect, test } from "bun:test";
import { api, createSystem, createTemplate, resetDb } from "./support";

const NIL_UUID = "00000000-0000-4000-8000-000000000000";

beforeEach(resetDb);

describe("add template", () => {
  test("creates an email template", async () => {
    const system = await createSystem();
    const res    = await api("POST", "/api/notification-template", {
      external_system_id: system.id,
      event_type:         "order.shipped",
      channel:            "email",
      template:           "<p>Hi {{name}}</p>",
      subject:            "Shipped: {{order.id}}",
    });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({
      status:  201,
      message: "Created",
      data: {
        external_system_id: system.id,
        event_type:         "order.shipped",
        channel:            "email",
        template:           "<p>Hi {{name}}</p>",
        subject:            "Shipped: {{order.id}}",
        deleted_at:         null,
      },
    });
    expect(Date.parse(res.json.data.created_at)).not.toBeNaN();
  });

  test.each(["sms", "telegram"] as const)("creates a %s template without a subject", async (channel) => {
    const system = await createSystem();
    const res    = await api("POST", "/api/notification-template", {
      external_system_id: system.id, event_type: "otp", channel, template: "Code {{code}}", subject: null,
    });
    expect(res.status).toBe(200);
    expect(res.json.data).toMatchObject({ channel, subject: null });
  });

  test("email without a subject → 422, not a database error", async () => {
    const system = await createSystem();
    const res    = await api("POST", "/api/notification-template", {
      external_system_id: system.id, event_type: "e", channel: "email", template: "x", subject: null,
    });
    expect(res.status).toBe(422);
    expect(res.json).toEqual({
      _tag:    "NotificationTemplateInvalid",
      message: "subject: is required for email templates",
      issues:  ["subject: is required for email templates"],
    });
  });

  test("syntax errors → 422 listing every issue", async () => {
    const system = await createSystem();
    const res    = await api("POST", "/api/notification-template", {
      external_system_id: system.id, event_type: "e", channel: "email",
      template: "Hi {{name", subject: "{{ }}",
    });
    expect(res.status).toBe(422);
    expect(res.json.message).toBe("Template has 2 problems");
    expect(res.json.issues).toEqual([
      'template: Unclosed "{{" (at position 3)',
      "subject: Empty expression (at position 0)",
    ]);
  });

  test("unknown external system → 422", async () => {
    const res = await api("POST", "/api/notification-template", {
      external_system_id: NIL_UUID, event_type: "e", channel: "sms", template: "x", subject: null,
    });
    expect(res.status).toBe(422);
    expect(res.json.message).toBe(`external_system_id: no external system with id ${NIL_UUID}`);
  });

  test("deleted external system → 422", async () => {
    const system = await createSystem();
    expect((await api("DELETE", `/api/external-system/${system.id}`)).status).toBe(204);
    const res = await api("POST", "/api/notification-template", {
      external_system_id: system.id, event_type: "e", channel: "sms", template: "x", subject: null,
    });
    expect(res.status).toBe(422);
  });

  test("malformed external_system_id → 400", async () => {
    const res = await api("POST", "/api/notification-template", {
      external_system_id: "", event_type: "e", channel: "sms", template: "x", subject: null,
    });
    expect(res.status).toBe(400);
  });

  test("unknown channel → 400", async () => {
    const system = await createSystem();
    const res    = await api("POST", "/api/notification-template", {
      external_system_id: system.id, event_type: "e", channel: "fax", template: "x", subject: null,
    });
    expect(res.status).toBe(400);
  });

  test("duplicate (system, event, channel) → 409", async () => {
    const system = await createSystem();
    await createTemplate({ external_system_id: system.id });
    const res = await api("POST", "/api/notification-template", {
      external_system_id: system.id, event_type: "order.shipped", channel: "email", template: "y", subject: "s",
    });
    expect(res.status).toBe(409);
    expect(res.json._tag).toBe("NotificationTemplateConflict");
  });

  test("same event on another channel or system is fine", async () => {
    const a = await createSystem();
    const b = await createSystem();
    await createTemplate({ external_system_id: a.id });
    await createTemplate({ external_system_id: a.id, channel: "sms", subject: null });
    await createTemplate({ external_system_id: b.id });
  });

  test("the slot can be reused after the template is deleted", async () => {
    const system = await createSystem();
    const first  = await createTemplate({ external_system_id: system.id });
    expect((await api("DELETE", `/api/notification-template/${first.id}`)).status).toBe(204);
    const second = await createTemplate({ external_system_id: system.id });
    expect(second.id).not.toBe(first.id);
  });
});

describe("get and list templates", () => {
  test("get by id", async () => {
    const system   = await createSystem();
    const template = await createTemplate({ external_system_id: system.id });
    const res      = await api("GET", `/api/notification-template/${template.id}`);
    expect(res.status).toBe(200);
    expect(res.json.data.id).toBe(template.id);
  });

  test("unknown id → 404, malformed id → 400", async () => {
    expect((await api("GET", `/api/notification-template/${NIL_UUID}`)).status).toBe(404);
    expect((await api("GET", "/api/notification-template/not-a-uuid")).status).toBe(400);
  });

  test("list is paginated, newest first, and filterable by system", async () => {
    const a = await createSystem();
    const b = await createSystem();
    for (const event of ["e1", "e2", "e3"]) {
      await createTemplate({ external_system_id: a.id, event_type: event });
    }
    await createTemplate({ external_system_id: b.id, event_type: "other" });

    const all = await api("GET", "/api/notification-template");
    expect(all.json.data.total).toBe(4);

    const page = await api("GET", `/api/notification-template?external_system_id=${a.id}&limit=2&skip=0`);
    expect(page.json.data).toMatchObject({ total: 3, skip: 0, limit: 2 });
    expect(page.json.data.items.map((t: { event_type: string }) => t.event_type)).toEqual(["e3", "e2"]);

    const next = await api("GET", `/api/notification-template?external_system_id=${a.id}&limit=2&skip=2`);
    expect(next.json.data.items.map((t: { event_type: string }) => t.event_type)).toEqual(["e1"]);
  });

  test("deleted templates are excluded from list and get", async () => {
    const system   = await createSystem();
    const template = await createTemplate({ external_system_id: system.id });
    await api("DELETE", `/api/notification-template/${template.id}`);
    expect((await api("GET", "/api/notification-template")).json.data.total).toBe(0);
    expect((await api("GET", `/api/notification-template/${template.id}`)).status).toBe(404);
  });
});

describe("edit template", () => {
  test("updates the body only, keeping the subject", async () => {
    const system   = await createSystem();
    const template = await createTemplate({ external_system_id: system.id, subject: "Keep me" });
    const res      = await api("PATCH", `/api/notification-template/${template.id}`, { template: "<p>New</p>" });
    expect(res.status).toBe(200);
    expect(res.json.data).toMatchObject({ template: "<p>New</p>", subject: "Keep me" });
    expect(Date.parse(res.json.data.updated_at)).toBeGreaterThanOrEqual(Date.parse(res.json.data.created_at));
  });

  test("updates the subject only, keeping the body", async () => {
    const system   = await createSystem();
    const template = await createTemplate({ external_system_id: system.id, template: "<p>Keep</p>" });
    const res      = await api("PATCH", `/api/notification-template/${template.id}`, { subject: "New {{x}}" });
    expect(res.json.data).toMatchObject({ template: "<p>Keep</p>", subject: "New {{x}}" });
  });

  test("an explicit null clears a non-email subject", async () => {
    const system   = await createSystem();
    const template = await createTemplate({ external_system_id: system.id, channel: "sms", subject: "old" });
    const res      = await api("PATCH", `/api/notification-template/${template.id}`, { subject: null });
    expect(res.status).toBe(200);
    expect(res.json.data.subject).toBeNull();
    expect((await api("GET", `/api/notification-template/${template.id}`)).json.data.subject).toBeNull();
  });

  test("clearing an email subject → 422 and nothing changes", async () => {
    const system   = await createSystem();
    const template = await createTemplate({ external_system_id: system.id, subject: "Keep" });
    const res      = await api("PATCH", `/api/notification-template/${template.id}`, { subject: null });
    expect(res.status).toBe(422);
    expect((await api("GET", `/api/notification-template/${template.id}`)).json.data.subject).toBe("Keep");
  });

  test("an edit introducing a syntax error → 422 and nothing changes", async () => {
    const system   = await createSystem();
    const template = await createTemplate({ external_system_id: system.id, template: "<p>{{ok}}</p>" });
    const res      = await api("PATCH", `/api/notification-template/${template.id}`, { template: "<p>{{broken</p>" });
    expect(res.status).toBe(422);
    expect(res.json.issues[0]).toContain('Unclosed "{{"');
    expect((await api("GET", `/api/notification-template/${template.id}`)).json.data.template).toBe("<p>{{ok}}</p>");
  });

  test("an empty patch is a no-op that still succeeds", async () => {
    const system   = await createSystem();
    const template = await createTemplate({ external_system_id: system.id });
    const res      = await api("PATCH", `/api/notification-template/${template.id}`, {});
    expect(res.status).toBe(200);
    expect(res.json.data).toMatchObject({ template: template.template, subject: template.subject });
  });

  test("unknown or deleted template → 404", async () => {
    expect((await api("PATCH", `/api/notification-template/${NIL_UUID}`, { template: "x" })).status).toBe(404);
    const system   = await createSystem();
    const template = await createTemplate({ external_system_id: system.id });
    await api("DELETE", `/api/notification-template/${template.id}`);
    expect((await api("PATCH", `/api/notification-template/${template.id}`, { template: "x" })).status).toBe(404);
  });
});

describe("delete template", () => {
  test("204, then 404 on repeat", async () => {
    const system   = await createSystem();
    const template = await createTemplate({ external_system_id: system.id });
    const first    = await api("DELETE", `/api/notification-template/${template.id}`);
    expect(first.status).toBe(204);
    expect(first.bytes.length).toBe(0);
    expect((await api("DELETE", `/api/notification-template/${template.id}`)).status).toBe(404);
  });

  test("unknown id → 404, malformed → 400", async () => {
    expect((await api("DELETE", `/api/notification-template/${NIL_UUID}`)).status).toBe(404);
    expect((await api("DELETE", "/api/notification-template/123")).status).toBe(400);
  });

  test("deleting one template leaves siblings alone", async () => {
    const system = await createSystem();
    const a      = await createTemplate({ external_system_id: system.id, event_type: "a" });
    const b      = await createTemplate({ external_system_id: system.id, event_type: "b" });
    await api("DELETE", `/api/notification-template/${a.id}`);
    expect((await api("GET", `/api/notification-template/${b.id}`)).status).toBe(200);
  });
});

describe("render a saved template", () => {
  test("email: subject, branded HTML body and text part", async () => {
    const system   = await createSystem("Acme <Shop>");
    const template = await createTemplate({
      external_system_id: system.id,
      template:           '<p>Hi {{name}}, order #{{order.id}} is on its way. {{note | default: "Thanks!"}}</p>',
      subject:            "Order {{order.id}} shipped",
    });

    const res = await api("POST", `/api/notification-template/${template.id}/render`, {
      payload: { name: "<script>x</script>", order: { id: 1001 } },
    });

    expect(res.status).toBe(200);
    const data = res.json.data;
    expect(data).toMatchObject({
      channel:   "email",
      subject:   "Order 1001 shipped",
      variables: ["order.id", "name", "note"],
      missing:   [],
      warnings:  [],
    });
    expect(data.body).toStartWith("<!DOCTYPE html>");
    expect(data.body).toContain("<p>Hi &lt;script&gt;x&lt;/script&gt;, order #1001 is on its way. Thanks!</p>");
    expect(data.body).not.toContain("<script>x</script>");
    expect(data.body).toContain("Acme &lt;Shop&gt;");
    expect(data.text).toBe("Hi <script>x</script>, order #1001 is on its way. Thanks!");
  });

  test("reports missing variables without failing", async () => {
    const system   = await createSystem();
    const template = await createTemplate({ external_system_id: system.id, template: "{{a}} {{b}}", subject: "{{c}}" });
    const res      = await api("POST", `/api/notification-template/${template.id}/render`, { payload: { b: 1 } });
    expect(res.status).toBe(200);
    expect(res.json.data.missing).toEqual(["c", "a"]);
  });

  test("sms renders plain text", async () => {
    const system   = await createSystem();
    const template = await createTemplate({
      external_system_id: system.id, channel: "sms", subject: null, template: "Your code is {{code}} & expires soon",
    });
    const res = await api("POST", `/api/notification-template/${template.id}/render`, { payload: { code: "<1234>" } });
    expect(res.json.data).toMatchObject({
      channel: "sms", subject: null, text: null, body: "Your code is <1234> & expires soon",
    });
  });

  test("render reflects the latest edit", async () => {
    const system   = await createSystem();
    const template = await createTemplate({ external_system_id: system.id, channel: "sms", subject: null, template: "v1" });
    await api("PATCH", `/api/notification-template/${template.id}`, { template: "v2 {{x}}" });
    const res = await api("POST", `/api/notification-template/${template.id}/render`, { payload: { x: "!" } });
    expect(res.json.data.body).toBe("v2 !");
  });

  test("deleted or unknown template → 404", async () => {
    const system   = await createSystem();
    const template = await createTemplate({ external_system_id: system.id });
    await api("DELETE", `/api/notification-template/${template.id}`);
    expect((await api("POST", `/api/notification-template/${template.id}/render`, { payload: {} })).status).toBe(404);
    expect((await api("POST", `/api/notification-template/${NIL_UUID}/render`, { payload: {} })).status).toBe(404);
  });

  test("payload must be an object", async () => {
    const system   = await createSystem();
    const template = await createTemplate({ external_system_id: system.id });
    expect((await api("POST", `/api/notification-template/${template.id}/render`, { payload: [1] })).status).toBe(400);
    expect((await api("POST", `/api/notification-template/${template.id}/render`, {})).status).toBe(400);
  });
});

describe("preview an unsaved template", () => {
  test("renders without saving anything", async () => {
    const system = await createSystem();
    const res    = await api("POST", "/api/notification-template/preview", {
      external_system_id: system.id, channel: "email", template: "<p>{{x}}</p>", subject: "S {{x}}", payload: { x: 1 },
    });
    expect(res.status).toBe(200);
    expect(res.json.data.subject).toBe("S 1");
    expect((await api("GET", "/api/notification-template")).json.data.total).toBe(0);
  });

  test("invalid drafts → 422", async () => {
    const system = await createSystem();
    const res    = await api("POST", "/api/notification-template/preview", {
      external_system_id: system.id, channel: "email", template: "{{", subject: null, payload: {},
    });
    expect(res.status).toBe(422);
    expect(res.json.issues).toHaveLength(2);
  });

  test("unknown external system → 422", async () => {
    const res = await api("POST", "/api/notification-template/preview", {
      external_system_id: NIL_UUID, channel: "sms", template: "x", subject: null, payload: {},
    });
    expect(res.status).toBe(422);
  });
});
