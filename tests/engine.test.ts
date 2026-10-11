import { describe, expect, test } from "vitest";
import { detExp, detLog } from "../src/engine/detmath";
import { shapley } from "../src/engine/shapley";
import { aggregate, screen } from "../src/engine/aggregate";
import { DEFAULT_CONFIG, inProcessClients, makeContext, payoutShares, runFederation } from "../src/engine/federation";
import { decodeF64, encodeF64 } from "../node/wire";
import { loadDataset } from "../node/load-dataset";

describe("deterministic math", () => {
  test("detExp and detLog match Math to ~1 ulp", () => {
    for (const x of [-30, -5.5, -1, -1e-9, 0, 0.3, 1, 2.7, 10, 80]) {
      expect(Math.abs(detExp(x) - Math.exp(x)) / Math.exp(x)).toBeLessThan(4e-16);
    }
    for (const x of [1e-12, 0.01, 0.5, 1, 1.5, 3, 1e6]) {
      expect(Math.abs(detLog(x) - Math.log(x))).toBeLessThan(4e-16 * Math.max(1, Math.abs(Math.log(x))));
    }
  });
});

describe("Shapley", () => {
  test("efficiency: values sum to U(all) - U(empty)", () => {
    const weights = [3, -1, 0.5, 2];
    const u = (m: number) => weights.reduce((a, w, i) => a + (m & (1 << i) ? w : 0), 0) + (m === 0b1111 ? 1.2 : 0);
    const phi = shapley(4, u);
    expect(phi.reduce((a, b) => a + b, 0)).toBeCloseTo(u(0b1111) - u(0), 12);
    // symmetric synergy is split evenly on top of each player's own weight
    phi.forEach((p, i) => expect(p).toBeCloseTo(weights[i] + 0.3, 12));
  });

  test("payout shares sum to 10000 bps and give nothing to negative contributors", () => {
    const bps = payoutShares([0.4, 0.1, -0.3, 0.2333]);
    expect(bps.reduce((a, b) => a + b, 0)).toBe(10000);
    expect(bps[2]).toBe(0);
  });
});

describe("robust aggregation", () => {
  test("trimmed mean and screening shrug off one boosted reversed update", () => {
    const honest = [1, 1.1, 0.9, 1.05].map((s) => ({ delta: Float64Array.from([s, 2 * s, -s]), n: 100 }));
    const attacker = { delta: Float64Array.from([-8, -16, 8]), n: 100 };
    const all = [...honest, attacker];
    expect(screen(all).map((s) => s.flagged)).toEqual([false, false, false, false, true]);
    const robust = aggregate(all, "trimmed", 0.2);
    expect(robust[0]).toBeGreaterThan(0.9);
    expect(aggregate(all, "fedavg", 0)[0]).toBeLessThan(0);
  });
});

describe("federation", () => {
  const ds = loadDataset();
  const cfg = { ...DEFAULT_CONFIG, rounds: 2 };

  test("is bit-for-bit reproducible from its config", async () => {
    const a = await runFederation(makeContext(cfg, ds), inProcessClients(makeContext(cfg, ds)));
    const b = await runFederation(makeContext(cfg, ds), inProcessClients(makeContext(cfg, ds)));
    expect(a.rounds.map((r) => r.modelHash)).toEqual(b.rounds.map((r) => r.modelHash));
    expect(a.contribution).toEqual(b.contribution);
  }, 60_000);

  test("the attacker is rejected and earns nothing", async () => {
    const ctx = makeContext(cfg, ds);
    const s = await runFederation(ctx, inProcessClients(ctx));
    const attacker = cfg.attacks[0].lab;
    expect(s.rounds.every((r) => !r.labs[attacker].accepted)).toBe(true);
    expect(s.payoutBps[attacker]).toBe(0);
  }, 60_000);

  test("wire encoding is lossless", () => {
    const v = Float64Array.from([Math.PI, -0, 1e-300, -123.456, Number.MIN_VALUE]);
    expect(Array.from(decodeF64(encodeF64(v)))).toEqual(Array.from(v));
  });
});
