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
    await page.getByLabel("Template").fill(
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
    await page.getByLabel("Template").fill("dup");
    await page.getByRole("button", { name: "Create template" }).click();
    await expect(page.getByTestId("save-error")).toContainText("already exists");
  });

  test("edit: preview follows unsaved edits, save persists them", async ({ page }) => {
    await page.goto(templatePath);
    const save = page.getByRole("button", { name: "Save" });
    await expect(save).toBeDisabled(); // nothing changed yet

    const preview = page.getByTestId("template-preview");
    await page.getByLabel("Sample payload (JSON)").fill('{"order":{"id":7,"eta":"Friday"}}');
    await page.getByLabel("Template").fill("<p>Order {{order.id}} arrives {{order.eta}}.</p>");
    await expect(page.getByText("Unsaved changes")).toBeVisible();
    await expect(previewFrame(page).locator('[data-slot="body"] p')).toHaveText("Order 7 arrives Friday.");

    await save.click();
    await expect(page.getByText("Template saved")).toBeVisible();
    await expect(save).toBeDisabled();

    await page.reload();
    await expect(page.getByLabel("Template")).toHaveValue("<p>Order {{order.id}} arrives {{order.eta}}.</p>");
    await expect(preview).toBeVisible();
  });

  test("edit: syntax errors show in the preview and block saving", async ({ page }) => {
    await page.goto(templatePath);
    await page.getByLabel("Template").fill("<p>Order {{order.id</p>");

    await expect(page.getByTestId("preview-issues")).toContainText('template: Unclosed "{{" (at position 9)');

    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByTestId("save-error")).toContainText('Unclosed "{{"');

    await page.reload();
    await expect(page.getByLabel("Template")).toHaveValue("<p>Order {{order.id}} arrives {{order.eta}}.</p>");
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
    await page.getByLabel("Template").fill("{{system.name}} code: {{code}} <keep & raw>");
    await page.getByLabel("Sample payload (JSON)").fill('{"code":"123456"}');

    const message = page.getByTestId("preview-message");
    await expect(message).toHaveText(`${SYSTEM_NAME} code: 123456 <keep & raw>`);
    await expect(page.getByTestId("preview-subject")).toHaveCount(0);

    await page.getByLabel("Template").fill("x".repeat(170));
    await expect(page.getByTestId("preview-warning")).toContainText("170 characters and will be sent as 2 segments");

    await page.getByLabel("Template").fill("Code {{code}}");
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

test("no console errors on the main screens", async ({ page }) => {
  const errors: Array<string> = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  for (const path of [systemPath, "/notifications/templates", "/notifications/templates/new"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }
  expect(errors).toEqual([]);
});
