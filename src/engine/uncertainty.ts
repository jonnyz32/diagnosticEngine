import { betaFromCI, posterior, toSensSpec, type AccuracyResolver } from "./bayes";
import type { Accuracy, Answer, EvidenceDb } from "./schema";

export { betaFromCI };

// Seeded PRNG so intervals are reproducible across renders and in tests.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(rand: () => number): number {
  const u = 1 - rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Marsaglia–Tsang gamma sampler.
function gamma(shape: number, rand: () => number): number {
  if (shape < 1) return gamma(shape + 1, rand) * Math.pow(rand(), 1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number, v: number;
    do {
      x = normal(rand);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rand();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

function sampleBeta([a, b]: [number, number], rand: () => number): number {
  const x = gamma(a, rand);
  return x / (x + gamma(b, rand));
}

export interface Interval {
  lo: number;
  hi: number;
}

/**
 * 95% intervals for each posterior by resampling every sens/spec from its CI.
 * Entries without a reported CI stay at their point estimate.
 */
export function posteriorIntervals(
  db: EvidenceDb,
  answers: Record<string, Answer>,
  draws = 400,
  seed = 1,
): Map<string, Interval> {
  const rand = mulberry32(seed);
  const samples = new Map<string, number[]>();
  for (let i = 0; i < draws; i++) {
    const cache = new Map<Accuracy, { sens: number; spec: number; derivedFromLR: boolean }>();
    const resolve: AccuracyResolver = (a) => {
      let v = cache.get(a);
      if (!v) {
        const base = toSensSpec(a);
        const sb = betaFromCI(base.sens, a.sensCI);
        const pb = betaFromCI(base.spec, a.specCI);
        v = {
          sens: sb ? sampleBeta(sb, rand) : base.sens,
          spec: pb ? sampleBeta(pb, rand) : base.spec,
          derivedFromLR: base.derivedFromLR,
        };
        cache.set(a, v);
      }
      return v;
    };
    for (const e of posterior(db, answers, resolve)) {
      if (!samples.has(e.id)) samples.set(e.id, []);
      samples.get(e.id)!.push(e.p);
    }
  }
  const out = new Map<string, Interval>();
  for (const [id, xs] of samples) {
    xs.sort((a, b) => a - b);
    out.set(id, { lo: xs[Math.floor(0.025 * (xs.length - 1))], hi: xs[Math.ceil(0.975 * (xs.length - 1))] });
  }
  return out;
}
