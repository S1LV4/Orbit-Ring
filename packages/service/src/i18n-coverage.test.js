const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const SOURCES = ["packages/ui/src", "packages/ring/src", "packages/shared/src"];
const LOCALES_DIR = path.join(ROOT, "packages", "shared", "locales", "en-US");

const USER_ATTRS = new Set(["title", "aria-label", "aria-description", "placeholder", "data-tip", "alt", "label", "prefix", "hint"]);
const USER_PROPS = new Set(["label", "title", "desc", "description", "hint", "placeholder", "tip", "text", "message"]);
const ALLOWED = [
  /^orbit$/, /^Ring$/, /^@$/, /^·$/, /^v\d/,
  /^(Ctrl|Shift|Alt|Win)(\+\S+)+$/i,
  /^#[0-9a-f]{3,8}$/i,
  /^(VID|PID):$/, /^&middot;$/,
  /^manifest\.json$/, /^github\.com\/$/, /^(Enter|Esc)$/, /^"author": "@your-github"$/,
];

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}

function leafKeys(obj, prefix = "") {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !("other" in v)) out.push(...leafKeys(v, key));
    else out.push(key);
  }
  return out;
}

const hasWords = (s) => /\p{L}{2,}/u.test(s);
const allowed = (s) => ALLOWED.some((re) => re.test(s.trim()));

const isConsoleCall = (n) => ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)
  && ts.isIdentifier(n.expression.expression) && n.expression.expression.text === "console";
const isTCall = (n) => ts.isCallExpression(n) && (
  (ts.isIdentifier(n.expression) && n.expression.text === "t")
  || (ts.isPropertyAccessExpression(n.expression) && ts.isIdentifier(n.expression.expression)
    && n.expression.expression.text === "t" && n.expression.name.text === "dyn"));

function scan(file) {
  const text = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const literals = [], keys = [], prefixes = [], strings = [];
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  const where = (n) => `${rel}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;

  const collectKeys = (n) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) keys.push([n.text, where(n)]);
    else if (ts.isTemplateExpression(n)) prefixes.push(n.head.text);
    else ts.forEachChild(n, collectKeys);
  };

  const LOGICAL = new Set([ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken]);
  const shownInJsx = (n) => {
    let c = n, p = n.parent;
    for (;;) {
      if (ts.isParenthesizedExpression(p)) { c = p; p = p.parent; continue; }
      if (ts.isConditionalExpression(p) && p.condition !== c) { c = p; p = p.parent; continue; }
      if (ts.isBinaryExpression(p) && LOGICAL.has(p.operatorToken.kind) && p.right === c) { c = p; p = p.parent; continue; }
      break;
    }
    if (!p || !ts.isJsxExpression(p) || !p.parent) return false;
    if (ts.isJsxAttribute(p.parent)) return USER_ATTRS.has(p.parent.name.getText(sf));
    return ts.isJsxElement(p.parent) || ts.isJsxFragment(p.parent);
  };

  const visit = (n, quiet) => {
    if (isConsoleCall(n) || ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return;
    if (isTCall(n)) {
      if (n.arguments[0]) collectKeys(n.arguments[0]);
      n.arguments.slice(1).forEach((a) => visit(a, quiet));
      return;
    }
    if (ts.isJsxText(n)) {
      const s = n.text.replace(/\s+/g, " ").trim();
      if (hasWords(s) && !allowed(s)) literals.push([s, where(n)]);
    } else if (ts.isJsxAttribute(n) && n.initializer && ts.isStringLiteral(n.initializer)) {
      const s = n.initializer.text;
      if (USER_ATTRS.has(n.name.getText(sf)) && hasWords(s) && !allowed(s)) literals.push([s, where(n)]);
      return;
    } else if ((ts.isBindingElement(n) || ts.isParameter(n)) && n.initializer && ts.isStringLiteral(n.initializer)
      && (USER_PROPS.has(n.name.getText(sf)) || USER_ATTRS.has(n.name.getText(sf))) && hasWords(n.initializer.text) && !allowed(n.initializer.text)) {
      literals.push([n.initializer.text, where(n)]);
    } else if (ts.isPropertyAssignment(n) && USER_PROPS.has(n.name.getText(sf).replace(/["']/g, ""))
      && (ts.isStringLiteral(n.initializer) || ts.isNoSubstitutionTemplateLiteral(n.initializer))) {
      const s = n.initializer.text;
      if (hasWords(s) && !allowed(s)) literals.push([s, where(n)]);
      return;
    } else if (ts.isTemplateExpression(n) && (shownInJsx(n) || (ts.isPropertyAssignment(n.parent) && USER_PROPS.has(n.parent.name.getText(sf))))
      && [n.head.text, ...n.templateSpans.map((sp) => sp.literal.text)].some((x) => hasWords(x) && !allowed(x))) {
      literals.push([n.getText(sf), where(n)]);
    } else if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && shownInJsx(n) && hasWords(n.text) && !allowed(n.text)) {
      literals.push([n.text, where(n)]);
    } else if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n)
      || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) && /[À-ÿ]/.test(n.text) && !allowed(n.text)) {
      literals.push([n.text, where(n)]);
    }
    ts.forEachChild(n, (c) => visit(c, quiet));
  };
  const collectStrings = (n) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) strings.push(n.text);
    ts.forEachChild(n, collectStrings);
  };
  visit(sf);
  collectStrings(sf);
  return { literals, keys, prefixes, strings };
}

const files = SOURCES.flatMap((d) => walk(path.join(ROOT, d)));
const results = files.map(scan);
const dictionary = new Set(fs.readdirSync(LOCALES_DIR).flatMap((f) =>
  leafKeys(JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, f), "utf8")), f.replace(/\.json$/, ""))));

test("the ring and the config UI carry no hard-coded user-facing text", () => {
  const found = results.flatMap((r) => r.literals).map(([s, at]) => `${at}  ${JSON.stringify(s.slice(0, 80))}`);
  expect(found).toEqual([]);
});

test("every key the code asks for exists in the default dictionary", () => {
  const missing = results.flatMap((r) => r.keys).filter(([k]) => !dictionary.has(k)).map(([k, at]) => `${at}  ${k}`);
  expect(missing).toEqual([]);
});

test("every key in the default dictionary is used by the code", () => {
  const used = new Set(results.flatMap((r) => r.keys.map(([k]) => k)));
  const prefixes = results.flatMap((r) => r.prefixes).filter(Boolean);
  for (const r of results) for (const s of r.strings) used.add(s);
  const unused = [...dictionary].filter((k) => !used.has(k) && !prefixes.some((p) => k.startsWith(p)));
  expect(unused).toEqual([]);
});
