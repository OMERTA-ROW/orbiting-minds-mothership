/** Read-only, repeatable source inventory. Bindings are evidence of code, never live acceptance. */
import ts from "typescript";
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";

const files = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory()
      ? files(path)
      : /\.(ts|tsx)$/.test(path) && !/\.(test|spec)\./.test(path) && !path.includes("routeTree.gen")
        ? [path]
        : [];
  });
const sources = files("src");
const controls = [],
  routes = [],
  panels = [],
  declarations = [];
const dependencies = new Map();
const resolveImport = (file, specifier) => {
  const base = specifier.startsWith("@/")
    ? `src/${specifier.slice(2)}`
    : specifier.startsWith(".")
      ? posix.normalize(join(dirname(file), specifier))
      : null;
  return (
    base &&
    [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find((candidate) =>
      existsSync(candidate),
    )
  );
};
for (const file of sources) {
  const text = readFileSync(file, "utf8");
  const ast = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const imports = [];
  const visit = (node) => {
    const line = ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const target = resolveImport(file, node.moduleSpecifier.text);
      if (target) imports.push(target);
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(ast) === "createFileRoute" &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      const path = node.arguments[0].text.replace("/_authenticated", "").replace(/\/$/, "") || "/";
      routes.push({
        path,
        file,
        line,
        kind: file.endsWith("/_authenticated/route.tsx") ? "protected layout" : path.startsWith("/api/") ? "server endpoint" : "content route",
        head: /head\s*:/.test(text),
        retired: text.includes("RetiredAreaPage") || text.includes("RetiredArea"),
        classification: "implemented/unverified",
        evidence: "Source exists; see dated readiness report for bounded runtime evidence.",
      });
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(ast);
      const attributes = Object.fromEntries(
        node.attributes.properties
          .filter(ts.isJsxAttribute)
          .map((attr) => [attr.name.getText(ast), attr.initializer?.getText(ast) ?? "true"]),
      );
      const parent = ts.isJsxOpeningElement(node) ? node.parent : node;
      const label = ts.isJsxElement(parent)
        ? parent.children
            .filter(ts.isJsxText)
            .map((child) => child.text.trim())
            .filter(Boolean)
            .join(" ")
        : "";
      if (["section", "TabsContent", "details", "DialogContent"].includes(tag))
        panels.push({
          file,
          line,
          tag,
          name: attributes["aria-label"] ?? attributes["value"] ?? label.slice(0, 120),
        });
      const action = Object.fromEntries(
        Object.entries(attributes).filter(([key]) => /^(on[A-Z]|href$|to$|action$)/.test(key)),
      );
      if (
        [
          "Button",
          "button",
          "a",
          "Link",
          "input",
          "select",
          "textarea",
          "form",
          "Switch",
          "Checkbox",
          "TabsTrigger",
          "summary",
        ].includes(tag) ||
        Object.keys(action).length
      ) {
        controls.push({
          file,
          line,
          tag,
          label: attributes["aria-label"] ?? label.slice(0, 160),
          action,
          disabled: attributes["disabled"] ?? null,
          blocker: attributes["title"] ?? attributes["aria-describedby"] ?? null,
          classification:
            attributes["disabled"] === "true"
              ? "blocked or display-only; review context"
              : Object.keys(action).length
                ? "implemented/unverified binding"
                : "native/input/composed control; review parent",
          evidence: "Static binding only; no automatic success assertion.",
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  dependencies.set(file, imports);
  if (
    /AGENT|PROVIDER|CLONE_BLOCKER|HANDOFF_CONTRACT|REVIEWED_EXECUTOR_RELEASE/.test(text) &&
    file.startsWith("src/lib/")
  )
    declarations.push({
      file,
      evidence:
        "Agent/provider/contract declarations; enrollment, credentials and execution not inferred.",
    });
}
function reachable(file, seen = new Set()) {
  if (seen.has(file)) return seen;
  seen.add(file);
  for (const dependency of dependencies.get(file) ?? []) reachable(dependency, seen);
  return seen;
}
for (const route of routes) {
  const reachableFiles = reachable(route.file);
  route.controls = controls
    .filter((control) => reachableFiles.has(control.file))
    .map((control) => `${control.file}:${control.line}`);
  route.panels = panels
    .filter((panel) => reachableFiles.has(panel.file))
    .map((panel) => `${panel.file}:${panel.line}`);
}
const inventory = {
  scope:
    "All src route and control declarations, including unmounted legacy source; transitive static imports; dynamic imports and runtime-generated controls need manual acceptance.",
  counts: {
    routes: routes.length,
    contentRoutes: routes.filter((r) => r.kind === "content route").length,
    controls: controls.length,
    panels: panels.length,
  },
  routes,
  controls,
  panels,
  declarations,
};
writeFileSync("docs/INTERFACE-SOURCE-INVENTORY.json", JSON.stringify(inventory, null, 2) + "\n");
const escape = (value) => String(value).replaceAll("|", "\\|");
writeFileSync(
  "docs/INTERFACE-ROUTE-INVENTORY.md",
  `# Interface source inventory\n\nGenerated by \`node scripts/interface-inventory.mjs\`. **Static code, not a live acceptance pass.**\n\n${inventory.scope}\n\n${JSON.stringify(inventory.counts)}\n\nFull control/panel bindings and route relationships: \`docs/INTERFACE-SOURCE-INVENTORY.json\`. Shared root navigation/background controls are listed in that JSON, not duplicated per route.\n\n| Path | File | Kind | Head | Retired | Reachable controls | Status |\n|---|---|---|---|---|---:|---|\n${routes
    .sort((a, b) => a.path.localeCompare(b.path))
    .map(
      (r) =>
        `| ${escape(r.path)} | ${r.file}:${r.line} | ${r.kind} | ${r.head ? "yes" : "no"} | ${r.retired ? "yes" : "no"} | ${r.controls.length} | implemented/unverified source |`,
    )
    .join("\n")}\n`,
);
console.log(JSON.stringify(inventory.counts));
