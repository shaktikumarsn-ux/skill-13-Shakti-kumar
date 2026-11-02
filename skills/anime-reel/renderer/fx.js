// anime-reel — anime FX: focus/speed lines, impact frames, chibi backdrops,
// flashes and onomatopoeia text. All randomness is seeded by frame index.
(function () {
  const { mix, OUT, star } = window.AnimeChar;
  const { rng } = window.AnimeBG;

  // Radial "concentration" lines that leave a clear hole around (cx, cy).
  function focusLines(ctx, W, H, cx, cy, seed, intensity = 1, color = '#120c18', innerFrac = 0.34) {
    const R = rng(seed), far = Math.hypot(W, H);
    const inner = Math.min(W, H) * innerFrac;
    const n = Math.round(110 * intensity);
    ctx.save(); ctx.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, w = 0.003 + R() * 0.011, r0 = inner * (0.9 + R() * 0.75);
      ctx.globalAlpha = 0.55 + R() * 0.4;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a - w) * far, cy + Math.sin(a - w) * far);
      ctx.lineTo(cx + Math.cos(a + w) * far, cy + Math.sin(a + w) * far);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  // Horizontal motion streaks (used by whip pans).
  function motionLines(ctx, W, H, seed, intensity = 1) {
    const R = rng(seed);
    ctx.save();
    for (let i = 0; i < 40 * intensity; i++) {
      ctx.globalAlpha = 0.25 + R() * 0.5; ctx.fillStyle = R() < 0.5 ? '#ffffff' : '#1a1030';
      const y = R() * H, h = 2 + R() * 6, x = R() * W * 0.6 - W * 0.2, w = W * (0.3 + R() * 0.7);
      ctx.fillRect(x, y, w, h);
    }
    ctx.restore();
  }
  // Pale speaker-coloured backdrop that replaces the BG during speed lines.
  function speedBackdrop(ctx, W, H, cx, cy, color) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(W, H) * 0.6);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, mix(color, '#ffffff', 0.45));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  // Impact frame post-process: hard B/W (alternating invert / red) + burst.
  function impactPost(ctx, canvas, tmp, k, cx, cy, W, H, seed) {
    const tctx = tmp.getContext('2d');
    tctx.setTransform(1, 0, 0, 1, 0, 0); tctx.clearRect(0, 0, W, H); tctx.drawImage(canvas, 0, 0);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    const variant = k % 3; // 0 invert, 1 red, 2 plain B/W
    ctx.filter = variant === 0 ? 'grayscale(1) invert(1) contrast(9)' : 'grayscale(1) contrast(9) brightness(1.15)';
    const z = 1.04 + 0.02 * (k % 2);
    ctx.drawImage(tmp, -(W * z - W) / 2, -(H * z - H) / 2, W * z, H * z);
    ctx.filter = 'none';
    if (variant === 1) { ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = '#ff2d3f'; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over'; }
    focusLines(ctx, W, H, cx, cy, seed, 1.4, variant === 0 ? '#ffffff' : '#000000', 0.28);
    ctx.restore();
  }

  const CHIBI_BG = {
    shock:   ['#2d2f7a', '#5a5fd1'], anger: ['#ff6b6b', '#ffd0c2'], sparkle: ['#ff9ad5', '#fff0fa'],
    sweat:   ['#9ad8ff', '#eaf7ff'], cry: ['#6e9bff', '#d9e6ff'], happy: ['#ffd84d', '#fff7d1'],
  };
  function chibiBackdrop(ctx, W, H, reaction, t) {
    const [a, b] = CHIBI_BG[reaction] || CHIBI_BG.sweat;
    ctx.fillStyle = b; ctx.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H * 0.45, far = Math.hypot(W, H);
    ctx.save(); ctx.translate(cx, cy);
    if (reaction === 'shock' || reaction === 'cry') {
      ctx.fillStyle = a; ctx.fillRect(-cx, -cy, W, H);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      for (let x = -cx; x < cx; x += W / 18) ctx.fillRect(x, -cy, 3, H);
    } else {
      ctx.rotate(t * 0.6);
      ctx.fillStyle = mix(a, b, 0.35);
      for (let i = 0; i < 16; i++) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, far, i * Math.PI / 8, i * Math.PI / 8 + Math.PI / 16); ctx.closePath(); ctx.fill(); }
      ctx.rotate(-t * 0.6);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      const step = Math.min(W, H) / 7;
      for (let y = -cy; y < H; y += step) for (let x = -cx; x < W; x += step) { ctx.beginPath(); ctx.arc(x + ((y / step) & 1) * step / 2, y, step * 0.12, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
  }

  function flash(ctx, W, H, a) { if (a <= 0) return; ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.fillRect(0, 0, W, H); ctx.restore(); }

  // Onomatopoeia (e.g. "BAAM!") in Bangers with a punchy scale-in.
  function sfxText(ctx, text, x, y, size, age, color = '#ffe14d') {
    if (!text) return;
    const s = age < 0.08 ? 0.4 + (age / 0.08) * 0.85 : 1.25 - Math.min(0.25, (age - 0.08) * 1.2);
    ctx.save(); ctx.translate(x, y); ctx.rotate(-0.12); ctx.scale(s, s);
    ctx.font = `${size}px Bangers`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = size * 0.16; ctx.strokeStyle = OUT; ctx.strokeText(text, 0, 0);
    ctx.fillStyle = color; ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  window.AnimeFX = { focusLines, motionLines, speedBackdrop, impactPost, chibiBackdrop, flash, sfxText };
})();
