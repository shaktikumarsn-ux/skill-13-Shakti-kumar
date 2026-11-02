#!/usr/bin/env node
// Build the soundtrack: every original voice MP3 placed at its line start
// (level untouched) + procedural SFX on the hits. No music unless the user
// asked for it (--music file.mp3 --music-gain 0.12).
//   node mix_audio.js --timeline work/timeline.json --sfx work/sfx --out work/mix.wav [--music m.mp3] [--force]
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const tlPath = opt('timeline'), sfxDir = opt('sfx'), out = opt('out'), music = opt('music'), musicGain = opt('music-gain', '0.12');
if (!tlPath || !sfxDir || !out) { console.error('usage: mix_audio.js --timeline T --sfx DIR --out mix.wav'); process.exit(1); }
if (fs.existsSync(out) && !args.includes('--force')) { console.error(`REFUSING TO OVERWRITE: ${out}\nAsk the user, then re-run with --force.`); process.exit(3); }
const TL = JSON.parse(fs.readFileSync(tlPath, 'utf8'));

const inputs = [], chains = [];
// mono -> stereo by copying the channel (ffmpeg's auto upmix would drop it 3 dB)
const channels = f => parseInt(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=channels', '-of', 'csv=p=0', f]).toString(), 10) || 2;
const add = (file, time, gain, clip) => {
  const i = inputs.length / 2; inputs.push('-i', file);
  const toStereo = channels(file) === 1 ? 'pan=stereo|c0=c0|c1=c0' : 'aformat=channel_layouts=stereo';
  const ms = Math.max(0, Math.round(time * 1000));
  chains.push(`[${i}:a]${clip ? `atrim=start=${clip[0]}:end=${clip[1]},asetpts=PTS-STARTPTS,` : ''}aresample=48000,${toStereo},aformat=sample_fmts=fltp,${gain !== 1 ? `volume=${gain},` : ''}adelay=${ms}|${ms}[a${i}]`);
};
for (const s of TL.shots) if (s.line) add(s.line.audio, s.line.start, 1, s.line.clip); // clip = range inside a combined MP3
for (const x of TL.sfx) { const f = path.join(sfxDir, `${x.name}.wav`); if (!fs.existsSync(f)) { console.error('missing sfx ' + f); process.exit(1); } add(f, x.time, x.gain); }
if (music) add(music, 0, parseFloat(musicGain));
const n = inputs.length / 2;
const graph = chains.join(';') + ';' + Array.from({ length: n }, (_, i) => `[a${i}]`).join('') +
  `amix=inputs=${n}:normalize=0:dropout_transition=0,alimiter=limit=0.97:level=false,apad,atrim=0:${TL.duration},asetpts=N/SR/TB[out]`;
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
const gfile = out + '.filter.txt'; fs.writeFileSync(gfile, graph);
execFileSync('ffmpeg', ['-y', '-v', 'error', ...inputs, '-filter_complex_script', gfile, '-map', '[out]', '-ar', '48000', '-c:a', 'pcm_s16le', out], { stdio: 'inherit' });
fs.unlinkSync(gfile);
console.log(`mix: ${out}  (${n - (music ? 1 : 0) - TL.sfx.length} voice lines, ${TL.sfx.length} sfx${music ? ', music' : ''}, ${TL.duration}s)`);
