import { GITHUB_STATE_OWNER, GITHUB_STATE_REPOSITORY } from './types.ts';
import { assertStateDocument, upgradeStateDocument } from './merge.ts';
import { ROUTES_PATH, parseRouteDocument } from './routeRegistry.ts';

/**
 * A health check of the shared state repository, the app's database (ADR 002, phase 6). It reads
 * the repository the way a reader without a key does, validates state.json and routes.json with
 * the app's own rules, and reports in plain Turkish. scripts/check-state-repo.mjs runs it on every
 * push; it never writes.
 */
export interface StateRepositoryHealth {
  ok: boolean;
  /** What stops the app from reading or writing its data. */
  problems: string[];
  /** What deserves a look but loses no data. */
  warnings: string[];
  facts: { repository: string; books: number; queue: number; routes: number; updatedAt: string | null };
}

export interface StateHealthOptions {
  fetch?: typeof globalThis.fetch;
  owner?: string;
  repository?: string;
  branch?: string;
  /** The catalogue's book ids; records for other books are reported. */
  bookIds?: Iterable<string>;
  /** The bookstores page's store ids; route stops for other stores are reported. */
  storeIds?: Iterable<string>;
}

const message = (error: unknown): string => error instanceof Error ? error.message : String(error);
const listed = (ids: readonly string[]): string => `${ids.slice(0, 10).join(', ')}${ids.length > 10 ? ` ve ${ids.length - 10} tane daha` : ''}`;

export async function checkStateRepository(options: StateHealthOptions = {}): Promise<StateRepositoryHealth> {
  const request = options.fetch ?? globalThis.fetch.bind(globalThis);
  const owner = options.owner ?? GITHUB_STATE_OWNER;
  const repository = options.repository ?? GITHUB_STATE_REPOSITORY;
  const branch = options.branch ?? 'main';
  const name = `${owner}/${repository}`;
  const problems: string[] = [];
  const warnings: string[] = [];
  const facts: StateRepositoryHealth['facts'] = { repository: name, books: 0, queue: 0, routes: 0, updatedAt: null };
  let repositoryMissing = false;

  // 1. The repository itself: it must exist, be public (readers without a key read it) and not be archived.
  try {
    const response = await request(`https://api.github.com/repos/${owner}/${repository}`, { headers: { Accept: 'application/vnd.github+json' } });
    if (response.status === 200) {
      const info = await response.json() as { private?: boolean; archived?: boolean };
      if (info.private) problems.push(`${name} herkese açık değil. Uygulama, anahtarı olmayan cihazlarda durumu bu depodan okuyamaz.`);
      if (info.archived) problems.push(`${name} arşivlenmiş. Uygulama bu depoya yazamaz.`);
    } else if (response.status === 404) {
      repositoryMissing = true;
      problems.push(`${name} bulunamadı. Depo silinmiş, adı değişmiş ya da özel yapılmış olabilir.`);
    } else if (response.status === 403 || response.status === 429) {
      warnings.push('GitHub istek sınırına ulaşıldığı için deponun bilgileri okunamadı. Dosyalar yine de denetlendi.');
    } else {
      warnings.push(`Deponun bilgileri okunamadı (HTTP ${response.status}). Dosyalar yine de denetlendi.`);
    }
  } catch (error) {
    warnings.push(`GitHub'a ulaşılamadığı için deponun bilgileri okunamadı: ${message(error)}`);
  }

  const read = async (path: string): Promise<string | null> => {
    const response = await request(`https://raw.githubusercontent.com/${owner}/${repository}/${branch}/${path}`);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  };

  // 2. state.json: marks, reading records and the queue.
  try {
    const text = await read('state.json');
    if (text === null) {
      if (!repositoryMissing) problems.push(`${name} içinde state.json bulunamadı. Okuma durumları bu dosyada tutuluyor.`);
    } else {
      const document = upgradeStateDocument(JSON.parse(text));
      assertStateDocument(document);
      facts.books = Object.keys(document.books).length;
      facts.queue = document.queue?.value.length ?? 0;
      facts.updatedAt = document.updatedAt;
      if (options.bookIds) {
        const known = new Set(options.bookIds);
        const unknown = Object.keys(document.books).filter(id => !known.has(id));
        if (unknown.length) warnings.push(`state.json katalogda olmayan ${unknown.length} kitabın kaydını tutuyor: ${listed(unknown)}.`);
        const queued = (document.queue?.value ?? []).filter(id => !known.has(id));
        if (queued.length) warnings.push(`Okuma sırasında katalogda olmayan kitaplar var: ${listed(queued)}.`);
      }
    }
  } catch (error) {
    problems.push(`state.json okunamadı ya da bozuk: ${message(error)}`);
  }

  // 3. routes.json: the bookstore routes. It appears with the first saved route, so its absence is fine.
  try {
    const text = await read(ROUTES_PATH);
    if (text !== null) {
      const document = parseRouteDocument(JSON.parse(text));
      const routes = Object.values(document.routes).map(record => record.value).filter(route => route !== null);
      facts.routes = routes.length;
      if (options.storeIds) {
        const known = new Set(options.storeIds);
        const unknown = [...new Set(routes.flatMap(route => route.stops).filter(id => !known.has(id)))];
        if (unknown.length) warnings.push(`routes.json listede olmayan kitapçılara gidiyor: ${listed(unknown)}.`);
      }
    }
  } catch (error) {
    problems.push(`routes.json okunamadı ya da bozuk: ${message(error)}`);
  }

  return { ok: problems.length === 0, problems, warnings, facts };
}

/** GitHub reads one annotation per line, so a message's percent signs and line breaks are escaped. */
const annotation = (level: 'error' | 'warning', text: string): string => `::${level} title=Eşitleme deposu::${text.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')}`;

/**
 * The report scripts/check-state-repo.mjs prints. In CI (github) problems and warnings become
 * annotations on the run. With warnOnly a problem is reported but does not fail the run.
 */
export function describeHealth(health: StateRepositoryHealth, { github = false, warnOnly = false }: { github?: boolean; warnOnly?: boolean } = {}): { text: string; exitCode: number } {
  const { repository, books, queue, routes, updatedAt } = health.facts;
  const lines = [health.ok ? `${repository} sağlıklı.` : `${repository} için ${health.problems.length} sorun var.`];
  let summary = `${books} kitap kaydı, okuma sırasında ${queue} kitap ve ${routes} rota var.`;
  if (updatedAt) summary += ` Son değişiklik ${new Date(updatedAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' })} tarihinde yapıldı.`;
  lines.push(summary);
  for (const text of health.problems) lines.push(github ? annotation('error', text) : `Sorun: ${text}`);
  for (const text of health.warnings) lines.push(github ? annotation('warning', text) : `Uyarı: ${text}`);
  return { text: lines.join('\n'), exitCode: health.ok || warnOnly ? 0 : 1 };
}
