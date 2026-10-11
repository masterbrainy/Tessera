import { aggregate, norm, screen, type Aggregator, type Update } from "./aggregate";
import { partition, type Dataset, type Partition } from "./data";
import { hashParams } from "./hash";
import { logLoss, meanAuc, recallAtFpr } from "./metrics";
import { initParams, predict, train, type Shape } from "./model";
import { epsilon, privatize, type DpConfig } from "./privacy";
import { Rng, seedFrom } from "./rng";
import { shapley } from "./shapley";

export type AttackType = "signFlip" | "labelFlip" | "noise";

export interface RunConfig {
  version: 1;
  seed: number;
  numLabs: number;
  rounds: number;
  localEpochs: number;
  lr: number;
  batchSize: number;
  hidden: number;
  aggregator: Aggregator;
  trimFrac: number;
  /** Drop updates the screening step flags before aggregating. */
  filterAnomalies: boolean;
  attacks: { lab: number; type: AttackType }[];
  dp: DpConfig;
}

export const DEFAULT_CONFIG: RunConfig = {
  version: 1,
  seed: 7,
  numLabs: 5,
  rounds: 10,
  localEpochs: 1,
  lr: 0.002,
  batchSize: 32,
  hidden: 64,
  aggregator: "trimmed",
  trimFrac: 0.2,
  filterAnomalies: true,
  attacks: [{ lab: 4, type: "signFlip" }],
  dp: { enabled: false, clip: 2, noiseMultiplier: 0.02 },
};

export const MAX_LABS = 8;
const SIGN_FLIP_BOOST = 4;
const NOISE_BOOST = 3;

export function shapeOf(cfg: RunConfig, ds: Dataset): Shape {
  return { nBits: ds.nBits, hidden: cfg.hidden, tasks: ds.tasks.length };
}

export function attackOf(cfg: RunConfig, lab: number): AttackType | null {
  return cfg.attacks.find((a) => a.lab === lab)?.type ?? null;
}

export function initialParams(cfg: RunConfig, ds: Dataset): Float64Array {
  return initParams(shapeOf(cfg, ds), new Rng(seedFrom(cfg.seed, 0xbeef)));
}

export interface LabUpdate extends Update {
  lab: number;
  rawNorm: number;
  clipped: boolean;
}

/**
 * What a lab does each round, entirely on its own premises: start from the global
 * model, train on its private molecules, and send back only the weight delta
 * (optionally clipped and noised for differential privacy). Attackers deviate here.
 */
export function labUpdate(
  cfg: RunConfig,
  ds: Dataset,
  myMolecules: readonly number[],
  lab: number,
  round: number,
  global: Float64Array,
): LabUpdate {
  const shape = shapeOf(cfg, ds);
  const rng = new Rng(seedFrom(cfg.seed, 1, lab, round));
  const attack = attackOf(cfg, lab);
  const local = train(
    global,
    shape,
    ds,
    myMolecules,
    { epochs: cfg.localEpochs, lr: cfg.lr, batchSize: cfg.batchSize, flipLabels: attack === "labelFlip" },
    rng,
  );
  let delta: Float64Array = new Float64Array(local.length);
  for (let i = 0; i < delta.length; i++) delta[i] = local[i] - global[i];
  const rawNorm = norm(delta);

  if (attack === "signFlip") {
    for (let i = 0; i < delta.length; i++) delta[i] *= -SIGN_FLIP_BOOST;
  } else if (attack === "noise") {
    const s = (NOISE_BOOST * rawNorm) / Math.sqrt(delta.length);
    for (let i = 0; i < delta.length; i++) delta[i] = s * rng.gaussian();
  }

  let clipped = false;
  if (cfg.dp.enabled && !attack) {
    const priv = privatize(delta, cfg.dp, rng);
    delta = priv.delta;
    clipped = priv.clipped;
  }
  return { lab, delta, n: myMolecules.length, rawNorm, clipped };
}

/** Any transport that can get a lab's update: in-process, Web Worker, or HTTP. */
export interface LabClient {
  lab: number;
  update(round: number, global: Float64Array): Promise<LabUpdate>;
}

export interface LabRoundStats {
  lab: number;
  n: number;
  norm: number;
  cosine: number;
  normRatio: number;
  flagged: boolean;
  accepted: boolean;
  shapley: number;
}

export interface RoundResult {
  round: number;
  test: Scores;
  valLoss: number;
  modelHash: `0x${string}`;
  labs: LabRoundStats[];
  epsilon: number | null;
  ms: number;
}

export interface Context {
  cfg: RunConfig;
  ds: Dataset;
  part: Partition;
  shape: Shape;
}

export function makeContext(cfg: RunConfig, ds: Dataset): Context {
  if (cfg.numLabs < 2 || cfg.numLabs > MAX_LABS) throw new Error(`numLabs must be 2..${MAX_LABS}`);
  return { cfg, ds, part: partition(ds, cfg.numLabs, cfg.seed), shape: shapeOf(cfg, ds) };
}

export interface Scores {
  auc: number;
  /** Share of illicit transactions caught at a 1% false-alarm rate. */
  catchRate: number;
  logLoss: number;
}

export function evaluate(ctx: Context, params: Float64Array, idx: readonly number[]): Scores {
  const probs = predict(params, ctx.shape, ctx.ds, idx);
  return { auc: meanAuc(probs, ctx.ds, idx), catchRate: recallAtFpr(probs, ctx.ds, idx), logLoss: logLoss(probs, ctx.ds, idx) };
}

/** Contribution utility: negative validation log-loss (keeps moving long after AUC saturates). */
function valUtility(ctx: Context, params: Float64Array): number {
  return -logLoss(predict(params, ctx.shape, ctx.ds, ctx.part.val), ctx.ds, ctx.part.val);
}

function addInto(base: Float64Array, delta: Float64Array): Float64Array {
  const out = new Float64Array(base.length);
  for (let i = 0; i < base.length; i++) out[i] = base[i] + delta[i];
  return out;
}

/**
 * One coordinator round on the updates already collected (in lab order):
 * screen, aggregate, score every lab's marginal value with exact Shapley over
 * all coalitions on the consortium validation set, then advance the model.
 */
export function coordinate(
  ctx: Context,
  round: number,
  global: Float64Array,
  updates: readonly LabUpdate[],
): { next: Float64Array; result: Omit<RoundResult, "ms"> } {
  const { cfg, part } = ctx;
  const screening = screen(updates);
  const acceptedMask = updates.reduce(
    (m, _, i) => (cfg.filterAnomalies && screening[i].flagged ? m : m | (1 << i)),
    0,
  );

  const baseVal = valUtility(ctx, global);
  const utility = (mask: number) => {
    const members = updates.filter((_, i) => mask & acceptedMask & (1 << i));
    if (!members.length) return baseVal;
    return valUtility(ctx, addInto(global, aggregate(members, cfg.aggregator, cfg.trimFrac)));
  };
  const phi = shapley(updates.length, utility);

  const accepted = updates.filter((_, i) => acceptedMask & (1 << i));
  const next = accepted.length ? addInto(global, aggregate(accepted, cfg.aggregator, cfg.trimFrac)) : global;

  return {
    next,
    result: {
      round,
      test: evaluate(ctx, next, part.test),
      valLoss: -valUtility(ctx, next),
      modelHash: hashParams(next),
      epsilon: cfg.dp.enabled ? epsilon(cfg.dp.noiseMultiplier, round + 1) : null,
      labs: updates.map((u, i) => ({
        lab: u.lab,
        n: u.n,
        norm: norm(u.delta),
        cosine: screening[i].cosine,
        normRatio: screening[i].normRatio,
        flagged: screening[i].flagged,
        accepted: !!(acceptedMask & (1 << i)),
        shapley: phi[i],
      })),
    },
  };
}

export interface RunHooks {
  onRoundStart?: (round: number) => void;
  onUpdates?: (round: number, updates: LabUpdate[]) => void;
  onRound?: (r: RoundResult, params: Float64Array) => void;
  shouldStop?: () => boolean;
}

export interface RunSummary {
  rounds: RoundResult[];
  params: Float64Array;
  /** Sum of per-round Shapley values per lab. */
  contribution: number[];
  /** Reward share per lab in basis points (negative contributions earn nothing). */
  payoutBps: number[];
}

export async function runFederation(ctx: Context, clients: LabClient[], hooks: RunHooks = {}): Promise<RunSummary> {
  let global = initialParams(ctx.cfg, ctx.ds);
  const rounds: RoundResult[] = [];
  for (let r = 0; r < ctx.cfg.rounds; r++) {
    if (hooks.shouldStop?.()) break;
    const t0 = Date.now();
    hooks.onRoundStart?.(r);
    const updates = await Promise.all(clients.map((c) => c.update(r, global)));
    updates.sort((a, b) => a.lab - b.lab);
    hooks.onUpdates?.(r, updates);
    const { next, result } = coordinate(ctx, r, global, updates);
    global = next;
    const full = { ...result, ms: Date.now() - t0 };
    rounds.push(full);
    hooks.onRound?.(full, global);
  }
  return summarize(ctx.cfg.numLabs, rounds, global);
}

export function summarize(numLabs: number, rounds: RoundResult[], params: Float64Array): RunSummary {
  const contribution = new Array<number>(numLabs).fill(0);
  for (const r of rounds) for (const l of r.labs) contribution[l.lab] += l.shapley;
  return { rounds, params, contribution, payoutBps: payoutShares(contribution) };
}

/** Basis points summing to exactly 10000 (largest remainder), zero for non-positive contribution. */
export function payoutShares(contribution: number[]): number[] {
  const pos = contribution.map((c) => Math.max(0, c));
  const total = pos.reduce((a, b) => a + b, 0);
  if (total === 0) return contribution.map(() => 0);
  const raw = pos.map((c) => (c / total) * 10000);
  const bps = raw.map(Math.floor);
  let left = 10000 - bps.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) {
    if (left <= 0) break;
    if (pos[i] > 0) {
      bps[i]++;
      left--;
    }
  }
  return bps;
}

export function inProcessClients(ctx: Context): LabClient[] {
  return ctx.part.labs.map((mols, lab) => ({
    lab,
    update: async (round, global) => labUpdate(ctx.cfg, ctx.ds, mols, lab, round, global),
  }));
}

/** What each lab would reach alone, and what pooling every honest lab's raw data would reach. */
export function baselineCurve(
  ctx: Context,
  molecules: readonly number[],
  salt: number,
  onRound?: (round: number, scores: Scores) => void,
): Scores[] {
  let p = initialParams(ctx.cfg, ctx.ds);
  const curve: Scores[] = [];
  for (let r = 0; r < ctx.cfg.rounds; r++) {
    p = train(
      p,
      ctx.shape,
      ctx.ds,
      molecules,
      { epochs: ctx.cfg.localEpochs, lr: ctx.cfg.lr, batchSize: ctx.cfg.batchSize },
      new Rng(seedFrom(ctx.cfg.seed, 2, salt, r)),
    );
    curve.push(evaluate(ctx, p, ctx.part.test));
    onRound?.(r, curve[r]);
  }
  return curve;
}
