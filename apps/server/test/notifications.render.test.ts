import { describe, expect, test } from "bun:test";
import { BrandAssetRecord, type AssetContentType, type AssetKind } from "@repo/schema";
import { isFullDocument, logoDisplaySize, wrapEmail } from "../src/domain/notifications/email-layout";
import {
  renderForChannel,
  validateTemplateFields,
  type RenderInput,
  type RenderOutput,
} from "../src/domain/notifications/notifications.render";

let assetCounter = 0;
const asset = (
  kind:         AssetKind,
  content_type: AssetContentType = "image/png",
  width:        number | null = 480,
  height:       number | null = 120,
) => {
  const id = `00000000-0000-4000-8000-${String(++assetCounter).padStart(12, "0")}`;
  return new BrandAssetRecord({
    id, external_system_id: "sys", kind, filename: `${kind}.png`, content_type,
    byte_size: 10, width, height, sha256: "x", url: `/api/asset/${id}`,
    created_at: new Date(), updated_at: null,
  });
};

const base: RenderInput = {
  channel:    "email",
  template:   "<p>Hello {{name}}</p>",
  subject:    "Order {{order.id}}",
  payload:    { name: "Ada", order: { id: 7 } },
  systemName: "Acme & Co",
  assets:     [],
  publicUrl:  "https://notify.example.com/",
};

const ok = (input: Partial<RenderInput>): RenderOutput => {
  const result = renderForChannel({ ...base, ...input });
  if ("problems" in result) throw new Error(`unexpected problems: ${result.problems.join("; ")}`);
  return result;
};

describe("validateTemplateFields", () => {
  test("valid email template", () => {
    expect(validateTemplateFields({ channel: "email", template: "Hi {{a}}", subject: "S" })).toEqual([]);
  });

  test("email requires a non-blank subject", () => {
    expect(validateTemplateFields({ channel: "email", template: "x", subject: null }))
      .toEqual(["subject: is required for email templates"]);
    expect(validateTemplateFields({ channel: "email", template: "x", subject: "   " }))
      .toEqual(["subject: is required for email templates"]);
  });

  test("sms and telegram don't need a subject", () => {
    expect(validateTemplateFields({ channel: "sms", template: "x", subject: null })).toEqual([]);
    expect(validateTemplateFields({ channel: "telegram", template: "x", subject: null })).toEqual([]);
  });

  test("blank template is rejected", () => {
    expect(validateTemplateFields({ channel: "sms", template: " \n ", subject: null }))
      .toEqual(["template: must not be empty"]);
  });

  test("syntax errors in body and subject are both reported with positions", () => {
    expect(validateTemplateFields({ channel: "email", template: "Hi {{name", subject: "{{ }}" })).toEqual([
      'template: Unclosed "{{" (at position 3)',
      "subject: Empty expression (at position 0)",
    ]);
  });

  test("subject must be one line and bounded", () => {
    expect(validateTemplateFields({ channel: "email", template: "x", subject: "a\nb" }))
      .toEqual(["subject: must be a single line"]);
    expect(validateTemplateFields({ channel: "email", template: "x", subject: "s".repeat(256) }))
      .toEqual(["subject: must be at most 255 characters"]);
  });
});

describe("email rendering", () => {
  test("renders subject (unescaped) and body (escaped) inside the layout", () => {
    const out = ok({ payload: { name: "<Ada>", order: { id: "A&B" } } });
    expect(out.subject).toBe("Order A&B");
    expect(out.body).toStartWith("<!DOCTYPE html>");
    expect(out.body).toContain("<p>Hello &lt;Ada&gt;</p>");
    expect(out.body).toContain("<title>Order A&amp;B</title>");
    expect(out.text).toBe("Hello <Ada>");
  });

  test("without a logo the header shows the escaped system name", () => {
    const out = ok({});
    expect(out.body).toContain('<span style="font-size:20px;font-weight:600;color:#111827;">Acme &amp; Co</span>');
    expect(out.body).toContain("Sent by Acme &amp; Co");
    expect(out.body).not.toContain("<img");
  });

  test("logo becomes an absolute, sized <img> in the header", () => {
    const logo = asset("logo", "image/png", 480, 120);
    const out  = ok({ assets: [logo] });
    expect(out.body).toContain(
      `<img src="https://notify.example.com/api/asset/${logo.id}" alt="Acme &amp; Co" width="200" height="50"`,
    );
    expect(out.warnings).toEqual([]);
  });

  test("email_header wins over logo", () => {
    const header = asset("email_header", "image/jpeg", 1200, 200);
    const out    = ok({ assets: [asset("logo"), header] });
    expect(out.body).toContain(`/api/asset/${header.id}"`);
  });

  test("a raster logo is preferred over an SVG email_header", () => {
    const svgHeader = asset("email_header", "image/svg+xml", 600, 100);
    const pngLogo   = asset("logo", "image/png", 480, 120);
    const out       = ok({ assets: [svgHeader, pngLogo] });
    expect(out.body).toContain(`/api/asset/${pngLogo.id}"`);
    expect(out.warnings).toEqual([]);
  });

  test.each([
    ["image/svg+xml", "SVG"],
    ["image/webp",    "image/webp"],
    ["image/x-icon",  "image/x-icon"],
  ] as const)("only a %s logo → used, with a client-support warning", (type, label) => {
    const logo = asset("logo", type, 480, 120);
    const out  = ok({ assets: [logo] });
    expect(out.body).toContain(`/api/asset/${logo.id}"`);
    expect(out.warnings).toEqual([
      `Header logo is ${label}, which Gmail and Outlook don't display — upload a PNG or JPEG logo`,
    ]);
  });

  test("GIF logos are fine for email", () => {
    expect(ok({ assets: [asset("logo", "image/gif", 480, 120)] }).warnings).toEqual([]);
  });

  test("low-resolution logo warns about high-DPI screens", () => {
    const out = ok({ assets: [asset("logo", "image/png", 120, 30)] });
    expect(out.warnings).toEqual(["Header logo is 120px wide; use at least 240px so it stays sharp on high-DPI screens"]);
  });

  test("SVG without intrinsic size gets a width only", () => {
    const out = ok({ assets: [asset("logo", "image/svg+xml", null, null)] });
    expect(out.body).toMatch(/width="200" style=/);
  });

  test("logo_dark and icon are not used as the header", () => {
    const out = ok({ assets: [asset("logo_dark"), asset("icon")] });
    expect(out.body).not.toContain("<img");
  });

  test("templates that are full documents skip the layout", () => {
    const doc = "<html><body><p>{{name}}</p></body></html>";
    const out = ok({ template: doc, assets: [asset("logo")] });
    expect(out.body).toBe("<html><body><p>Ada</p></body></html>");
  });

  test("system.* variables expose name and every asset URL", () => {
    const logo = asset("logo");
    const dark = asset("logo_dark");
    const icon = asset("icon");
    const out  = ok({
      template: '{{system.name}}|{{system.logo_url}}|{{system.logo_dark_url}}|{{system.icon_url}}|{{system.email_header_url | default: "none"}}',
      assets:   [logo, dark, icon],
    });
    expect(out.body).toContain(
      `Acme &amp; Co|https://notify.example.com/api/asset/${logo.id}|https://notify.example.com/api/asset/${dark.id}|https://notify.example.com/api/asset/${icon.id}|none`,
    );
  });

  test("a payload 'system' key can't spoof built-ins, and is flagged", () => {
    const out = ok({ template: "{{system.name}}", payload: { system: { name: "Evil" } } });
    expect(out.body).toContain("Acme &amp; Co");
    expect(out.warnings[0]).toContain('payload key "system" is reserved');
  });

  test("variables and missing are collected from subject and body", () => {
    const out = ok({ subject: "{{a}} {{b}}", template: "{{b}} {{c}}", payload: { b: 1 } });
    expect(out.variables).toEqual(["a", "b", "c"]);
    expect(out.missing).toEqual(["a", "c"]);
  });
});

describe("sms and telegram", () => {
  test("plain text, no layout, no escaping, subject ignored", () => {
    const out = ok({ channel: "sms", template: "Hi {{name}} & welcome", subject: "ignored", payload: { name: "<Ada>" } });
    expect(out).toMatchObject({ channel: "sms", subject: null, text: null, body: "Hi <Ada> & welcome", warnings: [] });
  });

  test("long SMS warns about segments", () => {
    const out = ok({ channel: "sms", template: "x".repeat(161), subject: null });
    expect(out.warnings).toEqual(["SMS is 161 characters and will be sent as 2 segments"]);
  });

  test("SMS at exactly 160 characters is one segment", () => {
    expect(ok({ channel: "sms", template: "x".repeat(160), subject: null }).warnings).toEqual([]);
  });

  test("telegram over 4096 characters warns", () => {
    const out = ok({ channel: "telegram", template: "{{t}}", subject: null, payload: { t: "y".repeat(4097) } });
    expect(out.warnings[0]).toContain("limited to 4096 characters");
  });
});

describe("invalid input", () => {
  test("returns problems instead of rendering", () => {
    expect(renderForChannel({ ...base, subject: null })).toEqual({
      problems: ["subject: is required for email templates"],
    });
  });
});

describe("email-layout helpers", () => {
  test.each([
    [480,  120,  { width: 200, height: 50 }],
    [100,  20,   { width: 100, height: 20 }],
    [64,   256,  { width: 16,  height: 64 }],
    [null, null, { width: 200, height: null }],
  ])("logoDisplaySize(%p, %p)", (w, h, expected) => {
    expect(logoDisplaySize(w, h)).toEqual(expected);
  });

  test("isFullDocument", () => {
    expect(isFullDocument("<HTML lang=en>")).toBe(true);
    expect(isFullDocument("<p>the <html> tag</p>")).toBe(true);
    expect(isFullDocument("<p>htmlish</p>")).toBe(false);
  });

  test("wrapEmail escapes the logo URL attribute", () => {
    const html = wrapEmail({
      subject:  "s",
      bodyHtml: "b",
      branding: { systemName: "n", logoUrl: 'https://x.test/a"onerror="x', logoWidth: 10, logoHeight: 10 },
    });
    expect(html).toContain('src="https://x.test/a&quot;onerror=&quot;x"');
  });
});
