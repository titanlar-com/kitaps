import { CRITERION_LABELS, DEFAULT_READING_POLICY, assertReadingPolicy } from './policy.ts';
import { readingGraphFor, type ReadingGraph } from './readingGraph.ts';
import type {
  Catalog,
  CatalogBook,
  CriterionId,
  CriterionResult,
  ReadingAudience,
  ReadingPriorityResult,
  ReadingRankingPolicy,
  ReadingRankingSnapshot,
  ReadinessLevel,
} from './types.ts';

const clamp = (value: number, min = 0, max = 1) =>
  Math.max(min, Math.min(max, value));
const round = (value: number, digits = 1) => Number(value.toFixed(digits));

type RawCriteria = Record<CriterionId, number>;

const AUDIENCES: readonly ReadingAudience[] = ['general', 'children'];

/** The reader a book is ranked for. Only the catalog category decides it. */
export function readingAudience(book: CatalogBook): ReadingAudience {
  return (book.categories ?? []).includes('children') ? 'children' : 'general';
}

interface RawAssessment {
  book: CatalogBook;
  raw: RawCriteria;
  confidence: Record<CriterionId, number>;
}

/** Catalog-derived facts. The engine has no personal input: purchases,
 * wishlists, reading states, reading records and the personal queue are
 * records kept for the reader and never change a score, rank or maturity. */
export class CatalogReadingProfile {
  private readonly graph: ReadingGraph;
  private readonly maxCollections: number;
  private readonly maxLeverage: number;

  constructor(catalog: Catalog) {
    this.graph = readingGraphFor(catalog);
    this.maxCollections = Math.max(
      1,
      ...catalog.books.map((book) => book.collectionIds?.length ?? 0),
    );
    this.maxLeverage = Math.max(1, ...catalog.books.map((book) => this.leverage(book.id)));
  }

  assess(book: CatalogBook): RawAssessment {
    return {
      book,
      raw: {
        editorialConsensus: this.editorialConsensus(book),
        learningLeverage: this.leverage(book.id) / this.maxLeverage,
        preparationFit: this.preparationFit(book),
        difficultyFit: this.difficultyFit(book),
        durability: this.durability(book),
      },
      confidence: this.criterionConfidence(book),
    };
  }

  evidence(
    id: CriterionId,
    assessment: RawAssessment,
    normalized: number,
  ): string {
    const { book } = assessment;
    const percent = Math.round(normalized * 100);
    const children = readingAudience(book) === 'children';

    switch (id) {
      case 'editorialConsensus':
        return `${book.collectionIds?.length ?? 0} bağımsız seçkide yer alıyor; ${children ? 'çocuk kitapları arasında' : 'güncel kataloğa göre'} %${percent}.`;
      case 'learningLeverage':
        return `${this.graph.unlockCount(book.id)} devam kitabı ve ${this.graph.companionCount(book.id)} eşlikçiyle bağlantılı; ${children ? 'çocuk kitapları arasında' : 'güncel ilişki ağına göre'} %${percent}.`;
      case 'preparationFit': {
        const count = this.graph.prerequisiteCount(book.id);
        return count === 0
          ? 'Bu kitap için ayrıca bir hazırlık okuması önerilmiyor.'
          : `${count} isteğe bağlı hazırlık okuması var; hazırlık yükü puana statik olarak yansıtıldı.`;
      }
      case 'difficultyFit':
        return children
          ? `Çocuk kitabı; genç okurun eşiğine göre değerlendirildi, uyum %${percent}.`
          : `Türetilmiş zorluk ${this.difficulty(book)}/5; sürdürülebilir okuma eşiğine uyum %${percent}.`;
      case 'durability':
        return (book.years?.length ?? 0) > 0
          ? `Güncellik ve kalıcı ilke dengesi %${percent}.`
          : `Yayın yılı katalogda yok; kalıcılık tahmini %${percent}.`;
    }
  }

  private leverage(bookId: string): number {
    return this.graph.unlockCount(bookId) + this.graph.companionCount(bookId);
  }

  private editorialConsensus(book: CatalogBook): number {
    return Math.log2(1 + (book.collectionIds?.length ?? 0))
      / Math.log2(1 + this.maxCollections);
  }

  private preparationFit(book: CatalogBook): number {
    return 1 / (1 + this.graph.prerequisiteCount(book.id) * 0.35);
  }

  private difficulty(book: CatalogBook): number {
    const hard = new Set(['finance', 'economy', 'science', 'technology', 'philosophy', 'systems']);
    const easy = new Set(['children', 'literature', 'biography', 'productivity']);
    let value = 3;
    if ((book.categories ?? []).some((id) => hard.has(id))) value += 1;
    if ((book.categories ?? []).some((id) => easy.has(id))) value -= 1;
    if ((book.collectionIds ?? []).includes('mit')) value += 1;
    return Math.max(1, Math.min(5, value));
  }

  private difficultyFit(book: CatalogBook): number {
    // Children's books are measured against a young reader, not an adult one.
    if ((book.categories ?? []).includes('children')) return 1;
    return 1 - Math.abs(this.difficulty(book) - 3) / 4;
  }

  private durability(book: CatalogBook): number {
    // A year before the common era is negative, and still a known year.
    const years = book.years ?? [];
    const tactical = (book.categories ?? [])
      .some((id) => ['technology', 'marketing'].includes(id));
    if (!years.length) return 0.55;
    const latest = Math.max(...years);
    if (!tactical) return 0.85;
    return clamp(0.35 + (latest - 1990) / 60);
  }

  private criterionConfidence(book: CatalogBook): Record<CriterionId, number> {
    const hasCategories = (book.categories?.length ?? 0) > 0;
    const hasCollections = (book.collectionIds?.length ?? 0) > 0;
    const hasYear = (book.years?.length ?? 0) > 0;

    return {
      editorialConsensus: hasCollections ? 1 : 0.55,
      learningLeverage: 0.9,
      preparationFit: 0.9,
      difficultyFit: hasCategories ? 0.8 : 0.5,
      durability: hasYear ? 0.9 : 0.5,
    };
  }
}

/** Min-max normalization is recomputed for the books in every rank call, so
 * additions, removals and relationship changes re-rank the whole catalog. */
export class CatalogNormalizer {
  normalize(assessments: readonly RawAssessment[], ids: readonly CriterionId[]): Map<string, RawCriteria> {
    const result = new Map<string, RawCriteria>();
    for (const assessment of assessments) {
      result.set(assessment.book.id, {} as RawCriteria);
    }

    for (const id of ids) {
      const values = assessments.map((assessment) => assessment.raw[id]);
      const min = Math.min(...values);
      const max = Math.max(...values);
      for (const assessment of assessments) {
        result.get(assessment.book.id)![id] = max === min
          ? clamp(assessment.raw[id])
          : clamp((assessment.raw[id] - min) / (max - min));
      }
    }

    return result;
  }
}

export class ReadingPriorityEngine {
  private readonly catalog: Catalog;
  private readonly policy: ReadingRankingPolicy;
  private readonly profile: CatalogReadingProfile;
  private readonly normalizer = new CatalogNormalizer();

  constructor(catalog: Catalog, policy: ReadingRankingPolicy = DEFAULT_READING_POLICY) {
    assertReadingPolicy(policy);
    this.catalog = catalog;
    this.policy = policy;
    this.profile = new CatalogReadingProfile(catalog);
  }

  /** Ranks the catalog. There is deliberately no user context parameter.
   * Each audience is normalised and ranked on its own; general books take the
   * first catalog positions and children's books follow. */
  rank(): ReadingPriorityResult[] {
    if (this.catalog.books.length === 0) return [];

    const ids = Object.keys(this.policy.weights) as CriterionId[];
    const assessments = this.catalog.books.map((book) => this.profile.assess(book));
    const ranked: ReadingPriorityResult[] = [];

    for (const audience of AUDIENCES) {
      const group = assessments.filter((assessment) => readingAudience(assessment.book) === audience);
      if (!group.length) continue;
      const normalized = this.normalizer.normalize(group, ids);
      const scored = group.map((assessment) =>
        this.score(assessment, normalized.get(assessment.book.id)!, ids, audience),
      );

      scored.sort((a, b) =>
        b.score - a.score
        || b.confidence - a.confidence
        || (a.bookId < b.bookId ? -1 : a.bookId > b.bookId ? 1 : 0),
      );

      let denseRank = 0;
      let previousKey = '';
      for (const result of scored) {
        const key = `${result.score}`;
        if (key !== previousKey) {
          denseRank += 1;
          previousKey = key;
        }
        ranked.push({ ...result, rank: denseRank, ordinal: ranked.length + 1 });
      }
    }

    return ranked;
  }

  private score(
    assessment: RawAssessment,
    normalized: RawCriteria,
    ids: readonly CriterionId[],
    audience: ReadingAudience,
  ): ReadingPriorityResult {
    const criteria = ids.map((id): CriterionResult => {
      const weight = this.policy.weights[id];
      return {
        id,
        label: CRITERION_LABELS[id],
        raw: round(assessment.raw[id], 3),
        normalized: round(normalized[id], 3),
        weight,
        points: round(normalized[id] * weight * 100, 2),
        confidence: round(assessment.confidence[id] * 100, 0),
        evidence: this.profile.evidence(id, assessment, normalized[id]),
      };
    });

    const score = ids.reduce((sum, id) => sum + normalized[id] * this.policy.weights[id] * 100, 0);
    const confidence = criteria.reduce(
      (sum, criterion) => sum + criterion.confidence * criterion.weight,
      0,
    );
    const readiness = this.readiness(score);
    const reasons = [...criteria]
      .sort((a, b) => b.points - a.points)
      .slice(0, 3)
      .map((criterion) =>
        `${criterion.label}: ${criterion.points.toFixed(2)} puan. ${criterion.evidence}`,
      );

    return {
      bookId: assessment.book.id,
      audience,
      rank: 0,
      ordinal: 0,
      score: round(score, 2),
      confidence: round(confidence, 0),
      maturity: readiness.level,
      maturityLabel: readiness.label,
      criteria,
      reasons,
      policyVersion: this.policy.version,
    };
  }

  private readiness(score: number): { level: ReadinessLevel; label: string } {
    const threshold = this.policy.maturity.find((item) => score >= item.minScore)
      ?? this.policy.maturity[this.policy.maturity.length - 1];
    return { level: threshold.level, label: threshold.label };
  }
}

export class ReadingRankingViewModel {
  private readonly engine: ReadingPriorityEngine;
  private readonly now: () => Date;

  constructor(engine: ReadingPriorityEngine, now: () => Date = () => new Date()) {
    this.engine = engine;
    this.now = now;
  }

  build(): ReadingRankingSnapshot {
    const ordered = this.engine.rank();
    return {
      version: ordered[0]?.policyVersion ?? DEFAULT_READING_POLICY.version,
      generatedAt: this.now().toISOString(),
      ordered,
      byId: Object.fromEntries(
        ordered.map((item) => [item.bookId, item]),
      ),
    };
  }
}
