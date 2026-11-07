import { describe, expect, test } from "bun:test";
import {
  escapeHtml,
  htmlToText,
  parseTemplate,
  renderTemplate,
  templateVariables,
} from "../src/domain/notifications/template-engine";

const html  = { escapeHtml: true };
const plain = { escapeHtml: false };

const render = (template: string, context: Record<string, unknown>, options = plain) => {
  const result = renderTemplate(template, context, options);
  if ("issues" in result) throw new Error(`unexpected issues: ${JSON.stringify(result.issues)}`);
  return result;
};

const issuesOf = (template: string) => {
  const parsed = parseTemplate(template);
  return parsed.ok ? [] : parsed.issues.map((issue) => issue.message);
};

describe("variables", () => {
  test("substitutes top-level values", () => {
    expect(render("Hi {{name}}!", { name: "Ada" }).output).toBe("Hi Ada!");
  });

  test("tolerates whitespace inside braces", () => {
    expect(render("Hi {{   name   }}", { name: "Ada" }).output).toBe("Hi Ada");
  });

  test("walks nested objects and array indexes", () => {
    const context = { order: { id: 42, items: [{ title: "Lamp" }, { title: "Desk" }] } };
    expect(render("#{{order.id}}: {{order.items.1.title}}", context).output).toBe("#42: Desk");
  });

  test("stringifies numbers, booleans, objects and dates", () => {
    const context = { n: 0, b: false, o: { a: 1 }, list: [1, 2], d: new Date("2026-01-02T03:04:05Z") };
    expect(render("{{n}} {{b}} {{o}} {{list}} {{d}}", context).output)
      .toBe('0 false {"a":1} [1,2] 2026-01-02T03:04:05.000Z');
  });

  test("keys with dashes and underscores are allowed", () => {
    expect(render("{{first-name}} {{last_name}}", { "first-name": "A", last_name: "B" }).output).toBe("A B");
  });

  test("missing values render empty and are reported once each", () => {
    const result = render("{{a}} {{b.c}} {{a}}", {});
    expect(result.output).toBe("  ");
    expect(result.missing).toEqual(["a", "b.c"]);
  });

  test("null and empty string count as missing", () => {
    expect(render("[{{a}}][{{b}}]", { a: null, b: "" }).missing).toEqual(["a", "b"]);
  });

  test("lookups never reach into the prototype chain", () => {
    const result = render("{{constructor}}|{{toString}}|{{name.length}}", { name: "abc" });
    expect(result.output).toBe("||");
    expect(result.missing).toEqual(["constructor", "toString", "name.length"]);
  });

  test("descending into a primitive is a miss, not a crash", () => {
    expect(render("{{a.b.c}}", { a: 5 }).missing).toEqual(["a.b.c"]);
  });
});

describe("default filter", () => {
  test("is used when the value is missing", () => {
    const result = render('{{nick | default: "friend"}}', {});
    expect(result.output).toBe("friend");
    expect(result.missing).toEqual([]);
  });

  test("is ignored when the value exists", () => {
    expect(render('{{nick | default: "friend"}}', { nick: "Ace" }).output).toBe("Ace");
  });

  test("accepts single quotes, escaped quotes and empty defaults", () => {
    expect(render("{{a | default: 'x'}}", {}).output).toBe("x");
    expect(render('{{a | default: "say \\"hi\\""}}', {}).output).toBe('say "hi"');
    expect(render('[{{a | default: ""}}]', {}).missing).toEqual([]);
  });

  test("default text is escaped like any other value in HTML mode", () => {
    expect(render('{{a | default: "<b>"}}', {}, html).output).toBe("&lt;b&gt;");
  });
});

describe("escaping", () => {
  test("HTML mode escapes the five significant characters", () => {
    expect(render("{{v}}", { v: `<a href="x">'&'</a>` }, html).output)
      .toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });

  test("triple braces output raw HTML", () => {
    expect(render("{{{v}}}", { v: "<b>bold</b>" }, html).output).toBe("<b>bold</b>");
  });

  test("plain mode never escapes", () => {
    expect(render("{{v}}", { v: "<b>&</b>" }, plain).output).toBe("<b>&</b>");
  });

  test("template literal text is left untouched in HTML mode", () => {
    expect(render("<p class='x'>{{v}}</p>", { v: "&" }, html).output).toBe("<p class='x'>&amp;</p>");
  });

  test("\\{{ produces literal braces", () => {
    expect(render("use \\{{name}} syntax", { name: "x" }).output).toBe("use {{name}} syntax");
  });

  test("nested CSS closing braces are not mistaken for a tag", () => {
    const css = "<style>@media (max-width:600px){ .a { color:red }}</style>{{v}}";
    expect(render(css, { v: "ok" }).output).toBe("<style>@media (max-width:600px){ .a { color:red }}</style>ok");
  });

  test("escapeHtml is exported for the layout", () => {
    expect(escapeHtml(`"Tom & Jerry's"`)).toBe("&quot;Tom &amp; Jerry&#39;s&quot;");
  });
});

describe("syntax errors", () => {
  test("unclosed tag", () => {
    expect(issuesOf("Hi {{name")).toEqual(['Unclosed "{{"']);
  });

  test("tag opened again before closing", () => {
    expect(issuesOf("{{a {{b}}")).toEqual(['Unclosed "{{"']);
  });

  test("raw tag closed with only two braces", () => {
    expect(issuesOf("{{{a}}")).toEqual(['Unclosed "{{{"']);
  });

  test("empty expression", () => {
    expect(issuesOf("{{ }}")).toEqual(["Empty expression"]);
  });

  test("invalid variable names", () => {
    expect(issuesOf("{{a..b}}")).toEqual(['Invalid variable name "a..b"']);
    expect(issuesOf("{{a b}}")).toEqual(['Invalid variable name "a b"']);
    expect(issuesOf("{{a[0]}}")).toEqual(['Invalid variable name "a[0]"']);
  });

  test("unknown or multiple filters", () => {
    expect(issuesOf("{{a | upper}}")[0]).toContain('Unknown filter "upper"');
    expect(issuesOf('{{a | default: "x" | default: "y"}}')[0]).toContain("Only one filter");
    expect(issuesOf("{{a | default: x}}")[0]).toContain("Unknown filter");
  });

  test("reports every problem with its offset", () => {
    const parsed = parseTemplate("ok {{ }} and {{bad name}}");
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.issues.map((issue) => issue.offset)).toEqual([3, 13]);
    }
  });

  test("renderTemplate surfaces issues instead of output", () => {
    expect(renderTemplate("{{", {}, plain)).toHaveProperty("issues");
  });

  test("text without tags is valid", () => {
    expect(issuesOf("just text, with } and { braces")).toEqual([]);
  });
});

describe("helpers", () => {
  test("templateVariables lists unique paths in order", () => {
    const parsed = parseTemplate("{{b}} {{a.x}} {{b}} {{{c}}}");
    expect(parsed.ok && templateVariables(parsed.nodes)).toEqual(["b", "a.x", "c"]);
  });

  test("htmlToText produces a readable plain-text part", () => {
    const text = htmlToText(
      "<style>p{color:red}</style><h1>Title</h1><p>Hello&nbsp;<b>Ada</b> &amp; co</p>" +
      '<ul><li>One</li><li>Two</li></ul><p>Track: <a href="https://x.test/t">here</a></p>' +
      '<p><a href="https://x.test/raw">https://x.test/raw</a></p>line<br>break',
    );
    expect(text).toBe(
      "Title\nHello Ada & co\n- One\n- Two\nTrack: here (https://x.test/t)\nhttps://x.test/raw\nline\nbreak",
    );
  });
});
