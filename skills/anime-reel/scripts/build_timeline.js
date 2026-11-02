#!/usr/bin/env node
// Combine episode.json (shot list) + alignment.json (forced-aligned word
// times + loudness envelopes from align.py) into work/timeline.json — the
// single source of truth for rendering frames, captions and the audio mix.
//
//   node build_timeline.js --episode episode.json --alignment work/alignment.json --out work/timeline.json [--force]
const fs = require('fs'), path = require('path');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const epPath = opt('episode'), alPath = opt('alignment'), out = opt('out');
if (!epPath || !alPath || !out) { console.error('usage: build_timeline.js --episode E --alignment A --out T'); process.exit(1); }
if (fs.existsSync(out) && !args.includes('--force')) { console.error(`REFUSING TO OVERWRITE: ${out}\nAsk the user, then re-run with --force.`); process.exit(3); }
const EP = JSON.parse(fs.readFileSync(epPath, 'utf8'));
const AL = JSON.parse(fs.readFileSync(alPath, 'utf8'));
const epDir = path.dirname(path.resolve(epPath));

const FX_TYPES = { speed_lines: 0.9, impact: 0.2, shake: 0.45, chibi: 1.3, zoom_punch: 0.5, flash: 0.2 };
const CHIBI_REACTIONS = ['shock', 'anger', 'sparkle', 'sweat', 'cry', 'happy'];
const CHIBI_SFX = { shock: 'ding', anger: 'pop', sparkle: 'sparkle', sweat: 'pop', cry: 'boing', happy: 'sparkle' };
const FX_SFX = { speed_lines: 'whoosh', impact: 'impact', shake: 'rumble', zoom_punch: 'swish', flash: null };
const SFX_NAMES = ['whoosh', 'swish', 'impact', 'rumble', 'pop', 'boing', 'sparkle', 'ding'];
const CAMERAS = ['static', 'push_in', 'pull_out', 'pan_left', 'pan_right', 'tilt_up', 'tilt_down', 'dutch', 'whip_in'];
const FRAMINGS = ['close', 'medium', 'establishing'];
const LOCATIONS = ['room', 'office', 'cafe', 'street', 'rooftop', 'abstract'];
const EXPR = ['neutral', 'happy', 'joy', 'angry', 'sad', 'worried', 'shocked', 'smug', 'determined'];

const errors = [];
const fps = EP.fps || 30;
const chars = EP.characters || {};
for (const [id, c] of Object.entries(chars)) { if (!c.color) errors.push(`character ${id}: missing caption "color"`); if (!c.name) c.name = id; }

let t = 0;
const shots = [], captions = [], sfx = [];
const maxWords = (EP.caption && EP.caption.maxWords) || 3;

for (const [i, s] of (EP.shots || []).entries()) {
  const id = s.id || `s${String(i + 1).padStart(2, '0')}`;
  const where = `shot ${id}`;
  const cast = s.cast || (s.speaker ? [s.speaker] : []);
  for (const c of cast) if (!chars[c]) errors.push(`${where}: unknown character "${c}"`);
  if (s.speaker && !chars[s.speaker]) errors.push(`${where}: unknown speaker "${s.speaker}"`);
  const camera = s.camera || 'static', framing = s.framing || (cast.length > 1 ? 'medium' : 'close');
  if (!CAMERAS.includes(camera)) errors.push(`${where}: camera "${camera}" not in ${CAMERAS}`);
  if (!FRAMINGS.includes(framing)) errors.push(`${where}: framing "${framing}" not in ${FRAMINGS}`);
  if (!LOCATIONS.includes(s.location || 'abstract')) errors.push(`${where}: location "${s.location}" not in ${LOCATIONS}`);
  for (const [c, e] of Object.entries(s.expressions || {})) if (!EXPR.includes(e)) errors.push(`${where}: expression "${e}" for ${c} not in ${EXPR}`);

  const pre = s.pre ?? (s.line ? 0.2 : 0), post = s.post ?? (s.line ? 0.35 : 0);
  let line = null, words = [];
  if (s.line) {
    const a = AL.lines && AL.lines[id];
    if (!a) { errors.push(`${where}: no alignment found — run align.py`); continue; }
    const start = t + pre;
    words = a.words.map(w => ({ text: w.text, start: +(start + w.start).toFixed(4), end: +(start + w.end).toFixed(4) }));
    line = { speaker: s.speaker, audio: path.resolve(epDir, s.line.audio), clip: s.line.clip || null, start: +start.toFixed(4), duration: a.duration, env: a.env, words };
  }
  const natural = pre + (line ? line.duration : 0) + post;
  const dur = Math.max(natural, s.hold || 0, line ? 0 : 1.5);
  const shot = {
    id, speaker: s.speaker || cast[0], cast, location: s.location || 'abstract', time: s.time || 'day', camera, framing,
    expressions: s.expressions || {}, start: +t.toFixed(4), end: +(t + dur).toFixed(4), line, fx: [], exprChanges: [],
    bgSeed: s.bgSeed || (s.location || 'abstract').length * 101 + 7,
  };
  const at = (spec, label) => {
    if (spec.word != null) {
      if (!line) { errors.push(`${where}: ${label} uses "word" but shot has no line`); return shot.start; }
      const w = words[spec.word];
      if (!w) { errors.push(`${where}: ${label} word index ${spec.word} out of range (0..${words.length - 1})`); return shot.start; }
      return w.start + (spec.offset || 0);
    }
    if (spec.at === 'end') return shot.end - 0.3;
    return shot.start + (spec.at || 0);
  };
  for (const f of s.fx || []) {
    if (!(f.type in FX_TYPES)) { errors.push(`${where}: fx type "${f.type}" not in ${Object.keys(FX_TYPES)}`); continue; }
    if (f.type === 'chibi' && !CHIBI_REACTIONS.includes(f.reaction)) errors.push(`${where}: chibi reaction "${f.reaction}" not in ${CHIBI_REACTIONS}`);
    const start = at(f, f.type);
    const fx = { ...f, start: +start.toFixed(4), dur: f.dur || FX_TYPES[f.type] };
    if (f.type === 'chibi') fx.char = f.char || shot.speaker;
    shot.fx.push(fx);
    const name = f.sfx === false ? null : (f.sfx || (f.type === 'chibi' ? CHIBI_SFX[f.reaction] : FX_SFX[f.type]));
    if (name) sfx.push({ name, time: +Math.max(0, start - (name === 'whoosh' ? 0.12 : 0)).toFixed(4), gain: f.sfxGain ?? 0.55 });
  }
  for (const x of s.sfx || []) {
    if (!SFX_NAMES.includes(x.name)) { errors.push(`${where}: sfx "${x.name}" not in ${SFX_NAMES}`); continue; }
    sfx.push({ name: x.name, time: +at(x, 'sfx').toFixed(4), gain: x.gain ?? 0.55 });
  }
  for (const c of s.expr_at || []) shot.exprChanges.push({ char: c.char || shot.speaker, expr: c.expr, time: at(c, 'expr_at') });

  // captions: 2–3 word chunks, break on punctuation or pauses
  if (line && words.length) {
    const color = chars[s.speaker]?.color || '#ffd23f';
    let chunk = [];
    const flush = () => { if (chunk.length) captions.push({ speaker: s.speaker, color, words: chunk }); chunk = []; };
    words.forEach((w, k) => {
      chunk.push(w);
      const next = words[k + 1];
      const punct = /[.,!?;:।…—-]$/.test(w.text);
      const pause = next && next.start - w.end > 0.4;
      if (chunk.length >= maxWords || punct || pause || !next) flush();
    });
  }
  shots.push(shot);
  t += dur;
}

// caption display windows: from first word to next caption (no flicker), capped
for (let i = 0; i < captions.length; i++) {
  const c = captions[i], n = captions[i + 1], last = c.words[c.words.length - 1];
  c.start = c.words[0].start;
  let end = last.end + 0.45;
  if (n && n.words[0].start - last.end < 0.3) end = n.words[0].start;
  if (n) end = Math.min(end, n.words[0].start);
  c.end = +Math.min(end, t).toFixed(4);
}

if (errors.length) { console.error('episode.json problems:\n - ' + errors.join('\n - ')); process.exit(2); }

const duration = +t.toFixed(4);
const TL = {
  title: EP.title || '', slug: EP.slug || 'episode', fps, duration, frames: Math.round(duration * fps),
  animateOnTwos: EP.animateOnTwos !== false,
  caption: { uppercase: EP.caption?.uppercase !== false, maxWords },
  characters: Object.fromEntries(Object.entries(chars).map(([id, c]) => [id, { name: c.name, color: c.color, design: c.design || {} }])),
  shots, captions, sfx,
};
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(out, JSON.stringify(TL));
console.log(`timeline: ${out}\n  ${shots.length} shots, ${duration.toFixed(2)}s, ${TL.frames} frames @${fps}, ${captions.length} captions, ${sfx.length} sfx`);
for (const s of shots) console.log(`  ${s.id.padEnd(5)} ${s.start.toFixed(2).padStart(6)}–${s.end.toFixed(2).padEnd(6)} ${s.speaker || '-'} @${s.location}/${s.time} ${s.framing}/${s.camera}${s.fx.length ? ' fx:' + s.fx.map(f => f.type + (f.reaction ? ':' + f.reaction : '')).join(',') : ''}`);
