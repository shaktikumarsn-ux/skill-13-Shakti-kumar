# episode.json — the shot list

Write this file in step 1. Everything is rendered from it plus the forced
alignment, so it is the only place creative decisions live. Paths are relative
to the folder that contains `episode.json`.

```json
{
  "title": "Zero Se Freelance — Ep 3",
  "slug": "zsf_ep03",
  "fps": 30,
  "caption": { "maxWords": 3, "uppercase": true },
  "characters": {
    "arjun": {
      "name": "Arjun", "color": "#38bdf8",
      "design": {
        "skin": "#f1c7a3",
        "hair": { "style": "spiky", "color": "#1f1d2b" },
        "eyes": "#3b82f6",
        "outfit": { "type": "hoodie", "color": "#2563eb", "accent": "#f8fafc" },
        "accessory": "headphones"
      }
    }
  },
  "shots": [
    {
      "id": "s01",
      "speaker": "arjun",
      "cast": ["arjun", "meera"],
      "location": "room", "time": "night",
      "framing": "medium", "camera": "push_in",
      "expressions": { "arjun": "worried", "meera": "neutral" },
      "line": { "audio": "voice/01_arjun.mp3", "text": "Client ne 5000{paanch_hazaar} mein logo maanga!" },
      "fx": [
        { "type": "speed_lines", "word": 4, "text": "DOOM" },
        { "type": "chibi", "word": 5, "reaction": "shock", "char": "meera" }
      ],
      "expr_at": [{ "word": 5, "char": "arjun", "expr": "shocked" }],
      "sfx": [{ "name": "ding", "word": 0, "gain": 0.4 }],
      "pre": 0.2, "post": 0.35
    }
  ]
}
```

## Characters
| field | values |
|---|---|
| `color` | the speaker's caption colour (hex). Keep these distinct across the cast. |
| `hair.style` | `spiky` · `messy` · `bob` · `long` · `ponytail` |
| `outfit.type` | `hoodie` · `shirt` · `blazer` (optional `tie` colour) · `tee` · `kurta` |
| `accessory` | `none` · `glasses` · `headphones` |
| `eyeSize` | 0.85–1.15 (default 1) |
| colours | `skin`, `hair.color`, `eyes`, `outfit.color`, `outfit.accent`. The renderer derives the single shade tone automatically. |

Once the character sheets are approved, **never change a design** mid-episode or between
episodes of the same series. Copy the `characters` block unchanged.

## Shots
| field | values / meaning |
|---|---|
| `speaker` | who talks in this shot (their mouth follows the loudness of `line.audio`) |
| `cast` | who is on screen (1–3). `close` framing shows only the speaker. |
| `location` | `room` · `office` · `cafe` · `street` · `rooftop` · `abstract` |
| `time` | `day` · `evening` · `night` |
| `framing` | `close` (speaker, head and shoulders) · `medium` (cast waist-up, side by side) · `establishing` (background only) |
| `camera` | `static` · `push_in` · `pull_out` · `pan_left` · `pan_right` · `tilt_up` · `tilt_down` · `dutch` · `whip_in` |
| `expressions` | per character: `neutral` `happy` `joy` `angry` `sad` `worried` `shocked` `smug` `determined` |
| `expr_at` | expression change at a word: `{word, char, expr}` |
| `line.audio` | that line's voice MP3, which is used unaltered in the final mix |
| `line.text` | exactly what is said, in the script's own spelling (Hindi, Devanagari or Hinglish all work). Digits need a spoken form: `5000{paanch_hazaar}`. |
| `pre` / `post` | silence before and after the line inside the shot (default 0.2 / 0.35 s) |
| `hold` | minimum shot length in seconds (silent shots default to 1.5 s) |

`word` is a **0-based index into the line's words** (punctuation-only tokens are
merged into the previous word). Timing comes from forced alignment, so a
`word` anchor lands exactly on that spoken word. Use `at` (seconds from the
shot start, or `"end"`) only on silent shots.

## FX (anime tricks)
Use them on key lines only: the punchline, a reveal, anger or shock. Plan roughly one
trick per 1–2 lines; too many effects stops them landing.

| type | default dur | default sfx | notes |
|---|---|---|---|
| `speed_lines` | 0.9 s | whoosh | focus lines plus a pale backdrop in the speaker's colour; optional `text`, `intensity` |
| `impact` | 0.2 s | impact | 6-frame black-and-white/red impact frame with burst lines; optional `text` ("BAAM!") |
| `shake` | 0.45 s | rumble | screen shake; `intensity` 0.5–2 |
| `zoom_punch` | 0.5 s | swish | fast zoom on the speaker |
| `chibi` | 1.3 s | by reaction | cutaway to a chibi; `reaction`: `shock` `anger` `sparkle` `sweat` `cry` `happy`; `char` (default speaker). Lip-sync continues if that character is talking. |
| `flash` | 0.2 s | — | white flash |

Every FX also takes `sfx` (a name or `false`), `sfxGain` (default 0.55) and `dur`.
SFX names: `whoosh` `swish` `impact` `rumble` `pop` `boing` `sparkle` `ding`.
