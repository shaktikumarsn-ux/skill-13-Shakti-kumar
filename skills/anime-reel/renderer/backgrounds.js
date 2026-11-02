// anime-reel — code-drawn anime backgrounds. Flat fills + one shade + soft
// outlines. drawBackground(ctx, W, H, location, timeOfDay, seed) paints a
// W x H canvas (the engine passes an oversized canvas so the camera can pan).
(function () {
  const { mix, shade } = window.AnimeChar;
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  const SKY = {
    day:     ['#5fb8ff', '#cdeeff'],
    evening: ['#6b4fa8', '#ffb37a'],
    night:   ['#121a44', '#3a3f86'],
  };
  const LIGHT = { day: 0, evening: 0.15, night: 0.45 }; // how much interiors darken

  function line(ctx, W) { ctx.strokeStyle = 'rgba(40,28,60,0.75)'; ctx.lineWidth = Math.max(2, W / 520); ctx.lineJoin = 'round'; }
  function box(ctx, x, y, w, h, fill, W, r = 0) {
    ctx.beginPath(); if (r) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
    ctx.fillStyle = fill; ctx.fill(); line(ctx, W); ctx.stroke();
  }
  function night(c, tod) { return tod === 'night' ? mix(c, '#1f1d48', 0.5) : tod === 'evening' ? mix(c, '#7a4a6a', 0.18) : c; }

  function sky(ctx, x, y, w, h, tod, R) {
    const [a, b] = SKY[tod] || SKY.day;
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, a); g.addColorStop(1, b);
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    if (tod === 'night') {
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 60; i++) { const s = R() * 2.2 + 0.6; ctx.globalAlpha = 0.4 + R() * 0.6; ctx.fillRect(x + R() * w, y + R() * h * 0.7, s, s); }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff6d0'; ctx.beginPath(); ctx.arc(x + w * 0.78, y + h * 0.2, Math.min(w, h) * 0.07, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = b; ctx.beginPath(); ctx.arc(x + w * 0.78 + Math.min(w, h) * 0.03, y + h * 0.18, Math.min(w, h) * 0.06, 0, Math.PI * 2); ctx.fill();
    } else {
      for (let i = 0; i < 4; i++) cloud(ctx, x + R() * w, y + h * (0.15 + R() * 0.4), Math.min(w, h) * (0.06 + R() * 0.05), tod);
    }
  }
  function cloud(ctx, cx, cy, r, tod) {
    const base = tod === 'evening' ? '#ffe1c8' : '#ffffff', sh = tod === 'evening' ? '#e79aa0' : '#bcd8f5';
    const puffs = [[0, 0, 1], [-1.1, 0.35, 0.75], [1.1, 0.3, 0.8], [-0.5, -0.45, 0.8], [0.55, -0.4, 0.7]];
    ctx.fillStyle = sh; for (const [dx, dy, s] of puffs) { ctx.beginPath(); ctx.arc(cx + dx * r, cy + dy * r + r * 0.18, r * s, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = base; for (const [dx, dy, s] of puffs) { ctx.beginPath(); ctx.arc(cx + dx * r, cy + dy * r, r * s * 0.92, 0, Math.PI * 2); ctx.fill(); }
  }
  function skyline(ctx, x, yBase, w, hMax, color, R, lit, W) {
    let cx = x;
    while (cx < x + w) {
      const bw = w * (0.05 + R() * 0.07), bh = hMax * (0.35 + R() * 0.65);
      ctx.fillStyle = color; ctx.fillRect(cx, yBase - bh, bw + 1, bh);
      if (lit) {
        ctx.fillStyle = 'rgba(255,220,130,0.85)';
        for (let wy = yBase - bh + 10; wy < yBase - 8; wy += 16) for (let wx = cx + 6; wx < cx + bw - 8; wx += 13) if (R() < 0.35) ctx.fillRect(wx, wy, 6, 8);
      }
      cx += bw;
    }
  }
  function windowFrame(ctx, x, y, w, h, tod, R, W, frame = '#f7f3ec') {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    sky(ctx, x, y, w, h, tod, R);
    skyline(ctx, x, y + h, w, h * 0.45, tod === 'night' ? '#232650' : tod === 'evening' ? '#8a5f86' : '#9cc3e0', R, tod === 'night', W);
    ctx.restore();
    line(ctx, W); ctx.lineWidth *= 2.4; ctx.strokeStyle = night(frame, tod);
    ctx.strokeRect(x, y, w, h); ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h); ctx.moveTo(x, y + h * 0.45); ctx.lineTo(x + w, y + h * 0.45); ctx.stroke();
    line(ctx, W); ctx.strokeRect(x - 4, y - 4, w + 8, h + 8);
  }
  function lampGlow(ctx, x, y, r, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(255,210,140,${a})`); g.addColorStop(1, 'rgba(255,210,140,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function wallAndFloor(ctx, W, H, wall, floor, tod, floorTop) {
    ctx.fillStyle = night(wall, tod); ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = shade(night(wall, tod), 0.18); ctx.fillRect(0, floorTop - H * 0.06, W, H * 0.06);
    ctx.fillStyle = night(floor, tod); ctx.fillRect(0, floorTop, W, H - floorTop);
    ctx.strokeStyle = shade(night(floor, tod), 0.25); ctx.lineWidth = Math.max(2, W / 600);
    for (let x = -W; x < W * 2; x += W / 9) { ctx.beginPath(); ctx.moveTo(W / 2 + (x - W / 2) * 0.35, floorTop); ctx.lineTo(x, H); ctx.stroke(); }
  }

  const LOC = {
    room(ctx, W, H, tod, R) {
      const ft = H * 0.74;
      wallAndFloor(ctx, W, H, '#f3e3cf', '#c58b5c', tod, ft);
      windowFrame(ctx, W * 0.12, H * 0.16, W * 0.4, H * 0.32, tod, R, W);
      // curtains
      for (const [x, s] of [[W * 0.07, 1], [W * 0.5, -1]]) { ctx.beginPath(); ctx.moveTo(x, H * 0.13); ctx.lineTo(x + W * 0.07, H * 0.13); ctx.quadraticCurveTo(x + W * 0.04 + s * W * 0.02, H * 0.34, x + W * 0.07, H * 0.52); ctx.lineTo(x, H * 0.52); ctx.closePath(); ctx.fillStyle = night('#7fb3a8', tod); ctx.fill(); line(ctx, W); ctx.stroke(); }
      // shelf + books
      box(ctx, W * 0.62, H * 0.3, W * 0.3, H * 0.02, night('#8a5a3c', tod), W);
      box(ctx, W * 0.62, H * 0.44, W * 0.3, H * 0.02, night('#8a5a3c', tod), W);
      const bc = ['#e85d75', '#4f8fe8', '#f4c542', '#59b88a', '#9b6be0'];
      for (const sy of [H * 0.3, H * 0.44]) { let x = W * 0.63; while (x < W * 0.9) { const bw = W * (0.014 + R() * 0.012), bh = H * (0.05 + R() * 0.04); box(ctx, x, sy - bh, bw, bh, night(bc[Math.floor(R() * bc.length)], tod), W); x += bw + 2; } }
      // poster
      box(ctx, W * 0.66, H * 0.08, W * 0.18, H * 0.16, night('#ffd166', tod), W);
      ctx.fillStyle = night('#ef476f', tod); ctx.beginPath(); ctx.arc(W * 0.75, H * 0.16, H * 0.045, 0, Math.PI * 2); ctx.fill();
      // desk + laptop + mug
      box(ctx, W * 0.05, H * 0.62, W * 0.9, H * 0.035, night('#a8714a', tod), W);
      box(ctx, W * 0.08, H * 0.655, W * 0.04, H * 0.2, night(shade('#a8714a', 0.3), tod), W);
      box(ctx, W * 0.88, H * 0.655, W * 0.04, H * 0.2, night(shade('#a8714a', 0.3), tod), W);
      box(ctx, W * 0.6, H * 0.53, W * 0.18, H * 0.09, night('#c9d3e3', tod), W, 8);
      ctx.fillStyle = tod === 'night' ? '#9fd4ff' : '#6ea8d8'; ctx.fillRect(W * 0.61, H * 0.54, W * 0.16, H * 0.07);
      box(ctx, W * 0.56, H * 0.615, W * 0.26, H * 0.01, night('#aab4c6', tod), W);
      box(ctx, W * 0.25, H * 0.575, W * 0.04, H * 0.045, night('#ffffff', tod), W, 6);
      if (tod === 'night') { lampGlow(ctx, W * 0.69, H * 0.57, W * 0.35, 0.35); lampGlow(ctx, W * 0.85, H * 0.1, W * 0.5, 0.25); }
    },
    office(ctx, W, H, tod, R) {
      const ft = H * 0.76;
      wallAndFloor(ctx, W, H, '#e7ecf2', '#9aa3b5', tod, ft);
      // big window with blinds
      const wx = W * 0.06, wy = H * 0.1, ww = W * 0.88, wh = H * 0.42;
      ctx.save(); ctx.beginPath(); ctx.rect(wx, wy, ww, wh); ctx.clip();
      sky(ctx, wx, wy, ww, wh, tod, R);
      skyline(ctx, wx, wy + wh, ww, wh * 0.7, tod === 'night' ? '#1e2147' : tod === 'evening' ? '#7c5580' : '#8fb4d6', R, tod !== 'day', W);
      ctx.fillStyle = 'rgba(255,255,255,0.28)'; for (let y = wy; y < wy + wh * 0.3; y += H * 0.018) ctx.fillRect(wx, y, ww, H * 0.008);
      ctx.restore();
      line(ctx, W); ctx.lineWidth *= 2.2; ctx.strokeRect(wx, wy, ww, wh);
      for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(wx + ww * i / 4, wy); ctx.lineTo(wx + ww * i / 4, wy + wh); ctx.stroke(); }
      // ceiling lights
      for (let i = 0; i < 3; i++) { box(ctx, W * (0.15 + i * 0.3), H * 0.03, W * 0.12, H * 0.012, '#ffffff', W, 4); if (tod !== 'day') lampGlow(ctx, W * (0.21 + i * 0.3), H * 0.05, W * 0.25, 0.25); }
      // desks + monitors
      for (let i = 0; i < 3; i++) {
        const x = W * (0.04 + i * 0.33);
        box(ctx, x, H * 0.64, W * 0.28, H * 0.03, night('#d7dde8', tod), W);
        box(ctx, x + W * 0.07, H * 0.55, W * 0.14, H * 0.08, night('#2f3448', tod), W, 6);
        ctx.fillStyle = tod === 'night' ? '#7fc8ff' : '#5d7fb5'; ctx.fillRect(x + W * 0.08, H * 0.56, W * 0.12, H * 0.06);
        box(ctx, x + W * 0.13, H * 0.63, W * 0.02, H * 0.012, night('#2f3448', tod), W);
      }
      // plant
      box(ctx, W * 0.86, H * 0.68, W * 0.08, H * 0.09, night('#e07a5f', tod), W, 6);
      ctx.fillStyle = night('#4caf7a', tod); line(ctx, W);
      for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.ellipse(W * 0.9 + Math.cos(k) * W * 0.03, H * 0.64 - k * H * 0.012, W * 0.022, H * 0.04, k * 0.7 - 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    },
    cafe(ctx, W, H, tod, R) {
      const ft = H * 0.75;
      wallAndFloor(ctx, W, H, '#d9a679', '#6e4a36', tod, ft);
      // wood panels
      ctx.fillStyle = night('#9a6a48', tod); ctx.fillRect(0, H * 0.5, W, H * 0.25);
      line(ctx, W); for (let x = 0; x < W; x += W / 12) { ctx.beginPath(); ctx.moveTo(x, H * 0.5); ctx.lineTo(x, ft); ctx.stroke(); }
      // menu board
      box(ctx, W * 0.1, H * 0.1, W * 0.36, H * 0.26, night('#2f4a3e', tod), W, 6);
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = Math.max(2, W / 500);
      for (let i = 0; i < 5; i++) { ctx.beginPath(); const y = H * (0.15 + i * 0.04); ctx.moveTo(W * 0.14, y); for (let x = W * 0.14; x < W * (0.3 + R() * 0.1); x += W * 0.015) ctx.lineTo(x, y + Math.sin(x * 0.2) * 3); ctx.stroke(); }
      // window
      windowFrame(ctx, W * 0.56, H * 0.12, W * 0.34, H * 0.3, tod, R, W, '#6e4a36');
      // pendant lamps
      for (const x of [W * 0.25, W * 0.5, W * 0.75]) {
        ctx.strokeStyle = '#3a2a22'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H * 0.06); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - W * 0.04, H * 0.09); ctx.quadraticCurveTo(x, H * 0.04, x + W * 0.04, H * 0.09); ctx.closePath(); ctx.fillStyle = night('#f4b860', tod); ctx.fill(); line(ctx, W); ctx.stroke();
        lampGlow(ctx, x, H * 0.1, W * 0.22, tod === 'day' ? 0.25 : 0.5);
      }
      // counter + cups
      box(ctx, -10, H * 0.66, W + 20, H * 0.04, night('#c98b5e', tod), W);
      for (const x of [W * 0.2, W * 0.27, W * 0.7]) { box(ctx, x, H * 0.62, W * 0.04, H * 0.04, '#ffffff', W, 5); }
    },
    street(ctx, W, H, tod, R) {
      sky(ctx, 0, 0, W, H * 0.7, tod, R);
      skyline(ctx, 0, H * 0.62, W, H * 0.25, tod === 'night' ? '#272b5c' : tod === 'evening' ? '#9a6a8f' : '#a9c6e2', R, tod === 'night', W);
      // near buildings with signs
      let x = -10;
      const cols = ['#f0d9b5', '#e6b8a2', '#cfd8dc', '#f4e1d2', '#d7c4e8'];
      while (x < W) {
        const bw = W * (0.18 + R() * 0.12), bh = H * (0.42 + R() * 0.2);
        box(ctx, x, H * 0.72 - bh, bw, bh, night(cols[Math.floor(R() * cols.length)], tod), W);
        for (let wy = H * 0.72 - bh + H * 0.04; wy < H * 0.62; wy += H * 0.07) for (let wx = x + bw * 0.12; wx < x + bw * 0.8; wx += bw * 0.28) box(ctx, wx, wy, bw * 0.16, H * 0.04, tod === 'night' && R() < 0.6 ? '#ffd98a' : night('#8fb8d8', tod), W);
        const sc = ['#ef476f', '#06d6a0', '#ffd166', '#118ab2'][Math.floor(R() * 4)];
        box(ctx, x + bw * 0.7, H * 0.72 - bh * 0.85, bw * 0.12, bh * 0.35, sc, W, 4);
        x += bw;
      }
      // pole + wires
      box(ctx, W * 0.82, H * 0.08, W * 0.025, H * 0.66, night('#8d8f99', tod), W);
      box(ctx, W * 0.77, H * 0.14, W * 0.12, H * 0.012, night('#6d6f79', tod), W);
      ctx.strokeStyle = '#2a2236'; ctx.lineWidth = Math.max(2, W / 700);
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(-10, H * (0.1 + k * 0.03)); ctx.quadraticCurveTo(W * 0.4, H * (0.2 + k * 0.03), W * 0.83, H * (0.15 + k * 0.01)); ctx.quadraticCurveTo(W * 0.95, H * (0.18 + k * 0.03), W + 10, H * (0.14 + k * 0.03)); ctx.stroke(); }
      // sidewalk + road
      ctx.fillStyle = night('#c9c3ba', tod); ctx.fillRect(0, H * 0.72, W, H * 0.08);
      ctx.fillStyle = night('#5b5d6b', tod); ctx.fillRect(0, H * 0.8, W, H * 0.2);
      ctx.fillStyle = '#f2f2f2'; for (let rx = 0; rx < W; rx += W * 0.16) ctx.fillRect(rx, H * 0.89, W * 0.08, H * 0.012);
    },
    rooftop(ctx, W, H, tod, R) {
      sky(ctx, 0, 0, W, H * 0.8, tod, R);
      skyline(ctx, 0, H * 0.66, W, H * 0.3, tod === 'night' ? '#1c1f4a' : tod === 'evening' ? '#7d5382' : '#9fbfdc', R, tod !== 'day', W);
      ctx.fillStyle = night('#b8b4ad', tod); ctx.fillRect(0, H * 0.66, W, H * 0.34);
      ctx.fillStyle = shade(night('#b8b4ad', tod), 0.15); for (let y = H * 0.7; y < H; y += H * 0.05) ctx.fillRect(0, y, W, 2);
      // water tank
      box(ctx, W * 0.72, H * 0.42, W * 0.16, H * 0.16, night('#d9d2c5', tod), W, 10);
      box(ctx, W * 0.74, H * 0.58, W * 0.02, H * 0.08, night('#8d8f99', tod), W); box(ctx, W * 0.84, H * 0.58, W * 0.02, H * 0.08, night('#8d8f99', tod), W);
      // fence
      ctx.strokeStyle = night('#6d7f8f', tod); ctx.lineWidth = Math.max(2, W / 700);
      const fy = H * 0.5, fh = H * 0.2;
      for (let fx = -fh; fx < W + fh; fx += W * 0.035) { ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + fh, fy + fh); ctx.moveTo(fx + fh, fy); ctx.lineTo(fx, fy + fh); ctx.stroke(); }
      box(ctx, -10, fy - 6, W + 20, 12, night('#7d8f9f', tod), W); box(ctx, -10, fy + fh - 6, W + 20, 12, night('#7d8f9f', tod), W);
      for (let px = 0; px < W; px += W * 0.2) box(ctx, px, fy - 10, 12, fh + 20, night('#7d8f9f', tod), W);
    },
    abstract(ctx, W, H, tod, R, accent = '#7c5cff') {
      const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, mix(accent, '#ffffff', 0.55)); g.addColorStop(1, mix(accent, '#1a1030', 0.35));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      const step = Math.max(W, H) / 40;
      for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) { const r = step * 0.35 * (x / W); ctx.beginPath(); ctx.arc(x + ((y / step) % 2) * step / 2, y, r, 0, Math.PI * 2); ctx.fill(); }
    },
  };

  function drawBackground(ctx, W, H, loc, tod, seed, accent) {
    const R = rng(seed || 7);
    const f = LOC[loc] || LOC.abstract;
    ctx.save(); f(ctx, W, H, tod || 'day', R, accent); ctx.restore();
  }
  window.AnimeBG = { drawBackground, locations: Object.keys(LOC), rng };
})();
