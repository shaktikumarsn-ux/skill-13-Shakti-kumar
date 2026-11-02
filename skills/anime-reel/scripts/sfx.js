#!/usr/bin/env node
// Procedural (code-synthesised) sound effects, so every run sounds identical
// and nothing is downloaded. Writes 48 kHz mono 16-bit WAVs.
//   node sfx.js <outDir>
const fs = require('fs'), path = require('path');
const SR = 48000;
const outDir = process.argv[2] || 'sfx';
fs.mkdirSync(outDir, { recursive: true });

let seed = 12345;
const noise = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2147483648 - 1; };
const buf = s => new Float32Array(Math.round(s * SR));

// Chamberlin state-variable filter, cutoff can change per sample
function svf(input, fcFn, q = 0.7, mode = 'bp') {
  let low = 0, band = 0; const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const f = 2 * Math.sin(Math.PI * Math.min(fcFn(i / SR), SR / 6) / SR);
    low += f * band; const high = input[i] - low - q * band; band += f * high;
    out[i] = mode === 'lp' ? low : mode === 'hp' ? high : band;
  }
  return out;
}
const env = (t, a, d) => t < a ? t / a : Math.exp(-(t - a) / d);

const SFX = {
  whoosh() { const b = buf(0.75); for (let i = 0; i < b.length; i++) b[i] = noise();
    const f = svf(b, t => 300 + 2600 * Math.sin(Math.PI * Math.min(1, t / 0.7)), 0.5);
    return f.map((v, i) => { const t = i / SR; return v * Math.sin(Math.PI * Math.min(1, t / 0.72)) ** 2; }); },
  swish() { const b = buf(0.32); for (let i = 0; i < b.length; i++) b[i] = noise();
    const f = svf(b, t => 1200 + 5000 * (t / 0.32), 0.45);
    return f.map((v, i) => v * Math.sin(Math.PI * (i / b.length)) ** 1.5); },
  impact() { const b = buf(1.0); let ph = 0;
    for (let i = 0; i < b.length; i++) { const t = i / SR; const fr = 45 + 95 * Math.exp(-t / 0.06); ph += 2 * Math.PI * fr / SR;
      b[i] = Math.sin(ph) * env(t, 0.002, 0.28) + noise() * env(t, 0.001, 0.035) * 0.9; }
    const lp = svf(b, () => 2500, 0.8, 'lp');
    return lp.map(v => Math.tanh(v * 2.2)); },
  rumble() { const b = buf(0.9); for (let i = 0; i < b.length; i++) b[i] = noise();
    const lp = svf(svf(b, () => 140, 0.9, 'lp'), () => 160, 0.9, 'lp');
    return lp.map((v, i) => { const t = i / SR; return v * env(t, 0.03, 0.3) * (0.7 + 0.3 * Math.sin(t * 2 * Math.PI * 13)); }); },
  pop() { const b = buf(0.16); let ph = 0;
    for (let i = 0; i < b.length; i++) { const t = i / SR; ph += 2 * Math.PI * (380 + 1300 * (t / 0.16)) / SR; b[i] = Math.sin(ph) * env(t, 0.002, 0.045); } return b; },
  boing() { const b = buf(0.7); let ph = 0;
    for (let i = 0; i < b.length; i++) { const t = i / SR; const fr = 170 + 140 * (t / 0.7) + 40 * Math.sin(2 * Math.PI * 11 * t) * Math.exp(-t / 0.4);
      ph += 2 * Math.PI * fr / SR; b[i] = (Math.sin(ph) + 0.3 * Math.sin(2 * ph)) * env(t, 0.005, 0.25); } return b; },
  sparkle() { const b = buf(1.0); const notes = [2093, 2637, 3136, 4186, 3520];
    notes.forEach((f, k) => { const st = k * 0.07; for (let i = Math.round(st * SR); i < b.length; i++) { const t = i / SR - st; b[i] += Math.sin(2 * Math.PI * f * t) * env(t, 0.002, 0.16) * 0.5; } }); return b; },
  ding() { const b = buf(1.3); const p = [[880, 1], [880 * 2.76, 0.45], [880 * 5.4, 0.2]];
    for (let i = 0; i < b.length; i++) { const t = i / SR; for (const [f, a] of p) b[i] += Math.sin(2 * Math.PI * f * t) * a * env(t, 0.002, 0.35 / (f / 880) ** 0.5); } return b; },
};

function writeWav(file, data) {
  let peak = 0; for (const v of data) peak = Math.max(peak, Math.abs(v));
  const g = peak > 0 ? 0.89 / peak : 1;
  const b = Buffer.alloc(44 + data.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + data.length * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(data.length * 2, 40);
  data.forEach((v, i) => b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * g * 32767))), 44 + i * 2));
  fs.writeFileSync(file, b);
}
for (const [name, fn] of Object.entries(SFX)) writeWav(path.join(outDir, `${name}.wav`), fn());
console.log(`sfx written to ${outDir}: ${Object.keys(SFX).join(', ')}`);
