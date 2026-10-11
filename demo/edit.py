"""Cut the recorded Tessera demo into the final ~90s video.

Reads build/timeline.json (frames + marks from record.mjs), rebuilds a constant-30fps master
from the screencast frames, then applies per-segment speed ramps and trims, fades, and a soft
synthesized music bed. Output: demo/tessera-demo.mp4 (1080p H.264 + AAC).
"""
import json
import subprocess
from pathlib import Path

DIR = Path(__file__).resolve().parent
BUILD = DIR / "build"
OUT = DIR / "tessera-demo.mp4"

# Per-mark overrides: speed (0 = cut), trim_start / trim_end seconds of raw footage.
PLAN = {
    "title": {"trim_start": -0.5},
    "landing": {"speed": 1.15},
    "run1": {"speed": 1.0},
    "results": {"speed": 1.25},
    "defense-off": {"speed": 1.3},
    "terminal": {"speed": 1.5, "trim_start": 0.3},
    "terminal-fast": {"speed": 2.0},
    "ledger": {"speed": 1.4, "trim_start": 1.2},
    "outro": {"trim_end": 0.0},
}
FPS = 30


def run(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True)


def build_master(frames: list[dict]) -> Path:
    lines = []
    for i, f in enumerate(frames):
        dur = frames[i + 1]["t"] - f["t"] if i + 1 < len(frames) else 0.1
        lines += [f"file 'frames/{f['name']}'", f"duration {max(dur, 0.001):.4f}"]
    lines.append(f"file 'frames/{frames[-1]['name']}'")
    (BUILD / "list.txt").write_text("\n".join(lines) + "\n")
    master = BUILD / "master.mp4"
    run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(BUILD / "list.txt"),
         "-vf", f"fps={FPS},scale=1920:1080:flags=lanczos,format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "14",
         str(master)])
    return master


def segments(frames: list[dict], marks: list[dict]) -> list[tuple[float, float, float]]:
    t0 = frames[0]["t"]
    out = []
    for i, m in enumerate(marks[:-1]):
        plan = PLAN.get(m["name"], {})
        speed = plan.get("speed", m["speed"])
        start = m["t"] - t0 + plan.get("trim_start", 0)
        end = marks[i + 1]["t"] - t0 - plan.get("trim_end", 0)
        if speed == 0 or end - start < 0.05:
            continue
        out.append((max(0.0, start), end, speed))
    return out


def music(duration: float) -> Path:
    """A quiet four-chord pad (sines with slow swells), soft enough to sit under captions."""
    chords = [
        [130.81, 196.00, 246.94, 329.63],  # Cmaj7
        [110.00, 164.81, 261.63, 329.63],  # Am7
        [87.31, 174.61, 220.00, 329.63],  # Fmaj7
        [98.00, 146.83, 246.94, 293.66],  # G6
    ]
    seg = duration / 4
    parts = []
    for k, chord in enumerate(chords):
        s0 = k * seg
        env = f"(min(1,(t-{s0:.3f})/2.5)*min(1,({s0 + seg:.3f}-t)/2.5))*between(t,{s0:.3f},{s0 + seg:.3f})"
        tones = "+".join(f"sin(2*PI*{f}*t)*(0.6+0.4*sin(2*PI*{0.07 + 0.03 * j}*t))" for j, f in enumerate(chord))
        parts.append(f"({tones})*{env}")
    expr = f"0.045*({'+'.join(parts)})"
    path = BUILD / "music.wav"
    run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
         f"aevalsrc='{expr}':s=44100:d={duration:.2f}",
         "-af", "aecho=0.8:0.7:120|260:0.35|0.2,lowpass=f=2400,afade=t=in:d=1.5,"
                f"afade=t=out:st={duration - 2.5:.2f}:d=2.5,volume=0.9",
         str(path)])
    return path


def main() -> None:
    data = json.loads((BUILD / "timeline.json").read_text())
    frames, marks = data["frames"], data["marks"]
    master = build_master(frames)
    segs = segments(frames, marks)

    chains, labels = [], []
    for i, (a, b, speed) in enumerate(segs):
        chains.append(f"[0:v]trim=start={a:.3f}:end={b:.3f},setpts=(PTS-STARTPTS)/{speed},fps={FPS}[v{i}]")
        labels.append(f"[v{i}]")
    total = sum((b - a) / s for a, b, s in segs)
    chains.append(f"{''.join(labels)}concat=n={len(segs)}:v=1:a=0,"
                  f"fade=t=in:st=0:d=0.5:color=0xfbf6ee,fade=t=out:st={total - 0.9:.2f}:d=0.9:color=0xfbf6ee[v]")
    graph = ";".join(chains)
    pad = music(total)
    run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(master), "-i", str(pad),
         "-filter_complex", graph, "-map", "[v]", "-map", "1:a", "-c:v", "libx264", "-preset", "slow", "-crf", "17",
         "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "160k", "-shortest", str(OUT)])
    print(f"{len(segs)} segments, {total:.1f}s -> {OUT}")
    for a, b, s in segs:
        print(f"  {a:7.2f}-{b:7.2f}  x{s:<4} -> {(b - a) / s:5.2f}s")


if __name__ == "__main__":
    main()
