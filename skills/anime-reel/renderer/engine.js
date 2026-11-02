// anime-reel — frame engine. Driven by work/timeline.json (built by
// scripts/build_timeline.js). Exposes window.Engine for scripts/render.js.
(function () {
  const C = window.AnimeChar, BG = window.AnimeBG, FX = window.AnimeFX;
  let TL, W, H, ASPECT, canvas, ctx, tmp, bgCache = new Map(), blinkTimes = {};

  const smooth = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
  const hash = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const BG_SCALE = 1.4;

  function init(timeline, aspect) {
    TL = timeline; ASPECT = aspect;
    [W, H] = aspect === '16x9' ? [1920, 1080] : [1080, 1920];
    canvas = document.getElementById('c'); canvas.width = W; canvas.height = H;
    ctx = canvas.getContext('2d');
    tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H;
    bgCache = new Map();
    // deterministic blink schedule per character
    blinkTimes = {};
    for (const id of Object.keys(TL.characters)) {
      const R = BG.rng(hash(id)); const arr = []; let t = 0.6 + R() * 1.2;
      while (t < TL.duration + 5) { arr.push(t); if (R() < 0.18) arr.push(t + 0.28); t += 2.2 + R() * 2.8; }
      blinkTimes[id] = arr;
    }
    return { W, H, frames: TL.frames, fps: TL.fps };
  }

  function bgCanvas(shot) {
    const key = `${shot.location}|${shot.time}|${shot.bgSeed}`;
    if (!bgCache.has(key)) {
      const c = document.createElement('canvas'); c.width = Math.round(W * BG_SCALE); c.height = Math.round(H * BG_SCALE);
      const accent = TL.characters[shot.speaker]?.color;
      BG.drawBackground(c.getContext('2d'), c.width, c.height, shot.location, shot.time, shot.bgSeed, accent);
      bgCache.set(key, c);
    }
    return bgCache.get(key);
  }

  // ---------- layout ----------
  function layout(shot) {
    const cast = shot.framing === 'establishing' ? [] : shot.framing === 'close' ? [shot.speaker || shot.cast[0]] : shot.cast;
    const n = Math.max(1, cast.length), portrait = H > W;
    const capClose = portrait ? H * 0.00122 : H * 0.0017;
    const cap = shot.framing === 'close' ? capClose : capClose * (n >= 3 ? 0.62 : 0.74);
    const s = Math.min(cap, (W / n) / 390);
    const headY = shot.framing === 'close' ? H * (portrait ? 0.40 : 0.45) : H * (portrait ? 0.47 : 0.47);
    const xs = n === 1 ? [0.5] : n === 2 ? (portrait ? [0.28, 0.72] : [0.33, 0.67]) : cast.map((_, i) => (i + 0.5) / n);
    return cast.map((id, i) => ({ id, x: W * xs[i], y: headY, s: s * (id === shot.speaker && n > 1 ? 1.04 : 1) }));
  }

  // ---------- per-character state ----------
  function mouthAt(shot, id, t) {
    const ln = shot.line;
    if (!ln || ln.speaker !== id) return 0;
    const rel = t - ln.start;
    if (rel < 0 || rel > ln.duration) return 0;
    let idx = Math.floor(rel * TL.fps);
    if (TL.animateOnTwos) idx -= idx % 2;                  // anime "on twos"
    const v = ln.env[Math.min(idx, ln.env.length - 1)] || 0;
    return v < 0.12 ? 0 : v < 0.38 ? 0.3 : v < 0.68 ? 0.62 : 1.0; // 4 mouth shapes
  }
  function eyeOpenAt(id, t) {
    for (const b of blinkTimes[id] || []) { const d = t - b; if (d >= 0 && d < 0.16) return Math.abs(d - 0.08) / 0.08; if (b > t) break; }
    return 1;
  }
  function exprAt(shot, id, t) {
    let e = (shot.expressions && shot.expressions[id]) || 'neutral';
    for (const c of shot.exprChanges || []) if (c.char === id && t >= c.time) e = c.expr;
    return e;
  }
  function charState(shot, id, t, myX, speakerX) {
    const ph = (hash(id) % 1000) / 1000 * Math.PI * 2;
    const mouth = mouthAt(shot, id, t);
    const speaking = shot.line && shot.line.speaker === id && t >= shot.line.start && t <= shot.line.start + shot.line.duration;
    const gaze = speakerX == null || id === shot.speaker ? Math.sin(t * 0.7 + ph) * 0.15 : Math.sign(speakerX - myX) * 0.85;
    return {
      expr: exprAt(shot, id, t), mouth, eyeOpen: eyeOpenAt(id, t), gaze,
      breath: (Math.sin(t * Math.PI * 2 / 3.4 + ph) + 1) / 2,
      bob: Math.sin(t * Math.PI * 2 / 2.7 + ph) * 2.5,
      tilt: Math.sin(t * 1.3 + ph) * 0.012 + (speaking ? Math.sin(t * 3.1 + ph) * 0.018 : 0),
      headDy: -mouth * 3,
      sway: Math.sin(t * 2.2 + ph),
    };
  }

  // ---------- camera ----------
  function camera(shot, t, lay, active) {
    const ls = t - shot.start, dur = shot.end - shot.start, p = smooth(ls / dur);
    const sp = lay.find(l => l.id === shot.speaker) || lay[0];
    const anchor = sp ? { x: sp.x, y: sp.y } : { x: W / 2, y: H / 2 };
    let z = 1, tx = 0, ty = 0, rot = 0, whip = 0;
    switch (shot.camera) {
      case 'push_in': z = 1 + 0.12 * p; break;
      case 'pull_out': z = 1.12 - 0.12 * p; break;
      case 'pan_left': tx = W * 0.05 * (2 * p - 1); z = 1.06; break;
      case 'pan_right': tx = -W * 0.05 * (2 * p - 1); z = 1.06; break;
      case 'tilt_up': ty = H * 0.04 * (2 * p - 1); z = 1.06; break;
      case 'tilt_down': ty = -H * 0.04 * (2 * p - 1); z = 1.06; break;
      case 'dutch': rot = 0.08; z = 1.08 + 0.04 * p; break;
      case 'whip_in': { const k = Math.min(1, ls / 0.28); tx = W * 0.9 * Math.pow(1 - smooth(k), 2); whip = 1 - k; z = 1.02; break; }
      default: z = 1;
    }
    for (const f of active) {
      const age = t - f.start, k = age / f.dur;
      if (f.type === 'shake') { const a = W * 0.028 * (f.intensity || 1) * (1 - k); tx += Math.sin(age * 83) * a; ty += Math.cos(age * 71) * a * 0.8; rot += Math.sin(age * 59) * 0.012 * (1 - k); }
      if (f.type === 'zoom_punch') { const zz = age < 0.07 ? age / 0.07 : 1 - smooth((age - 0.07) / (f.dur - 0.07)); z *= 1 + 0.16 * (f.intensity || 1) * zz; }
      if (f.type === 'impact') { tx += Math.sin(age * 120) * W * 0.012; }
    }
    return { z, tx, ty, rot, anchor, whip };
  }
  function applyCam(cam, parallax) {
    const z = 1 + (cam.z - 1) * parallax;
    ctx.translate(W / 2, H / 2); ctx.rotate(cam.rot); ctx.translate(-W / 2, -H / 2);
    ctx.translate(cam.tx * parallax, cam.ty * parallax);
    ctx.translate(cam.anchor.x, cam.anchor.y); ctx.scale(z, z); ctx.translate(-cam.anchor.x, -cam.anchor.y);
  }

  // ---------- captions ----------
  function drawCaption(t) {
    const cap = TL.captions.find(c => t >= c.start && t < c.end);
    if (!cap) return;
    const portrait = H > W;
    let size = portrait ? 92 : 76;
    const y = portrait ? H * 0.73 : H * 0.86, maxW = W * 0.88;
    const words = cap.words.map(w => ({ ...w, label: TL.caption.uppercase ? w.text.toUpperCase() : w.text }));
    const setFont = s => { ctx.font = `800 ${s}px Baloo2`; };
    setFont(size);
    const gap = () => size * 0.28;
    let total = words.reduce((a, w) => a + ctx.measureText(w.label).width, 0) + gap() * (words.length - 1);
    if (total > maxW) { size *= maxW / total; setFont(size); total = maxW; }
    let x = W / 2 - total / 2;
    ctx.save(); ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (let i = 0; i < words.length; i++) {
      const w = words[i], ww = ctx.measureText(w.label).width;
      const next = words[i + 1];
      const active = t >= w.start && t < (next ? next.start : Math.max(w.end, w.start + 0.15));
      const age = t - w.start, pop = active ? 1 + 0.13 * Math.max(0, 1 - age / 0.12) : 1;
      ctx.save(); ctx.translate(x + ww / 2, y); ctx.scale(pop, pop); ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillText(w.label, size * 0.04, size * 0.08);
      ctx.lineWidth = size * 0.2; ctx.strokeStyle = '#120c18'; ctx.strokeText(w.label, 0, 0);
      ctx.fillStyle = active ? cap.color : '#ffffff'; ctx.fillText(w.label, 0, 0);
      ctx.restore();
      x += ww + gap();
    }
    ctx.restore();
  }

  // ---------- frame ----------
  function shotAt(t) { let s = TL.shots[0]; for (const sh of TL.shots) if (t >= sh.start) s = sh; return s; }

  function renderFrame(fi, opts = {}) {
    const t = fi / TL.fps;
    const shot = shotAt(t);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.filter = 'none'; ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);
    const active = (shot.fx || []).filter(f => t >= f.start && t < f.start + f.dur);
    const lay = layout(shot);
    const cam = camera(shot, t, lay, active);
    const sp = lay.find(l => l.id === shot.speaker);
    const focal = sp ? { x: sp.x, y: sp.y + 20 } : { x: W / 2, y: H * 0.42 };
    const chibi = active.find(f => f.type === 'chibi');
    const speed = active.find(f => f.type === 'speed_lines');
    const spColor = TL.characters[shot.speaker]?.color || '#7c5cff';

    if (chibi) {
      const age = t - chibi.start;
      FX.chibiBackdrop(ctx, W, H, chibi.reaction, age);
      const id = chibi.char || shot.speaker;
      const st = { reaction: chibi.reaction, t: age, mouth: mouthAt(shot, id, t) };
      const portrait = H > W;
      const pop = age < 0.1 ? 0.3 + 0.95 * (age / 0.1) : age < 0.2 ? 1.25 - 0.25 * ((age - 0.1) / 0.1) : 1;
      let jx = 0, jy = 0;
      if (chibi.reaction === 'anger') { jx = Math.sin(age * 70) * 8; jy = -Math.abs(Math.sin(age * 9)) * 30; }
      if (chibi.reaction === 'shock') jx = Math.sin(age * 110) * 5;
      if (chibi.reaction === 'happy' || chibi.reaction === 'sparkle') jy = -Math.abs(Math.sin(age * 8)) * 40;
      const s = (portrait ? W / 1080 * 2.2 : H / 1080 * 1.45) * pop;
      ctx.save(); ctx.translate(W / 2 + jx, H * (portrait ? 0.38 : 0.42) + jy); ctx.scale(s, s);
      C.drawChibi(ctx, TL.characters[id].design, st);
      ctx.restore();
    } else {
      // background (parallax)
      ctx.save();
      if (speed) {
        FX.speedBackdrop(ctx, W, H, focal.x, focal.y, spColor);
      } else {
        applyCam(cam, 0.6);
        const bg = bgCanvas(shot);
        if (cam.whip > 0) {
          for (let k = 0; k < 6; k++) { ctx.globalAlpha = k === 0 ? 1 : 0.22; ctx.drawImage(bg, -(bg.width - W) / 2 + k * W * 0.03 * cam.whip, -(bg.height - H) / 2); }
          ctx.globalAlpha = 1;
        } else ctx.drawImage(bg, -(bg.width - W) / 2, -(bg.height - H) / 2);
      }
      ctx.restore();
      if (cam.whip > 0.05) FX.motionLines(ctx, W, H, fi, cam.whip);
      // characters
      ctx.save(); applyCam(cam, 1);
      for (const l of lay) {
        const st = charState(shot, l.id, t, l.x, sp ? sp.x : null);
        ctx.save(); ctx.translate(l.x, l.y); ctx.scale(l.s, l.s);
        if (l.id !== shot.speaker && lay.length > 1) ctx.rotate(Math.sign((sp ? sp.x : W / 2) - l.x) * 0.02);
        C.drawCharacter(ctx, TL.characters[l.id].design, st);
        ctx.restore();
      }
      ctx.restore();
      if (speed) FX.focusLines(ctx, W, H, focal.x, focal.y, hash(shot.id) + Math.floor(fi / 2), speed.intensity || 1);
    }
    // impact frame post-process
    const imp = active.find(f => f.type === 'impact');
    if (imp) {
      const k = Math.floor((t - imp.start) * TL.fps);
      FX.impactPost(ctx, canvas, tmp, k, focal.x, focal.y, W, H, fi * 31 + 7);
    }
    for (const f of active) {
      if (f.type === 'flash') FX.flash(ctx, W, H, 0.9 * (1 - (t - f.start) / f.dur));
      if (f.text && (f.type === 'impact' || f.type === 'zoom_punch' || f.type === 'speed_lines' || f.type === 'shake')) {
        const portrait = H > W;
        FX.sfxText(ctx, f.text, W * (portrait ? 0.5 : 0.72), H * (portrait ? 0.16 : 0.22), portrait ? 190 : 160, t - f.start);
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawCaption(t);
    if (opts.label) {
      ctx.font = `800 ${Math.round(W / 26)}px Baloo2`; ctx.textBaseline = 'top';
      const tw = ctx.measureText(opts.label).width;
      ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(0, 0, tw + 40, W / 26 + 30);
      ctx.fillStyle = '#fff'; ctx.fillText(opts.label, 20, 14);
    }
  }

  // ---------- character sheet ----------
  function drawSheet(id) {
    const ch = TL.characters[id];
    W = 2400; H = 1500; canvas.width = W; canvas.height = H; ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f7f4ee'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(0,0,0,0.05)'; ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    const label = (txt, x, y, sz = 30, col = '#2a2236') => { ctx.font = `800 ${sz}px Baloo2`; ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(txt, x, y); };
    const cell = (x, y, w, h, fn, title) => {
      ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, w, h, 18); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = '#d8d2c8'; ctx.lineWidth = 3; ctx.stroke(); ctx.clip();
      fn(x + w / 2, y + h / 2); ctx.restore();
      if (title) label(title, x + w / 2, y + h + 6, 26, '#5a5266');
    };
    const base = { expr: 'neutral', mouth: 0, eyeOpen: 1, gaze: 0, breath: 0.5, bob: 0, tilt: 0, headDy: 0, sway: 0 };
    const fig = (st, s, dy = 0) => (cx, cy) => { ctx.translate(cx, cy + dy); ctx.scale(s, s); C.drawCharacter(ctx, ch.design, { ...base, ...st }); };
    // title + main figure
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.font = '72px Bangers'; ctx.fillStyle = ch.color; ctx.lineWidth = 10; ctx.strokeStyle = '#1d1424'; ctx.lineJoin = 'round';
    ctx.strokeText(ch.name.toUpperCase(), 50, 30); ctx.fillText(ch.name.toUpperCase(), 50, 30);
    ctx.font = '800 26px Baloo2'; ctx.fillStyle = '#5a5266'; ctx.fillText(`character sheet · ${TL.title || ''}`, 52, 112);
    cell(40, 160, 680, 1000, fig({}, 1.55, -150), 'turnaround: front (master)');
    // swatches
    const d = C.withDefaults(ch.design);
    const sw = [['skin', d.skin], ['hair', d.hair.color], ['eyes', d.eyes], ['outfit', d.outfit.color], ['accent', d.outfit.accent], ['caption', ch.color]];
    sw.forEach(([n, c], i) => {
      const x = 60 + i * 110, y = 1230;
      ctx.fillStyle = c; ctx.fillRect(x, y, 48, 48); ctx.fillStyle = C.shade(c, 0.32); ctx.fillRect(x + 48, y, 48, 48);
      ctx.strokeStyle = '#1d1424'; ctx.lineWidth = 3; ctx.strokeRect(x, y, 96, 48);
      label(n, x + 48, y + 56, 22, '#5a5266');
    });
    label(`hair: ${d.hair.style} · outfit: ${d.outfit.type} · accessory: ${d.accessory}`, 380, 1350, 24, '#5a5266');
    label('base | shade', 380, 1390, 22, '#8a8296');
    // expressions
    const ex = ['neutral', 'happy', 'angry', 'sad', 'shocked', 'smug'];
    ex.forEach((e, i) => cell(770 + i * 265, 160, 245, 300, fig({ expr: e }, 0.9, 10), e));
    const mo = [[0, 'mouth closed'], [0.3, 'mouth small'], [0.62, 'mouth mid'], [1, 'mouth wide'], [-1, 'blink'], [-2, 'joy (^ ^)']];
    mo.forEach(([m, n], i) => cell(770 + i * 265, 540, 245, 300, fig(m === -1 ? { eyeOpen: 0 } : m === -2 ? { expr: 'joy', mouth: 0.62 } : { mouth: m }, 0.9, 10), n));
    const re = ['shock', 'anger', 'sparkle', 'sweat', 'cry', 'happy'];
    re.forEach((r, i) => cell(770 + i * 265, 920, 245, 330, (cx, cy) => {
      FX.chibiBackdrop(ctx, 2400, 1500, r, 0.3); // fills the clipped cell
      ctx.translate(cx, cy - 30); ctx.scale(0.62, 0.62); C.drawChibi(ctx, ch.design, { reaction: r, t: 0.3, mouth: 0.4 });
    }, `chibi: ${r}`));
  }

  window.Engine = { init, renderFrame, drawSheet, size: () => ({ W, H }) };
})();
