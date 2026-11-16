import type { CriterionId, ReadingRankingPolicy } from './types.ts';

// v2 removes the access and library-coverage criteria of v1: both were read
// from purchase state, and purchases, wishlists, reading activity and the
// personal queue are records, never ranking inputs. The five catalog criteria
// keep their v1 proportions, rounded to two decimals.
// v2.1 ranks children's books among themselves (see readingAudience); weights
// and thresholds are unchanged.
export const DEFAULT_READING_POLICY: ReadingRankingPolicy = {
  version: 'reading-priority-v2.1.1',
  weights: {
    editorialConsensus: 0.17,
    learningLeverage: 0.29,
    preparationFit: 0.20,
    difficultyFit: 0.16,
    durability: 0.18,
  },
  // The v1 thresholds (72/58/43/28) expressed on the rescaled v2 score.
  maturity: [
    { level: 5, minScore: 76, label: 'Çok yüksek okuma önceliği' },
    { level: 4, minScore: 57.5, label: 'Yüksek okuma önceliği' },
    { level: 3, minScore: 38, label: 'Orta okuma önceliği' },
    { level: 2, minScore: 18, label: 'Bağlama bağlı' },
    { level: 1, minScore: 0, label: 'Düşük okuma önceliği' },
  ],
};

export const CRITERION_LABELS: Readonly<Record<CriterionId, string>> = {
  editorialConsensus: 'Editoryal kesişim',
  learningLeverage: 'Öğrenme kaldıracı',
  preparationFit: 'Hazırlık uygunluğu',
  difficultyFit: 'Okuma eşiği',
  durability: 'Kalıcılık',
};

export function assertReadingPolicy(policy: ReadingRankingPolicy): void {
  const weightTotal = Object.values(policy.weights)
    .reduce((sum, value) => sum + value, 0);
  if (Math.abs(weightTotal - 1) > Number.EPSILON * 10) {
    throw new Error(`Reading ranking weights must total 1; received ${weightTotal}.`);
  }
  const thresholds = policy.maturity.map((item) => item.minScore);
  if (!thresholds.length || thresholds.some((value, index) => index > 0 && value >= thresholds[index - 1])
    || thresholds.at(-1) !== 0) {
    throw new Error('Maturity thresholds must descend strictly and end at 0.');
  }
}

assertReadingPolicy(DEFAULT_READING_POLICY);
