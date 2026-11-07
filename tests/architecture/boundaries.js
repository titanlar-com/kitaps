// The dependency rules of the data core (ADR 003, "Sınır kapıları"). The core runs in plain
// Node and in any UI technology, so it may not reach React, Mantine, JSX, CSS, Vite-only
// imports or browser globals. Files are read with the TypeScript compiler (already installed),
// so a word in a string, a property called `document` or a local variable is never mistaken
// for a browser global, and a real use is never missed.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const SRC = path.resolve(new URL('../../src', import.meta.url).pathname);
/** Framework-free modules outside the core that the core may use. */
const ALLOWED_OUTSIDE = [
  file => file.startsWith(path.join(SRC, 'state') + path.sep) && file.endsWith('.ts'),
  file => file.startsWith(path.join(SRC, 'ranking') + path.sep) && file.endsWith('.ts'),
  file => file === path.join(SRC, 'site.js'),
  file => file === path.join(SRC, 'views.js'),
];
/** Globals that exist only in a browser (or mean the page's own state there). */
const BROWSER_GLOBALS = new Set(['window', 'document', 'localStorage', 'sessionStorage', 'navigator', 'location', 'history', 'globalThis']);

export const filesUnder = dir => !fs.existsSync(dir) ? [] : fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? filesUnder(full) : [full];
});

const KINDS = { '.ts': ts.ScriptKind.TS, '.tsx': ts.ScriptKind.TSX, '.jsx': ts.ScriptKind.JSX };
const parse = file => ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, KINDS[path.extname(file)] ?? ts.ScriptKind.JS);
/** A relative import as Vite resolves it: the path itself, or with an extension or an index file. */
const resolveImport = target => [target, ...['.js', '.jsx', '.ts', '.tsx', '.mjs'].map(extension => target + extension), path.join(target, 'index.js')].find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ?? target;

/** Every module specifier a file imports or re-exports, static or dynamic. */
export function specifiers(source) {
  const found = [];
  const visit = node => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) found.push(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) found.push(node.arguments[0].text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** Names the file declares itself: a local `document` is not the browser's. */
function declaredNames(source) {
  const names = new Set();
  const visit = node => {
    if ((ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isBindingElement(node) || ts.isImportSpecifier(node) || ts.isImportClause(node) || ts.isNamespaceImport(node)) && node.name && ts.isIdentifier(node.name)) names.add(node.name.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return names;
}

/** Browser globals the code reads: identifiers that are neither a property name nor declared in the file. */
function browserGlobalUses(source) {
  const declared = declaredNames(source);
  const uses = [];
  const visit = node => {
    if (ts.isIdentifier(node) && BROWSER_GLOBALS.has(node.text) && !declared.has(node.text)) {
      const parent = node.parent;
      const isName = (ts.isPropertyAccessExpression(parent) && parent.name === node)
        || ((ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent) || ts.isPropertySignature(parent) || ts.isMethodDeclaration(parent) || ts.isMethodSignature(parent) || ts.isGetAccessor(parent) || ts.isSetAccessor(parent) || ts.isEnumMember(parent)) && parent.name === node)
        || ts.isQualifiedName(parent) || ts.isTypeReferenceNode(parent) || ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent);
      if (!isName) uses.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...new Set(uses)];
}

const usesImportMetaEnv = source => {
  let found = false;
  const visit = node => {
    if (ts.isPropertyAccessExpression(node) && node.name.text === 'env' && ts.isMetaProperty(node.expression) && node.expression.keywordToken === ts.SyntaxKind.ImportKeyword) found = true;
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
};

/** The rules each file under `coreRoot` breaks, as "file: rule" lines. */
export function coreViolations(coreRoot) {
  const root = path.resolve(coreRoot);
  const problems = [];
  for (const file of filesUnder(root)) {
    const name = path.relative(root, file);
    if (!/\.(js|ts)$/.test(file)) { problems.push(`${name}: only .js and .ts files belong in the core`); continue; }
    const source = parse(file);
    for (const specifier of specifiers(source)) {
      if (/\.(jsx|tsx|css|scss|svg|png|md)(\?|$)|\?(raw|url|inline)/.test(specifier)) { problems.push(`${name}: imports a UI or bundler asset (${specifier})`); continue; }
      if (!specifier.startsWith('.')) { problems.push(`${name}: imports a package (${specifier})`); continue; }
      const target = path.resolve(path.dirname(file), specifier);
      if (target.startsWith(root + path.sep) || ALLOWED_OUTSIDE.some(allowed => allowed(target))) continue;
      problems.push(`${name}: imports outside the core (${path.relative(SRC, target)})`);
    }
    for (const global of browserGlobalUses(source)) problems.push(`${name}: uses the browser global ${global}`);
    if (usesImportMetaEnv(source)) problems.push(`${name}: reads import.meta.env`);
  }
  return problems;
}

/** Every module a Node script reaches from `entry` through relative imports. */
export function importGraph(entry) {
  const seen = new Set();
  const visit = file => {
    if (seen.has(file)) return;
    seen.add(file);
    if (!fs.existsSync(file) || !/\.(js|ts|mjs|jsx|tsx)$/.test(file)) return;
    for (const specifier of specifiers(parse(file))) {
      if (specifier.startsWith('.')) visit(resolveImport(path.resolve(path.dirname(file), specifier.replace(/\?.*$/, ''))));
      else seen.add(specifier);
    }
  };
  visit(path.resolve(entry));
  return [...seen];
}
