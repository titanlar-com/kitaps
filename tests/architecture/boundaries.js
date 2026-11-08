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

export const filesUnder = dir => !fs.existsSync(dir) ? [] : fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? filesUnder(full) : [full];
});

const KINDS = { '.ts': ts.ScriptKind.TS, '.tsx': ts.ScriptKind.TSX, '.jsx': ts.ScriptKind.JSX };
const parse = file => ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, KINDS[path.extname(file)] ?? ts.ScriptKind.JS);
/** A relative import as Vite resolves it: the path itself, or with an extension or an index file. */
const resolveImport = target => [target, ...['.js', '.jsx', '.ts', '.tsx', '.mjs'].map(extension => target + extension), path.join(target, 'index.js')].find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ?? target;

/** Every module specifier a file imports or re-exports, static or dynamic. `runtimeOnly` leaves
 * out `import type` and `export type`, which are gone when the code runs. */
export function specifiers(source, { runtimeOnly = false } = {}) {
  const found = [];
  const typeOnly = node => ts.isImportDeclaration(node) ? node.importClause?.isTypeOnly === true : node.isTypeOnly;
  const visit = node => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) && !(runtimeOnly && typeOnly(node))) found.push(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) found.push(node.arguments[0].text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** Whether a file holds anything that runs: a file of types alone is never reached at run time. */
export function hasRuntimeCode(file) {
  return parse(file).statements.some(node => !ts.isInterfaceDeclaration(node) && !ts.isTypeAliasDeclaration(node) && !(ts.isImportDeclaration(node) && node.importClause?.isTypeOnly));
}

/**
 * Globals a file reads that plain JavaScript does not have. The files are compiled together
 * with the ES2023 library only (no DOM, no Node types), so the compiler resolves every name in
 * its own scope: a local `document` in one function never hides the real `document.title` in
 * another, and any browser or Node global (window, matchMedia, addEventListener, process, …)
 * stays unresolved and is reported. `globalThis` exists in plain JavaScript, so it is named.
 */
function undeclaredGlobals(files) {
  const program = ts.createProgram(files, { allowJs: true, checkJs: false, noEmit: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, allowImportingTsExtensions: true, lib: ['lib.es2023.d.ts'], types: [] });
  const checker = program.getTypeChecker();
  const found = new Map(files.map(file => [path.resolve(file), new Set()]));
  for (const file of files) {
    const source = program.getSourceFile(file);
    const visit = node => {
      if (ts.isIdentifier(node)) {
        const parent = node.parent;
        const isName = (ts.isPropertyAccessExpression(parent) && parent.name === node)
          || ((ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent) || ts.isPropertySignature(parent) || ts.isMethodDeclaration(parent) || ts.isMethodSignature(parent) || ts.isGetAccessor(parent) || ts.isSetAccessor(parent) || ts.isEnumMember(parent) || ts.isPropertyAccessExpression(parent.parent ?? parent)) && parent.name === node)
          || (ts.isQualifiedName(parent) && parent.right === node) || ts.isLabeledStatement(parent) || ts.isBreakOrContinueStatement(parent)
          || (ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)) || ts.isMetaProperty(parent);
        if (!isName) {
          const symbol = ts.isShorthandPropertyAssignment(parent) ? checker.getShorthandAssignmentValueSymbol(parent) : checker.getSymbolAtLocation(node);
          if (!symbol || node.text === 'globalThis') found.get(path.resolve(file)).add(node.text);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return found;
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
  const code = filesUnder(root).filter(file => /\.(js|ts)$/.test(file));
  const globals = code.length ? undeclaredGlobals(code) : new Map();
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
    for (const global of globals.get(path.resolve(file)) ?? []) problems.push(`${name}: uses the global ${global}, which plain JavaScript does not have`);
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
    for (const specifier of specifiers(parse(file), { runtimeOnly: true })) {
      if (specifier.startsWith('.')) visit(resolveImport(path.resolve(path.dirname(file), specifier.replace(/\?.*$/, ''))));
      else seen.add(specifier);
    }
  };
  visit(path.resolve(entry));
  return [...seen];
}
