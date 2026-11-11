"use client";

import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  startCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { html } from "@codemirror/lang-html";
import { bracketMatching, HighlightStyle, indentOnInput, syntaxHighlighting } from "@codemirror/language";
import { lintGutter, setDiagnostics, type Diagnostic } from "@codemirror/lint";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  Decoration,
  drawSelection,
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
  MatchDecorator,
  placeholder as placeholderExtension,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import {
  Braces,
  Heading1,
  ImagePlus,
  Minus,
  MousePointerClick,
  Pilcrow,
} from "lucide-react";
import { useEffect, useId, useRef } from "react";
import type { ChannelType } from "@repo/schema";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { searchAssets } from "../lib/asset-sources";
import { issuePositions, SYSTEM_VARIABLES, variablesIn } from "../lib/template-variables";

interface TemplateEditorProps {
  readonly label:            string;
  readonly value:            string;
  readonly onChange:         (value: string) => void;
  readonly channel:          ChannelType;
  /** scopes @image suggestions; without it only variables are offered */
  readonly externalSystemId: string;
  /** extra variable names to suggest (e.g. keys of the sample payload) */
  readonly variables?:       ReadonlyArray<string>;
  /** server-side issues ("template: … (at position N)") shown inline */
  readonly issues?:          ReadonlyArray<string>;
  readonly hint?:            string;
  readonly placeholder?:     string;
  readonly minHeight?:       number;
}

// ---------- {{ variable }} highlighting ----------

const variableMark = Decoration.mark({ class: "cm-tpl-var" });

const variableHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    private readonly matcher = new MatchDecorator({
      regexp:     /\{\{\{?[^{}]*\}?\}\}|@[\w.-]*/g,
      decoration: (match) => (match[0].startsWith("@") ? Decoration.mark({ class: "cm-tpl-at" }) : variableMark),
    });

    constructor(view: EditorView) {
      this.decorations = this.matcher.createDeco(view);
    }

    update(update: ViewUpdate) {
      this.decorations = this.matcher.updateDeco(update, this.decorations);
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

// ---------- look ----------

// Plain, solid colours that sit on the app's surface tokens.
const highlightStyle = HighlightStyle.define([
  { tag: tags.tagName,           color: "#256abf" },
  { tag: tags.angleBracket,      color: "#898781" },
  { tag: tags.attributeName,     color: "#b45309" },
  { tag: tags.attributeValue,    color: "#15803d" },
  { tag: tags.string,            color: "#15803d" },
  { tag: tags.comment,           color: "#898781", fontStyle: "italic" },
  { tag: tags.propertyName,      color: "#b45309" },
  { tag: tags.number,            color: "#7c3aed" },
]);

const editorTheme = EditorView.theme({
  "&": {
    fontSize:        "12.5px",
    backgroundColor: "var(--background)",
    color:           "var(--foreground)",
    border:          "1px solid var(--border)",
    borderRadius:    "var(--radius-md, 8px)",
  },
  "&.cm-focused": {
    outline:   "none",
    borderColor: "var(--ring)",
    boxShadow: "0 0 0 3px color-mix(in oklab, var(--ring) 35%, transparent)",
  },
  ".cm-scroller": {
    fontFamily: "var(--font-mono)",
    lineHeight: "1.6",
  },
  ".cm-content":     { padding: "8px 0" },
  ".cm-gutters": {
    backgroundColor: "var(--muted)",
    color:           "var(--muted-foreground)",
    border:          "none",
    borderRight:     "1px solid var(--border)",
    borderRadius:    "var(--radius-md, 8px) 0 0 var(--radius-md, 8px)",
  },
  ".cm-activeLine":       { backgroundColor: "color-mix(in oklab, var(--muted) 60%, transparent)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--foreground)" },
  ".cm-tpl-var": {
    backgroundColor: "color-mix(in oklab, var(--primary) 12%, transparent)",
    color:           "var(--primary)",
    borderRadius:    "3px",
    padding:         "0 1px",
  },
  ".cm-tpl-at": { color: "var(--primary)", fontWeight: "600" },
  ".cm-placeholder": { color: "var(--muted-foreground)" },
  ".cm-tooltip": {
    border:          "1px solid var(--border)",
    backgroundColor: "var(--popover)",
    color:           "var(--popover-foreground)",
    borderRadius:    "8px",
    overflow:        "hidden",
  },
  ".cm-tooltip-autocomplete > ul > li": { padding: "4px 8px", display: "flex", alignItems: "center", gap: "8px" },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "var(--primary)",
    color:           "var(--primary-foreground)",
  },
  ".cm-completionDetail":  { marginLeft: "auto", paddingLeft: "12px", opacity: "0.7", fontStyle: "normal" },
  ".cm-tooltip-autocomplete > ul > completion-section": {
    fontSize: "11px", fontWeight: "600", padding: "4px 8px", color: "var(--muted-foreground)", borderBottom: "1px solid var(--border)",
  },
  ".cm-tpl-thumb": {
    width:           "36px",
    height:          "24px",
    objectFit:       "contain",
    backgroundColor: "#fff",
    border:          "1px solid var(--border)",
    borderRadius:    "4px",
    flexShrink:      "0",
  },
});

// ---------- completion ----------

interface AssetCompletion extends Completion {
  readonly thumbnailUrl?: string;
}

function makeCompletionSource(getContext: () => {
  readonly channel:          ChannelType;
  readonly externalSystemId: string;
  readonly variables:        ReadonlyArray<string>;
}) {
  // {{ name  → variable names
  const variableSource = (context: CompletionContext): CompletionResult | null => {
    const match = context.matchBefore(/\{\{\{?\s*[\w.-]*$/);
    if (!match) return null;
    const prefix = /^\{\{\{?\s*/.exec(match.text)![0];
    const raw    = prefix.startsWith("{{{");
    const close  = raw ? "}}}" : "}}";

    // Insert the name and finish the tag: reuse closing braces that are
    // already there (auto-closed or typed) and put the cursor after them,
    // so the next keystroke lands outside the tag.
    const applyVariable = (view: EditorView, completion: Completion, from: number, to: number) => {
      const after = view.state.sliceDoc(to, to + 64);
      let insert  = completion.label;
      let anchor  = from + insert.length;

      if (/^\s*\|/.test(after)) {
        // `{{name | default: "x"}}` — the tag continues; only swap the name
      } else {
        const closing = new RegExp(`^\\s*\\}{1,${close.length}}`).exec(after)?.[0];
        if (closing) {
          // braces already there (auto-closed or typed): step over them
          anchor = from + insert.length + closing.length;
        } else {
          insert += close;
          anchor  = from + insert.length;
        }
      }

      view.dispatch({
        changes:   { from, to, insert },
        selection: { anchor },
        userEvent: "input.complete",
      });
    };

    const { variables } = getContext();
    // variables used elsewhere in the doc — minus the one being typed now
    const doc  = context.state.doc;
    const rest = doc.sliceString(0, match.from) + doc.sliceString(context.pos);
    const own  = [...new Set([...variables, ...variablesIn(rest)])]
      .filter((name) => !name.startsWith("system."));

    const options: Array<Completion> = [
      ...own.map((name) => ({ label: name, type: "variable", detail: "payload", section: "Payload" })),
      ...SYSTEM_VARIABLES.map((variable) => ({
        label: variable.name, type: "constant", detail: variable.detail, section: "Built-in",
      })),
    ].map((option) => ({ ...option, apply: applyVariable }));

    return { from: match.from + prefix.length, options, validFor: /^[\w.-]*$/ };
  };

  // @query → images from every asset source.
  //
  // Sources are queried once when the menu opens; CodeMirror then filters
  // that list locally as the user keeps typing, and only asks the sources
  // again if the query stops extending the one that was fetched (e.g. after
  // a backspace). Re-querying on every keystroke would leave the menu in a
  // pending state where Enter can't pick anything.
  const assetSource = async (context: CompletionContext): Promise<CompletionResult | null> => {
    const match = context.matchBefore(/(?:^|[\s>"'(])@[\w.-]*$/);
    if (!match) return null;
    const at    = match.from + match.text.lastIndexOf("@");
    const query = context.state.sliceDoc(at + 1, context.pos);
    const { channel, externalSystemId } = getContext();

    // result.from is just after "@"; replace the "@" too
    const replaceWithAt = (insert: string) => (view: EditorView, _completion: Completion, from: number, to: number) => {
      view.dispatch({
        changes:   { from: from - 1, to, insert },
        selection: { anchor: from - 1 + insert.length },
        userEvent: "input.complete",
      });
    };

    const results = await searchAssets(query, { channel, externalSystemId });
    const options: Array<AssetCompletion> = results.map(({ source, suggestion }) => ({
      label:        suggestion.label,
      detail:       suggestion.detail,
      type:         "image",
      section:      source.label,
      thumbnailUrl: suggestion.thumbnailUrl,
      apply:        replaceWithAt(channel === "email" ? suggestion.html : suggestion.text),
    }));

    if (options.length === 0 && query === "") {
      options.push({
        label:  externalSystemId ? "No images yet" : "Select an external system first",
        detail: externalSystemId ? "Upload brand assets on the external system page" : "",
        type:   "text",
        apply:  () => {},
      });
    }

    return {
      from:     at + 1,
      options,
      validFor: (text) => /^[\w.-]*$/.test(text) && text.startsWith(query),
    };
  };

  return [variableSource, assetSource];
}

const thumbnailOption = {
  position: 20,
  render: (completion: Completion) => {
    const url = (completion as AssetCompletion).thumbnailUrl;
    if (!url) return null;
    const image = document.createElement("img");
    image.className = "cm-tpl-thumb";
    image.src       = url;
    image.alt       = "";
    return image;
  },
};

// ---------- snippets (toolbar) ----------

interface Snippet {
  readonly label: string;
  readonly icon:  React.ComponentType<{ className?: string }>;
  readonly text:  string;
  readonly emailOnly?: boolean;
}

const BUTTON_SNIPPET =
  '<a href="{{url}}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:600">Button label</a>';

const SNIPPETS: ReadonlyArray<Snippet> = [
  { label: "Heading",   icon: Heading1,          text: '<h2 style="margin:0 0 12px">Heading</h2>\n', emailOnly: true },
  { label: "Paragraph", icon: Pilcrow,           text: "<p>Text</p>\n",                               emailOnly: true },
  { label: "Button",    icon: MousePointerClick, text: `<p>${BUTTON_SNIPPET}</p>\n`,                  emailOnly: true },
  { label: "Divider",   icon: Minus,             text: '<hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0">\n', emailOnly: true },
];

// ---------- component ----------

export function TemplateEditor({
  label,
  value,
  onChange,
  channel,
  externalSystemId,
  variables = [],
  issues = [],
  hint,
  placeholder = "",
  minHeight = 280,
}: TemplateEditorProps) {
  const labelId   = useId();
  const hostRef   = useRef<HTMLDivElement>(null);
  const viewRef   = useRef<EditorView | null>(null);
  const language  = useRef(new Compartment());

  // Every document state the editor itself produced. A `value` prop equal to
  // one of these is an echo of our own typing — possibly a stale one, if
  // React renders after CodeMirror has moved on — and must not be pushed
  // back into the editor (that would revert the newer edit).
  const emitted = useRef(new Set<string>([value]));

  // latest props for callbacks created once with the view
  const latest = useRef({ onChange, channel, externalSystemId, variables });
  useEffect(() => {
    latest.current = { onChange, channel, externalSystemId, variables };
  });

  // create the view once
  useEffect(() => {
    const extensions: Array<Extension> = [
      lineNumbers(),
      history(),
      drawSelection(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      highlightActiveLine(),
      lintGutter(),
      EditorView.lineWrapping,
      syntaxHighlighting(highlightStyle),
      editorTheme,
      EditorView.theme({ ".cm-content, .cm-gutter": { minHeight: `${minHeight}px` } }),
      variableHighlighter,
      language.current.of(latest.current.channel === "email" ? html({ autoCloseTags: true }) : []),
      autocompletion({
        override:            makeCompletionSource(() => latest.current),
        addToOptions:        [thumbnailOption],
        activateOnTyping:    true,
        icons:               false,
        closeOnBlur:         true,
      }),
      keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...completionKeymap, indentWithTab]),
      placeholderExtension(placeholder),
      EditorView.contentAttributes.of({
        "aria-labelledby": labelId,
        "aria-multiline":  "true",
        "data-testid":     "template-editor",
        spellcheck:        "false",
      }),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        const doc = update.state.doc.toString();
        emitted.current.add(doc);
        if (emitted.current.size > 200) {
          emitted.current = new Set([...emitted.current].slice(-100));
        }
        latest.current.onChange(doc);
      }),
    ];

    const view = new EditorView({
      parent: hostRef.current!,
      state:  EditorState.create({ doc: value, extensions }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // the view is created once; later prop changes flow in below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // genuinely external value changes (not echoes of our own edits) → replace doc
  useEffect(() => {
    const view = viewRef.current;
    if (!view || emitted.current.has(value)) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      emitted.current = new Set([value]);
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  // HTML language only for email
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: language.current.reconfigure(channel === "email" ? html({ autoCloseTags: true }) : []),
    });
  }, [channel]);

  // server-side syntax issues → inline diagnostics
  const issueKey = issues.join("\n");
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const length = view.state.doc.length;
    const diagnostics: Array<Diagnostic> = issuePositions(issues, "template").map(({ message, position }) => {
      const from = Math.min(position, length);
      return { from, to: Math.min(from + 2, length), severity: "error", message };
    });
    view.dispatch(setDiagnostics(view.state, diagnostics));
    // issues is compared by content
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issueKey]);

  const insert = (text: string, openCompletion = false) => {
    const view = viewRef.current;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    view.dispatch({
      changes:   { from, to, insert: text },
      selection: { anchor: from + text.length },
      scrollIntoView: true,
    });
    view.focus();
    if (openCompletion) startCompletion(view);
  };

  const snippets = SNIPPETS.filter((snippet) => !snippet.emailOnly || channel === "email");

  return (
    <div className="flex flex-col gap-1.5">
      <Label id={labelId}>{label}</Label>
      <div
        className="flex flex-wrap items-center gap-1 rounded-md border bg-muted/40 p-1"
        role="toolbar"
        aria-label={`${label} tools`}
      >
        <ToolbarButton icon={Braces} label="Variable" title="Insert a {{variable}}" onClick={() => insert("{{", true)} />
        <ToolbarButton icon={ImagePlus} label="Image" title="Insert an image (type @ to search)" onClick={() => insert(" @", true)} />
        {snippets.length > 0 && <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />}
        {snippets.map((snippet) => (
          <ToolbarButton
            key={snippet.label}
            icon={snippet.icon}
            label={snippet.label}
            title={`Insert ${snippet.label.toLowerCase()}`}
            onClick={() => insert(snippet.text)}
          />
        ))}
      </div>
      <div ref={hostRef} />
      <p className="text-xs text-muted-foreground">
        {hint ?? (
          <>
            Type <kbd className="rounded border px-1 font-mono">@</kbd> to insert an image,{" "}
            <kbd className="rounded border px-1 font-mono">{"{{"}</kbd> for a variable,{" "}
            <kbd className="rounded border px-1 font-mono">Ctrl</kbd>+<kbd className="rounded border px-1 font-mono">Space</kbd> for suggestions.
          </>
        )}
      </p>
    </div>
  );
}

function ToolbarButton({
  icon: Icon,
  label,
  title,
  onClick,
}: {
  readonly icon:    React.ComponentType<{ className?: string }>;
  readonly label:   string;
  readonly title:   string;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      // keep focus (and the selection) in the editor
      onMouseDown={(event) => event.preventDefault()}
      className={cn(
        "inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-muted-foreground",
        "hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );
}
