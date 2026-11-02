#!/usr/bin/env python3
"""One MP3 for the whole dialogue -> per-line clip ranges, via forced alignment.

Use when the user sends a single voice file instead of one MP3 per line.
The whole transcript is force-aligned with torchaudio MMS_FA; each line's
range runs from the middle of the pause before it to the middle of the pause
after it. Nothing is re-encoded: episode.json lines reference the original file
with "clip": [start, end] and align.py / mix_audio.js read exactly that range.

It also tests whether speaker names / a title were read aloud, by comparing the
alignment score of each transcript variant, so you don't have to guess.

usage: python3 split_lines.py voice.mp3 lines.json --out work/line_clips.json [--title "..."] [--force]
  lines.json = [{"speaker": "munni", "name": "मुन्नी", "text": "..."}, ...]   (in spoken order)
"""
import argparse, json, os, sys, warnings

warnings.filterwarnings("ignore")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import align  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio"); ap.add_argument("lines")
    ap.add_argument("--out", required=True); ap.add_argument("--title", default="")
    ap.add_argument("--model-dir", default=os.environ.get("MMS_FA_MODEL_DIR"))
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    if os.path.exists(a.out) and not a.force:
        align.die(f"REFUSING TO OVERWRITE: {a.out}\nAsk the user, then re-run with --force.", 3)
    lines = json.load(open(a.lines, encoding="utf-8"))

    import torch, torchaudio
    b = torchaudio.pipelines.MMS_FA
    d = b.get_dict(star=None)
    model = b.get_model(with_star=False, **({"dl_kwargs": {"model_dir": a.model_dir}} if a.model_dir else {})).eval()
    tok, aligner = b.get_tokenizer(), b.get_aligner()
    wav = align.decode(a.audio)
    dur = len(wav) / align.SR
    with torch.inference_mode():
        em, _ = model(torch.from_numpy(wav).unsqueeze(0))
    ratio = len(wav) / em.size(1) / align.SR

    def words_of(text):
        return [w for _, sp in align.tokens_for(text.replace("-", " ")) for w in align.normalize(sp, d)]

    def run(segments):  # segments: list of (kind, line_index|None, text)
        flat, owner = [], []
        for kind, idx, text in segments:
            ws = words_of(text); flat += ws; owner += [(kind, idx)] * len(ws)
        spans = aligner(em[0], tok(flat))
        toks = [t for g in spans for t in g]
        score = sum(t.score * len(t) for t in toks) / sum(len(t) for t in toks)
        return score, spans, owner

    variants = {"lines only": [("line", i, l["text"]) for i, l in enumerate(lines)]}
    variants["names + lines"] = [s for i, l in enumerate(lines) for s in (("name", i, l.get("name", "")), ("line", i, l["text"]))]
    if a.title:
        variants["title + lines"] = [("title", None, a.title)] + variants["lines only"]
        variants["title + names + lines"] = [("title", None, a.title)] + variants["names + lines"]
    results = {k: run(v) for k, v in variants.items()}
    for k, (s, _, _) in results.items():
        print(f"  transcript variant {k:24s} score {s:.3f}")
    best = max(results, key=lambda k: results[k][0])
    score, spans, owner = results[best]
    print(f"best fit: {best}")

    # per-line speech extents (line words only)
    ext = {}
    for (kind, idx), g in zip(owner, spans):
        if kind != "line":
            continue
        s, e = g[0].start * ratio, g[-1].end * ratio
        lo, hi = ext.get(idx, (s, e)); ext[idx] = (min(lo, s), max(hi, e))
    # spoken names/titles are excluded: the cut goes right before the line's first word
    pre_ext = {}
    for (kind, idx), g in zip(owner, spans):
        if kind in ("name", "title"):
            pre_ext[idx] = g[-1][-1].end * ratio if hasattr(g[-1], "__len__") else g[-1].end * ratio
    clips = []
    for i in range(len(lines)):
        s, e = ext[i]
        prev_end = ext[i - 1][1] if i > 0 else 0.0
        if i in pre_ext:
            prev_end = max(prev_end, pre_ext[i])
        nxt = ext[i + 1][0] if i + 1 < len(lines) else dur
        if (i + 1) in pre_ext:
            nxt = min(nxt, ext[i][1] + (pre_ext[i + 1] - ext[i][1]) / 2)
        start = max(0.0, (prev_end + s) / 2 if i > 0 or i in pre_ext else max(0.0, s - 0.15))
        end = min(dur, (e + nxt) / 2 if i + 1 < len(lines) else min(dur, e + 0.3))
        clips.append({"speaker": lines[i].get("speaker"), "text": lines[i]["text"], "clip": [round(start, 3), round(end, 3)],
                      "speech": [round(s, 3), round(e, 3)]})
        print(f"  line {i + 1:02d} {lines[i].get('speaker', ''):8s} clip {start:6.2f}–{end:6.2f}s  speech {s:6.2f}–{e:6.2f}s  {lines[i]['text'][:40]}")
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    json.dump({"audio": os.path.abspath(a.audio), "duration": round(dur, 4), "best_variant": best,
               "scores": {k: round(v[0], 3) for k, v in results.items()}, "lines": clips},
              open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"line clips: {a.out}")


if __name__ == "__main__":
    main()
