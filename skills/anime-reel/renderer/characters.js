// anime-reel — parametric anime character renderer (Canvas 2D).
// Everything is drawn from a character "design" object, so the same design
// always produces the same character. Style rules: big eyes, thick clean
// outlines, flat base colours + exactly one shade tone per material.
(function () {
  const OUT = '#1d1424';          // outline colour
  const LW = 5.5;                 // outline width in character-local units
  const SHADE_TO = '#2b1d4f';     // cool violet that every shade is mixed toward

  // ---------- colour helpers ----------
  function hexToRgb(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  }
  function mix(a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
  }
  const shade = (c, t = 0.3) => mix(c, SHADE_TO, t);

  const DEFAULT_DESIGN = {
    skin: '#f6d3b8',
    hair: { style: 'spiky', color: '#2b2b3a' },
    eyes: '#5b8cff',
    outfit: { type: 'hoodie', color: '#4a6cff', accent: '#ffffff', tie: null },
    accessory: 'none',
    eyeSize: 1,
  };
  function withDefaults(d) {
    d = d || {};
    return {
      ...DEFAULT_DESIGN, ...d,
      hair: { ...DEFAULT_DESIGN.hair, ...(d.hair || {}) },
      outfit: { ...DEFAULT_DESIGN.outfit, ...(d.outfit || {}) },
    };
  }

  function strokeFill(ctx, path, fill, lw = LW) {
    ctx.fillStyle = fill; ctx.fill(path);
    ctx.lineWidth = lw; ctx.strokeStyle = OUT; ctx.stroke(path);
  }
  function shadeInside(ctx, clipPath, color, drawFn) {
    ctx.save(); ctx.clip(clipPath); ctx.fillStyle = color; drawFn(); ctx.restore();
  }

  // ---------- hair ----------
  function backHairPath(style, sway, chibi) {
    const p = new Path2D();
    if (style === 'spiky' || style === 'messy') {
      const n = style === 'spiky' ? 11 : 15;
      const rOut = style === 'spiky' ? 168 : 146, rIn = style === 'spiky' ? 124 : 122;
      p.moveTo(-96, 62);
      for (let i = 0; i <= n; i++) {
        const a = Math.PI * (0.9 + 1.2 * i / n);
        const wob = style === 'messy' ? Math.sin(i * 2.7) * 8 : 0;
        const r = (i % 2 ? rOut : rIn) + wob;
        p.lineTo(Math.cos(a) * r * 0.95, -30 + Math.sin(a) * r * 0.92);
      }
      p.lineTo(96, 62);
      p.closePath();
    } else if (style === 'bob') {
      p.moveTo(-130, 98);
      p.bezierCurveTo(-146, -60, -92, -152, 0, -152);
      p.bezierCurveTo(92, -152, 146, -60, 130, 98);
      p.quadraticCurveTo(112, 116, 82, 102);
      p.lineTo(-82, 102);
      p.quadraticCurveTo(-112, 116, -130, 98);
      p.closePath();
    } else if (style === 'long') {
      const L = chibi ? 0.55 : 1;
      p.moveTo(0, -152);
      p.bezierCurveTo(-100, -152, -150, -70, -146, 40);
      p.bezierCurveTo(-150, 200 * L, -172 + sway * 6, 330 * L, -150 + sway * 8, 430 * L);
      p.lineTo(-116 + sway * 6, 395 * L);
      p.lineTo(-96 + sway * 6, 440 * L);
      p.lineTo(-70, 300 * L);
      p.lineTo(70, 300 * L);
      p.lineTo(96 + sway * 6, 440 * L);
      p.lineTo(116 + sway * 6, 395 * L);
      p.lineTo(150 + sway * 8, 430 * L);
      p.bezierCurveTo(172 + sway * 6, 330 * L, 150, 200 * L, 146, 40);
      p.bezierCurveTo(150, -70, 100, -152, 0, -152);
      p.closePath();
    } else { // ponytail
      p.moveTo(-118, 30);
      p.bezierCurveTo(-132, -70, -88, -150, 0, -150);
      p.bezierCurveTo(88, -150, 132, -70, 118, 30);
      p.closePath();
      const L = chibi ? 0.6 : 1;
      p.moveTo(30, -128);
      p.bezierCurveTo(150, -160, 205 + sway * 12, 40 * L, 152 + sway * 26, 255 * L);
      p.lineTo(138 + sway * 22, 210 * L);
      p.lineTo(120 + sway * 18, 250 * L);
      p.bezierCurveTo(130 + sway * 12, 140 * L, 105, 10, 58, -60);
      p.closePath();
    }
    return p;
  }

  const BANGS = {
    spiky:    { tips: [[-98, 18], [-62, 0], [-22, 24], [18, 4], [58, 22], [96, 8]], root: -64, side: 44 },
    messy:    { tips: [[-100, 10], [-72, 28], [-42, 6], [-10, 32], [22, 8], [52, 28], [80, 4], [102, 20]], root: -60, side: 54 },
    bob:      { tips: [[-102, -14], [-66, -20], [-30, -16], [6, -22], [42, -16], [78, -20], [104, -14]], root: -52, side: 96 },
    long:     { tips: [[-104, 34], [-74, -4], [-36, -22], [4, -12], [44, 6], [84, 32], [106, 52]], root: -66, side: 120 },
    ponytail: { tips: [[-102, 24], [-66, -8], [-26, -22], [14, -6], [56, 14], [100, 30]], root: -64, side: 74 },
  };
  function bangsPath(style) {
    const b = BANGS[style] || BANGS.spiky;
    const p = new Path2D();
    const t = b.tips;
    p.moveTo(-122, b.side);
    p.lineTo(-104, b.side - 34);
    p.lineTo(t[0][0], t[0][1]);
    // zig-zag left -> right along the fringe
    for (let i = 1; i < t.length; i++) {
      const rx = (t[i][0] + t[i - 1][0]) / 2;
      p.lineTo(rx, b.root + ((i * 37) % 11));
      p.lineTo(t[i][0], t[i][1]);
    }
    p.lineTo(104, b.side - 34);
    p.lineTo(122, b.side);
    p.bezierCurveTo(132, -40, 128, -96, 98, -126);
    p.bezierCurveTo(60, -160, -60, -160, -98, -126);
    p.bezierCurveTo(-128, -96, -132, -40, -122, b.side);
    p.closePath();
    // shade region: zig-zag that follows each strand, ~22 units above its tip
    const sh = new Path2D();
    sh.moveTo(-140, b.side + 40); sh.lineTo(-140, t[0][1] - 24);
    for (let i = 0; i < t.length; i++) {
      if (i > 0) sh.lineTo((t[i][0] + t[i - 1][0]) / 2, b.root + 22);
      sh.lineTo(t[i][0], t[i][1] - 24);
    }
    sh.lineTo(140, t[t.length - 1][1] - 24); sh.lineTo(140, b.side + 40); sh.closePath();
    return { path: p, root: b.root, shadePath: sh };
  }

  // ---------- face ----------
  function facePath(chibi) {
    const p = new Path2D();
    if (chibi) {
      p.moveTo(0, -122);
      p.bezierCurveTo(72, -122, 112, -80, 112, -8);
      p.bezierCurveTo(112, 62, 70, 104, 0, 104);
      p.bezierCurveTo(-70, 104, -112, 62, -112, -8);
      p.bezierCurveTo(-112, -80, -72, -122, 0, -122);
    } else {
      p.moveTo(0, -122);
      p.bezierCurveTo(60, -122, 100, -85, 100, -20);
      p.bezierCurveTo(100, 30, 88, 60, 60, 88);
      p.quadraticCurveTo(22, 118, 0, 118);
      p.quadraticCurveTo(-22, 118, -60, 88);
      p.bezierCurveTo(-88, 60, -100, 30, -100, -20);
      p.bezierCurveTo(-100, -85, -60, -122, 0, -122);
    }
    p.closePath();
    return p;
  }

  function drawEye(ctx, d, side, st) {
    ctx.save();
    ctx.translate(side * 42, 14);
    ctx.scale(side, 1); // +x = outer corner for both eyes
    const w = 50 * d.eyeSize, h = 60 * d.eyeSize;
    const expr = st.expr;
    let open = st.eyeOpen;
    if (expr === 'smug') open *= 0.62;
    if (expr === 'angry') open *= 0.85;
    const skin = d.skin;
    if (open < 0.14 || expr === 'joy') {
      ctx.beginPath();
      if (expr === 'joy') { // ^ ^ closed happy eyes
        ctx.moveTo(-w * 0.5, 6); ctx.quadraticCurveTo(0, -h * 0.42, w * 0.55, 6);
      } else {
        ctx.moveTo(-w * 0.5, 0); ctx.quadraticCurveTo(0, h * 0.2, w * 0.56, -2);
        ctx.moveTo(w * 0.5, 0); ctx.lineTo(w * 0.72, -6);
      }
      ctx.lineWidth = 6.5; ctx.strokeStyle = OUT; ctx.stroke();
      ctx.restore();
      return;
    }
    const top = -h * 0.5 * open, bot = h * 0.45 * open;
    const sp = new Path2D();
    sp.moveTo(-w * 0.5, 0);
    sp.bezierCurveTo(-w * 0.45, top * 1.05, w * 0.45, top * 1.1, w * 0.55, top * 0.35);
    sp.bezierCurveTo(w * 0.52, bot * 0.6, w * 0.2, bot, -w * 0.05, bot);
    sp.bezierCurveTo(-w * 0.35, bot, -w * 0.5, bot * 0.5, -w * 0.5, 0);
    sp.closePath();
    ctx.fillStyle = '#ffffff'; ctx.fill(sp);
    ctx.save();
    ctx.clip(sp);
    const irisScale = expr === 'shocked' ? 0.55 : 1;
    const ix = (st.gaze || 0) * side * w * 0.14, iy = h * 0.05;
    const rx = w * 0.34 * irisScale, ry = h * 0.41 * irisScale;
    const iris = new Path2D(); iris.ellipse(ix, iy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = d.eyes; ctx.fill(iris);
    shadeInside(ctx, iris, shade(d.eyes, 0.5), () => ctx.fillRect(ix - rx, iy - ry, rx * 2, ry * 0.95));
    ctx.fillStyle = '#170f2a';
    ctx.beginPath(); ctx.ellipse(ix, iy + ry * 0.1, rx * 0.42, ry * 0.48, 0, 0, Math.PI * 2); ctx.fill();
    // upper-lid cast shadow on the white (one shade)
    ctx.fillStyle = 'rgba(80,60,140,0.22)';
    ctx.beginPath(); ctx.ellipse(0, top * 0.95, w * 0.7, h * 0.16, 0, 0, Math.PI * 2); ctx.fill();
    // highlights stay on the same screen side for both eyes
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(ix + rx * 0.32 * side, iy - ry * 0.36, rx * (expr === 'shocked' ? 0.25 : 0.33), 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(ix - rx * 0.36 * side, iy + ry * 0.48, rx * 0.15, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // lashes
    ctx.strokeStyle = OUT; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-w * 0.56, 2);
    ctx.bezierCurveTo(-w * 0.46, top * 1.1, w * 0.46, top * 1.16, w * 0.62, top * 0.34);
    ctx.lineWidth = 8.5; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w * 0.5, top * 0.52); ctx.lineTo(w * 0.78, top * 0.74); ctx.lineWidth = 6; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w * 0.08, bot * 0.98); ctx.quadraticCurveTo(w * 0.4, bot * 0.92, w * 0.5, bot * 0.5);
    ctx.lineWidth = 3.5; ctx.stroke();
    // expression lids (skin wedge + lid line)
    const lid = (a, b) => {
      ctx.fillStyle = skin;
      ctx.beginPath(); ctx.moveTo(-w * 0.8, a); ctx.lineTo(w * 0.85, b); ctx.lineTo(w * 0.85, top * 1.9 - 10); ctx.lineTo(-w * 0.8, top * 1.9 - 10); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-w * 0.6, a); ctx.lineTo(w * 0.64, b); ctx.lineWidth = 8; ctx.strokeStyle = OUT; ctx.stroke();
    };
    if (expr === 'angry') lid(top * 0.2, top * 0.95);
    else if (expr === 'sad' || expr === 'worried') lid(top * 0.95, top * 0.35);
    else if (expr === 'smug') lid(top * 0.55, top * 0.55);
    ctx.restore();
  }

  const BROWS = {
    neutral: [0, -4], happy: [-4, -8], joy: [-6, -10], angry: [14, -10], sad: [-14, 4], worried: [-14, 2],
    shocked: [-16, -18], smug: [2, -10], determined: [8, -8],
  };
  function drawBrows(ctx, d, st) {
    const [iy, oy] = BROWS[st.expr] || BROWS.neutral;
    ctx.strokeStyle = shade(d.hair.color, 0.35); ctx.lineWidth = 8; ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      ctx.save(); ctx.translate(side * 44, -36); ctx.scale(side, 1);
      let o = oy; if (st.expr === 'smug' && side > 0) o -= 10;
      ctx.beginPath(); ctx.moveTo(-20, iy); ctx.quadraticCurveTo(4, Math.min(iy, o) - 7, 26, o); ctx.stroke();
      ctx.restore();
    }
  }

  function drawMouth(ctx, d, st) {
    const m = st.mouth || 0, e = st.expr;
    ctx.save(); ctx.translate(0, 80);
    ctx.strokeStyle = OUT; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (m < 0.08) {
      ctx.beginPath();
      if (e === 'shocked') { ctx.ellipse(0, 4, 8, 10, 0, 0, Math.PI * 2); ctx.fillStyle = '#5b1726'; ctx.fill(); }
      else if (e === 'happy' || e === 'joy') { ctx.moveTo(-18, -3); ctx.quadraticCurveTo(0, 12, 18, -3); }
      else if (e === 'smug') { ctx.moveTo(-14, 2); ctx.quadraticCurveTo(6, 8, 20, -6); }
      else if (e === 'angry' || e === 'determined') { ctx.moveTo(-16, 4); ctx.quadraticCurveTo(0, -3, 16, 4); }
      else if (e === 'sad' || e === 'worried') { ctx.moveTo(-14, 5); ctx.quadraticCurveTo(0, -5, 14, 5); }
      else { ctx.moveTo(-12, 0); ctx.quadraticCurveTo(0, 4, 12, 0); }
      ctx.lineWidth = 4.5; ctx.stroke();
      ctx.restore();
      return;
    }
    let w = 14 + 12 * m, h = 6 + 32 * m;
    if (e === 'happy' || e === 'joy') w += 6;
    if (e === 'angry') w += 8;
    if (e === 'shocked') { w = 10 + 9 * m; h = 12 + 34 * m; }
    const p = new Path2D();
    if (e === 'angry') {
      p.moveTo(-w, -2); p.lineTo(w, -2); p.lineTo(w * 0.72, h); p.lineTo(-w * 0.72, h); p.closePath();
    } else if (e === 'shocked') {
      p.ellipse(0, h * 0.45, w, h * 0.55, 0, 0, Math.PI * 2);
    } else {
      p.moveTo(-w, 0); p.quadraticCurveTo(0, (e === 'happy' || e === 'joy') ? -2 : -5, w, 0);
      p.bezierCurveTo(w, h * 1.2, -w, h * 1.2, -w, 0); p.closePath();
    }
    ctx.fillStyle = '#5b1726'; ctx.fill(p);
    ctx.save(); ctx.clip(p);
    ctx.fillStyle = '#e2717e'; ctx.beginPath(); ctx.ellipse(0, h * 1.0, w * 0.66, h * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    if (m > 0.35) {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(-w, -6, w * 2, 4 + h * 0.13);
      if (e === 'angry') ctx.fillRect(-w, h - 2 - h * 0.12, w * 2, h * 0.14);
    }
    ctx.restore();
    ctx.lineWidth = 4.5; ctx.stroke(p);
    ctx.restore();
  }

  function drawBlush(ctx, strength) {
    if (!strength) return;
    for (const side of [-1, 1]) {
      ctx.fillStyle = `rgba(255,105,130,${0.32 * strength})`;
      ctx.beginPath(); ctx.ellipse(side * 62, 52, 26, 10, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(225,70,100,${0.65 * strength})`; ctx.lineWidth = 2.6;
      for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(side * 62 + k * 12 - 4, 58); ctx.lineTo(side * 62 + k * 12 + 4, 46); ctx.stroke(); }
    }
  }

  function drawGlasses(ctx) {
    ctx.strokeStyle = OUT; ctx.lineWidth = 5;
    for (const side of [-1, 1]) {
      ctx.fillStyle = 'rgba(180,220,255,0.18)';
      ctx.beginPath(); ctx.roundRect(side * 42 - 36, -12, 72, 56, 14); ctx.fill(); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(-6, 8); ctx.quadraticCurveTo(0, 2, 6, 8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-78, 6); ctx.lineTo(-98, 0); ctx.moveTo(78, 6); ctx.lineTo(98, 0); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3.5;
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(side * 42 + 12, -2); ctx.lineTo(side * 42 + 22, 12); ctx.stroke(); }
  }

  // ---------- chibi faces ----------
  function star(ctx, x, y, r, pts = 5, inner = 0.45) {
    ctx.beginPath();
    for (let i = 0; i < pts * 2; i++) {
      const a = -Math.PI / 2 + i * Math.PI / pts, rr = i % 2 ? r * inner : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
  }
  function drawChibiFace(ctx, d, st) {
    const r = st.reaction || 'sweat', t = st.t || 0, m = st.mouth || 0;
    ctx.strokeStyle = OUT; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const ey = 26;
    if (r === 'shock') {
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * 46, ey, 24, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 6; ctx.stroke(); ctx.fillStyle = OUT; ctx.beginPath(); ctx.arc(s * 46, ey, 4, 0, Math.PI * 2); ctx.fill(); }
      const h = 26 + 22 * m;
      ctx.beginPath(); ctx.ellipse(0, 76 + h * 0.3, 16 + 6 * m, h * 0.6, 0, 0, Math.PI * 2); ctx.fillStyle = '#5b1726'; ctx.fill(); ctx.lineWidth = 5; ctx.stroke();
    } else if (r === 'anger') {
      ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(-70, ey - 16); ctx.lineTo(-34, ey); ctx.lineTo(-70, ey + 16); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(70, ey - 16); ctx.lineTo(34, ey); ctx.lineTo(70, ey + 16); ctx.stroke();
      const w = 34 + 10 * m, h = 22 + 22 * m;
      const p = new Path2D(); p.moveTo(-w, 62); p.lineTo(w, 62); p.lineTo(w * 0.7, 62 + h); p.lineTo(-w * 0.7, 62 + h); p.closePath();
      ctx.fillStyle = '#5b1726'; ctx.fill(p); ctx.lineWidth = 5; ctx.stroke(p);
      ctx.fillStyle = '#fff'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * (w - 10), 62); ctx.lineTo(s * (w - 18), 76); ctx.lineTo(s * (w - 26), 62); ctx.fill(); }
    } else if (r === 'sparkle') {
      for (const s of [-1, 1]) {
        const tw = 1 + 0.12 * Math.sin(t * 18 + s);
        star(ctx, s * 46, ey, 26 * tw); ctx.fillStyle = '#ffd23f'; ctx.fill(); ctx.lineWidth = 5; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s * 46 + 6, ey - 8, 5, 0, Math.PI * 2); ctx.fill();
      }
      const w = 30, h = 18 + 24 * m;
      const p = new Path2D(); p.moveTo(-w, 64); p.quadraticCurveTo(0, 60, w, 64); p.bezierCurveTo(w, 64 + h * 1.3, -w, 64 + h * 1.3, -w, 64); p.closePath();
      ctx.fillStyle = '#5b1726'; ctx.fill(p); ctx.lineWidth = 5; ctx.stroke(p);
    } else if (r === 'cry') {
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(s * 70, ey + 6); ctx.quadraticCurveTo(s * 46, ey - 18, s * 22, ey + 6); ctx.lineWidth = 7; ctx.stroke();
        ctx.fillStyle = 'rgba(120,190,255,0.92)';
        const wv = Math.sin(t * 20 + s) * 4;
        ctx.beginPath(); ctx.moveTo(s * 60, ey + 8); ctx.lineTo(s * 32, ey + 8); ctx.lineTo(s * 34 + wv, 230); ctx.lineTo(s * 60 + wv, 230); ctx.closePath(); ctx.fill();
      }
      ctx.beginPath(); ctx.moveTo(-26, 78);
      for (let i = 1; i <= 6; i++) ctx.lineTo(-26 + i * 52 / 6, 78 + (i % 2 ? -8 : 0) + m * 12 * (i % 2 ? 0 : 1));
      ctx.lineWidth = 5; ctx.stroke();
    } else if (r === 'happy') {
      ctx.lineWidth = 8;
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 68, ey + 8); ctx.quadraticCurveTo(s * 46, ey - 22, s * 24, ey + 8); ctx.stroke(); }
      const w = 30, h = 14 + 24 * m;
      const p = new Path2D(); p.moveTo(-w, 64); p.quadraticCurveTo(0, 60, w, 64); p.bezierCurveTo(w, 64 + h * 1.3, -w, 64 + h * 1.3, -w, 64); p.closePath();
      ctx.fillStyle = '#5b1726'; ctx.fill(p); ctx.lineWidth = 5; ctx.stroke(p);
    } else { // sweat
      ctx.fillStyle = OUT;
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * 44, ey, 7, 10, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.beginPath(); ctx.moveTo(-22, 80);
      for (let i = 1; i <= 4; i++) ctx.quadraticCurveTo(-22 + (i - 0.5) * 11, 80 + (i % 2 ? -6 : 6) - m * 4, -22 + i * 11, 80);
      ctx.lineWidth = 5; ctx.stroke();
    }
    if (r !== 'shock') drawBlush(ctx, 1);
  }
  function drawChibiOverlay(ctx, d, st) {
    const r = st.reaction, t = st.t || 0;
    ctx.strokeStyle = OUT; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (r === 'anger') {
      ctx.save(); ctx.translate(92, -118); const s = 1 + 0.15 * Math.abs(Math.sin(t * 14)); ctx.scale(s, s);
      ctx.strokeStyle = '#e8243c'; ctx.lineWidth = 9;
      for (let k = 0; k < 4; k++) { ctx.save(); ctx.rotate(k * Math.PI / 2); ctx.beginPath(); ctx.moveTo(8, -26); ctx.quadraticCurveTo(8, -8, 26, -8); ctx.stroke(); ctx.restore(); }
      ctx.restore();
      for (const s of [-1, 1]) {
        const ph = (t * 2.2 + (s > 0 ? 0.5 : 0)) % 1;
        ctx.fillStyle = `rgba(255,255,255,${0.9 * (1 - ph)})`;
        ctx.beginPath(); ctx.arc(s * (150 + ph * 50), -70 - ph * 90, 22 + ph * 26, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = 4; ctx.globalAlpha = 1 - ph; ctx.stroke(); ctx.globalAlpha = 1;
      }
    } else if (r === 'shock') {
      ctx.strokeStyle = 'rgba(70,80,200,0.75)'; ctx.lineWidth = 5;
      for (let i = 0; i < 7; i++) { const x = -66 + i * 22; ctx.beginPath(); ctx.moveTo(x, -112 + (i % 2) * 8); ctx.lineTo(x, -40 - (i % 3) * 6); ctx.stroke(); }
    } else if (r === 'sweat') {
      const y = -60 + Math.min(1, t * 1.5) * 40;
      ctx.beginPath(); ctx.moveTo(118, y - 46); ctx.bezierCurveTo(140, y - 6, 140, y + 20, 118, y + 20); ctx.bezierCurveTo(96, y + 20, 96, y - 6, 118, y - 46);
      ctx.fillStyle = '#9fd8ff'; ctx.fill(); ctx.lineWidth = 5; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(112, y + 2, 5, 9, 0.3, 0, Math.PI * 2); ctx.fill();
    } else if (r === 'sparkle' || r === 'happy') {
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2 + t * 0.8, rr = 190 + 16 * Math.sin(t * 5 + i);
        const tw = 0.6 + 0.4 * Math.abs(Math.sin(t * 9 + i * 1.7));
        star(ctx, Math.cos(a) * rr, -20 + Math.sin(a) * rr * 0.8, 22 * tw, 4, 0.3);
        ctx.fillStyle = r === 'sparkle' ? '#fff27a' : '#ffffff'; ctx.fill(); ctx.lineWidth = 3.5; ctx.stroke();
      }
    }
  }

  // ---------- body ----------
  function torsoPaths() {
    const fill = new Path2D();
    fill.moveTo(-34, 150);
    fill.quadraticCurveTo(-110, 160, -158, 200);
    fill.quadraticCurveTo(-186, 230, -188, 330);
    fill.lineTo(-198, 1500); fill.lineTo(198, 1500); fill.lineTo(188, 330);
    fill.quadraticCurveTo(186, 230, 158, 200);
    fill.quadraticCurveTo(110, 160, 34, 150);
    fill.closePath();
    const outline = new Path2D();
    outline.moveTo(-198, 1500); outline.lineTo(-188, 330);
    outline.quadraticCurveTo(-186, 230, -158, 200); outline.quadraticCurveTo(-110, 160, -34, 150);
    outline.moveTo(34, 150); outline.quadraticCurveTo(110, 160, 158, 200);
    outline.quadraticCurveTo(186, 230, 188, 330); outline.lineTo(198, 1500);
    return { fill, outline };
  }

  function drawBody(ctx, d, st) {
    const o = d.outfit, col = o.color, sh = shade(col, 0.32);
    ctx.save();
    const br = st.breath || 0;
    ctx.translate(0, -br * 3);
    // hoodie hood sits behind the neck
    if (o.type === 'hoodie') {
      const hood = new Path2D(); hood.ellipse(0, 158, 122, 46, 0, Math.PI, Math.PI * 2); hood.closePath();
      strokeFill(ctx, hood, sh);
    }
    // neck
    const neck = new Path2D(); neck.moveTo(-30, 70); neck.lineTo(-33, 175); neck.lineTo(33, 175); neck.lineTo(30, 70); neck.closePath();
    ctx.fillStyle = d.skin; ctx.fill(neck);
    shadeInside(ctx, neck, shade(d.skin, 0.3), () => ctx.fillRect(-40, 60, 80, 52));
    ctx.lineWidth = LW; ctx.strokeStyle = OUT;
    ctx.beginPath(); ctx.moveTo(-30, 90); ctx.lineTo(-33, 170); ctx.moveTo(30, 90); ctx.lineTo(33, 170); ctx.stroke();
    // torso
    ctx.save(); ctx.scale(1 + br * 0.012, 1);
    const T = torsoPaths();
    ctx.fillStyle = col; ctx.fill(T.fill);
    shadeInside(ctx, T.fill, sh, () => {
      ctx.fillRect(122, 140, 90, 1400); // right arm in shade (light from upper-left)
      ctx.beginPath(); ctx.moveTo(-40, 150); ctx.lineTo(40, 150); ctx.lineTo(60, 200); ctx.lineTo(-60, 200); ctx.fill(); // under-collar
    });
    ctx.lineWidth = LW; ctx.strokeStyle = OUT; ctx.stroke(T.outline);
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-128, 262); ctx.quadraticCurveTo(-140, 600, -136, 1500); ctx.moveTo(128, 262); ctx.quadraticCurveTo(140, 600, 136, 1500); ctx.stroke();

    const acc = o.accent || '#ffffff';
    ctx.lineWidth = LW;
    if (o.type === 'hoodie') {
      const rim = new Path2D(); rim.moveTo(-74, 156); rim.quadraticCurveTo(0, 250, 74, 156); rim.quadraticCurveTo(0, 205, -74, 156); rim.closePath();
      strokeFill(ctx, rim, sh);
      ctx.strokeStyle = acc; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(-24, 205); ctx.lineTo(-28, 330); ctx.moveTo(24, 205); ctx.lineTo(30, 340); ctx.stroke();
      ctx.strokeStyle = OUT; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(-90, 600); ctx.quadraticCurveTo(0, 580, 90, 600); ctx.stroke();
    } else if (o.type === 'shirt') {
      for (const s of [-1, 1]) {
        const c = new Path2D(); c.moveTo(s * 34, 150); c.lineTo(s * 74, 176); c.lineTo(s * 12, 222); c.closePath();
        strokeFill(ctx, c, acc, 4.5);
      }
      ctx.strokeStyle = OUT; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, 215); ctx.lineTo(0, 1500); ctx.stroke();
      ctx.fillStyle = acc; for (const y of [270, 350, 430, 510]) { ctx.beginPath(); ctx.arc(10, y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    } else if (o.type === 'blazer') {
      const inner = new Path2D(); inner.moveTo(-40, 150); inner.lineTo(40, 150); inner.lineTo(0, 360); inner.closePath();
      ctx.fillStyle = acc; ctx.fill(inner);
      if (o.tie) { const tie = new Path2D(); tie.moveTo(-10, 172); tie.lineTo(10, 172); tie.lineTo(16, 300); tie.lineTo(0, 330); tie.lineTo(-16, 300); tie.closePath(); strokeFill(ctx, tie, o.tie, 4); }
      for (const s of [-1, 1]) {
        const l = new Path2D(); l.moveTo(s * 40, 150); l.lineTo(s * 86, 196); l.lineTo(s * 52, 238); l.lineTo(s * 2, 362); l.lineTo(s * 30, 170); l.closePath();
        strokeFill(ctx, l, s > 0 ? sh : col, 4.5);
      }
      ctx.fillStyle = OUT; ctx.beginPath(); ctx.arc(12, 430, 7, 0, Math.PI * 2); ctx.fill();
    } else if (o.type === 'kurta') {
      const band = new Path2D(); band.roundRect(-40, 146, 80, 26, 8); strokeFill(ctx, band, acc, 4.5);
      const pl = new Path2D(); pl.rect(-11, 172, 22, 190); strokeFill(ctx, pl, acc, 4);
      ctx.fillStyle = OUT; for (const y of [210, 260, 310]) { ctx.beginPath(); ctx.arc(0, y, 4.5, 0, Math.PI * 2); ctx.fill(); }
    } else { // tee
      const nl = new Path2D(); nl.moveTo(-38, 149); nl.quadraticCurveTo(0, 212, 38, 149); nl.closePath();
      ctx.fillStyle = d.skin; ctx.fill(nl);
      ctx.strokeStyle = OUT; ctx.lineWidth = LW; ctx.beginPath(); ctx.moveTo(-38, 149); ctx.quadraticCurveTo(0, 212, 38, 149); ctx.stroke();
      ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(-58, 330, 26, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = 4; ctx.stroke();
    }
    ctx.restore();
    if (d.accessory === 'headphones') {
      ctx.strokeStyle = OUT; ctx.lineWidth = LW;
      const band = new Path2D(); band.moveTo(-82, 168); band.quadraticCurveTo(0, 246, 82, 168);
      ctx.lineWidth = 16; ctx.strokeStyle = OUT; ctx.stroke(band); ctx.lineWidth = 9; ctx.strokeStyle = '#3a3550'; ctx.stroke(band);
      for (const s of [-1, 1]) { const cup = new Path2D(); cup.roundRect(s * 84 - 24, 140, 48, 66, 16); strokeFill(ctx, cup, s > 0 ? '#2a2640' : '#3a3550'); ctx.fillStyle = o.accent || '#ff5e7e'; ctx.fillRect(s * 84 - 6, 154, 12, 38); }
    }
    ctx.restore();
  }

  function drawChibiBody(ctx, d, st) {
    const o = d.outfit, col = o.color, sh = shade(col, 0.32), r = st.reaction, t = st.t || 0;
    // legs
    for (const s of [-1, 1]) {
      const leg = new Path2D(); leg.roundRect(s * 26 - 15, 238, 30, 62, 10); strokeFill(ctx, leg, '#3b3f5c');
      const shoe = new Path2D(); shoe.ellipse(s * 28, 300, 24, 13, 0, 0, Math.PI * 2); strokeFill(ctx, shoe, '#2a2236');
    }
    // arms (pose by reaction)
    // outward angle from hanging straight down (0) to straight up (PI)
    const armAng = { anger: 2.4, shock: 1.2, sparkle: 2.7, happy: 2.5, cry: 0.3, sweat: 0.25 }[r] ?? 0.3;
    for (const s of [-1, 1]) {
      ctx.save(); ctx.translate(s * 66, 140);
      const wig = r === 'anger' ? Math.sin(t * 30 + s) * 0.2 : (r === 'happy' || r === 'sparkle') ? Math.sin(t * 12 + s) * 0.15 : 0;
      ctx.rotate(-s * armAng + wig);
      const arm = new Path2D(); arm.roundRect(-16, 0, 32, 74, 16); strokeFill(ctx, arm, s > 0 ? sh : col);
      const hand = new Path2D(); hand.arc(0, 78, 16, 0, Math.PI * 2); strokeFill(ctx, hand, d.skin);
      ctx.restore();
    }
    const b = new Path2D();
    b.moveTo(-58, 98); b.quadraticCurveTo(-86, 104, -88, 200); b.lineTo(-80, 250); b.lineTo(80, 250); b.lineTo(88, 200); b.quadraticCurveTo(86, 104, 58, 98); b.closePath();
    ctx.fillStyle = col; ctx.fill(b);
    shadeInside(ctx, b, sh, () => ctx.fillRect(40, 90, 60, 170));
    ctx.lineWidth = LW; ctx.strokeStyle = OUT; ctx.stroke(b);
  }

  // ---------- head ----------
  function drawHead(ctx, d, st, chibi) {
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // ears
    for (const s of [-1, 1]) {
      const ear = new Path2D(); ear.ellipse(s * (chibi ? 108 : 98), 18, 16, 24, 0, 0, Math.PI * 2);
      strokeFill(ctx, ear, d.skin);
    }
    const face = facePath(chibi);
    ctx.fillStyle = d.skin; ctx.fill(face);
    const bangs = bangsPath(d.hair.style);
    // face shade: the fringe casts a shadow, plus jaw shade on the far side
    ctx.save(); ctx.clip(face);
    ctx.translate(5, 16); ctx.fillStyle = shade(d.skin, 0.26); ctx.fill(bangs.path); ctx.translate(-5, -16);
    if (!chibi) { ctx.beginPath(); ctx.moveTo(70, 20); ctx.quadraticCurveTo(64, 92, 10, 120); ctx.lineTo(120, 120); ctx.lineTo(120, 20); ctx.fill(); }
    ctx.restore();
    ctx.lineWidth = LW; ctx.strokeStyle = OUT; ctx.stroke(face);
    if (chibi) {
      drawChibiFace(ctx, d, st);
    } else {
      drawEye(ctx, d, -1, st); drawEye(ctx, d, 1, st);
      ctx.strokeStyle = shade(d.skin, 0.45); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(4, 48); ctx.lineTo(-1, 56); ctx.stroke();
      drawMouth(ctx, d, st);
      const blush = st.blush ?? ((st.expr === 'happy' || st.expr === 'joy') ? 0.8 : 0);
      drawBlush(ctx, blush);
    }
    // fringe
    ctx.fillStyle = d.hair.color; ctx.fill(bangs.path);
    shadeInside(ctx, bangs.path, shade(d.hair.color, 0.35), () => ctx.fill(bangs.shadePath));
    ctx.lineWidth = LW; ctx.strokeStyle = OUT; ctx.stroke(bangs.path);
    if (!chibi) drawBrows(ctx, d, st);
    if (d.accessory === 'glasses' && !chibi) drawGlasses(ctx);
  }

  function drawBackHair(ctx, d, st, chibi) {
    const p = backHairPath(d.hair.style, st.sway || 0, chibi);
    ctx.fillStyle = d.hair.color; ctx.fill(p);
    shadeInside(ctx, p, shade(d.hair.color, 0.35), () => ctx.fillRect(-260, 10, 520, 600));
    ctx.lineWidth = LW; ctx.strokeStyle = OUT; ctx.lineJoin = 'round'; ctx.stroke(p);
    if (d.hair.style === 'ponytail') {
      const tie = new Path2D(); tie.ellipse(44, -118, 14, 20, -0.6, 0, Math.PI * 2);
      strokeFill(ctx, tie, d.outfit.accent || '#ff5e7e', 4);
    }
  }

  // Draw a full (waist-up) character. Origin = head centre, local units.
  // st: {expr, mouth 0..1, eyeOpen 0..1, gaze -1..1, breath 0..1, bob px, tilt rad, headDy, sway, blush}
  function drawCharacter(ctx, design, st) {
    const d = withDefaults(design);
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.translate(0, st.bob || 0);
    const headT = () => { ctx.translate(0, st.headDy || 0); ctx.translate(0, 110); ctx.rotate(st.tilt || 0); ctx.translate(0, -110); };
    ctx.save(); headT(); drawBackHair(ctx, d, st, false); ctx.restore();
    drawBody(ctx, d, st);
    ctx.save(); headT(); drawHead(ctx, d, st, false); ctx.restore();
    ctx.restore();
  }

  // Chibi (super-deformed) version. Origin = head centre. st.reaction in
  // shock|anger|sparkle|sweat|cry|happy, st.t = seconds since reaction start.
  function drawChibi(ctx, design, st) {
    const d = withDefaults(design);
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    drawBackHair(ctx, d, st, true);
    drawChibiBody(ctx, d, st);
    drawHead(ctx, d, st, true);
    drawChibiOverlay(ctx, d, st);
    ctx.restore();
  }

  window.AnimeChar = { drawCharacter, drawChibi, withDefaults, shade, mix, OUT, star };
})();
