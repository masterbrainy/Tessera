"""Turn the Elliptic Bitcoin dataset into a compact file the engine (Node + browser) loads.

Elliptic: 203k real Bitcoin transactions over 49 two-week time steps, 46k of them
labeled illicit (scams, ransomware, darknet markets...) or licit, each with 165
anonymized features. We keep the labeled ones, pick the 64 most informative
features, and quantile-bin each into 8 buckets. A transaction then becomes 64
active bits out of 512, so the model's first layer stays sparse and fast.

Bin edges and feature choice use only the training time steps (no test leakage).
Split follows the standard temporal protocol: train on steps 1-34, test on 35-49.
"""
import base64
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

N_FEATURES = 64
N_BINS = 8
TRAIN_LAST = 30  # steps 1..30 are spread across the exchanges
VAL_LAST = 34  # steps 31..34 are the consortium's shared validation window
ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data/raw"
OUT = ROOT / "public/data/elliptic.json"


def auc(scores: np.ndarray, y: np.ndarray) -> float:
    order = np.argsort(scores, kind="mergesort")
    ranks = np.empty(len(scores))
    ranks[order] = np.arange(1, len(scores) + 1)
    pos = y.sum()
    neg = len(y) - pos
    return (ranks[y == 1].sum() - pos * (pos + 1) / 2) / (pos * neg)


def b64(arr: np.ndarray) -> str:
    return base64.b64encode(arr.tobytes()).decode()


def main() -> None:
    feats = pd.read_csv(RAW / "elliptic_txs_features.csv", header=None)
    classes = pd.read_csv(RAW / "elliptic_txs_classes.csv")
    feats.columns = ["txId", "step"] + [f"local_{i}" for i in range(93)] + [f"agg_{i}" for i in range(72)]
    df = feats.merge(classes, on="txId")
    df = df[df["class"] != "unknown"].reset_index(drop=True)
    y = (df["class"] == "1").astype(np.int8).to_numpy()  # 1 = illicit
    step = df["step"].to_numpy().astype(np.uint8)
    names = [c for c in df.columns if c.startswith(("local_", "agg_"))]
    X = df[names].to_numpy()

    fit = step <= VAL_LAST
    strength = [abs(auc(X[fit, j], y[fit]) - 0.5) for j in range(len(names))]
    chosen = sorted(np.argsort(strength)[::-1][:N_FEATURES].tolist())

    bins = np.zeros((len(df), N_FEATURES), dtype=np.uint8)
    all_edges = []
    for k, j in enumerate(chosen):
        edges = np.unique(np.quantile(X[fit, j], np.linspace(0, 1, N_BINS + 1)[1:-1]))
        bins[:, k] = np.searchsorted(edges, X[:, j], side="right")
        all_edges.append(edges.tolist())

    split = np.where(step <= TRAIN_LAST, 0, np.where(step <= VAL_LAST, 1, 2)).astype(np.uint8)
    payload = {
        "name": "Elliptic Bitcoin transactions",
        "tasks": ["illicit"],
        "features": [names[j] for j in chosen],
        "nBins": N_BINS,
        # Lets a browser bin raw feature values from an uploaded CSV exactly like this script does.
        "edges": all_edges,
        "rows": len(df),
        "bins": b64(bins),
        "labels": b64(y),
        "step": b64(step),
        "split": b64(split),
        "txId": b64(df["txId"].to_numpy().astype(np.uint32)),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, separators=(",", ":")))
    for s, label in enumerate(["exchanges", "validation", "test"]):
        m = split == s
        print(f"{label}: {m.sum()} tx, {y[m].mean():.1%} illicit", file=sys.stderr)
    print(f"-> {OUT} ({OUT.stat().st_size / 1e6:.1f} MB)", file=sys.stderr)
    write_samples(df, [names[j] for j in chosen], y, step, split)


# Sample provider files mirror src/engine/data.ts: sizes, illicit bias, and each scam wave
# (time step) concentrating at one venue. They are what a real member would export.
SAMPLES = ROOT / "public/samples"
PROFILES = [("harbor", 1.6, 1.0), ("meridian", 1.0, 2.6), ("kestrel", 0.7, 1.4), ("atlas", 2.2, 0.35), ("lumen", 1.2, 0.8)]
WAVE_CONCENTRATION = 8
SAMPLE_ROWS = 3000  # keeps each sample export a quick download


def write_samples(df: pd.DataFrame, cols: list[str], y: np.ndarray, step: np.ndarray, split: np.ndarray) -> None:
    SAMPLES.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(7)
    pool = np.flatnonzero(split == 0)
    owner = np.empty(len(pool), dtype=int)
    n = len(PROFILES)
    for k, i in enumerate(pool):
        w = np.array([s * (b * (WAVE_CONCENTRATION if step[i] % n == l else 1) if y[i] else 1) for l, (_, s, b) in enumerate(PROFILES)])
        owner[k] = rng.choice(n, p=w / w.sum())
    out = pd.DataFrame({"tx_id": df["txId"], "time_step": step, "is_illicit": y})
    out = pd.concat([out, df[cols]], axis=1)  # full precision: many values sit exactly on a bin edge
    for l, (name, _, _) in enumerate(PROFILES):
        rows = out.iloc[pool[owner == l]]
        rows = rows.sample(n=min(SAMPLE_ROWS, len(rows)), random_state=7).sort_values("time_step")
        rows.to_csv(SAMPLES / f"{name}.csv", index=False)
        print(f"sample {name}: {len(rows)} tx, {rows.is_illicit.mean():.1%} illicit", file=sys.stderr)
    # Fresh, unlabeled transactions from the future test window, for "screen your own transactions".
    fresh = out.iloc[np.flatnonzero(split == 2)].sample(n=1000, random_state=7).drop(columns=["is_illicit"])
    fresh.to_csv(SAMPLES / "new-transactions.csv", index=False)
    out.iloc[:0].drop(columns=["time_step"]).to_csv(SAMPLES / "template.csv", index=False)


if __name__ == "__main__":
    main()
