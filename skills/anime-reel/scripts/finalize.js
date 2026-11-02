#!/usr/bin/env node
// Mux rendered video + mix into the deliverables:
//   <slug>_reel_9x16.mp4      1080x1920  H.264 CRF18 + AAC 192k
//   <slug>_youtube_16x9.mp4   1920x1080  H.264 CRF18 + AAC 192k
//   <slug>_whatsapp_720p.mp4  720x1280   two-pass H.264 sized to < 20 MB
//   node finalize.js --slug ep01 --mix work/mix.wav --v9 work/video_9x16.mp4 --v16 work/video_16x9.mp4 --outdir final [--force]
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const slug = opt('slug', 'episode'), mix = opt('mix'), v9 = opt('v9'), v16 = opt('v16'), outdir = opt('outdir', 'final');
const force = args.includes('--force');
const LIMIT = 20 * 1000 * 1000; // WhatsApp-safe: stay under 20 MB (decimal, the stricter reading)
fs.mkdirSync(outdir, { recursive: true });
const targets = { reel: path.join(outdir, `${slug}_reel_9x16.mp4`), yt: path.join(outdir, `${slug}_youtube_16x9.mp4`), wa: path.join(outdir, `${slug}_whatsapp_720p.mp4`) };
const clash = Object.values(targets).filter(p => fs.existsSync(p));
if (clash.length && !force) { console.error('REFUSING TO OVERWRITE:\n  ' + clash.join('\n  ') + '\nAsk the user, then re-run with --force.'); process.exit(3); }
const ff = a => execFileSync('ffmpeg', ['-y', '-v', 'error', ...a], { stdio: 'inherit' });
const probe = f => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', f]).toString());

const mux = (v, o) => ff(['-i', v, '-i', mix, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-shortest', '-movflags', '+faststart', o]);
if (v9) mux(v9, targets.reel);
if (v16) mux(v16, targets.yt);

if (v9) {
  const dur = parseFloat(probe(targets.reel).format.duration);
  const audioK = 128;
  let videoK = Math.min(4500, Math.floor((LIMIT * 8 * 0.94) / dur / 1000) - audioK);
  const passlog = path.join(outdir, `.${slug}_2pass`);
  for (let attempt = 0; attempt < 4; attempt++) {
    const common = ['-vf', 'scale=720:1280:flags=lanczos', '-c:v', 'libx264', '-preset', 'slow', '-tune', 'animation', '-b:v', `${videoK}k`,
      '-maxrate', `${Math.round(videoK * 1.5)}k`, '-bufsize', `${videoK * 2}k`, '-pix_fmt', 'yuv420p', '-profile:v', 'main', '-level', '3.1', '-passlogfile', passlog];
    ff(['-i', targets.reel, ...common, '-pass', '1', '-an', '-f', 'mp4', '/dev/null']);
    ff(['-i', targets.reel, ...common, '-pass', '2', '-c:a', 'aac', '-b:a', `${audioK}k`, '-ar', '48000', '-movflags', '+faststart', targets.wa]);
    if (fs.statSync(targets.wa).size < LIMIT) break;
    videoK = Math.floor(videoK * 0.85);
  }
  for (const f of fs.readdirSync(outdir)) if (f.startsWith(`.${slug}_2pass`)) fs.unlinkSync(path.join(outdir, f));
}
for (const p of Object.values(targets)) if (fs.existsSync(p)) {
  const j = probe(p), v = j.streams.find(s => s.codec_type === 'video'), a = j.streams.find(s => s.codec_type === 'audio');
  console.log(`${p}\n   ${v.width}x${v.height} ${v.codec_name} ${(([n, d]) => (n / (d || 1)).toFixed(2))(v.r_frame_rate.split('/').map(Number))}fps | ${a ? a.codec_name + ' ' + a.sample_rate + 'Hz' : 'no audio'} | ${(+j.format.duration).toFixed(2)}s | ${(fs.statSync(p).size / 1e6).toFixed(2)} MB`);
}
if (fs.existsSync(targets.wa) && fs.statSync(targets.wa).size >= LIMIT) { console.error('WARNING: WhatsApp copy is still >= 20 MB'); process.exit(4); }
