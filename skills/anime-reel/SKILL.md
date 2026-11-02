---
name: anime-reel
description: Turn a script plus one voice MP3 per line into an anime-style episode with original, code-drawn characters lip-synced to the voices (the Zero Se Freelance format), with speed lines, impact frames, screen shake, chibi reactions, word-by-word captions and SFX. Renders a 9:16 reel, a 16:9 YouTube copy and a 720p WhatsApp copy under 20 MB. Use when the user runs /anime-reel or asks for an anime episode or reel from a script and voice lines.
argument-hint: "<script file or pasted script> + voice MP3s (one per line)"
---

# /anime-reel

Input: a script and the voice MP3 for every spoken line. Output: an anime
episode drawn entirely in code and lip-synced to those voices.

`SKILL` below means this folder: `.claude/skills/anime-reel`.

## Rules for every run (non-negotiable)
1. **Draw everything in code.** Use an HTML canvas (`SKILL/renderer/*.js`), rendered frame by frame
   in headless Chrome (Playwright) and encoded with ffmpeg. No stock footage, no
   image or video generators and no downloaded art. The only bundled assets are the two
   fonts in `SKILL/assets/fonts` (Baloo 2 ExtraBold for captions, which covers Devanagari, and Bangers for SFX text).
2. **Time every word with forced alignment** (`torchaudio.pipelines.MMS_FA`, via
   `scripts/align.py`). Never guess, estimate or evenly space timings. If alignment
   can't run, stop and tell the user why; do not fall back to fake timings.
3. **Show a contact sheet of stills before the full render** and wait for the user's OK.
4. **Ask before overwriting any file.** The scripts refuse with exit code 3 and the message
   `REFUSING TO OVERWRITE`. Only re-run with `--force` after the user says yes.
5. Keep the **original voice audio** untouched in the mix (no denoise, EQ or loudness changes);
   it is only placed on the timeline. **No background music** unless the user asks.
6. Deliver the 9:16 MP4, the 16:9 MP4 and a 720p copy under 20 MB for WhatsApp.

## Project layout
Create one folder per episode next to the user's files (ask if unsure):
```
anime-reel-out/<slug>/
  episode.json            # shot list (step 1)
  voice/                  # the user's MP3s (reference them in place or copy here; never re-encode)
  sheets/<char>.png       # character sheets (step 2)
  work/alignment.json     # forced alignment + mouth envelopes (step 3)
  work/timeline.json      # everything resolved to absolute times
  work/sfx/*.wav          # synthesised SFX
  work/mix.wav            # voices + SFX
  stills/contact_sheet_9x16.png, stills/contact_sheet_16x9.png
  final/<slug>_reel_9x16.mp4, <slug>_youtube_16x9.mp4, <slug>_whatsapp_720p.mp4
```

## Step 0: preflight
```bash
bash SKILL/scripts/setup.sh
```
This checks and installs ffmpeg, Node, Playwright + Chromium, torch/torchaudio 2.8 (MMS_FA),
uroman and numpy. The first run downloads the MMS_FA weights (~1.2 GB from `dl.fbaipublicfiles.com`).
If that host is blocked, tell the user. They can allow it, or put `model.pt` in a folder and
set `MMS_FA_MODEL_DIR`. Then check the inputs: count the spoken lines in the script, count the MP3s, and
match each line to its file (by filename number or order). If they don't match, ask; never guess.

**One MP3 for the whole dialogue?** Write `work/lines.json` (`[{"speaker","name","text"}]` in spoken
order) and run:
```bash
python3 SKILL/scripts/split_lines.py voice/<file>.mp3 work/lines.json --title "<title if any>" --out work/line_clips.json
```
It force-aligns the whole script, works out whether the speaker names or title were read aloud (it picks the
transcript variant with the best alignment score), and gives each line a `clip: [start, end]` that is cut
in the middle of a pause. Put `"audio": "voice/<file>.mp3", "clip": [...]` on every shot's `line`. Nothing is
re-encoded: `align.py` and `mix_audio.js` read exactly that range of the original file.

## Step 1: script → shots
Read the script and write `episode.json` (full schema: `SKILL/reference/episode-schema.md`).
- Make **one shot per spoken line**. Add an `establishing` shot when the location changes, if that helps.
- For each shot decide **who speaks** (`speaker`), **who is on screen** (`cast`), **where**
  (`location` + `time`), the **framing**, and the **camera move**. Vary them: open on an establishing shot or a `push_in`,
  use `close` for punchlines, `medium` for back-and-forth, `whip_in` for a sudden entrance, and `dutch` for tension.
- `line.text` must be **exactly what is said**, in the script's spelling, because alignment depends on it.
  Write digits with a spoken form: `5000{paanch_hazaar}`. Strip stage directions such as `(sighs)`
  out of `text` and turn them into `expressions`.
- Give each character a distinct caption `color`.
- Show the user the shot list as a short table (shot, speaker, location, framing, camera, FX) before moving on.

## Step 2: character design and sheets
Saved casts live in `SKILL/presets/` (e.g. `munni_pintu_characters.json` for Munni and Pintu). When the user asks for the same characters, copy that block into `episode.json → characters` unchanged.

Design each character in `episode.json → characters[].design` in anime style: big eyes,
thick clean outlines, flat colours with one shade. These are already the renderer's style
rules; you choose hair style and colour, eye colour, outfit, accent and accessory. Make the cast easy to
tell apart in silhouette (different hair styles) and in colour. Characters are **original**;
never copy an existing franchise's characters. Then render the sheets straight from `episode.json`:
```bash
node SKILL/scripts/render.js sheet --episode episode.json --out sheets
```
Each sheet has the master front view, 6 expressions, 4 mouth shapes plus blink and joy,
6 chibi reactions, and colour swatches (base | shade). Show them to the user. **The design block
is the character's identity.** Once approved, reuse it byte-for-byte in every shot and future episode.

## Step 3: forced alignment, lip-sync, blinks, idle motion
```bash
python3 SKILL/scripts/align.py episode.json --out work/alignment.json
```
- `align.py` decodes each MP3 to 16 kHz mono, romanises the text with uroman, and aligns
  every word with MMS_FA. It also writes a per-frame loudness envelope that is **gated to the aligned
  words**, so breaths and noise don't move the mouth.
- Read its report. If any `LOW CONFIDENCE` words appear (score < 0.3), the text probably doesn't match
  the audio (an ad-lib or a misspelling). Fix `line.text` to match what is actually said and re-run it; ask the user before
  using `--force`.
- The renderer drives each speaker's mouth from that envelope: 4 mouth shapes, updated "on twos"
  (15 changes a second at 30 fps) for an anime feel. Listeners keep their mouths closed and look at the speaker.
- Blinks follow a seeded schedule per character (with occasional double blinks). Idle motion
  (breathing, head bob, a small talking tilt and hair sway) is automatic and deterministic.

## Step 4: anime tricks on key lines
Add `fx` to the key lines in `episode.json`, anchored to a **word index** so they land on the
aligned word: `speed_lines`, `impact` (optionally with `text`, e.g. "BAAM!"), `shake`, `zoom_punch`,
`chibi` (`reaction`: shock, anger, sparkle, sweat, cry or happy) and `flash`. Use them sparingly, roughly 1 per
1–2 lines, saved for punchlines, reveals and reactions. Use `expr_at` to switch a face on a word.

## Step 5: captions and SFX
These are automatic from the alignment:
- **Captions** show 2–3 words at a time, breaking on punctuation and pauses over 0.4 s. The word being spoken
  is in the **speaker's colour** with a pop; the other words are white with a thick dark outline. Safe zones: 73% of
  the height on 9:16 and 86% on 16:9.
- **SFX** are synthesised in code (`sfx.js`) and added automatically on each FX hit (whoosh, impact, rumble, pop,
  sparkle, ding, boing, swish). Add extras with `shots[].sfx`. No music unless asked (`mix_audio.js --music`).

Then generate the SFX and build the timeline (rebuild it after every edit to `episode.json`):
```bash
node SKILL/scripts/sfx.js work/sfx
node SKILL/scripts/build_timeline.js --episode episode.json --alignment work/alignment.json --out work/timeline.json
```
Rebuilding later:
```bash
node SKILL/scripts/build_timeline.js --episode episode.json --alignment work/alignment.json --out work/timeline.json --force
```
(`--force` applies only to the derived `timeline.json`. It is fine here, but say so the first time.)

## Step 6a: contact sheet (stop and ask)
```bash
node SKILL/scripts/render.js stills --timeline work/timeline.json --aspect 9x16 --out stills
node SKILL/scripts/render.js stills --timeline work/timeline.json --aspect 16x9 --out stills
```
This renders one labelled still per shot plus one for every FX moment, tiled into
`stills/contact_sheet_<aspect>.png`. **Show both to the user and wait for approval** before the full render.
Apply any notes to `episode.json`, rebuild, and re-render the stills.

## Step 6b: full render (only after approval)
```bash
node SKILL/scripts/render.js video --timeline work/timeline.json --aspect 9x16 --out work/video_9x16.mp4
node SKILL/scripts/render.js video --timeline work/timeline.json --aspect 16x9 --out work/video_16x9.mp4
node SKILL/scripts/mix_audio.js --timeline work/timeline.json --sfx work/sfx --out work/mix.wav
node SKILL/scripts/finalize.js --slug <slug> --mix work/mix.wav --v9 work/video_9x16.mp4 --v16 work/video_16x9.mp4 --outdir final
```
The 16:9 version is **re-laid-out, not cropped**: the same timeline drawn on a landscape canvas.

## Render settings
| output | settings |
|---|---|
| frames | Canvas 2D, 1080×1920 (9:16) / 1920×1080 (16:9), 30 fps, PNG frames piped to ffmpeg, rendered by parallel headless-Chrome workers |
| video | libx264, `-preset slow -tune animation -crf 18`, yuv420p, High profile, GOP 2 s, `+faststart` |
| audio | the original voice MP3s at their aligned positions, level untouched (mono is copied to both channels, never auto-upmixed, which would cost 3 dB), plus SFX at gain 0.55; 48 kHz stereo; safety limiter at -0.26 dBFS (peaks only); AAC 192 kbps |
| reel | `<slug>_reel_9x16.mp4`, 1080×1920 |
| YouTube | `<slug>_youtube_16x9.mp4`, 1920×1080 |
| WhatsApp | `<slug>_whatsapp_720p.mp4`: 720×1280, two-pass libx264 with bitrate sized to stay under 20 MB (capped at 4.5 Mbps; retries lower if over), Main@3.1, AAC 128 kbps |

## Finish
Report each file's path, resolution, duration and size (`finalize.js` prints them), then attach a
frame grab and the files. If any line had low-confidence alignment words, say so.
