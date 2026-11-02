#!/usr/bin/env python3
"""Forced alignment for anime-reel (torchaudio MMS_FA) + mouth envelopes.

For every shot in episode.json that has a `line`, this:
  1. decodes the voice MP3 to 16 kHz mono,
  2. romanises the line text (uroman; handles Hindi/Devanagari, Hinglish, etc.),
  3. force-aligns each word with torchaudio.pipelines.MMS_FA (never guessed),
  4. computes a per-frame loudness envelope (0..1) gated by the aligned words,
     which drives that speaker's mouth.

Display tokens can carry a spoken form for alignment: `5000{paanch_hazaar}`
shows "5000" in captions but aligns "paanch hazaar". Digits without a spoken
form are an error (we refuse to guess their timing).

usage: python3 align.py episode.json --out work/alignment.json [--model-dir DIR] [--force]
"""
import argparse, json, os, re, subprocess, sys, unicodedata, warnings

warnings.filterwarnings("ignore")
import numpy as np

SR = 16000


def die(msg, code=2):
    print(msg, file=sys.stderr)
    sys.exit(code)


def decode(path, clip=None):
    rng = ["-ss", f"{clip[0]:.4f}", "-t", f"{clip[1] - clip[0]:.4f}"] if clip else []
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, *rng, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                         check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


_uroman = None


def romanize(s):
    global _uroman
    if all(ord(c) < 128 for c in s):
        return s
    if _uroman is None:
        import uroman as ur
        _uroman = ur.Uroman()
    return _uroman.romanize_string(s)


def tokens_for(text):
    """Split display text into tokens; each -> (display, [spoken subwords])."""
    out = []
    for raw in text.split():
        m = re.match(r"^(.*?)\{([^}]+)\}([^\w]*)$", raw)
        if m:
            display, spoken = m.group(1) + m.group(3), m.group(2).replace("_", " ")
        else:
            display, spoken = raw, raw
        out.append([display, spoken])
    # attach punctuation-only tokens to the previous word
    merged = []
    for d, s in out:
        if merged and not re.search(r"\w", d, re.UNICODE):
            merged[-1][0] += d
        else:
            merged.append([d, s])
    return merged


def normalize(spoken, dictionary):
    words = []
    for w in spoken.split():
        r = unicodedata.normalize("NFKC", romanize(w)).lower().replace("’", "'")
        r = "".join(c for c in r if c in dictionary)
        if r:
            words.append(r)
    return words


def envelope(wav, fps, words, duration):
    hop = SR / fps
    n = int(np.ceil(duration * fps))
    win = int(SR * 2 / fps)
    rms = np.zeros(n, dtype=np.float32)
    for i in range(n):
        c = int(i * hop + hop / 2)
        seg = wav[max(0, c - win // 2): c + win // 2]
        rms[i] = np.sqrt(np.mean(seg ** 2)) if len(seg) else 0
    db = 20 * np.log10(rms + 1e-6)
    gate = np.zeros(n, dtype=bool)
    for w in words:
        a, b = int((w["start"] - 0.03) * fps), int(np.ceil((w["end"] + 0.03) * fps))
        gate[max(0, a):min(n, b)] = True
    voiced = db[gate] if gate.any() else db
    floor = np.percentile(voiced, 10) - 3
    peak = np.percentile(voiced, 95)
    v = np.clip((db - floor) / max(6.0, peak - floor), 0, 1) ** 0.8
    v[~gate] = 0
    out = np.zeros_like(v)
    prev = 0.0
    for i, x in enumerate(v):  # fast attack, softer release
        prev = prev + (x - prev) * (0.7 if x > prev else 0.45)
        out[i] = prev
    return [round(float(x), 3) for x in out]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("episode")
    ap.add_argument("--out", required=True)
    ap.add_argument("--model-dir", default=os.environ.get("MMS_FA_MODEL_DIR"))
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    if os.path.exists(a.out) and not a.force:
        die(f"REFUSING TO OVERWRITE: {a.out}\nAsk the user, then re-run with --force.", 3)

    ep = json.load(open(a.episode, encoding="utf-8"))
    base = os.path.dirname(os.path.abspath(a.episode))
    fps = ep.get("fps", 30)

    # validate before loading the model
    jobs, problems = [], []
    for i, s in enumerate(ep.get("shots", [])):
        if not s.get("line"):
            continue
        sid = s.get("id") or f"s{i + 1:02d}"
        audio = os.path.join(base, s["line"]["audio"])
        if not os.path.exists(audio):
            problems.append(f"{sid}: audio not found: {audio}")
        toks = tokens_for(s["line"]["text"])
        for d, sp in toks:
            if re.search(r"\d", sp):
                problems.append(f"{sid}: '{d}' contains digits — write it as {d}{{spoken_form}} (e.g. 5000{{paanch_hazaar}})")
        jobs.append((sid, audio, toks, s["line"].get("clip")))
    if problems:
        die("alignment input problems:\n - " + "\n - ".join(problems))

    import torch, torchaudio
    bundle = torchaudio.pipelines.MMS_FA
    dictionary = bundle.get_dict(star=None)
    try:
        kw = {"dl_kwargs": {"model_dir": a.model_dir}} if a.model_dir else {}
        model = bundle.get_model(with_star=False, **kw)
    except Exception as e:  # weights are fetched from dl.fbaipublicfiles.com on first use
        die("Could not load the MMS_FA model weights (first run downloads ~1.2 GB from "
            "dl.fbaipublicfiles.com).\nAllow that host, or place model.pt in a folder and pass "
            f"--model-dir / set MMS_FA_MODEL_DIR.\nError: {e}", 5)
    model.eval()
    tokenizer, aligner = bundle.get_tokenizer(), bundle.get_aligner()

    result = {"fps": fps, "model": "torchaudio.pipelines.MMS_FA", "lines": {}}
    for sid, audio, toks, clip in jobs:
        wav = decode(audio, clip)
        duration = len(wav) / SR
        spoken = [normalize(sp, dictionary) for _, sp in toks]
        flat = [w for ws in spoken for w in ws]
        if not flat:
            die(f"{sid}: nothing alignable in the line text")
        with torch.inference_mode():
            emission, _ = model(torch.from_numpy(wav).unsqueeze(0))
        spans = aligner(emission[0], tokenizer(flat))
        ratio = len(wav) / emission.size(1) / SR
        words, k = [], 0
        for (display, _), ws in zip(toks, spoken):
            if not ws:  # e.g. an emoji: attach to the previous word's timing
                if words:
                    words[-1]["text"] += " " + display
                continue
            group = spans[k:k + len(ws)]
            k += len(ws)
            toks_all = [t for g in group for t in g]
            score = sum(t.score * len(t) for t in toks_all) / max(1, sum(len(t) for t in toks_all))
            words.append({"text": display, "start": round(group[0][0].start * ratio, 3),
                          "end": round(group[-1][-1].end * ratio, 3), "score": round(float(score), 3)})
        low = [w["text"] for w in words if w["score"] < 0.3]
        result["lines"][sid] = {"audio": audio, "clip": clip, "duration": round(duration, 4), "words": words,
                                "env": envelope(wav, fps, words, duration), "low_confidence": low}
        flag = f"  LOW CONFIDENCE: {low}" if low else ""
        print(f"{sid}: {len(words)} words, {duration:.2f}s, first '{words[0]['text']}' @{words[0]['start']:.2f}s{flag}")
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    json.dump(result, open(a.out, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"alignment: {a.out}")


if __name__ == "__main__":
    main()
