// The dependency rules of the data core (ADR 003, "Sınır kapıları"). The core runs in plain
// Node and in any UI technology, so it may not reach React, Mantine, JSX, CSS, Vite-only
// imports or browser globals. It may import itself and a few framework-free modules.
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(new URL('../../src', import.meta.url).pathname);
/** Framework-free modules outside the core that the core may use. */
const ALLOWED_OUTSIDE = [
  file => file.startsWith(path.join(SRC, 'state') + path.sep) && file.endsWith('.ts'),
  file => file.startsWith(path.join(SRC, 'ranking') + path.sep) && file.endsWith('.ts'),
  file => file === path.join(SRC, 'site.js'),
  file => file === path.join(SRC, 'views.js'),
];
const GLOBALS = /\b(?:window|document|localStorage|sessionStorage|navigator)\b(?=\s*(?:\.|\[|\?\.))|\btypeof\s+(?:window|document|localStorage|sessionStorage|navigator)\b/;

export const filesUnder = dir => !fs.existsSync(dir) ? [] : fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? filesUnder(full) : [full];
});

/** Comments are not code: a rule mentioned in a comment is not a violation. */
const withoutComments = text => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

export function specifiers(text) {
  const found = [];
  for (const pattern of [/\b(?:import|export)\s[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g, /\bimport\s*['"]([^'"]+)['"]/g, /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g]) {
    for (const match of text.matchAll(pattern)) found.push(match[1]);
  }
  return found;
}

/** The rules each file under `coreRoot` breaks, as "file: rule" lines. */
export function coreViolations(coreRoot) {
  const root = path.resolve(coreRoot);
  const problems = [];
  for (const file of filesUnder(root)) {
    const name = path.relative(root, file);
    if (!/\.(js|ts)$/.test(file)) { problems.push(`${name}: only .js and .ts files belong in the core`); continue; }
    const code = withoutComments(fs.readFileSync(file, 'utf8'));
    for (const specifier of specifiers(code)) {
      if (/\.(jsx|tsx|css|scss|svg|png|md)(\?|$)|\?(raw|url|inline)/.test(specifier)) { problems.push(`${name}: imports a UI or bundler asset (${specifier})`); continue; }
      if (!specifier.startsWith('.')) { problems.push(`${name}: imports a package (${specifier})`); continue; }
      const target = path.resolve(path.dirname(file), specifier);
      if (target.startsWith(root + path.sep) || ALLOWED_OUTSIDE.some(allowed => allowed(target))) continue;
      problems.push(`${name}: imports outside the core (${path.relative(SRC, target)})`);
    }
    if (GLOBALS.test(code)) problems.push(`${name}: uses a browser global`);
    if (/\bimport\.meta\.env\b/.test(code)) problems.push(`${name}: reads import.meta.env`);
  }
  return problems;
}

/** Every module a Node script reaches from `entry` through relative imports. */
export function importGraph(entry) {
  const seen = new Set();
  const visit = file => {
    if (seen.has(file)) return;
    seen.add(file);
    if (!fs.existsSync(file) || !/\.(js|ts|mjs)$/.test(file)) return;
    for (const specifier of specifiers(withoutComments(fs.readFileSync(file, 'utf8')))) {
      if (specifier.startsWith('.')) visit(path.resolve(path.dirname(file), specifier.replace(/\?.*$/, '')));
      else seen.add(specifier);
    }
  };
  visit(path.resolve(entry));
  return [...seen];
}
