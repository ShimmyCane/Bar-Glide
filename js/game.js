/* Ole Bar Glide — the game: a day of shifts, bars, customers, mugs, breaks and the owner's ending.
 * Draws on a 320 x 200 canvas that CSS scales up with crisp pixels.
 * Exposes window.BarGlide (start, press, release, move, pause, configure, debug). */
(function (BG) {
  'use strict';

  const W = 320, H = 200;
  const BAR_X0 = 36;        // left end of every bar (the doors are left of it)
  const BAR_X1 = 268;       // right end, where the bartender stands
  const TAP_X = 298;        // the beer tap on the right wall
  const POUR_TIME = 0.5;    // seconds to fill a mug
  const FULL_SPEED = 120;   // px/s for a full mug sliding left
  const PUSH_DIST = 46;     // how far a customer slides back when they catch a mug
  const PUSH_SPEED = 90;

  const cfg = { start: 1, speed: 1, glasses: 3, ending: 'spank', theme: 'saloon', glass: 1, events: 2 };
  // One saloon door at the top left; guests walk down the walkway, then turn onto their bar (notes of 11-10 and 11-16).
  const DOOR_TOP = 22;      // top of the door leaves
  const ENTRY_Y = 40;       // feet line of a guest standing in the doorway
  const ENTER_X = 8;        // where guests walk down the walkway
  const EXIT_X = 18;        // where guests walk down when they leave
  const ENTER_SPEED = 40;   // px/s down the walkway
  const LEAVE_SPEED = 90;   // px/s along the bar towards the walkway
  const EXIT_SPEED = 60;    // px/s down the walkway
  // Bonus events (convo v0.4): seconds between events for each ⚙️ level (1 rare ... 4 lots), blurred by chance.
  const EVENT_GAPS = [0, 70, 45, 30, 18];
  let lanes = 2;            // bars open now: set by the shift
  // A day at the bar (convo v0.2). Each round is a shift; after Night the nights keep getting faster.
  //   bars: bars open · speed: how fast customers walk · total: customers in the shift · gap: seconds between arrivals
  //   two: share of customers who order two drinks · relax: easy seconds at the start before it ramps up
  const SHIFTS = [
    { name: 'MORNING', note: 'TWO BARS - TAKE IT EASY', bars: 2, speed: 0.75, total: 6, gap: 4.0, two: 0, relax: 30 },
    { name: 'LUNCH RUSH', note: 'SPEEDING UP!', bars: 2, speed: 0.9, total: 14, gap: 1.9, two: 0.3, relax: 8 },
    { name: 'AFTERNOON', note: 'A THIRD BAR OPENS', bars: 3, speed: 0.9, total: 10, gap: 2.8, two: 0.3, relax: 8 },
    { name: 'DINNER RUSH', note: 'ALL FOUR BARS!', bars: 4, speed: 1.0, total: 14, gap: 2.4, two: 0.35, relax: 8 },
    { name: 'NIGHT', note: 'LAST CALL IS A LONG WAY OFF', bars: 4, speed: 1.15, total: 20, gap: 1.7, two: 0.45, relax: 5 }
  ];
  function shiftFor(n) {
    const base = SHIFTS[Math.min(n, SHIFTS.length) - 1];
    const extra = Math.max(0, n - SHIFTS.length);
    if (!extra) return base;
    return Object.assign({}, base, { name: 'NIGHT ' + (extra + 1), note: 'FASTER!', speed: base.speed + 0.07 * extra,
      total: base.total + 3 * extra, gap: Math.max(1.1, base.gap - 0.08 * extra), two: Math.min(0.6, base.two + 0.03 * extra) });
  }
  const CATCH_EARLY = 0.1;  // seconds: an empty mug this close to the end is caught when you arrive
  const TEETER = 0.25;      // seconds an empty mug wobbles on the edge before it falls
  const hooks = { onState: null, onGameOver: null, onError: null };

  let canvas, ctx, sprites, bg = null, barImg = null, theme = BG.THEMES.saloon;
  let lanesY = [];
  let state = 'title';      // title | ready | play | oops | clear | boss | over
  let paused = false;
  let timer = 0, clock = 0;
  let score = 0, best = 0, lives = 3;
  let round = null;
  let customers = [], mugs = [], parts = [], pops = [], doorOpen = 0;
  let bt = null, oops = null, boss = null;
  let tips = [], dash = null, show = 0, bonus = null;
  let ev = null, evT = 0;   // the bonus event now playing, and the countdown to the next one
  const TIP_CHANCE = 0.22;  // chance a customer leaves a coin when they catch a mug
  const SHOW_TIME = 3.5;    // seconds the customers stop to watch the show

  // ---------- setup ----------
  function laneLayout() {
    const n = lanes;
    const top = { 2: 86, 3: 74, 4: 64 }[n] || 64, gap = { 2: 54, 3: 44, 4: 34 }[n] || 34;
    lanesY = [];
    for (let i = 0; i < n; i++) lanesY.push(top + i * gap);
  }

  // ---------- drawing helpers (version 2: the canvas is SCALE times bigger and drawn with smooth shapes) ----------
  const S = BG.SCALE, TAU = Math.PI * 2;
  const shade = BG.shade, mixc = BG.mix;
  function blit(img, x, y) { ctx.drawImage(img, x, y, img.lw, img.lh); }
  function rr(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  function disc(cx, cy, r, fill) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fillStyle = fill; ctx.fill(); }
  function vg(y0, y1, c0, c1) { const g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, c0); g.addColorStop(1, c1); return g; }
  function hg(x0, x1, c0, c1) { const g = ctx.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, c0); g.addColorStop(1, c1); return g; }
  function outline(w) { ctx.strokeStyle = theme.ink; ctx.lineWidth = w || 0.6; ctx.stroke(); }
  function soft(cx, cy, r, color) {                      // a soft round glow
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }

  function buildBackground() {
    const c = document.createElement('canvas');
    c.width = W * S; c.height = H * S; c.lw = W; c.lh = H;
    const x = c.getContext('2d');
    x.scale(S, S);
    const T = theme, pastel = T === BG.THEMES.pastel;
    const save = ctx; ctx = x;                 // the helpers draw on `ctx`
    // Wall: a soft gradient with planks, grain and a little light from above.
    x.fillStyle = vg(0, H, shade(T.wall, 1.12), shade(T.wall, 0.78)); x.fillRect(0, 0, W, H);
    for (let px = 0; px < W; px += 16) {
      x.fillStyle = (px / 16) % 2 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.06)'; x.fillRect(px, 0, 16, H);
      x.fillStyle = T.plankLine; x.globalAlpha = 0.55; x.fillRect(px, 0, 0.6, H); x.globalAlpha = 1;
      x.fillStyle = 'rgba(255,255,255,0.06)'; x.fillRect(px + 0.6, 0, 0.5, H);
      for (let k = 0; k < 5; k++) { x.fillStyle = 'rgba(0,0,0,0.07)'; x.fillRect(px + 2 + ((px * 7 + k * 5) % 11), (px * 13 + k * 41) % H, 0.5, 6 + (k * 7) % 10); }
    }
    // Shelves with glass bottles, lit from behind.
    const shelfY = 40;
    [[40, 132], [188, 280]].forEach(([a, b]) => {
      soft((a + b) / 2, shelfY - 8, 60, pastel ? 'rgba(255,255,230,0.35)' : 'rgba(255,190,100,0.22)');
      x.fillStyle = vg(shelfY - 1, shelfY + 5, T.shelfHi, shade(T.shelf, 0.8)); rr(a - 2, shelfY, b - a + 4, 4.5, 1.2); x.fill(); outline(0.5);
      x.fillStyle = vg(shelfY + 5, shelfY + 10, 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0)'); x.fillRect(a, shelfY + 5, b - a, 5);
    });
    const bottleCols = ['#3f8f5a', '#c8463a', '#d9a441', '#6a9fd8', '#8a5a2b', '#b05fa0', '#e8e2cc'];
    let bi = 0;
    [[44, 128], [192, 276]].forEach(([a, b]) => {
      for (let bx = a; bx < b; bx += 7) {
        const hgt = 9 + ((bx * 13) % 5), col = bottleCols[bi++ % bottleCols.length], top = shelfY - hgt;
        x.fillStyle = 'rgba(0,0,0,0.2)'; x.beginPath(); x.ellipse(bx + 2.4, shelfY + 0.3, 3.2, 0.9, 0, 0, TAU); x.fill();
        x.fillStyle = hg(bx, bx + 4.6, shade(col, 1.3), shade(col, 0.7)); rr(bx, top, 4.6, hgt, 1.5); x.fill(); outline(0.45);
        x.fillStyle = hg(bx + 1.2, bx + 3.4, shade(col, 1.15), shade(col, 0.8)); rr(bx + 1.3, top - 3.4, 2.1, 3.8, 0.8); x.fill(); outline(0.4);
        x.fillStyle = shade(col, 0.5); x.fillRect(bx + 1.3, top - 3.7, 2.1, 0.9);
        x.fillStyle = 'rgba(255,248,230,0.8)'; x.fillRect(bx + 0.4, top + hgt * 0.4, 3.8, hgt * 0.28);
        x.fillStyle = 'rgba(255,255,255,0.5)'; x.fillRect(bx + 0.8, top + 1.2, 0.7, hgt - 3);
      }
    });
    // Hanging lamps with a warm pool of light.
    [86, 234].forEach(lx => {
      soft(lx, 30, 72, T.glow); soft(lx, 25, 16, pastel ? 'rgba(255,255,220,0.5)' : 'rgba(255,214,140,0.5)');
      x.fillStyle = T.ink; x.fillRect(lx - 0.3, 0, 0.6, 16);
      x.beginPath(); x.arc(lx, 22, 6, Math.PI, 0); x.closePath(); x.fillStyle = vg(16, 22, T.brass, T.brassDark); x.fill(); outline(0.5);
      disc(lx, 23.2, 2.2, T.lamp);
    });
    // Right wall: a wooden panel with one tap per bar, shaded at the edge.
    x.fillStyle = hg(288, 320, shade(T.shelf, 0.95), shade(T.shelf, 0.7)); x.fillRect(288, 0, 32, H);
    for (let py = 0; py < H; py += 12) { x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(289, py, 31, 0.5); x.fillStyle = 'rgba(255,255,255,0.06)'; x.fillRect(289, py + 0.5, 31, 0.5); }
    x.fillStyle = hg(288, 293, 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0)'); x.fillRect(288, 0, 5, H);
    x.fillStyle = T.plankLine; x.fillRect(287.6, 0, 0.8, H);
    // Floor.
    x.fillStyle = vg(186, H, shade(T.floorB, 1.15), shade(T.floorA, 0.7)); x.fillRect(0, 186, W, 14);
    for (let fx = 0; fx < W; fx += 10) { x.fillStyle = (fx / 10) % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)'; x.fillRect(fx, 186, 10, 14); }
    x.fillStyle = vg(180, 186, 'rgba(0,0,0,0)', 'rgba(0,0,0,0.3)'); x.fillRect(0, 180, W, 6);
    // The saloon doorway (night sky or a bright day) and the carpeted walkway to every bar.
    rr(2, DOOR_TOP - 2, 30, 22, 3.5); x.fillStyle = T.ink; x.fill();
    rr(4, DOOR_TOP, 26, 18, 2); x.fillStyle = vg(DOOR_TOP, DOOR_TOP + 18, shade(T.night, 0.7), shade(T.night, 1.3)); x.fill();
    disc(23.5, DOOR_TOP + 5, 2.4, T.star); disc(24.4, DOOR_TOP + 4.4, 2, shade(T.night, 0.95));
    [[9, 3], [15, 7], [19, 2], [11, 10]].forEach(([sx, sy]) => disc(sx, DOOR_TOP + sy, 0.45, T.star));
    rr(2, DOOR_TOP + 20, 30, 166 - DOOR_TOP, 2); x.fillStyle = T.ink; x.fill();
    const carpet = mixc(T.floorB, T.neon, pastel ? 0.3 : 0.35);
    x.fillStyle = hg(4, 30, shade(carpet, 1.1), shade(carpet, 0.8)); x.fillRect(4, DOOR_TOP + 20, 26, 166 - DOOR_TOP);
    x.fillStyle = T.rail; x.fillRect(5, DOOR_TOP + 20, 0.7, 166 - DOOR_TOP); x.fillRect(28.3, DOOR_TOP + 20, 0.7, 166 - DOOR_TOP);
    for (let wy = DOOR_TOP + 26; wy < 184; wy += 14) {
      x.beginPath(); x.moveTo(17, wy - 5); x.lineTo(22, wy); x.lineTo(17, wy + 5); x.lineTo(12, wy); x.closePath();
      x.fillStyle = 'rgba(255,230,160,0.2)'; x.fill();
    }
    // A gentle vignette.
    const vgn = x.createRadialGradient(W / 2, H / 2, 70, W / 2, H / 2, 210);
    vgn.addColorStop(0, 'rgba(0,0,0,0)'); vgn.addColorStop(1, pastel ? 'rgba(120,70,60,0.14)' : 'rgba(0,0,0,0.5)');
    x.fillStyle = vgn; x.fillRect(0, 0, W, H);
    bg = c;

    // One bar, drawn once and reused for every lane: polished top, panelled front, brass rail.
    const bw = BAR_X1 - BAR_X0 + 4;
    const b = document.createElement('canvas');
    b.width = bw * S; b.height = 16 * S; b.lw = bw; b.lh = 16;
    const y = b.getContext('2d');
    y.scale(S, S); ctx = y;
    rr(0, 0, bw, 16, 2); y.fillStyle = T.ink; y.fill();
    rr(0.8, 0.8, bw - 1.6, 5, 1.6); y.fillStyle = vg(0.8, 5.8, T.barTopHi, T.barTop); y.fill();
    y.fillStyle = 'rgba(255,255,255,0.45)'; y.fillRect(2, 1.3, bw - 4, 0.7);
    y.fillStyle = 'rgba(255,255,255,0.12)'; y.fillRect(14, 2.4, 40, 0.6); y.fillRect(bw - 70, 3.2, 30, 0.6);
    y.fillStyle = vg(5.8, 15.2, shade(T.barFront, 1.15), shade(T.barFront, 0.78)); y.fillRect(0.8, 5.8, bw - 1.6, 9.4);
    for (let px = 8; px < bw - 14; px += 26) {
      rr(px, 7, 21, 5.6, 1.2); y.fillStyle = shade(T.barPanel, 0.85); y.fill();
      rr(px + 0.5, 7.5, 20, 4.6, 0.9); y.fillStyle = vg(7.5, 12.1, shade(T.barPanel, 1.1), shade(T.barPanel, 0.9)); y.fill();
      y.fillStyle = 'rgba(255,255,255,0.18)'; y.fillRect(px + 1.2, 7.7, 18.6, 0.5);
    }
    y.fillStyle = vg(12.9, 14.5, shade(T.rail, 1.3), shade(T.rail, 0.7)); rr(0.8, 12.9, bw - 1.6, 1.6, 0.8); y.fill();
    y.fillStyle = 'rgba(255,255,255,0.6)'; y.fillRect(2, 13.2, bw - 4, 0.4);
    barImg = b;
    ctx = save;
  }

  function init(el) {
    canvas = el;
    canvas.width = W * BG.SCALE; canvas.height = H * BG.SCALE;
    ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    sprites = BG.sprites();
    try { best = +localStorage.getItem('barglide.best') || 0; } catch (e) { best = 0; }
    applyConfig();
    resetRun();
    state = 'title';
    requestAnimationFrame(frame);
  }

  function applyConfig() {
    theme = BG.THEMES[cfg.theme] || BG.THEMES.saloon;
    laneLayout();
    buildBackground();
  }

  function resetRun() {
    score = 0; lives = cfg.glasses;
    customers = []; mugs = []; parts = []; pops = [];
    bt = { lane: 0, fill: 0, holding: false, throwT: 0, shake: 0 };
    oops = null; boss = null; ev = null;
    startRound(cfg.start);
  }

  function startRound(n) {
    const shift = shiftFor(n);
    round = { n, shift, total: shift.total, spawned: 0, served: 0, spawnT: 1.2, t: 0 };
    if (shift.bars !== lanes) { lanes = shift.bars; applyConfig(); }
    if (bt) bt.lane = Math.min(bt.lane, lanes - 1);
    customers = []; mugs = []; tips = []; dash = null; show = 0; bonus = null; ev = null; evT = nextEventGap(1.3);
    if (bt) { bt.holding = false; bt.fill = 0; }
    setState('ready', 1.6);
  }

  function setState(s, t) {
    state = s; timer = t || 0;
    syncMusic();
    if (hooks.onState) hooks.onState(s);
  }
  // Music runs while the bar is open, a little faster each round and during the show.
  function syncMusic() {
    const on = !paused && (state === 'ready' || state === 'play' || state === 'clear' || state === 'bonus');
    const speed = Math.min(1.45, 1 + ((round && round.n) || 1) * 0.04 + (show > 0 ? 0.12 : 0));
    BG.sound.music(on, speed);
  }

  // ---------- difficulty ----------
  // Easy for the shift's first seconds, then it ramps up over a minute.
  function ramp() {
    const r = round.shift.relax;
    return round.t < r ? 0.8 : Math.min(1.2, 0.8 + (round.t - r) / 60 * 0.4);
  }
  function walkSpeed() { return 11 * round.shift.speed * ramp() * cfg.speed; }
  function spawnGap() { return round.shift.gap / ramp() / cfg.speed; }
  function emptySpeed() { return (8 + 30 * round.shift.speed) * cfg.speed * cfg.glass; }   // ⚙️ slider: how fast empties come back

  // ---------- input ----------
  function move(lane) {
    if (state !== 'play' && state !== 'ready') return;
    lane = Math.max(0, Math.min(lanes - 1, lane));
    if (lane === bt.lane) return;
    bt.lane = lane; bt.fill = 0; bt.throwT = 0;
    puff(BAR_X1 + 10, lanesY[lane] + 2);
  }
  function press(lane) {
    if (typeof lane === 'number') move(lane);
    bt.holding = true;
  }
  function release() {
    if (!bt.holding) return;
    bt.holding = false;
    if (state === 'play' && bt.fill >= 1) {
      mugs.push({ lane: bt.lane, x: BAR_X1 - 8, full: true });
      bt.fill = 0; bt.throwT = 0.25;
      BG.sound.play('slide');
    }
  }
  function laneAt(gameY) {
    let bestLane = 0, d = 1e9;
    lanesY.forEach((y, i) => { const dd = Math.abs(gameY - (y - 6)); if (dd < d) { d = dd; bestLane = i; } });
    return bestLane;
  }

  // ---------- update ----------
  function frame(now) {
    requestAnimationFrame(frame);
    const t = now / 1000;
    let dt = clock ? t - clock : 0;
    clock = t;
    if (dt > 0.05) dt = 0.05;
    try {
      if (!paused) update(dt);
      draw();
    } catch (e) {
      if (hooks.onError) hooks.onError('Game loop: ' + e.message);
      paused = true;
    }
  }

  function update(dt) {
    doorOpen = Math.max(0, doorOpen - dt * 3);
    parts = parts.filter(p => {
      p.life -= dt; p.vy += (p.g || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.floor && p.y > p.floor) { p.y = p.floor; p.vy *= -0.3; p.vx *= 0.6; }
      return p.life > 0;
    });
    pops = pops.filter(p => { p.t += dt; return p.t < p.life; });
    if (bt.throwT > 0) bt.throwT -= dt;
    if (bt.shake > 0) bt.shake -= dt;

    if (state === 'ready') { timer -= dt; if (timer <= 0) setState('play'); return; }
    if (state === 'clear') { timer -= dt; if (timer <= 0) { if (round.n % 2 === 0) startBonus(); else startRound(round.n + 1); } return; }
    if (state === 'bonus') { updateBonus(dt); return; }
    if (state === 'oops') { updateOops(dt); return; }
    if (state === 'boss') { updateBoss(dt); return; }
    if (state !== 'play') return;

    // Tips fade away; the dash to grab one; the show.
    tips = tips.filter(t => (t.t -= dt) > 0);
    if (show > 0) { show -= dt; if (show <= 0) syncMusic(); }
    if (dash) updateDash(dt);

    // Pouring.
    if (bt.holding && bt.fill < 1 && !dash) {
      const before = bt.fill;
      bt.fill = Math.min(1, bt.fill + dt / POUR_TIME);
      if (Math.floor(before * 6) !== Math.floor(bt.fill * 6)) BG.sound.play('pour', bt.fill);
    }

    // New customers: they step in at the saloon door, one at a time, and choose a bar.
    round.t += dt;
    const frozen = !!(ev && ev.freeze);
    if (!frozen) round.spawnT -= dt;
    if (round.spawned < round.total && round.spawnT <= 0 && !frozen) {
      const counts = lanesY.map((_, i) => customers.filter(c => c.lane === i && c.state !== 'leave').length);
      const doorFree = !customers.some(c => c.state === 'enter' && c.fy < ENTRY_Y + 18);
      const open = lanesY.map((_, i) => i).filter(i => counts[i] < 3 && !customers.some(c => c.lane === i && !c.vert && c.x < 24 && c.state !== 'leave'));
      if (open.length && doorFree) {
        const lane = open[Math.floor(Math.random() * open.length)];
        customers.push({ lane, x: ENTER_X, fy: ENTRY_Y, vert: true, state: 'enter', t: 0, kind: Math.floor(Math.random() * 5), push: 0, bob: 0,
          wants: Math.random() < round.shift.two ? 2 : 1 });
        doorOpen = 1;
        round.spawned++;
        round.spawnT = spawnGap() * (0.6 + Math.random() * 0.8);
      } else if (!open.length) round.spawnT = spawnGap() * (0.6 + Math.random() * 0.8);
      else round.spawnT = 0.3;
    }

    // The bonus events (dancer, fight, celebration, a helper's break).
    updateEvents(dt);

    // Customers walk in steps toward the bartender, but only once they are at their bar.
    for (const c of customers) {
      const onBar = !c.vert && (c.state === 'walk' || c.state === 'pause');
      if (onBar && (show > 0 || (ev && (ev.freeze || ev.hold === c.lane)))) { c.bob += dt * 2; continue; }   // watching
      if (c.state === 'enter') {                 // down the walkway, then turn onto the bar
        c.fy += ENTER_SPEED * cfg.speed * dt; c.bob += dt * 1.5;
        if (c.fy >= lanesY[c.lane]) { c.vert = false; c.state = 'walk'; c.t = 0.4; }
      } else if (c.state === 'walk') {
        c.x += walkSpeed() * dt; c.bob += dt; c.t -= dt;
        if (c.t <= 0) { c.state = 'pause'; c.t = 0.5 + Math.random() * 0.6; }
        if (c.x + 11 >= BAR_X1 - 2) return strike('grumpy', c.lane, c.x + 10, lanesY[c.lane] - 8, c);
      } else if (c.state === 'pause') {
        c.t -= dt; if (c.t <= 0) { c.state = 'walk'; c.t = 0.7 + Math.random() * 0.6; }
      } else if (c.state === 'pushed') {
        const step = PUSH_SPEED * dt;
        c.x = Math.max(ENTER_X + 2, c.x - step); c.push -= step;
        if (c.push <= 0 || c.x <= ENTER_X + 2) { c.state = 'drink'; c.t = 1.3; BG.sound.play('gulp'); }
      } else if (c.state === 'drink') {
        c.t -= dt;
        if (c.t <= 0) {
          mugs.push({ lane: c.lane, x: c.x + 12, full: false });     // the empty comes back; it is not a new order until then
          if (c.wants > 0) { c.state = 'pause'; c.t = 0.4; }          // wants another: comes back for it, X2 gone
          else { c.state = 'leave'; c.t = 0; }                         // had their fill: heads out
        }
      } else if (c.state === 'leave') {
        c.bob += dt * 2;
        if (!c.vert) {
          c.x -= LEAVE_SPEED * dt;
          if (c.x <= EXIT_X) {
            c.x = EXIT_X; c.vert = true; c.fy = lanesY[c.lane];
            if (!c.escorted) { score += 50; round.served++; BG.sound.play('serve'); pop('+50', 24, lanesY[c.lane] - 18); }
          }
        } else {
          c.fy += EXIT_SPEED * dt;
          if (c.fy > H + 18) c.gone = true;
        }
      }
    }
    customers = customers.filter(c => !c.gone);

    // Mugs slide.
    for (const m of mugs) {
      if (m.full) {
        m.x -= FULL_SPEED * cfg.speed * dt;
        const catcher = customers
          .filter(c => c.lane === m.lane && !c.vert && (c.state === 'walk' || c.state === 'pause') && c.x - 4 <= m.x && (c.x + 11 >= m.x || m.x <= BAR_X0 + 2))
          .sort((a, b) => b.x - a.x)[0];
        if (catcher) {
          m.gone = true; score += 10;
          BG.sound.play('catch');
          catcher.wants = Math.max(0, (catcher.wants || 1) - 1);    // one drink down; the next waits until they finish this one
          catcher.state = 'pushed'; catcher.push = PUSH_DIST;
          if (Math.random() < TIP_CHANCE && !tips.some(t => t.lane === m.lane) && catcher.x > BAR_X0 + 6) {
            tips.push({ lane: m.lane, x: Math.round(catcher.x + 4), t: 7 });
            pop('TIP!', catcher.x + 6, lanesY[m.lane] - 20);
          }
        } else if (m.x < BAR_X0 - 2) {
          if (m.helper) { m.gone = true; continue; }          // a helper's mug that found nobody is no strike
          return strike('missed', m.lane, BAR_X0 - 4, lanesY[m.lane] - 7, null, -1);
        }
      } else {
        const edge = BAR_X1 - 6;
        if (m.x < edge) m.x = Math.min(edge, m.x + emptySpeed() * dt);
        const here = bt.lane === m.lane && !dash;
        const helped = helperOn(m.lane);
        if (helped && m.x >= edge) {
          m.gone = true; score += 10; BG.sound.play('catch'); pop('+10', BAR_X1 - 4, lanesY[m.lane] - 14);
        } else if (here && m.x >= edge - emptySpeed() * CATCH_EARLY) {
          m.gone = true; score += 25; BG.sound.play('catch'); pop(m.teeter ? 'SAVED! +25' : '+25', BAR_X1 - 4, lanesY[m.lane] - 14);
        } else if (m.x >= edge) {
          if (m.teeter === undefined) { m.teeter = 0; BG.sound.play('swap'); }
          m.teeter += dt;                   // wobbles on the edge: a last moment to save it
          if (m.teeter > TEETER) return strike('dropped', m.lane, BAR_X1 - 2, lanesY[m.lane] - 7, null, 1);
        }
      }
    }
    mugs = mugs.filter(m => !m.gone);

    if (score > best) { best = score; try { localStorage.setItem('barglide.best', String(best)); } catch (e) {} }

    if (round.spawned >= round.total && !customers.length && !mugs.length) {
      score += 100 * round.n;
      pop('ROUND BONUS +' + 100 * round.n, W / 2, 96);
      if (score > best) { best = score; try { localStorage.setItem('barglide.best', String(best)); } catch (e) {} }
      BG.sound.play('clear');
      ev = null;
      setState('clear', 2.2);
    }
  }

  // ---------- oops: a glass breaks or a customer reaches the end ----------
  function strike(kind, lane, x, y, cust, dir) {
    bt.holding = false; bt.fill = 0;
    oops = { kind, lane, t: 0, cust, glass: kind === 'grumpy' ? null : { x, y, vx: 26 * dir, vy: -30, broken: false } };
    bt.shake = 1.4;
    if (kind === 'grumpy') { BG.sound.play('hey'); pop('HEY!', x, y - 14, true); setTimeout(() => BG.sound.play('uhoh'), 400); }
    else BG.sound.play('uhoh');
    setState('oops');
  }

  function updateOops(dt) {
    oops.t += dt;
    const g = oops.glass;
    if (g && !g.broken) {
      g.vy += 260 * dt; g.x += g.vx * dt; g.y += g.vy * dt;
      if (g.y >= 182) {
        g.broken = true; g.y = 182;
        BG.sound.play('break');
        for (let i = 0; i < 16; i++) {
          parts.push({ x: g.x, y: 181, vx: (Math.random() - 0.5) * 110, vy: -40 - Math.random() * 70, g: 260, floor: 184,
            life: 1.6, color: i % 3 ? '#bfe3ea' : (i % 2 ? '#f2b134' : '#ffffff') });
        }
      }
    }
    if (oops.t > 2.3) {
      lives--;
      oops = null;
      if (lives <= 0) return startBoss();
      // Everyone goes back out; the customers still in the bar come again later.
      round.spawned -= customers.length;
      customers = []; mugs = []; ev = null; evT = nextEventGap(1.3);
      setState('ready', 1.4);
    }
  }

  // ---------- the owner's ending ----------
  function startBoss() {
    ev = null;
    boss = { t: 0, lane: bt.lane, x: 330, hits: 0, nextHit: 0, tearT: 0 };
    BG.sound.play('over');
    setState('boss');
  }

  function updateBoss(dt) {
    const b = boss;
    b.t += dt;
    const y = lanesY[b.lane];
    if (b.t < 1.2) {
      b.x = 330 - (330 - 284) * (b.t / 1.2);
      if (Math.floor(b.t * 4) !== Math.floor((b.t - dt) * 4)) BG.sound.play('stomp');
    } else if (b.t < 1.9) {
      b.x = 284 - (b.t - 1.2) / 0.7 * 22;           // walks up to the bar end
    } else if (b.t < 5.6) {
      b.x = 262;
      const cycle = 0.55;
      const k = Math.floor((b.t - 2.1) / cycle);
      if (b.t >= 2.1 && k >= b.hits && b.hits < 6) {
        b.hits = k + 1;
        if (cfg.ending === 'spank') {
          BG.sound.play('whap');
          pop('WHAP!', 252 + (b.hits % 2 ? -6 : 6), y - 30, true);
          for (let i = 0; i < 5; i++) parts.push({ x: 248, y: y - 14, vx: (Math.random() - 0.5) * 80, vy: -30 - Math.random() * 40, g: 120, life: 0.6, color: '#fff2b0' });
        } else {
          BG.sound.play('hey');
          if (b.hits % 2) pop('TSK TSK!', 270, y - 34, true);
        }
        if (b.hits % 2 === 0) BG.sound.play('sob');
      }
      // Little pixel tears from the bartender's eye.
      b.tearT -= dt;
      if (b.tearT <= 0) {
        b.tearT = 0.09;
        parts.push({ x: 232 + 4 + Math.random() * 2, y: y - 1, vx: (Math.random() - 0.5) * 14, vy: 10, g: 220, life: 1.2, floor: 184, color: '#7fc8ff' });
      }
    } else if (b.t < 7.4) {
      if (!b.said) { b.said = true; pop(cfg.ending === 'spank' ? 'AND STAY BEHIND THAT BAR!' : 'BACK TO WORK, KID!', W / 2, y - 40, true, 1.8); }
    } else {
      setState('over');
      if (hooks.onGameOver) hooks.onGameOver({ score, round: round.n, best });
    }
  }

  // ---------- tips and the show ----------
  function grabTip(tip) {
    bt.lane = tip.lane; bt.fill = 0; bt.holding = false;
    dash = { lane: tip.lane, tip, x: 272, back: false };
    BG.sound.play('slide');
  }
  function updateDash(dt) {
    const speed = 300;
    if (!dash.back) {
      dash.x -= speed * dt;
      if (dash.x <= dash.tip.x + 4) {
        tips = tips.filter(t => t !== dash.tip);
        score += 150; show = SHOW_TIME;
        pop('+150', dash.tip.x, lanesY[dash.lane] - 18);
        pop('SHOW TIME!', W / 2, 52, true, 1.6);
        BG.sound.play('tip'); BG.sound.play('show');
        syncMusic();
        dash.back = true;
      }
    } else {
      dash.x += speed * dt;
      if (dash.x >= 272) dash = null;
    }
  }

  // ---------- bonus events (convo v0.4): dancer, fight, celebration, a helper's break ----------
  // ⚙️ → Bonus events sets how often they come (Off, Rare ... Lots); the gap is blurred by chance so they never feel timed.
  function nextEventGap(first) {
    const base = EVENT_GAPS[cfg.events] || 0;
    return base ? base * (first || 1) * (0.6 + Math.random() * 0.9) : 1e9;
  }
  const DANCES = ['twirl', 'shimmy', 'bounce', 'kick'];
  const FIGHTS = ['brawl', 'wrestle', 'shove'];
  const PARTIES = ['confetti', 'toast', 'conga'];
  const HELPERS = [{ name: 'PAL', kind: 1 }, { name: 'COUSIN', kind: 2 }, { name: 'NEIGHBOUR', kind: 3 }];
  let lastEvent = '';
  const pick = list => list[Math.floor(Math.random() * list.length)];
  function barGuests(lane) { return customers.filter(c => !c.vert && c.state !== 'leave' && (lane === undefined || c.lane === lane)); }
  function helperOn(lane) { return !!(ev && ev.kind === 'helper' && ev.lanes.indexOf(lane) >= 0 && ev.t > 0.8 && ev.t < ev.dur - 0.8); }

  function startEvent(force) {
    const kinds = [];
    if (barGuests().length >= 1) kinds.push('dancer', 'celebration', 'fight');
    if (barGuests().length >= 2) kinds.push('helper');
    if (!kinds.length) return false;
    let kind = force && kinds.indexOf(force) >= 0 ? force : pick(kinds);
    if (!force && kind === lastEvent && kinds.length > 1) kind = pick(kinds.filter(k => k !== kind));
    lastEvent = kind;
    const guestLanes = lanesY.map((_, i) => i).filter(i => barGuests(i).length);
    if (kind === 'dancer') {
      ev = { kind, variant: pick(DANCES), t: 0, dur: 10 + Math.random() * 5, freeze: true, lane: Math.floor(Math.random() * lanes), x: 90 + Math.random() * 120, cheerT: 0.5, landed: false, kindSprite: Math.floor(Math.random() * 5) };
      pop('DRUNK DANCER!', W / 2, 52, true, 1.6); BG.sound.play('cheer');
    } else if (kind === 'celebration') {
      ev = { kind, variant: pick(PARTIES), t: 0, dur: 8 + Math.random() * 3, freeze: true, cheerT: 0.4 };
      pop('CELEBRATION!', W / 2, 52, true, 1.6); BG.sound.play('cheer');
    } else if (kind === 'fight') {
      const most = Math.max.apply(null, guestLanes.map(i => barGuests(i).length));
      const lane = pick(guestLanes.filter(i => barGuests(i).length === most));
      const x = 100 + Math.random() * 70;
      ev = { kind, variant: pick(FIGHTS), t: 0, dur: 6 + (x + 30) / 80 + 0.4, hold: lane, lane, x, k1: Math.floor(Math.random() * 5), k2: Math.floor(Math.random() * 5), hitT: 1, whistled: false, swept: false };
      pop('BAR FIGHT!', W / 2, 52, true, 1.6); BG.sound.play('hey');
    } else {
      const lanesWith = guestLanes.slice().sort(() => Math.random() - 0.5);
      const mine = lanesWith.slice(0, lanes >= 3 && Math.random() < 0.5 ? 2 : 1);
      ev = { kind, variant: pick(HELPERS), t: 0, dur: 15, lanes: mine, serveT: mine.map(() => 1.2) };
      pop(ev.variant.name + ' HELPS OUT!', W / 2, 52, true, 1.8); BG.sound.play('tip');
    }
    return true;
  }

  function endEvent() { ev = null; evT = nextEventGap(1); }

  function updateEvents(dt) {
    if (!ev) {
      if (dash || show > 0 || round.t < 12 || round.n < 2) return;   // events start at Lunch (convo v0.5)
      evT -= dt;
      if (evT <= 0 && !startEvent()) evT = 3;
      return;
    }
    ev.t += dt;
    if (ev.kind === 'dancer' || ev.kind === 'celebration') {
      ev.cheerT -= dt;
      if (ev.cheerT <= 0 && ev.t < ev.dur - 1.2) {
        ev.cheerT = 1.1 + Math.random() * 0.8;
        const g = pick(barGuests().concat([null]));
        if (g) pop(pick(['WOO!', 'YEAH!', 'HA HA!', 'HOORAY!']), g.x + 6, lanesY[g.lane] - 22, true, 0.9);
        if (Math.random() < 0.5) BG.sound.play('cheer');
      }
      if (ev.kind === 'celebration' && ev.t < ev.dur - 0.5) {
        if (Math.random() < dt * 30) parts.push({ x: Math.random() * W, y: 24, vx: (Math.random() - 0.5) * 30, vy: 20 + Math.random() * 30, g: 20, life: 2.4, color: pick(['#ffd36b', '#ff5fa2', '#7fc8ff', '#b6e34a', '#fff8e6']) });
      }
      if (ev.kind === 'dancer' && !ev.landed && ev.t > ev.dur - 0.25) {
        ev.landed = true; BG.sound.play('thud'); pop('OOF!', ev.x + 6, lanesY[ev.lane] + 18, true, 0.9);
        puff(ev.x + 6, lanesY[ev.lane] + 18);
      }
    } else if (ev.kind === 'fight') {
      const f = ev;
      if (f.t > 0.6 && f.t < 5.2) {
        f.hitT -= dt;
        if (f.hitT <= 0) { f.hitT = 0.7; BG.sound.play('whap'); pop(pick(['POW!', 'WHAM!', 'BONK!', 'OOF!']), f.x + 6, lanesY[f.lane] - 24, true, 0.6); }
      }
      if (f.t >= 5.2 && !f.whistled) { f.whistled = true; BG.sound.play('whistle'); pop('BOUNCER!', 60, lanesY[f.lane] - 24, true, 1); }
      if (f.t >= 6.0) {
        if (!f.swept) { f.swept = true; f.hold = -1; mugs = mugs.filter(m => !(m.full && m.lane === f.lane)); pop('OUT YOU GO!', W / 2, 52, true, 1.4); }
        barGuests(f.lane).forEach(c => {
          if (c.state === 'walk' || c.state === 'pause') { c.state = 'leave'; c.escorted = true; round.spawned = Math.max(0, round.spawned - 1); }   // no score, no penalty, and they don't count: new guests come
        });
      }
    } else if (ev.kind === 'helper') {
      const h = ev;
      if (h.t > 0.8 && h.t < h.dur - 0.8) h.lanes.forEach((lane, k) => {
        h.serveT[k] -= dt;
        if (h.serveT[k] > 0) return;
        h.serveT[k] = 0.8 + Math.random() * 0.4;
        if (mugs.some(m => m.full && m.lane === lane)) return;
        if (barGuests(lane).some(c => (c.state === 'walk' || c.state === 'pause') && c.x > BAR_X0 - 6)) {
          mugs.push({ lane, x: BAR_X1 - 8, full: true, helper: true }); BG.sound.play('slide');
        }
      });
    }
    if (ev.t >= ev.dur) endEvent();
  }

  // ---------- bonus round: find the coin under the mugs ----------
  const SLOTS = [104, 160, 216];
  function startBonus() {
    const coin = Math.floor(Math.random() * 3);
    const swaps = [];
    const n = Math.min(12, 5 + Math.floor(round.n / 2));
    for (let i = 0; i < n; i++) { const a = Math.floor(Math.random() * 3); swaps.push([a, (a + 1 + Math.floor(Math.random() * 2)) % 3]); }
    bonus = { phase: 'show', t: 0, slotOf: [0, 1, 2], coin, swaps, k: 0, dur: Math.max(0.2, 0.46 - round.n * 0.02), pick: -1, win: false };
    customers = []; mugs = []; tips = []; dash = null; show = 0;
    setState('bonus');
  }
  function updateBonus(dt) {
    const b = bonus;
    b.t += dt;
    if (b.phase === 'show' && b.t > 1.8) { b.phase = 'shuffle'; b.t = 0; BG.sound.play('swap'); }
    else if (b.phase === 'shuffle' && b.t >= b.dur) {
      const [s1, s2] = b.swaps[b.k];
      const m1 = b.slotOf.indexOf(s1), m2 = b.slotOf.indexOf(s2);
      b.slotOf[m1] = s2; b.slotOf[m2] = s1;
      b.k++; b.t = 0;
      if (b.k >= b.swaps.length) b.phase = 'pick'; else BG.sound.play('swap');
    } else if (b.phase === 'reveal' && b.t > 2.4) {
      bonus = null;
      startRound(round.n + 1);
    }
  }
  function pickSlot(slot) {
    const b = bonus;
    if (!b || b.phase !== 'pick') return;
    b.pick = b.slotOf.indexOf(slot);
    b.win = b.pick === b.coin;
    b.phase = 'reveal'; b.t = 0;
    if (b.win) {
      const prize = 500 + 100 * round.n;
      score += prize; pop('JACKPOT +' + prize, W / 2, 70, true, 2);
      BG.sound.play('jackpot');
      for (let i = 0; i < 30; i++) parts.push({ x: SLOTS[slot], y: 120, vx: (Math.random() - 0.5) * 160, vy: -60 - Math.random() * 90, g: 200, life: 1.6, color: ['#ffd36b', '#ff5fa2', '#7fc8ff', '#b6e34a'][i % 4] });
    } else {
      pop('SPLASH!', W / 2, 70, true, 2);
      BG.sound.play('splash');
      for (let i = 0; i < 26; i++) parts.push({ x: SLOTS[slot], y: 112, vx: (Math.random() - 0.5) * 120, vy: -50 - Math.random() * 80, g: 220, life: 1.4, color: i % 2 ? '#fff8e6' : '#f2b134' });
    }
    if (score > best) { best = score; try { localStorage.setItem('barglide.best', String(best)); } catch (e) {} }
  }
  function mugSlotX(i) {           // where mug i is drawn now (slides along an arc during a swap)
    const b = bonus;
    let x = SLOTS[b.slotOf[i]], lift = 0;
    if (b.phase === 'shuffle' && b.k < b.swaps.length) {
      const [s1, s2] = b.swaps[b.k];
      const from = b.slotOf[i];
      if (from === s1 || from === s2) {
        const to = from === s1 ? s2 : s1, p = Math.min(1, b.t / b.dur), e = p * p * (3 - 2 * p);
        x = SLOTS[from] + (SLOTS[to] - SLOTS[from]) * e;
        lift = Math.sin(p * Math.PI) * (from === s1 ? 10 : -4);
      }
    }
    return { x, lift };
  }
  function drawBonus() {
    const b = bonus;
    ctx.fillStyle = theme.dim; ctx.fillRect(0, 0, W, H); ctx.fillRect(0, 0, W, H);
    // Spotlight and a short counter.
    soft(160, 120, 120, 'rgba(255, 220, 140, 0.4)');
    ctx.drawImage(barImg, 70, 126, 180, 16);
    BG.drawText(ctx, 'BONUS ROUND', W / 2, 26, theme.neon, 3, 'center', theme.ink);
    const say = { show: 'WATCH THE COIN', shuffle: 'KEEP YOUR EYE ON IT', pick: 'TAP THE MUG WITH THE COIN', reveal: b.win ? 'YOU FOUND IT!' : 'NOT THAT ONE' }[b.phase];
    BG.drawText(ctx, say, W / 2, 50, theme.hud, 1, 'center', theme.hudShadow);
    for (let i = 0; i < 3; i++) {
      const { x, lift } = mugSlotX(i);
      let up = 0;
      if (b.phase === 'show' && i === b.coin) up = Math.min(14, Math.sin(Math.min(1, b.t / 1.6) * Math.PI) * 18);
      if (b.phase === 'reveal' && (i === b.pick || i === b.coin)) up = Math.min(16, b.t * 40);
      if (up > 2 && i === b.coin) drawCoin(x - 2.5, 118);      // the gold coin
      // A big upside-down mug.
      ctx.save();
      ctx.translate(x - 12, 126 - up - lift);
      ctx.scale(3, -3);
      drawMug(0, 0, 0, false);
      ctx.restore();
      if (b.phase === 'pick') BG.drawText(ctx, String(b.slotOf[i] + 1), x, 132, theme.hud, 1, 'center', theme.hudShadow);
    }
  }

  // ---------- effects ----------
  function puff(x, y) {
    for (let i = 0; i < 6; i++) parts.push({ x, y, vx: (Math.random() - 0.5) * 50, vy: -Math.random() * 30, g: 0, life: 0.35, color: 'rgba(255,255,255,0.7)' });
  }
  function pop(text, x, y, bubble, life) { pops.push({ text, x, y, t: 0, life: life || 1.1, bubble: !!bubble }); }

  // ---------- drawing ----------
  // A glass mug: glassy body, amber beer, a foamy head and a handle. 8 x 9 game units from (x, y).
  function drawMug(x, y, fill, full) {
    const topFull = full || fill >= 1;
    ctx.beginPath(); ctx.arc(x + 6.1, y + 4.2, 1.9, -1.25, 1.25);
    ctx.strokeStyle = theme.ink; ctx.lineWidth = 1.7; ctx.stroke();
    ctx.strokeStyle = '#d4edf2'; ctx.lineWidth = 0.75; ctx.stroke();
    rr(x, y, 6, 8.2, 1.2); ctx.fillStyle = hg(x, x + 6, 'rgba(236,249,252,0.95)', 'rgba(186,222,230,0.9)'); ctx.fill();
    const rows = topFull ? 6.6 : fill * 6.6;
    if (rows > 0.3) {
      ctx.save(); rr(x, y, 6, 8.2, 1.2); ctx.clip();
      ctx.fillStyle = vg(y + 7.7 - rows, y + 8, '#ffd36b', '#e8941a'); ctx.fillRect(x, y + 7.8 - rows, 6, rows + 0.4);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      for (let k = 0; k < 3; k++) disc(x + 1.5 + k * 1.5, y + 6.6 - ((clock * 3 + k * 0.7) % 1) * Math.max(1, rows - 1), 0.28, 'rgba(255,255,255,0.6)');
      ctx.restore();
    }
    rr(x, y, 6, 8.2, 1.2); outline(0.75);
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; rr(x + 0.9, y + 1.4, 0.8, 5.2, 0.4); ctx.fill();
    if (topFull) {
      ctx.fillStyle = '#fffaf0';
      [[1.4, 0.3, 1.5], [3, -0.4, 1.7], [4.6, 0.4, 1.4]].forEach(([dx, dy, r]) => { ctx.beginPath(); ctx.arc(x + dx, y + dy, r, 0, TAU); ctx.fill(); });
      ctx.fillRect(x + 0.1, y + 0.2, 5.8, 1.3);
      ctx.fillStyle = 'rgba(232,148,26,0.35)'; ctx.fillRect(x + 0.4, y + 1.2, 5.2, 0.4);
    }
  }

  // The one saloon door: the leaves swing open when a guest steps in.
  function drawDoor() {
    const top = DOOR_TOP, w = Math.max(2, 12 - doorOpen * 9);
    [[4, false], [30 - w, true]].forEach(([lx, right]) => {
      rr(lx, top + 0.3, w, 17.4, 1.4); ctx.fillStyle = hg(lx, lx + w, right ? theme.doorDark : theme.door, right ? theme.door : theme.doorDark); ctx.fill(); outline(0.6);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      for (let k = 0; k < 6; k++) ctx.fillRect(lx + 1, top + 3 + k * 2.4, Math.max(0.5, w - 2), 0.7);
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(lx + 0.7, top + 1, Math.max(0.5, w - 1.4), 0.6);
    });
    if (w > 6) disc(right0(w), top + 9, 0.8, theme.brass);
    function right0(wd) { return 4 + wd - 1.4; }
  }

  function drawTap(i, pouring) {
    const y = lanesY[i];
    rr(TAP_X - 1, y - 17, 10, 7, 2.2); ctx.fillStyle = vg(y - 17, y - 10, theme.brass, theme.brassDark); ctx.fill(); outline(0.6);
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(TAP_X + 0.2, y - 16, 7, 0.8);
    rr(TAP_X - 0.4, y - 11, 3.2, 4.8, 1); ctx.fillStyle = vg(y - 11, y - 6, theme.brass, theme.brassDark); ctx.fill(); outline(0.55);
    const hx = TAP_X + 4 + (pouring ? -3 : 0), col = ['#c8463a', '#3f8f5a', '#34508f', '#d98a2b'][i % 4];
    rr(hx - 1.1, y - 27, 3.4, 11, 1.6); ctx.fillStyle = hg(hx - 1, hx + 2, shade(col, 1.3), shade(col, 0.75)); ctx.fill(); outline(0.6);
    disc(hx + 0.6, y - 27.6, 2, shade(col, 1.1)); ctx.beginPath(); ctx.arc(hx + 0.6, y - 27.6, 2, 0, TAU); outline(0.55);
    disc(hx, y - 28.2, 0.6, 'rgba(255,255,255,0.7)');
    if (pouring) { rr(TAP_X + 0.4, y - 7, 1.4, 5, 0.7); ctx.fillStyle = '#f2b134'; ctx.fill(); }
  }

  function drawCustomer(c) {
    const y = c.vert ? c.fy : lanesY[c.lane];
    const watching = !c.vert && (c.state === 'walk' || c.state === 'pause') && ev && (ev.freeze || ev.hold === c.lane);
    let lift = 0, cheer = false;
    if (watching) {
      if (ev.kind === 'celebration') { cheer = true; lift = Math.sin(clock * 9 + (ev.variant === 'conga' ? c.x * 0.12 : c.lane)) > 0 ? 2 : 0; }
      else if (ev.kind === 'dancer') lift = Math.sin(clock * 6 + c.x * 0.2) > 0.6 ? 1 : 0;
      else lift = Math.sin(clock * 10 + c.x) > 0.7 ? 1 : 0;      // fight: jumpy
    }
    const moving = c.state === 'walk' || c.state === 'enter' || c.state === 'leave';
    const bob = moving ? Math.abs(Math.sin(c.bob * 9)) * -1.1 : 0;
    const img = sprites.customers[c.kind];
    const top = y - 14 + bob - lift;
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(c.x + 6, y + 1.6, 5, 1.2, 0, 0, TAU); ctx.fill();
    if (c.state === 'leave' && !c.vert) { ctx.save(); ctx.translate(c.x + 12, top); ctx.scale(-1, 1); blit(img, 0, 0); ctx.restore(); }
    else blit(img, c.x, top);
    if (c.state === 'drink') drawMug(c.x + 7, y - 13, 0.6, false);
    else if (c.state === 'pushed') drawMug(c.x + 11, y - 7, 1, true);
    if (cheer) drawMug(c.x + 8, y - 26 - lift, 1, true);       // mug raised
    if (c.wants > 1 && c.state !== 'leave') {                // still has more than one to drink
      const bx = c.x + 0.5, by = y - 28;
      rr(bx, by, 11, 8.6, 3.4); ctx.fillStyle = '#ffd36b'; ctx.fill(); outline(0.7);
      ctx.beginPath(); ctx.moveTo(bx + 3, by + 8.4); ctx.lineTo(bx + 5, by + 11); ctx.lineTo(bx + 6.4, by + 8.4); ctx.fillStyle = '#ffd36b'; ctx.fill();
      BG.drawText(ctx, 'X' + c.wants, bx + 5.5, by + 1.6, theme.ink, 1, 'center');
    }
  }

  // ---------- drawing the bonus events ----------
  const hash = k => Math.abs(Math.sin(k * 127.1 + Math.floor(clock * 12) * 311.7) * 43758.5453) % 1;
  function drawDancer(i) {
    const d = ev, y = lanesY[i], t = d.t, T = d.dur;
    const hop = Math.min(1, t / 0.8), wobbleAt = T - 1.8, fallAt = T - 0.7;
    let x = d.x, off = (1 - hop) * 16 - Math.sin(hop * Math.PI) * 8, flip = false, ang = 0;
    if (t >= 0.8) {
      off = 0;
      if (d.variant === 'twirl') { flip = Math.floor(t * 6) % 2 === 1; off = -Math.abs(Math.sin(t * 6)) * 2; }
      else if (d.variant === 'shimmy') { x += Math.sin(t * 38) * 0.9; off = -Math.abs(Math.sin(t * 6)) * 1.2; }
      else if (d.variant === 'bounce') off = -Math.abs(Math.sin(t * 5)) * 7;
      else { flip = Math.floor(t / 0.35) % 2 === 1; x += Math.sin(t * 4) * 10; off = -Math.abs(Math.sin(t * 8)) * 3; }
    }
    if (t >= wobbleAt) { const k = Math.min(1, (t - wobbleAt) / 1.1); ang = Math.sin(t * 18) * (0.12 + 0.25 * k); x += Math.sin(t * 18) * 2 * k; }
    if (t >= fallAt) { const p = (t - fallAt) / 0.7; off = p * p * 26; ang = p * 1.3; }
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(x + 6, y + 3.4 + Math.max(0, off), 5, 1.2, 0, 0, TAU); ctx.fill();
    ctx.save();
    ctx.translate(x + 6, y + 3 + off);
    ctx.rotate(ang);
    if (flip) ctx.scale(-1, 1);
    blit(sprites.customers[d.kindSprite], -6, -16);
    ctx.restore();
    if (t >= 0.8 && t < wobbleAt) {                           // music notes over the dancer
      for (let k = 0; k < 2; k++) {
        const p = (clock * 0.9 + k * 0.5) % 1, nx = x + 2 + k * 8 + Math.sin(p * 6) * 3, ny = y - 20 - p * 12;
        ctx.globalAlpha = 1 - p; disc(nx, ny, 1.2, '#ffd36b');
        ctx.strokeStyle = '#ffd36b'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(nx + 1.1, ny); ctx.lineTo(nx + 1.1, ny - 4.5); ctx.stroke(); ctx.globalAlpha = 1;
      }
    }
  }

  function drawBouncer(x, y, flip) {
    ctx.save(); ctx.translate(x, y); if (flip) { ctx.translate(14, 0); ctx.scale(-1, 1); }
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(7, 21, 7, 1.4, 0, 0, TAU); ctx.fill();
    rr(-1.4, 10, 3.2, 6.2, 1.5); ctx.fillStyle = '#34344c'; ctx.fill(); outline(0.55); disc(0.2, 16.4, 1.4, '#e0a074');
    rr(12, 10, 3.2, 6.2, 1.5); ctx.fillStyle = '#34344c'; ctx.fill(); outline(0.55); disc(13.8, 16.4, 1.4, '#e0a074');
    rr(0.4, 8, 13.2, 13, 3); ctx.fillStyle = vg(8, 21, '#4a4a68', '#26263a'); ctx.fill(); outline(0.7);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(5, 8.4); ctx.lineTo(9, 8.4); ctx.lineTo(7, 13); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(6.2, 9); ctx.lineTo(7.8, 9); ctx.lineTo(8, 15); ctx.lineTo(7, 16); ctx.lineTo(6, 15); ctx.closePath(); ctx.fillStyle = '#e63946'; ctx.fill();
    ctx.beginPath(); ctx.arc(7, 4.4, 4, 0, TAU); ctx.fillStyle = vg(0, 8, '#f0b88c', '#d99a6c'); ctx.fill(); outline(0.7);
    rr(2.6, 3, 8.8, 2.3, 1.1); ctx.fillStyle = theme.ink; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(3.6, 3.4, 2, 0.5);
    rr(4.2, 7, 5.6, 0.9, 0.45); ctx.fillStyle = '#7a3a2a'; ctx.fill();
    ctx.restore();
  }

  function drawDust(cx, cy) {                                  // a scuffle cloud with stars
    for (let k = 0; k < 7; k++) {
      const dx = (hash(k + 1) - 0.5) * 20, dy = (hash(k + 9) - 0.5) * 9, r = 2.4 + hash(k + 15) * 2.2;
      disc(cx + dx, cy + dy, r, k % 3 ? 'rgba(240,235,220,0.92)' : 'rgba(190,184,166,0.9)');
    }
    ctx.strokeStyle = '#ffd36b'; ctx.lineWidth = 0.8;
    const sx = cx + (hash(20) - 0.5) * 16, sy = cy - 8 - hash(21) * 4;
    ctx.beginPath(); ctx.moveTo(sx - 2, sy); ctx.lineTo(sx + 2, sy); ctx.moveTo(sx, sy - 2); ctx.lineTo(sx, sy + 2); ctx.stroke();
  }

  function drawFight(i) {
    const f = ev, y = lanesY[i], t = f.t;
    if (t < 0.15) return;
    const away = Math.max(0, t - 6.0) * 80;
    const cx = f.x - away;
    const a = sprites.customers[f.k1], b = sprites.customers[f.k2];
    const flipDraw = (img, x, yy, flip) => { ctx.save(); ctx.translate(x + (flip ? 12 : 0), yy); if (flip) ctx.scale(-1, 1); blit(img, 0, 0); ctx.restore(); };
    if (t >= 6.0) {                                           // carried out, feet off the floor, with the bouncer behind
      flipDraw(a, cx - 8, y - 16, false); flipDraw(b, cx + 4, y - 16, true);
      drawBouncer(cx + 18, y - 18, true);
    } else {
      let ax = cx - 7, bx = cx + 7, ay = y - 14, by = y - 14;
      if (f.variant === 'wrestle') { const sw = Math.sin(t * 10); ax = cx - 4 + sw * 4; bx = cx + 4 - sw * 4; ay += 3 + Math.abs(sw); by += 3 + Math.abs(sw); }
      else if (f.variant === 'shove') { const s = Math.sin(t * 5) * 6; ax = cx - 8 + s; bx = cx + 8 + s; }
      else { ax += (hash(3) - 0.5) * 2; bx += (hash(4) - 0.5) * 2; }
      flipDraw(a, ax, ay, false); flipDraw(b, bx, by, true);
      if (f.variant === 'brawl' || t < 0.6) drawDust(cx + 6, y - 8);
      if (t >= 5.2) drawBouncer(Math.min(cx - 16, -20 + (t - 5.2) / 0.8 * (cx + 4)), y - 18, false);   // the bouncer strides in from the door
    }
  }

  function drawHelper(i) {
    const h = ev, y = lanesY[i];
    const slide = Math.min(1, h.t / 0.8, Math.max(0, (h.dur - h.t) / 0.8));
    const hx = (i === bt.lane ? 244 : 270) + (1 - slide) * 44;
    ctx.save(); ctx.translate(hx + 12, y - 6 - (slide < 1 ? Math.abs(Math.sin(clock * 12)) : 0)); ctx.scale(-1, 1);
    blit(sprites.customers[h.variant.kind], 0, 0); ctx.restore();
    rr(hx + 2.6, y + 4.4, 6.6, 5.6, 1.3); ctx.fillStyle = '#fff8e6'; ctx.fill(); outline(0.45);        // apron
  }

  function drawParty() {                                      // streamers and a banner
    for (let k = 0; k < 6; k++) {
      const x0 = 40 + k * 40, x1 = x0 + 40;
      ctx.strokeStyle = '#ff5fa2'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(x0, 30); ctx.quadraticCurveTo((x0 + x1) / 2, 37, x1, 30); ctx.stroke();
      for (let j = 1; j < 4; j++) {
        const u = j / 4, fx = x0 + 40 * u, fy = 30 + 14 * u * (1 - u) * 1.0 * 2;
        ctx.beginPath(); ctx.moveTo(fx - 2, fy); ctx.lineTo(fx + 2, fy); ctx.lineTo(fx, fy + 4.5); ctx.closePath();
        ctx.fillStyle = ['#ffd36b', '#7fc8ff', '#b6e34a', '#ff5fa2'][(k + j) % 4]; ctx.fill();
      }
    }
    if (Math.floor(clock * 3) % 2) BG.drawText(ctx, ev.variant === 'toast' ? 'CHEERS!' : 'PARTY TIME', W / 2, 40, '#ffd36b', 1, 'center', theme.ink);
  }

  function drawBartender(i) {
    const y = lanesY[i];
    const facingTap = (bt.holding || bt.fill > 0) && bt.throwT <= 0 && state === 'play';
    const sx = bt.shake > 0 ? Math.sin(bt.shake * 90) * 1 : 0;
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(286 + sx, y + 14, 7, 1.6, 0, 0, TAU); ctx.fill();
    if (facingTap) {
      blit(sprites.btRight, 280 + sx, y - 6);
      drawMug(TAP_X - 1, y - 3, bt.fill, false);
    } else {
      blit(sprites.btLeft, 272 + sx, y - 6);
    }
  }

  function drawBubble(text, x, y, alpha) {
    const w = BG.textWidth(text, 1) + 8;
    const bx = Math.max(2, Math.min(W - w - 2, x - w / 2)), by = y;
    ctx.globalAlpha = alpha;
    rr(bx, by, w, 10.5, 4); ctx.fillStyle = theme.bubble; ctx.fill(); outline(0.7);
    const tx = Math.max(bx + 5, Math.min(bx + w - 5, x));
    ctx.beginPath(); ctx.moveTo(tx - 2, by + 10.3); ctx.lineTo(tx + 0.6, by + 13.4); ctx.lineTo(tx + 2, by + 10.3); ctx.fillStyle = theme.bubble; ctx.fill();
    BG.drawText(ctx, text, bx + w / 2, by + 2.6, theme.ink, 1, 'center');
    ctx.globalAlpha = 1;
  }

  function drawHud() {
    rr(2, 2, 74, 19, 5); ctx.fillStyle = theme.dim; ctx.fill();
    BG.drawText(ctx, 'SCORE ' + String(score).padStart(6, '0'), 7, 4.6, theme.hud, 1, 'left', theme.hudShadow);
    BG.drawText(ctx, round ? round.shift.name : 'MORNING', 7, 12.6, theme.hud, 1, 'left', theme.hudShadow);
    rr(W - 76, 2, 74, 19, 5); ctx.fillStyle = theme.dim; ctx.fill();
    BG.drawText(ctx, 'BEST ' + String(best).padStart(6, '0'), W - 7, 4.6, theme.hud, 1, 'right', theme.hudShadow);
    for (let i = 0; i < cfg.glasses; i++) {
      const x = W - 14 - i * 10, y = 12;
      if (i < lives) drawMug(x, y + 0.5, 1, true);
      else { ctx.globalAlpha = 0.4; drawMug(x, y + 0.5, 0, false); ctx.globalAlpha = 1; }
    }
  }

  function drawSign() {
    const flick = Math.sin(clock * 13) > 0.97 || (Math.floor(clock * 2) % 17 === 0 && Math.sin(clock * 40) > 0);
    const col = flick ? theme.neonDim : theme.neon;
    const beat = BG.sound.pulse ? BG.sound.pulse() : 0;
    if (!flick) soft(160, 14, 78 + beat * 14, theme.neonGlow);
    rr(101, 3.5, 118, 19, 5); ctx.fillStyle = vg(3, 23, '#2a1830', theme.ink); ctx.fill();
    if (theme === BG.THEMES.pastel) { ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill(); }
    ctx.save();
    if (!flick) { ctx.shadowColor = col; ctx.shadowBlur = (6 + beat * 6) * S; }
    ctx.strokeStyle = col; ctx.lineWidth = 1.1; rr(101, 3.5, 118, 19, 5); ctx.stroke();
    BG.drawText(ctx, 'OLE BAR GLIDE', 160, 6.6, col, 2, 'center');
    ctx.restore();
    ctx.globalAlpha = flick ? 0.4 : 1; drawMug(222.5, 7, 1, true); ctx.globalAlpha = 1;
  }

  function draw() {
    ctx.setTransform(S, 0, 0, S, 0, 0);
    ctx.drawImage(bg, 0, 0, W, H);
    drawSign();
    const bossLane = boss ? boss.lane : -1;
    for (let i = 0; i < lanesY.length; i++) {
      const y = lanesY[i];
      customers.filter(c => c.lane === i && !c.vert).forEach(drawCustomer);
      if (ev && ev.kind === 'fight' && ev.lane === i) drawFight(i);
      ctx.drawImage(barImg, BAR_X0 - 2, y, barImg.lw, barImg.lh);
      ctx.fillStyle = vg(y + 16, y + 23, 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0)'); ctx.fillRect(BAR_X0 - 1, y + 16, BAR_X1 - BAR_X0 + 2, 7);
      mugs.filter(m => m.lane === i).forEach(m => {
        const wob = m.teeter !== undefined ? Math.sin(clock * 90) * 0.7 : 0;
        if (m.full) { ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(m.x + 3, y + 0.8, 4, 0.9, 0, 0, TAU); ctx.fill(); }
        drawMug(m.x + wob, y - 7 - (wob > 0 ? 1 : 0), m.full ? 1 : 0, m.full);
        if (m.teeter !== undefined) BG.drawText(ctx, '!', m.x + 3, y - 17, '#ff5fa2', 1, 'center', theme.ink);
      });
      tips.filter(t => t.lane === i && (t.t > 2 || Math.floor(t.t * 6) % 2)).forEach(t => drawCoin(t.x, y - 4));
      if (ev && ev.kind === 'dancer' && ev.lane === i) drawDancer(i);
      if (ev && ev.kind === 'helper' && ev.lanes.indexOf(i) >= 0) drawHelper(i);
      drawTap(i, state === 'play' && bt.lane === i && bt.holding && bt.fill < 1);
      if (i === bossLane) drawBossScene(i);
      else if (dash && dash.lane === i) blit(dash.back ? sprites.btRight : sprites.btLeft, dash.x, y - 6 - Math.abs(Math.sin(clock * 12)));
      else if (i === bt.lane && state !== 'title' && state !== 'bonus' && !(boss && boss.t >= 1.9)) drawBartender(i);
      if (oops && oops.lane === i && oops.glass) {
        const g = oops.glass;
        if (!g.broken) drawMug(g.x, g.y, 1, true);
      }
    }
    drawDoor();
    customers.filter(c => c.vert).forEach(drawCustomer);
    if (state === 'title') blit(sprites.btLeft, 272, lanesY[bt.lane] - 6);
    if (ev && ev.kind === 'celebration') drawParty();
    if (show > 0) drawShow();
    if (state === 'bonus') drawBonus();
    parts.forEach(p => { ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, 0.75, 0, TAU); ctx.fill(); });
    // Beer puddle under a broken glass.
    if (oops && oops.glass && oops.glass.broken) {
      ctx.fillStyle = 'rgba(242,177,52,0.9)'; ctx.beginPath(); ctx.ellipse(oops.glass.x, 184.6, 7, 1.5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,248,230,0.8)'; ctx.beginPath(); ctx.ellipse(oops.glass.x - 1, 184.2, 2.4, 0.6, 0, 0, TAU); ctx.fill();
    }
    if (oops) drawBubble('UH-OH!', 278, lanesY[bt.lane] - 22, 1);
    pops.forEach(p => {
      const a = Math.min(1, (p.life - p.t) * 3);
      if (p.bubble) drawBubble(p.text, p.x, p.y - p.t * 4, a);
      else { ctx.globalAlpha = a; BG.drawText(ctx, p.text, p.x, p.y - p.t * 12, theme.hud, 1, 'center', theme.hudShadow); ctx.globalAlpha = 1; }
    });
    drawHud();
    if (state === 'ready') banner(round.shift.name, round.shift.note);
    if (state === 'clear') banner(round.shift.name + ' DONE!', 'NICE POURING');
    if (state === 'over') banner('GAME OVER', 'SCORE ' + score);
    if (paused && state !== 'title' && state !== 'over') banner('PAUSED', 'TAP TO GO ON');
  }

  function drawCoin(x, y) {
    const cx = x + 2.5, cy = y + 2;
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(cx, cy + 3.2, 3, 0.8, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, 3.1, 0, TAU); ctx.fillStyle = vg(cy - 3, cy + 3, '#fff0a0', '#e8a82a'); ctx.fill(); outline(0.6);
    ctx.beginPath(); ctx.arc(cx, cy, 1.9, 0, TAU); ctx.strokeStyle = 'rgba(160,100,10,0.55)'; ctx.lineWidth = 0.4; ctx.stroke();
    if (Math.floor(clock * 4) % 2) { ctx.strokeStyle = '#fff8e6'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(cx + 4, cy - 4.4); ctx.lineTo(cx + 4, cy - 1.8); ctx.moveTo(cx + 2.7, cy - 3.1); ctx.lineTo(cx + 5.3, cy - 3.1); ctx.stroke(); }
  }
  // Show time: coloured spotlights sweep the room while everyone watches.
  function drawShow() {
    const cols = ['rgba(255, 95, 162, 0.26)', 'rgba(127, 200, 255, 0.26)', 'rgba(182, 227, 74, 0.24)'];
    cols.forEach((c, k) => {
      const x = 160 + Math.sin(clock * (2.2 + k * 0.7) + k * 2) * 120, y = 110 + Math.cos(clock * (1.7 + k * 0.5) + k) * 50;
      soft(x, y, 48, c);
    });
    if (Math.floor(clock * 4) % 2) BG.drawText(ctx, 'SHOW TIME', W / 2, 26, '#ffd36b', 2, 'center', theme.ink);
    for (let k = 0; k < 4; k++) {                             // music notes float up from the jukebox corner
      const p = (clock * 0.6 + k / 4) % 1, nx = 44 + k * 60 + Math.sin(p * 6 + k) * 6, ny = 180 - p * 140;
      ctx.globalAlpha = Math.min(1, (1 - p) * 2); disc(nx, ny, 1.4, '#ffd36b');
      ctx.strokeStyle = '#ffd36b'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(nx + 1.3, ny); ctx.lineTo(nx + 1.3, ny - 5); ctx.stroke(); ctx.globalAlpha = 1;
    }
  }

  function drawBossScene(i) {
    const b = boss, y = lanesY[i];
    const T = b.t;
    if (T < 1.9) {
      // The bartender waits, shaking; the owner stomps in.
      const lift = T > 1.2 ? Math.min(6, (T - 1.2) * 20) : 0;
      const sx = Math.sin(T * 90);
      blit(sprites.btLeft, 272 + sx - (T > 1.2 ? (T - 1.2) / 0.7 * 30 : 0), y - 6 - lift);
      blit(sprites.boss, b.x, y - 8);
      if (T < 1.2) drawBubble('?!', 278, y - 20, 1);
    } else {
      // Bent over the bar.
      const wobble = cfg.ending === 'spank' && (T - 2.1) % 0.55 < 0.1 ? 1 : 0;
      blit(sprites.btBent, 232, y - 12 + wobble);
      blit(sprites.boss, b.x, y - 8);
      if (T < 5.6) {
        const phase = ((T - 2.1) % 0.55) / 0.55;
        if (cfg.ending === 'spank') {
          const up = T < 2.1 ? 1 : (phase < 0.15 ? 0 : Math.min(1, (phase - 0.15) * 2));
          const hy = y - 14 - up * 16;
          rr(254, hy + 1.6, Math.max(2, b.x - 252), 2.6, 1.3); ctx.fillStyle = '#4a3262'; ctx.fill(); outline(0.5);
          blit(sprites.hand, 247, hy);
        } else {
          const wag = Math.sin(T * 14) > 0 ? 1 : -1;
          rr(250, y - 31, 12, 2.6, 1.3); ctx.fillStyle = '#4a3262'; ctx.fill(); outline(0.5);
          blit(sprites.hand, 244 + wag, y - 33);
          rr(245 + wag, y - 40, 2.4, 7, 1.2); ctx.fillStyle = '#e0786a'; ctx.fill(); outline(0.45);
        }
      }
    }
  }

  function banner(a, b) {
    ctx.fillStyle = vg(76, 120, 'rgba(0,0,0,0)', 'rgba(0,0,0,0)');
    rr(0, 78, W, 40, 0); ctx.fillStyle = theme.dim; ctx.fill();
    ctx.fillStyle = theme.rail; ctx.fillRect(0, 78, W, 0.7); ctx.fillRect(0, 117.3, W, 0.7);
    BG.drawText(ctx, a, W / 2, 83, theme.hud, 3, 'center', theme.hudShadow);
    BG.drawText(ctx, b, W / 2, 104, theme.hud, 1, 'center', theme.hudShadow);
  }

  // ---------- public ----------
  window.BarGlide = {
    init, press, release,
    up() { move(bt.lane - 1); },
    down() { move(bt.lane + 1); },
    laneFromPoint(clientY) {
      const r = canvas.getBoundingClientRect();
      return laneAt((clientY - r.top) / r.height * H);
    },
    start() { resetRun(); paused = false; BG.sound.play('start'); },
    pause(on) { paused = on === undefined ? !paused : !!on; bt.holding = false; syncMusic(); },
    // A tap on the screen: picks a mug in the bonus round, or grabs a tip. Returns true if it used the tap.
    tap(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      const gx = (clientX - r.left) / r.width * W, gy = (clientY - r.top) / r.height * H;
      if (state === 'bonus') {
        if (bonus && bonus.phase === 'pick') {
          let best = 0; SLOTS.forEach((x, i) => { if (Math.abs(gx - x) < Math.abs(gx - SLOTS[best])) best = i; });
          if (Math.abs(gx - SLOTS[best]) < 28 && gy > 80 && gy < 150) pickSlot(best);
        }
        return true;
      }
      if (state === 'play' && !dash) {
        const tip = tips.find(t => Math.abs(gx - (t.x + 2)) < 14 && Math.abs(gy - (lanesY[t.lane] - 3)) < 12);
        if (tip) { grabTip(tip); return true; }
      }
      return false;
    },
    pickSlot,
    isPaused: () => paused,
    configure(next) {
      const restart = next.start !== undefined && next.start !== cfg.start;
      Object.assign(cfg, next);
      applyConfig();
      if (restart && bt) { resetRun(); setState('title'); }
    },
    hooks,
    // For the smoke test and the notes box.
    state: () => ({ state, score, best, lives, round: round && round.n, lane: bt.lane, fill: bt.fill, tips: tips.length, dashing: !!dash,
      customers: customers.length, mugs: mugs.length, lanes, event: ev && ev.kind, shift: round && round.shift.name, paused }),
    debug: {
      spawn(lane, x, wants) { customers.push({ lane, x: x === undefined ? 100 : x, state: 'pause', t: 99, kind: 0, push: 0, bob: 0, wants: wants || 1 }); },
      event(kind) { ev = null; round.t = 99; return startEvent(kind); },
      eventInfo() { return ev && { kind: ev.kind, variant: ev.variant.name || ev.variant, t: ev.t, dur: ev.dur }; },
      startAt(n) { startRound(n); },
      emptyMug(lane, x) { mugs.push({ lane, x: x || 200, full: false }); },
      peekMugs() { return mugs.map(m => ({ lane: m.lane, x: Math.round(m.x), teeter: m.teeter })); },
      strike(kind) { strike(kind || 'dropped', bt.lane, BAR_X1 - 2, lanesY[bt.lane] - 7, null, 1); },
      setLives(n) { lives = n; },
      setScore(n) { score = n; },
      tip(lane, x) { tips.push({ lane, x, t: 7 }); },
      grab() { if (tips[0]) grabTip(tips[0]); },
      bonus() { startBonus(); },
      bonusInfo() { return bonus && { phase: bonus.phase, coinSlot: bonus.slotOf[bonus.coin], win: bonus.win }; },
      show: () => show,
      peek() { return { customers: customers.map(c => ({ lane: c.lane, x: c.x, y: c.vert ? c.fy : undefined, state: c.state, wants: c.wants, vert: !!c.vert })), mugs: mugs.map(m => ({ lane: m.lane, x: m.x, full: m.full })) }; },
      freezeSpawns() { round.spawned = round.total; },
      step(sec) { const n = Math.round(sec / 0.02); for (let i = 0; i < n; i++) update(0.02); draw(); }
    }
  };
})(window.BG);
