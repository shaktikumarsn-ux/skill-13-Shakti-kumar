#!/usr/bin/env node
// anime-reel renderer driver: headless Chrome (Playwright) draws each frame on
// an HTML canvas; frames are piped as PNG into ffmpeg (libx264).
//
//   node render.js sheet  --timeline work/timeline.json --out sheets/            [--force]
//   node render.js stills --timeline work/timeline.json --aspect 9x16 --out stills/ [--force]
//   node render.js video  --timeline work/timeline.json --aspect 9x16 --out work/video_9x16.mp4 [--workers 4] [--force]
const fs = require('fs'), path = require('path'), os = require('os');
const { spawn, execFileSync } = require('child_process');

function loadPlaywright() {
  try { return require('playwright'); } catch (_) {}
  try { const g = execFileSync('npm', ['root', '-g']).toString().trim(); return require(path.join(g, 'playwright')); } catch (_) {}
  console.error('Playwright not found. Run scripts/setup.sh first.'); process.exit(1);
}
const { chromium } = loadPlaywright();

const args = process.argv.slice(2);
const mode = args[0];
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const flag = k => args.includes('--' + k);
const tlPath = opt('timeline'); const epPath = opt('episode'); const out = opt('out'); const aspect = opt('aspect', '9x16');
const force = flag('force');
if (!mode || !(tlPath || (mode.startsWith('sheet') && epPath)) || !out) { console.error('usage: render.js sheet --episode E --out DIR | stills|video --timeline T --out O [--aspect 9x16|16x9]'); process.exit(1); }
// sheets can be drawn straight from episode.json (before alignment exists)
const TL = tlPath ? JSON.parse(fs.readFileSync(tlPath, 'utf8')) : (() => {
  const ep = JSON.parse(fs.readFileSync(epPath, 'utf8'));
  return { title: ep.title || '', fps: ep.fps || 30, duration: 0, frames: 0, shots: [], captions: [], sfx: [], caption: {},
    characters: Object.fromEntries(Object.entries(ep.characters || {}).map(([id, c]) => [id, { name: c.name || id, color: c.color || '#ffd23f', design: c.design || {} }])) };
})();
const SKILL = path.resolve(__dirname, '..');

function guard(p) {
  if (fs.existsSync(p) && !force) { console.error(`REFUSING TO OVERWRITE: ${p}\nAsk the user, then re-run with --force.`); process.exit(3); }
}

async function newPage(browser, w, h) {
  const page = await browser.newPage({ viewport: { width: Math.min(w, 1920), height: Math.min(h, 1920) } });
  page.on('pageerror', e => console.error('[page error]', e.message));
  await page.setContent('<!doctype html><html><body style="margin:0;background:#000"><canvas id="c"></canvas></body></html>');
  const fonts = {
    Baloo2: fs.readFileSync(path.join(SKILL, 'assets/fonts/Baloo2-ExtraBold.ttf')).toString('base64'),
    Bangers: fs.readFileSync(path.join(SKILL, 'assets/fonts/Bangers-Regular.ttf')).toString('base64'),
  };
  await page.evaluate(async fonts => {
    const buf = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
    const f1 = new FontFace('Baloo2', buf(fonts.Baloo2), { weight: '800' });
    const f2 = new FontFace('Bangers', buf(fonts.Bangers));
    await f1.load(); await f2.load(); document.fonts.add(f1); document.fonts.add(f2);
  }, fonts);
  for (const f of ['characters.js', 'backgrounds.js', 'fx.js', 'engine.js']) await page.addScriptTag({ path: path.join(SKILL, 'renderer', f) });
  return page;
}
const grab = page => page.evaluate(() => document.getElementById('c').toDataURL('image/png').split(',')[1]);

async function sheets() {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const page = await newPage(browser, 2400, 1500);
  await page.evaluate(tl => Engine.init(tl, '16x9'), TL);
  for (const id of Object.keys(TL.characters)) {
    const p = path.join(out, `${id}.png`); guard(p);
    await page.evaluate(id => Engine.drawSheet(id), id);
    fs.writeFileSync(p, Buffer.from(await grab(page), 'base64'));
    console.log('sheet', p);
  }
  await browser.close();
}

function stillTimes() {
  // one still per shot (mid-line, or the moment of its first FX) + every FX moment
  const list = [];
  const fmt = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
  for (const s of TL.shots) {
    const mid = s.line ? s.line.start + s.line.duration * 0.45 : (s.start + s.end) / 2;
    list.push({ t: mid, label: `${s.id} · ${s.framing}/${s.camera} · ${fmt(mid)}` });
    for (const f of s.fx || []) {
      const t = f.start + Math.min(f.dur * 0.4, f.type === 'impact' ? 0.04 : 0.35);
      list.push({ t, label: `${s.id} · ${f.type}${f.reaction ? ':' + f.reaction : ''} · ${fmt(t)}` });
    }
  }
  return list.sort((a, b) => a.t - b.t);
}

async function stills() {
  const dir = path.join(out, aspect); fs.mkdirSync(dir, { recursive: true });
  const contact = path.join(out, `contact_sheet_${aspect}.png`); guard(contact);
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.png')) fs.unlinkSync(path.join(dir, f));
  const browser = await chromium.launch();
  const page = await newPage(browser, 1920, 1920);
  await page.evaluate(([tl, a]) => Engine.init(tl, a), [TL, aspect]);
  const list = stillTimes();
  for (let i = 0; i < list.length; i++) {
    const fi = Math.min(TL.frames - 1, Math.round(list[i].t * TL.fps));
    await page.evaluate(([fi, label]) => Engine.renderFrame(fi, { label }), [fi, list[i].label]);
    fs.writeFileSync(path.join(dir, `${String(i + 1).padStart(3, '0')}.png`), Buffer.from(await grab(page), 'base64'));
  }
  await browser.close();
  const cols = aspect === '16x9' ? 4 : 6, rows = Math.ceil(list.length / cols), tw = aspect === '16x9' ? 480 : 300;
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-framerate', '1', '-i', path.join(dir, '%03d.png'),
    '-vf', `scale=${tw}:-2:flags=lanczos,tile=${cols}x${rows}:padding=10:margin=10:color=0x16121c`, '-frames:v', '1', contact]);
  console.log(`contact sheet (${list.length} stills): ${contact}`);
}

// x264 settings shared by every segment so they can be concatenated losslessly
const X264 = ['-c:v', 'libx264', '-preset', 'slow', '-tune', 'animation', '-crf', '18', '-pix_fmt', 'yuv420p',
  '-profile:v', 'high', '-g', String((TL.fps || 30) * 2), '-bf', '2', '-movflags', '+faststart'];

async function renderSegment(browser, from, to, segPath) {
  const page = await newPage(browser, 1920, 1920);
  await page.evaluate(([tl, a]) => Engine.init(tl, a), [TL, aspect]);
  const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(TL.fps), '-c:v', 'png', '-i', '-',
    ...X264, '-r', String(TL.fps), segPath], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', c => c === 0 ? res() : rej(new Error('ffmpeg exit ' + c))));
  for (let fi = from; fi < to; fi++) {
    await page.evaluate(fi => Engine.renderFrame(fi), fi);
    const buf = Buffer.from(await grab(page), 'base64');
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if ((fi - from) % 60 === 0) process.stdout.write(`  [${path.basename(segPath)}] frame ${fi}/${to}\n`);
  }
  ff.stdin.end(); await done; await page.close();
}

async function video() {
  guard(out);
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  const workers = Math.max(1, Math.min(parseInt(opt('workers', String(Math.max(1, os.cpus().length))), 10), 8));
  const N = TL.frames, per = Math.ceil(N / workers);
  const segDir = path.join(path.dirname(path.resolve(out)), `segments_${aspect}`); fs.mkdirSync(segDir, { recursive: true });
  const t0 = Date.now();
  const jobs = [];
  for (let w = 0; w < workers; w++) {
    const from = w * per, to = Math.min(N, from + per); if (from >= to) break;
    const seg = path.join(segDir, `seg_${String(w).padStart(2, '0')}.mp4`);
    jobs.push((async () => { const b = await chromium.launch(); try { await renderSegment(b, from, to, seg); } finally { await b.close(); } return seg; })());
  }
  const segs = await Promise.all(jobs);
  const list = path.join(segDir, 'list.txt');
  fs.writeFileSync(list, segs.map(s => `file '${s.replace(/'/g, "'\\''")}'`).join('\n'));
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', out]);
  fs.rmSync(segDir, { recursive: true, force: true });
  console.log(`video ${aspect}: ${out}  (${N} frames, ${((Date.now() - t0) / 1000).toFixed(1)}s, ${workers} workers)`);
}

({ sheet: sheets, sheets, stills, video }[mode] || (() => { console.error('unknown mode ' + mode); process.exit(1); }))()
  .catch(e => { console.error(e); process.exit(1); });
