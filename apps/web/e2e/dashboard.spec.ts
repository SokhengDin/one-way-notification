// Full dashboard flows in a real browser: brand assets of every format,
// template add / edit / delete, live rendering and validation feedback.
// Tests run in order and share one external system created by the first.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { resolve } from "node:path";
import { API_URL } from "../playwright.config";

test.describe.configure({ mode: "serial" });

const fixture = (name: string) => resolve(__dirname, "fixtures", name);

const SYSTEM_NAME = `Acme E2E ${Date.now()}`;
let systemPath    = "";
let templatePath  = "";

/** The <img> actually decoded (not a broken-image icon). */
async function expectImageRendered(image: Locator) {
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0))
    .toBe(true);
}

async function uploadAsset(page: Page, kind: string, file: string) {
  await page.getByTestId(`asset-input-${kind}`).setInputFiles(fixture(file));
}

function slot(page: Page, kind: string) {
  return page.getByTestId(`asset-slot-${kind}`);
}

function previewFrame(page: Page) {
  return page.frameLocator('[data-testid="preview-frame"]');
}

/** The CodeMirror template editor's editable surface. */
function editor(page: Page) {
  return page.getByTestId("template-editor");
}

/** Replace the editor's whole content (one insert, so no auto-closing). */
async function setEditor(page: Page, text: string) {
  const content = editor(page);
  await content.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText(text);
}

async function selectOption(page: Page, label: string, option: string) {
  await page.getByLabel(label, { exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test("create an external system", async ({ page }) => {
  await page.goto("/external-systems/new");
  await page.getByLabel("Name").fill(SYSTEM_NAME);
  await page.getByLabel("API key").fill(`key-${Date.now()}`);
  await page.getByRole("button", { name: "Create system" }).click();

  await expect(page).toHaveURL(/\/external-systems\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: SYSTEM_NAME })).toBeVisible();
  systemPath = new URL(page.url()).pathname;

  for (const kind of ["logo", "logo_dark", "icon", "email_header"]) {
    await expect(slot(page, kind)).toContainText("Nothing uploaded.");
  }
});

test.describe("brand assets", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(systemPath);
    await expect(page.getByTestId("asset-slot-logo")).toBeVisible();
  });

  test("upload a different format into every slot", async ({ page }) => {
    const uploads = [
      ["logo",         "logo.png",         "PNG",  "480×120"],
      ["logo_dark",    "logo.jpg",         "JPEG", "480×120"],
      ["icon",         "icon.ico",         "ICO",  "64×64"],
      ["email_header", "logo-simple.webp", "WebP", "480×120"],
    ] as const;

    for (const [kind, file, format, size] of uploads) {
      await uploadAsset(page, kind, file);
      const meta = page.getByTestId(`asset-meta-${kind}`);
      await expect(meta).toContainText(file);
      await expect(meta).toContainText(format);
      await expect(meta).toContainText(size);
      await expectImageRendered(slot(page, kind).getByRole("img", { name: /preview/ }));
    }

    // survives a reload
    await page.reload();
    await expect(page.getByTestId("asset-meta-icon")).toContainText("ICO");
  });

  test("replace the logo with a GIF; the old file stays servable", async ({ page, request }) => {
    const oldSrc = await slot(page, "logo").getByRole("img", { name: /preview/ }).getAttribute("src");
    expect(oldSrc).toContain("/api/asset/");

    await uploadAsset(page, "logo", "logo.gif");
    await expect(page.getByTestId("asset-meta-logo")).toContainText("GIF");
    await expect(page.getByTestId("asset-meta-logo")).toContainText("240×60");
    await expect(page.getByText("Logo replaced")).toBeVisible();

    const newSrc = await slot(page, "logo").getByRole("img", { name: /preview/ }).getAttribute("src");
    expect(newSrc).not.toBe(oldSrc);
    await expectImageRendered(slot(page, "logo").getByRole("img", { name: /preview/ }));

    const old = await request.get(oldSrc!);
    expect(old.status()).toBe(200);
    expect(old.headers()["content-type"]).toBe("image/png");
  });

  test("animated GIFs are accepted too", async ({ page }) => {
    await uploadAsset(page, "logo_dark", "animated.gif");
    await expect(page.getByTestId("asset-meta-logo_dark")).toContainText("120×120");
    await expectImageRendered(slot(page, "logo_dark").getByRole("img", { name: /preview/ }));
  });

  test("a safe SVG uploads; a scripted one is rejected with a reason", async ({ page }) => {
    const input = page.getByTestId("asset-input-email_header");

    await input.setInputFiles({
      name:     "evil.svg",
      mimeType: "image/svg+xml",
      buffer:   Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)" width="10" height="10"/>'),
    });
    await expect(slot(page, "email_header").getByRole("alert")).toContainText("event handler attributes");
    // the previous WebP is untouched
    await expect(page.getByTestId("asset-meta-email_header")).toContainText("WebP");

    await input.setInputFiles({
      name:     "banner.svg",
      mimeType: "image/svg+xml",
      buffer:   Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 100"><rect width="600" height="100" fill="#16a34a"/></svg>'),
    });
    await expect(page.getByTestId("asset-meta-email_header")).toContainText("SVG");
    await expect(page.getByTestId("asset-meta-email_header")).toContainText("600×100");
    await expect(slot(page, "email_header").getByRole("alert")).toHaveCount(0);
    await expectImageRendered(slot(page, "email_header").getByRole("img", { name: /preview/ }));
  });

  test("non-images are rejected", async ({ page }) => {
    await page.getByTestId("asset-input-icon").setInputFiles({
      name: "notes.png", mimeType: "image/png", buffer: Buffer.from("definitely not a png"),
    });
    await expect(slot(page, "icon").getByRole("alert")).toContainText("Unsupported file type");
  });

  test("remove an asset through the confirm dialog (cancel first)", async ({ page }) => {
    const iconSlot = slot(page, "icon");

    await iconSlot.getByRole("button", { name: "Remove" }).click();
    await expect(page.getByRole("dialog")).toContainText("Remove the icon?");
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByTestId("asset-meta-icon")).toBeVisible();

    await iconSlot.getByRole("button", { name: "Remove" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
    await expect(iconSlot).toContainText("Nothing uploaded.");
    await expect(iconSlot.getByRole("button", { name: "Upload" })).toBeVisible();
  });
});

test.describe("templates", () => {
  test("add an email template with a live, branded preview", async ({ page }) => {
    await page.goto("/notifications/templates/new");

    await page.getByLabel("External system").click();
    await page.getByPlaceholder("Search external system…").fill("Acme E2E");
    await page.getByRole("option", { name: SYSTEM_NAME }).click();

    await page.getByLabel("Event type").fill("order.shipped");
    await page.getByLabel("Subject").fill("Order #{{order.id}} shipped");
    await setEditor(page, 
      '<h2>Hi {{customer.name | default: "there"}}</h2><p>Order <b>#{{order.id}}</b> is on its way.</p>',
    );

    // preview renders before anything is saved
    const preview = page.getByTestId("template-preview");
    // the sample payload is seeded from the template's own variables
    await expect(page.getByLabel("Sample payload (JSON)")).toHaveValue(/"id": "<order\.id>"/);
    await page.getByLabel("Sample payload (JSON)").fill('{"order":{"id":1001},"customer":{"name":"<Ada>"}}');

    await expect(preview.getByTestId("preview-subject")).toHaveText("Order #1001 shipped");
    const frame = previewFrame(page);
    await expect(frame.locator("h2")).toHaveText("Hi <Ada>"); // escaped, shown literally
    await expect(frame.locator("p").first()).toContainText("Order #1001 is on its way.");
    // the GIF logo heads the email (the SVG email_header is skipped for clients that can't show it)
    const headerLogo = frame.locator('[data-slot="header"] img');
    await expect(headerLogo).toHaveAttribute("src", new RegExp(`^${API_URL}/api/asset/`));
    await expect(headerLogo).toHaveAttribute("alt", SYSTEM_NAME);
    await expectImageRendered(headerLogo);
    await expect(frame.locator('[data-slot="footer"]')).toContainText(`Sent by ${SYSTEM_NAME}`);

    // plain-text part
    await page.getByRole("tab", { name: "Plain text" }).click();
    await expect(preview.getByTestId("preview-text")).toHaveText("Hi <Ada>\nOrder #1001 is on its way.");
    await page.getByRole("tab", { name: "Email" }).click();

    await page.getByRole("button", { name: "Create template" }).click();
    await expect(page).toHaveURL(/\/notifications\/templates\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "order.shipped" })).toBeVisible();
    templatePath = new URL(page.url()).pathname;
  });

  test("a duplicate template is refused with the server's message", async ({ page }) => {
    await page.goto("/notifications/templates/new");
    await page.getByLabel("External system").click();
    await page.getByPlaceholder("Search external system…").fill("Acme E2E");
    await page.getByRole("option", { name: SYSTEM_NAME }).click();
    await page.getByLabel("Event type").fill("order.shipped");
    await page.getByLabel("Subject").fill("dup");
    await setEditor(page, "dup");
    await page.getByRole("button", { name: "Create template" }).click();
    await expect(page.getByTestId("save-error")).toContainText("already exists");
  });

  test("edit: preview follows unsaved edits, save persists them", async ({ page }) => {
    await page.goto(templatePath);
    const save = page.getByRole("button", { name: "Save" });
    await expect(save).toBeDisabled(); // nothing changed yet

    const preview = page.getByTestId("template-preview");
    await page.getByLabel("Sample payload (JSON)").fill('{"order":{"id":7,"eta":"Friday"}}');
    await setEditor(page, "<p>Order {{order.id}} arrives {{order.eta}}.</p>");
    await expect(page.getByText("Unsaved changes")).toBeVisible();
    await expect(previewFrame(page).locator('[data-slot="body"] p')).toHaveText("Order 7 arrives Friday.");

    // a background refetch (React Query refetches on window focus) must not wipe unsaved edits
    const refetched = page.waitForResponse((response) => response.url().includes("/api/notification-template/") && response.request().method() === "GET");
    await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
    await refetched;
    await expect(editor(page)).toHaveText("<p>Order {{order.id}} arrives {{order.eta}}.</p>");

    await save.click();
    await expect(page.getByText("Template saved")).toBeVisible();
    await expect(save).toBeDisabled();

    await page.reload();
    await expect(editor(page)).toHaveText("<p>Order {{order.id}} arrives {{order.eta}}.</p>");
    await expect(preview).toBeVisible();
  });

  test("editor: @ inserts a brand image, {{ completes variables, toolbar inserts blocks", async ({ page }) => {
    await page.goto(templatePath);
    await expect(editor(page)).toBeVisible();
    await page.getByLabel("Sample payload (JSON)").fill('{"order":{"id":7,"eta":"Friday"}}');
    await setEditor(page, "<p>Hello</p>");
    await page.keyboard.press("ControlOrMeta+End");

    // @ → search brand assets; the menu shows thumbnails grouped by source
    await page.keyboard.type(" @lo");
    const menu = page.locator(".cm-tooltip-autocomplete");
    await expect(menu).toBeVisible();
    await expect(menu.locator("completion-section")).toContainText("Brand assets");
    const logoOption = menu.getByRole("option", { name: /Logo/ }).first();
    await expect(logoOption).toContainText("GIF · 240×60");
    await expectImageRendered(logoOption.locator("img.cm-tpl-thumb"));
    await page.keyboard.press("Enter");

    await expect(editor(page)).toContainText('<img src="{{system.logo_url}}" alt="{{system.name}} logo" width="200"');
    // the preview resolves it to the uploaded logo, served by the API
    const inserted = previewFrame(page).locator('[data-slot="body"] img');
    await expect(inserted).toHaveAttribute("src", new RegExp(`^${API_URL}/api/asset/`));
    await expectImageRendered(inserted);

    // {{ → payload keys (from the sample) and built-ins
    await page.keyboard.type(" {{ord");
    await expect(menu.getByRole("option", { name: /order\.id/ })).toBeVisible();
    await expect(menu.getByRole("option", { name: /^ord\b/ })).toHaveCount(0); // not the half-typed word itself
    await menu.getByRole("option", { name: /order\.eta/ }).click();
    await expect(editor(page)).toContainText("{{order.eta}}");
    await expect(previewFrame(page).locator('[data-slot="body"]')).toContainText("Friday");

    await page.keyboard.type(" {{system.");
    await menu.getByRole("option", { name: /system\.name/ }).click();
    // completing steps over the auto-closed braces: the next tag starts outside the previous one
    await expect(editor(page)).toContainText("{{order.eta}} {{system.name}}");

    // toolbar snippets
    await page.getByRole("toolbar", { name: "Template tools" }).getByRole("button", { name: "Button" }).click();
    await expect(previewFrame(page).getByRole("link", { name: "Button label" })).toBeVisible();

    // leave without saving: nothing persisted
    await page.reload();
    await expect(editor(page)).toHaveText("<p>Order {{order.id}} arrives {{order.eta}}.</p>");
  });

  test("edit: syntax errors show in the preview and block saving", async ({ page }) => {
    await page.goto(templatePath);
    await setEditor(page, "<p>Order {{order.id</p>");

    await expect(page.getByTestId("preview-issues")).toContainText('template: Unclosed "{{" (at position 9)');
    // …and the editor marks the exact spot
    await expect(page.locator(".cm-lintRange-error")).toHaveCount(1);
    await expect(page.locator(".cm-lintRange-error")).toHaveText("{{");

    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByTestId("save-error")).toContainText('Unclosed "{{"');

    await page.reload();
    await expect(editor(page)).toHaveText("<p>Order {{order.id}} arrives {{order.eta}}.</p>");
  });

  test("edit: an email template can't lose its subject", async ({ page }) => {
    await page.goto(templatePath);
    const subject = page.getByLabel("Subject");
    await subject.fill("");
    // the browser's own `required` check stops the submit first…
    await page.getByRole("button", { name: "Save" }).click();
    expect(await subject.evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
    // …and the server enforces it regardless
    await expect(page.getByTestId("preview-issues")).toContainText("subject: is required for email templates");
    await page.reload();
    await expect(subject).toHaveValue("Order #{{order.id}} shipped");
  });

  test("add an SMS template: plain-text bubble, no subject, segment warning", async ({ page }) => {
    await page.goto("/notifications/templates/new");
    await page.getByLabel("External system").click();
    await page.getByPlaceholder("Search external system…").fill("Acme E2E");
    await page.getByRole("option", { name: SYSTEM_NAME }).click();
    await page.getByLabel("Event type").fill("otp.requested");
    await selectOption(page, "Channel", "sms");
    await setEditor(page, "{{system.name}} code: {{code}} <keep & raw>");
    await page.getByLabel("Sample payload (JSON)").fill('{"code":"123456"}');

    const message = page.getByTestId("preview-message");
    await expect(message).toHaveText(`${SYSTEM_NAME} code: 123456 <keep & raw>`);
    await expect(page.getByTestId("preview-subject")).toHaveCount(0);

    await setEditor(page, "x".repeat(170));
    await expect(page.getByTestId("preview-warning")).toContainText("170 characters and will be sent as 2 segments");

    await setEditor(page, "Code {{code}}");
    await page.getByRole("button", { name: "Create template" }).click();
    await expect(page).toHaveURL(/\/notifications\/templates\/[0-9a-f-]{36}$/);
    await expect(page.getByText("Not used for this channel.")).toBeVisible();
  });

  test("the list shows both templates", async ({ page }) => {
    await page.goto("/notifications/templates");
    await expect(page.getByRole("link", { name: "order.shipped" })).toBeVisible();
    await expect(page.getByRole("link", { name: "otp.requested" })).toBeVisible();
  });

  test("delete through the confirm dialog", async ({ page, request }) => {
    await page.goto(templatePath);
    await page.getByRole("button", { name: "Delete template" }).click();
    await expect(page.getByRole("dialog")).toContainText("Delete this template?");
    await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();

    await expect(page).toHaveURL(/\/notifications\/templates$/);
    await expect(page.getByText("Template deleted")).toBeVisible();
    await expect(page.getByRole("link", { name: "order.shipped" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "otp.requested" })).toBeVisible();

    const id = templatePath.split("/").pop();
    expect((await request.get(`${API_URL}/api/notification-template/${id}`)).status()).toBe(404);

    // the old URL now shows a clear not-found state
    await page.goto(templatePath);
    await expect(page.getByTestId("load-error")).toHaveText("This template doesn't exist or has been deleted.");
    await expect(page.getByRole("link", { name: "Back to templates" })).toBeVisible();
  });
});

test.describe("providers", () => {
  const PROVIDER_NAME = `Own domain E2E ${Date.now()}`;
  let providerPath    = "";

  test("configure our own domain over SMTP", async ({ page }) => {
    await page.goto("/providers/new");
    await expect(page.getByRole("radio", { name: "Email", exact: true })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("radio", { name: /Own domain \(SMTP\)/ }).click();

    await page.getByLabel("Name", { exact: true }).fill(PROVIDER_NAME);
    await page.getByLabel("SMTP host", { exact: true }).fill("smtp.acme-e2e.test");
    await expect(page.getByLabel("Port", { exact: true })).toHaveValue("587"); // catalog default
    await page.getByLabel("Username (optional)", { exact: true }).fill("noreply@acme-e2e.test");
    await page.getByLabel("Password (optional)", { exact: true }).fill("smtp-secret-e2e");
    await page.getByLabel("From email", { exact: true }).fill("not-an-email");
    await page.getByLabel("Priority", { exact: true }).fill("10");

    // client-side validation catches it before the request
    await page.getByRole("button", { name: "Create provider" }).click();
    await expect(page.getByTestId("provider-error")).toHaveText("From email: must be an email address");
    await expect(page.getByText("must be an email address", { exact: true })).toBeVisible(); // under the field

    await page.getByLabel("From email", { exact: true }).fill("noreply@acme-e2e.test");
    // DNS guidance for the sending domain
    await expect(page.getByText("DNS for acme-e2e.test")).toBeVisible();
    await expect(page.getByText("v=DMARC1; p=none; rua=mailto:dmarc@acme-e2e.test")).toBeVisible();

    await page.getByRole("button", { name: "Create provider" }).click();
    await expect(page).toHaveURL(/\/providers\/[0-9a-f-]{36}$/);
    providerPath = new URL(page.url()).pathname;

    await expect(page.getByRole("heading", { name: PROVIDER_NAME })).toBeVisible();
    await expect(page.getByTestId("secret-password")).toContainText("Saved");
    // the password never comes back to the browser
    await expect(page.getByLabel("Password (optional)", { exact: true })).toHaveValue("");
    expect(await page.content()).not.toContain("smtp-secret-e2e");
  });

  test("edit settings while keeping the saved password", async ({ page, request }) => {
    await page.goto(providerPath);
    await page.getByLabel("SMTP host", { exact: true }).fill("mail.acme-e2e.test");
    await page.getByLabel("Port", { exact: true }).fill("465");
    await selectOption(page, "Security", "tls");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Provider saved")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("SMTP host", { exact: true })).toHaveValue("mail.acme-e2e.test");
    await expect(page.getByLabel("Port", { exact: true })).toHaveValue("465");
    await expect(page.getByTestId("secret-password")).toContainText("Saved");

    const id   = providerPath.split("/").pop();
    const body = await (await request.get(`${API_URL}/api/channel-provider/${id}`)).json();
    expect(body.data).toMatchObject({ secret_keys: ["password"], config: { host: "mail.acme-e2e.test", port: 465, security: "tls" } });
    expect(JSON.stringify(body)).not.toContain("smtp-secret-e2e");
  });

  test("removing the password requires removing the username too", async ({ page }) => {
    await page.goto(providerPath);
    await page.getByTestId("secret-password").getByRole("button", { name: "Remove" }).click();
    await expect(page.getByTestId("secret-password")).toContainText("Will be removed");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByTestId("provider-error")).toContainText("Password: username and password go together");

    await page.getByTestId("secret-password").getByRole("button", { name: "Undo" }).click();
    await expect(page.getByTestId("secret-password")).toContainText("Saved");
  });

  test("a Telegram bot needs its token", async ({ page }) => {
    await page.goto("/providers/new");
    await page.getByRole("radio", { name: "Telegram", exact: true }).click();
    await expect(page.getByText("Telegram bot settings")).toBeVisible();
    await page.getByLabel("Name", { exact: true }).fill(`Bot E2E ${Date.now()}`);
    await page.getByRole("button", { name: "Create provider" }).click();
    await expect(page.getByTestId("provider-error")).toHaveText("Bot token: is required");

    await page.getByLabel("Bot token", { exact: true }).fill("123456:ABC-e2e");
    await page.getByRole("button", { name: "Create provider" }).click();
    await expect(page).toHaveURL(/\/providers\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId("secret-bot_token")).toContainText("Saved");
  });

  test("the list shows service, sender, priority and credential status", async ({ page }) => {
    await page.goto("/providers");
    const row = page.getByRole("row", { name: new RegExp(PROVIDER_NAME) });
    await expect(row).toContainText("Own domain (SMTP)");
    await expect(row).toContainText("noreply@acme-e2e.test");
    await expect(row).toContainText("10");
    await expect(row).toContainText("Saved");
  });
});

test.describe("overview dashboard", () => {
  // the e2e API is started with deterministic demo traffic (db/seed-demo.ts)
  const statsFor = async (request: import("@playwright/test").APIRequestContext, days: number, timezone: string) =>
    (await (await request.get(`${API_URL}/api/stats/overview?days=${days}&timezone=${encodeURIComponent(timezone)}`)).json()).data;

  test("tiles, chart and tables show the API's numbers", async ({ page, request }) => {
    await page.goto("/");
    const timezone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
    const stats    = await statsFor(request, 30, timezone);
    expect(stats.totals.notifications).toBeGreaterThan(0);

    const fmt = (n: number) => new Intl.NumberFormat("en-US").format(n);
    await expect(page.getByTestId("tile-notifications-value")).toHaveText(fmt(stats.totals.notifications));
    await expect(page.getByTestId("tile-deliveries-value")).toHaveText(fmt(stats.totals.deliveries));
    await expect(page.getByTestId("tile-sent-value")).toHaveText(fmt(stats.totals.sent));
    await expect(page.getByTestId("tile-failed-value")).toHaveText(fmt(stats.totals.failed));
    await expect(page.getByTestId("tile-success-rate-value")).toContainText("%");

    // one column group per day, each with a hit target
    await expect(page.getByTestId("daily-chart").locator("g[role=button]")).toHaveCount(30);

    // hover a day → tooltip with every series
    const lastDay = page.getByTestId("daily-chart").locator("g[role=button]").last();
    await lastDay.hover();
    const tooltip = page.getByTestId("daily-tooltip");
    for (const label of ["Sent", "Failed", "In progress", "Skipped"]) await expect(tooltip).toContainText(label);
    await expect(tooltip).toContainText(fmt(stats.daily.at(-1).sent));

    // table view carries the same numbers
    await page.getByRole("button", { name: "Show table" }).click();
    await expect(page.getByTestId("daily-table").locator("tbody tr")).toHaveCount(30);

    // breakdowns
    await expect(page.getByTestId("channel-email")).toContainText(fmt(stats.channels[0].deliveries));
    await expect(page.getByTestId("providers-table")).toContainText("Demo Amazon SES");
    await expect(page.getByTestId("event-types").locator("li")).toHaveCount(stats.event_types.length);
    await expect(page.getByTestId("failures-table").locator("tbody tr")).toHaveCount(stats.recent_failures.length);
  });

  test("switching the range refetches everything", async ({ page, request }) => {
    await page.goto("/");
    const timezone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
    await page.getByRole("radio", { name: "Last 7 days" }).click();
    await expect(page.getByRole("radio", { name: "Last 7 days" })).toHaveAttribute("aria-checked", "true");

    const stats = await statsFor(request, 7, timezone);
    await expect(page.getByTestId("daily-chart").locator("g[role=button]")).toHaveCount(7);
    await expect(page.getByTestId("tile-sent-value")).toHaveText(new Intl.NumberFormat("en-US").format(stats.totals.sent));

    await page.getByRole("radio", { name: "Last 90 days" }).click();
    await expect(page.getByTestId("daily-chart").locator("g[role=button]")).toHaveCount(90);
  });

  test("charts use flat fills — no gradients anywhere", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("daily-chart")).toBeVisible();
    // scoped to the app's own markup: Next's dev-only overlay (in a shadow
    // root) draws its own logo with gradients
    expect(await page.locator("main, nav").locator("linearGradient, radialGradient").count()).toBe(0);
    const gradientBackgrounds = await page.evaluate(() =>
      [...document.querySelectorAll("main *, nav *")].filter((el) => getComputedStyle(el).backgroundImage.includes("gradient")).length,
    );
    expect(gradientBackgrounds).toBe(0);
  });
});

test.describe("names instead of ids", () => {
  test("a user is created with a name and shown by it everywhere", async ({ page }) => {
    const name = `Dara E2E ${Date.now()}`;
    await page.goto("/users/new");
    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByRole("button", { name: "Create user" }).click();
    await expect(page).toHaveURL(/\/users\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);

    await page.goto("/users");
    await page.getByLabel("Search users").fill(name);
    await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();
  });

  test("lists show user and system names, not UUIDs", async ({ page }) => {
    const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
    for (const path of ["/notifications", "/deliveries", "/users", "/notifications/templates", "/external-systems"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      expect(await page.locator("main table").innerText(), path).not.toMatch(uuid);
    }
  });
});

test.describe("deliveries", () => {
  test("queue tiles, status filter and a delivery's timeline", async ({ page }) => {
    await page.goto("/deliveries");
    await expect(page.getByText("Sent, last hour")).toBeVisible();

    await page.getByRole("radio", { name: "Failed" }).click();
    await expect(page).toHaveURL(/status=failed/);
    const firstRow = page.locator("main table tbody tr").first();
    await expect(firstRow).toContainText("Failed");

    await firstRow.getByRole("link").first().click();
    await expect(page).toHaveURL(/\/deliveries\/[0-9a-f-]{36}$/);
    await expect(page.getByText("Timeline")).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  });
});

test("no console errors on the main screens", async ({ page }) => {
  const errors: Array<string> = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  for (const path of [
    "/", systemPath, "/notifications/templates", "/notifications/templates/new", "/providers", "/providers/new",
    "/deliveries", "/notifications", "/notifications/new", "/users",
  ]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }
  expect(errors).toEqual([]);
});
