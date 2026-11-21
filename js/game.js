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

  function buildBackground() {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    const T = theme;
    x.fillStyle = T.wall; x.fillRect(0, 0, W, H);
    for (let px = 0; px < W; px += 16) {            // wall planks
      x.fillStyle = T.plank; x.fillRect(px + 1, 0, 14, H);
      x.fillStyle = T.plankLine; x.fillRect(px, 0, 1, H);
      x.fillRect(px + 7, (px * 7) % 40 + 20, 2, 1);  // knots
    }
    // Shelves with bottles, either side of the sign.
    const shelfY = 40;
    x.fillStyle = T.shelf; x.fillRect(40, shelfY, 92, 4); x.fillRect(188, shelfY, 92, 4);
    x.fillStyle = T.shelfHi; x.fillRect(40, shelfY, 92, 1); x.fillRect(188, shelfY, 92, 1);
    const bottleCols = ['#3f8f5a', '#c8463a', '#d9a441', '#6a9fd8', '#8a5a2b', '#b05fa0', '#e8e2cc'];
    let bi = 0;
    [[44, 128], [192, 276]].forEach(([a, b]) => {
      for (let bx = a; bx < b; bx += 7) {
        const hgt = 8 + ((bx * 13) % 5);
        x.fillStyle = bottleCols[bi++ % bottleCols.length];
        x.fillRect(bx, shelfY - hgt, 4, hgt);
        x.fillRect(bx + 1, shelfY - hgt - 3, 2, 3);
        x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(bx + 1, shelfY - hgt + 2, 1, hgt - 4);
      }
    });
    // Hanging lamps with a warm glow.
    [86, 234].forEach(lx => {
      const g = x.createRadialGradient(lx, 26, 2, lx, 26, 60);
      g.addColorStop(0, T.glow); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(lx - 60, 0, 120, 90);
      x.fillStyle = T.ink; x.fillRect(lx, 0, 1, 18);
      x.fillStyle = T.shelf; x.fillRect(lx - 5, 18, 11, 3); x.fillRect(lx - 3, 16, 7, 2);
      x.fillStyle = T.lamp; x.fillRect(lx - 2, 21, 5, 2);
    });
    // Right wall panel with one tap per bar.
    x.fillStyle = T.plankLine; x.fillRect(288, 0, 1, H);
    x.fillStyle = T.shelf; x.fillRect(289, 0, 31, H);
    for (let py = 0; py < H; py += 12) { x.fillStyle = T.barPanel; x.fillRect(289, py, 31, 1); }
    // Floor at the bottom.
    for (let fx = 0; fx < W; fx += 8) {
      x.fillStyle = (fx / 8) % 2 ? T.floorA : T.floorB;
      x.fillRect(fx, 186, 8, 14);
    }
    // One doorway at the top left, with a bit of night sky, and a walkway down to every bar.
    x.fillStyle = T.ink; x.fillRect(2, DOOR_TOP - 2, 30, 22);
    x.fillStyle = T.night; x.fillRect(4, DOOR_TOP, 26, 18);
    x.fillStyle = T.star; x.fillRect(9, DOOR_TOP + 3, 1, 1); x.fillRect(22, DOOR_TOP + 6, 1, 1); x.fillRect(15, DOOR_TOP + 1, 1, 1);
    x.fillStyle = T.ink; x.fillRect(2, DOOR_TOP + 20, 30, 166 - DOOR_TOP);
    x.fillStyle = T.floorB; x.fillRect(4, DOOR_TOP + 20, 26, 166 - DOOR_TOP);
    x.fillStyle = T.floorA;
    for (let wy = DOOR_TOP + 22; wy < 184; wy += 8) { x.fillRect(5, wy, 6, 2); x.fillRect(16, wy + 4, 6, 2); x.fillRect(25, wy, 4, 2); }
    bg = c;

    // One bar, drawn once and reused for every lane.
    const b = document.createElement('canvas');
    b.width = BAR_X1 - BAR_X0 + 4; b.height = 16;
    const y = b.getContext('2d');
    y.fillStyle = T.ink; y.fillRect(0, 0, b.width, 16);
    y.fillStyle = T.barTop; y.fillRect(1, 1, b.width - 2, 4);
    y.fillStyle = T.barTopHi; y.fillRect(1, 1, b.width - 2, 1);
    y.fillStyle = T.barFront; y.fillRect(1, 6, b.width - 2, 9);
    for (let px = 12; px < b.width - 4; px += 24) { y.fillStyle = T.barPanel; y.fillRect(px, 7, 1, 7); y.fillRect(px + 2, 7, 1, 7); }
    y.fillStyle = T.rail; y.fillRect(1, 12, b.width - 2, 1);
    barImg = b;
  }

  function init(el) {
    canvas = el;
    ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
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
    const g = ctx.createRadialGradient(160, 120, 10, 160, 120, 120);
    g.addColorStop(0, 'rgba(255, 220, 140, 0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(barImg, 0, 0, barImg.width, 16, 70, 126, 180, 16);
    BG.drawText(ctx, 'BONUS ROUND', W / 2, 30, theme.neon, 3, 'center', theme.ink);
    const say = { show: 'WATCH THE COIN', shuffle: 'KEEP YOUR EYE ON IT', pick: 'TAP THE MUG WITH THE COIN', reveal: b.win ? 'YOU FOUND IT!' : 'NOT THAT ONE' }[b.phase];
    BG.drawText(ctx, say, W / 2, 52, theme.hud, 1, 'center', theme.hudShadow);
    for (let i = 0; i < 3; i++) {
      const { x, lift } = mugSlotX(i);
      let up = 0;
      if (b.phase === 'show' && i === b.coin) up = Math.min(14, Math.sin(Math.min(1, b.t / 1.6) * Math.PI) * 18);
      if (b.phase === 'reveal' && (i === b.pick || i === b.coin)) up = Math.min(16, b.t * 40);
      if (up > 2 && i === b.coin) {      // the gold coin
        ctx.fillStyle = theme.ink; ctx.fillRect(x - 4, 120, 9, 6);
        ctx.fillStyle = '#ffd36b'; ctx.fillRect(x - 3, 121, 7, 4);
        ctx.fillStyle = '#fff8e6'; ctx.fillRect(x - 2, 121, 2, 1);
      }
      // A big upside-down mug.
      ctx.save();
      ctx.translate(Math.round(x - 12), Math.round(126 - up - lift));
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
  function drawMug(x, y, fill, full) {
    x = Math.round(x); y = Math.round(y);
    const k = theme.ink;
    ctx.fillStyle = k;
    ctx.fillRect(x, y, 6, 8);                       // outline
    ctx.fillRect(x + 6, y + 2, 2, 1); ctx.fillRect(x + 7, y + 2, 1, 4); ctx.fillRect(x + 6, y + 5, 2, 1); // handle
    ctx.fillStyle = '#bfe3ea'; ctx.fillRect(x + 1, y + 1, 4, 6);
    const rows = full ? 6 : Math.round(fill * 6);
    if (rows > 0) {
      ctx.fillStyle = '#f2b134'; ctx.fillRect(x + 1, y + 7 - rows, 4, rows);
      ctx.fillStyle = '#ffd36b'; ctx.fillRect(x + 1, y + 7 - rows, 1, rows);
    }
    if (full || fill >= 1) {
      ctx.fillStyle = '#fff8e6'; ctx.fillRect(x + 1, y + 1, 4, 2); ctx.fillRect(x, y - 1, 6, 2); ctx.fillRect(x + 1, y - 2, 3, 1);
    }
  }

  // The one saloon door: the leaves swing open when a guest steps in.
  function drawDoor() {
    const top = DOOR_TOP;
    const w = Math.max(2, Math.round(12 - doorOpen * 9));
    ctx.fillStyle = theme.ink; ctx.fillRect(4, top, w + 1, 18); ctx.fillRect(30 - w - 1, top, w + 1, 18);
    ctx.fillStyle = theme.door; ctx.fillRect(4, top + 1, w, 16); ctx.fillRect(30 - w, top + 1, w, 16);
    ctx.fillStyle = theme.doorDark;
    for (let k = 2; k < w - 1; k += 3) { ctx.fillRect(4 + k, top + 3, 1, 12); ctx.fillRect(30 - w + k, top + 3, 1, 12); }
  }

  function drawTap(i, pouring) {
    const y = lanesY[i];
    ctx.fillStyle = theme.ink; ctx.fillRect(TAP_X - 1, y - 17, 10, 7);
    ctx.fillStyle = theme.brass; ctx.fillRect(TAP_X, y - 16, 8, 5);
    ctx.fillStyle = theme.brassDark; ctx.fillRect(TAP_X, y - 12, 8, 1);
    ctx.fillStyle = theme.ink; ctx.fillRect(TAP_X, y - 11, 3, 4);   // spout
    ctx.fillStyle = theme.brass; ctx.fillRect(TAP_X + 1, y - 11, 1, 3);
    // Handle: tips forward while pouring.
    const hx = TAP_X + 4 + (pouring ? -3 : 0);
    ctx.fillStyle = theme.ink; ctx.fillRect(hx - 1, y - 28, 4, 12);
    ctx.fillStyle = ['#c8463a', '#3f8f5a', '#34508f', '#d98a2b'][i % 4]; ctx.fillRect(hx, y - 27, 2, 10);
    ctx.fillStyle = '#fff8e6'; ctx.fillRect(hx, y - 27, 1, 2);
    if (pouring) { ctx.fillStyle = '#f2b134'; ctx.fillRect(TAP_X + 1, y - 7, 1, 4); }
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
    const bob = moving && Math.floor(c.bob * 6) % 2 ? -1 : 0;
    const img = sprites.customers[c.kind];
    const top = Math.round(y) - 14 + bob - lift;
    if (c.state === 'leave' && !c.vert) {                    // walking home along the bar, facing left
      ctx.save(); ctx.translate(Math.round(c.x) + 12, top); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0); ctx.restore();
    } else ctx.drawImage(img, Math.round(c.x), top);
    if (c.state === 'drink') drawMug(c.x + 7, y - 13, 0.6, false);
    else if (c.state === 'pushed') drawMug(c.x + 11, y - 7, 1, true);
    if (cheer) drawMug(c.x + 8, y - 26 - lift, 1, true);       // mug raised
    if (c.wants > 1 && c.state !== 'leave') {                // still has more than one to drink
      const bx = Math.round(c.x) + 1, by = Math.round(y) - 26 - (c.vert ? 0 : 0);
      ctx.fillStyle = theme.ink; ctx.fillRect(bx, by, 11, 9);
      ctx.fillStyle = theme.bubble; ctx.fillRect(bx + 1, by + 1, 9, 7);
      BG.drawText(ctx, 'X' + c.wants, bx + 2, by + 2, theme.ink, 1);
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
      else if (d.variant === 'shimmy') { x += Math.floor(t * 12) % 2 ? 1 : -1; off = Math.floor(t * 6) % 2 ? -1 : 0; }
      else if (d.variant === 'bounce') off = -Math.abs(Math.sin(t * 5)) * 7;
      else { flip = Math.floor(t / 0.35) % 2 === 1; x += Math.sin(t * 4) * 10; off = -Math.abs(Math.sin(t * 8)) * 3; }
    }
    if (t >= wobbleAt) { const k = Math.min(1, (t - wobbleAt) / 1.1); ang = Math.sin(t * 18) * (0.12 + 0.25 * k); x += Math.sin(t * 18) * 2 * k; }
    if (t >= fallAt) { const p = (t - fallAt) / 0.7; off = p * p * 26; ang = p * 1.3; }
    ctx.save();
    ctx.translate(Math.round(x + 6), Math.round(y + 3 + off));
    ctx.rotate(ang);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(sprites.customers[d.kindSprite], -6, -16);
    ctx.restore();
    if (t >= 0.8 && t < wobbleAt) {                           // music notes over the dancer
      ctx.fillStyle = '#ffd36b';
      for (let k = 0; k < 2; k++) { const p = (clock * 0.9 + k * 0.5) % 1, nx = Math.round(x + 2 + k * 8 + Math.sin(p * 6) * 3), ny = Math.round(y - 20 - p * 12); ctx.fillRect(nx, ny, 2, 2); ctx.fillRect(nx + 1, ny - 4, 1, 4); }
    }
  }

  function drawBouncer(x, y, flip) {
    ctx.save(); ctx.translate(Math.round(x), Math.round(y)); if (flip) { ctx.translate(14, 0); ctx.scale(-1, 1); }
    ctx.fillStyle = theme.ink; ctx.fillRect(2, 0, 10, 8); ctx.fillRect(0, 8, 14, 13);
    ctx.fillStyle = '#e0a074'; ctx.fillRect(3, 1, 8, 6);
    ctx.fillStyle = theme.ink; ctx.fillRect(3, 3, 8, 2);
    ctx.fillStyle = '#3a3a52'; ctx.fillRect(1, 9, 12, 11);
    ctx.fillStyle = '#e63946'; ctx.fillRect(6, 9, 2, 6);
    ctx.fillStyle = '#e0a074'; ctx.fillRect(-1, 11, 2, 4); ctx.fillRect(13, 11, 2, 4);
    ctx.restore();
  }

  function drawDust(cx, cy) {
    for (let k = 0; k < 6; k++) {
      const dx = Math.round((hash(k + 1) - 0.5) * 18), dy = Math.round((hash(k + 9) - 0.5) * 10);
      ctx.fillStyle = k % 3 ? '#e8e2cc' : '#b9b2a0'; ctx.fillRect(cx + dx - 3, cy + dy - 2, 6, 4);
    }
    ctx.fillStyle = '#ffd36b'; ctx.fillRect(cx + Math.round((hash(20) - 0.5) * 16), cy - 8 - Math.round(hash(21) * 4), 2, 2);
  }

  function drawFight(i) {
    const f = ev, y = lanesY[i], t = f.t;
    if (t < 0.15) return;
    const away = Math.max(0, t - 6.0) * 80;
    const cx = f.x - away;
    const a = sprites.customers[f.k1], b = sprites.customers[f.k2];
    const flipDraw = (img, x, yy, flip) => { ctx.save(); ctx.translate(Math.round(x) + (flip ? 12 : 0), yy); if (flip) ctx.scale(-1, 1); ctx.drawImage(img, 0, 0); ctx.restore(); };
    if (t >= 6.0) {                                           // carried out, feet off the floor, with the bouncer behind
      flipDraw(a, cx - 8, y - 16, false); flipDraw(b, cx + 4, y - 16, true);
      drawBouncer(cx + 18, y - 18, true);
    } else {
      let ax = cx - 7, bx = cx + 7, ay = y - 14, by = y - 14;
      if (f.variant === 'wrestle') { const sw = Math.floor(t / 0.3) % 2; ax = cx - 4 + sw * 8; bx = cx + 4 - sw * 8; ay += 3; by += 3; }
      else if (f.variant === 'shove') { const s = Math.sin(t * 5) * 6; ax = cx - 8 + s; bx = cx + 8 + s; }
      else { ax += Math.round((hash(3) - 0.5) * 2); bx += Math.round((hash(4) - 0.5) * 2); }
      flipDraw(a, ax, ay, false); flipDraw(b, bx, by, true);
      if (f.variant === 'brawl' || t < 0.6) drawDust(Math.round(cx + 6), y - 8);
      if (t >= 5.2) drawBouncer(Math.min(cx - 16, -20 + (t - 5.2) / 0.8 * (cx + 4)), y - 18, false);   // the bouncer strides in from the door
    }
  }

  function drawHelper(i) {
    const h = ev, y = lanesY[i];
    const slide = Math.min(1, h.t / 0.8, Math.max(0, (h.dur - h.t) / 0.8));
    const hx = (i === bt.lane ? 244 : 270) + (1 - slide) * 44;
    ctx.save(); ctx.translate(Math.round(hx) + 12, y - 6 - (Math.floor(clock * 8) % 2 && slide < 1 ? 1 : 0)); ctx.scale(-1, 1);
    ctx.drawImage(sprites.customers[h.variant.kind], 0, 0); ctx.restore();
    ctx.fillStyle = '#fff8e6'; ctx.fillRect(Math.round(hx) + 3, y + 5, 6, 5);        // apron
    ctx.fillStyle = theme.ink; ctx.fillRect(Math.round(hx) + 3, y + 5, 6, 1);
  }

  function drawParty() {                                      // streamers and a banner
    ctx.fillStyle = '#ff5fa2'; ctx.fillRect(40, 30, 240, 1);
    for (let k = 0; k < 12; k++) { ctx.fillStyle = ['#ffd36b', '#7fc8ff', '#b6e34a', '#ff5fa2'][k % 4]; ctx.fillRect(46 + k * 20, 31, 4, 3 + (k % 3)); }
    if (Math.floor(clock * 3) % 2) BG.drawText(ctx, ev.variant === 'toast' ? 'CHEERS!' : 'PARTY TIME', W / 2, 36, '#ffd36b', 1, 'center', theme.ink);
  }

  function drawBartender(i) {
    const y = lanesY[i];
    const facingTap = (bt.holding || bt.fill > 0) && bt.throwT <= 0 && state === 'play';
    const sx = bt.shake > 0 ? (Math.floor(bt.shake * 30) % 2 ? 1 : -1) : 0;
    if (facingTap) {
      ctx.drawImage(sprites.btRight, 280 + sx, y - 6);
      drawMug(TAP_X - 1, y - 3, bt.fill, false);
    } else {
      ctx.drawImage(sprites.btLeft, 272 + sx, y - 6);
    }
  }

  function drawBubble(text, x, y, alpha) {
    const w = BG.textWidth(text, 1) + 6;
    const bx = Math.round(Math.max(2, Math.min(W - w - 2, x - w / 2))), by = Math.round(y);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = theme.ink; ctx.fillRect(bx - 1, by - 1, w + 2, 11);
    ctx.fillStyle = theme.bubble; ctx.fillRect(bx, by, w, 9);
    BG.drawText(ctx, text, bx + 3, by + 2, theme.ink, 1);
    ctx.globalAlpha = 1;
  }

  function drawHud() {
    BG.drawText(ctx, 'SCORE ' + String(score).padStart(6, '0'), 4, 4, theme.hud, 1, 'left', theme.hudShadow);
    BG.drawText(ctx, round ? round.shift.name : 'MORNING', 4, 12, theme.hud, 1, 'left', theme.hudShadow);
    BG.drawText(ctx, 'BEST ' + String(best).padStart(6, '0'), W - 4, 4, theme.hud, 1, 'right', theme.hudShadow);
    for (let i = 0; i < cfg.glasses; i++) {
      const x = W - 12 - i * 10, y = 12;
      if (i < lives) drawMug(x, y + 1, 1, true);
      else { ctx.fillStyle = theme.hudShadow; ctx.fillRect(x, y + 4, 6, 2); ctx.fillStyle = '#bfe3ea'; ctx.fillRect(x + 1, y + 4, 2, 1); ctx.fillRect(x + 4, y + 5, 1, 1); }
    }
  }

  function drawSign() {
    const flick = Math.sin(clock * 13) > 0.97 || (Math.floor(clock * 2) % 17 === 0 && Math.sin(clock * 40) > 0);
    const col = flick ? theme.neonDim : theme.neon;
    if (!flick) {
      const beat = BG.sound.pulse ? BG.sound.pulse() : 0;
      ctx.fillStyle = theme.neonGlow; ctx.fillRect(100, 2, 120, 22);
      if (beat > 0) { ctx.globalAlpha = beat * 0.8; ctx.fillRect(96, 0, 136, 26); ctx.globalAlpha = 1; }
    }
    ctx.fillStyle = theme.ink; ctx.fillRect(102, 4, 116, 18);
    ctx.fillStyle = col; ctx.fillRect(102, 4, 116, 1); ctx.fillRect(102, 21, 116, 1); ctx.fillRect(102, 4, 1, 18); ctx.fillRect(217, 4, 1, 18);
    BG.drawText(ctx, 'OLE BAR GLIDE', 160, 8, col, 2, 'center');
    // A tiny neon mug beside the words.
    ctx.fillStyle = flick ? theme.neonDim : '#f2b134';
    ctx.fillRect(222, 9, 5, 8); ctx.fillRect(227, 11, 2, 4);
    ctx.fillStyle = '#fff8e6'; ctx.fillRect(221, 7, 7, 2);
  }

  function draw() {
    ctx.drawImage(bg, 0, 0);
    drawSign();
    const bossLane = boss ? boss.lane : -1;
    for (let i = 0; i < lanesY.length; i++) {
      const y = lanesY[i];
      customers.filter(c => c.lane === i && !c.vert).forEach(drawCustomer);
      if (ev && ev.kind === 'fight' && ev.lane === i) drawFight(i);
      ctx.drawImage(barImg, BAR_X0 - 2, y);
      mugs.filter(m => m.lane === i).forEach(m => {
        const wob = m.teeter !== undefined ? (Math.floor(clock * 40) % 2 ? 1 : -1) : 0;
        drawMug(m.x + wob, y - 7 - (wob > 0 ? 1 : 0), m.full ? 1 : 0, m.full);
        if (m.teeter !== undefined) BG.drawText(ctx, '!', m.x + 2, y - 16, '#ff5fa2', 1, 'left', theme.ink);
      });
      tips.filter(t => t.lane === i && (t.t > 2 || Math.floor(t.t * 6) % 2)).forEach(t => drawCoin(t.x, y - 4));
      if (ev && ev.kind === 'dancer' && ev.lane === i) drawDancer(i);
      if (ev && ev.kind === 'helper' && ev.lanes.indexOf(i) >= 0) drawHelper(i);
      drawTap(i, state === 'play' && bt.lane === i && bt.holding && bt.fill < 1);
      if (i === bossLane) drawBossScene(i);
      else if (dash && dash.lane === i) ctx.drawImage(dash.back ? sprites.btRight : sprites.btLeft, Math.round(dash.x), y - 6 - (Math.floor(clock * 12) % 2));
      else if (i === bt.lane && state !== 'title' && state !== 'bonus' && !(boss && boss.t >= 1.9)) drawBartender(i);
      if (oops && oops.lane === i && oops.glass) {
        const g = oops.glass;
        if (!g.broken) drawMug(g.x, g.y, 1, true);
      }
    }
    drawDoor();
    customers.filter(c => c.vert).forEach(drawCustomer);
    if (state === 'title') ctx.drawImage(sprites.btLeft, 272, lanesY[bt.lane] - 6);
    if (ev && ev.kind === 'celebration') drawParty();
    if (show > 0) drawShow();
    if (state === 'bonus') drawBonus();
    parts.forEach(p => { ctx.fillStyle = p.color; ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); });
    // Beer puddle under a broken glass.
    if (oops && oops.glass && oops.glass.broken) {
      ctx.fillStyle = '#f2b134'; ctx.fillRect(Math.round(oops.glass.x) - 6, 184, 13, 2);
      ctx.fillStyle = '#fff8e6'; ctx.fillRect(Math.round(oops.glass.x) - 2, 184, 3, 1);
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
    ctx.fillStyle = theme.ink; ctx.fillRect(x - 1, y - 1, 7, 6);
    ctx.fillStyle = '#ffd36b'; ctx.fillRect(x, y, 5, 4);
    ctx.fillStyle = '#fff8e6'; ctx.fillRect(x + 1, y, 1, 1);
    if (Math.floor(clock * 4) % 2) { ctx.fillStyle = '#fff8e6'; ctx.fillRect(x + 6, y - 3, 1, 1); }
  }
  // Show time: coloured spotlights sweep the room while everyone watches.
  function drawShow() {
    const cols = ['rgba(255, 95, 162, 0.22)', 'rgba(127, 200, 255, 0.22)', 'rgba(182, 227, 74, 0.2)'];
    cols.forEach((c, k) => {
      const x = 160 + Math.sin(clock * (2.2 + k * 0.7) + k * 2) * 120, y = 110 + Math.cos(clock * (1.7 + k * 0.5) + k) * 50;
      const g = ctx.createRadialGradient(x, y, 4, x, y, 46);
      g.addColorStop(0, c); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(x - 46, y - 46, 92, 92);
    });
    if (Math.floor(clock * 4) % 2) BG.drawText(ctx, 'SHOW TIME', W / 2, 28, '#ffd36b', 2, 'center', theme.ink);
    // Music notes float up from the jukebox corner.
    ctx.fillStyle = '#ffd36b';
    for (let k = 0; k < 4; k++) {
      const p = (clock * 0.6 + k / 4) % 1, nx = 44 + k * 60 + Math.sin(p * 6 + k) * 6, ny = 180 - p * 140;
      ctx.fillRect(Math.round(nx), Math.round(ny), 2, 2); ctx.fillRect(Math.round(nx) + 1, Math.round(ny) - 5, 1, 5);
    }
  }

  function drawBossScene(i) {
    const b = boss, y = lanesY[i];
    const T = b.t;
    if (T < 1.9) {
      // The bartender waits, shaking; the owner stomps in.
      const lift = T > 1.2 ? Math.min(6, (T - 1.2) * 20) : 0;
      const sx = Math.floor(T * 30) % 2 ? 1 : -1;
      ctx.drawImage(sprites.btLeft, 272 + sx - (T > 1.2 ? (T - 1.2) / 0.7 * 30 : 0), y - 6 - lift);
      ctx.drawImage(sprites.boss, Math.round(b.x), y - 8);
      if (T < 1.2) drawBubble('?!', 278, y - 20, 1);
    } else {
      // Bent over the bar.
      const wobble = cfg.ending === 'spank' && (T - 2.1) % 0.55 < 0.1 ? 1 : 0;
      ctx.drawImage(sprites.btBent, 232, y - 12 + wobble);
      ctx.drawImage(sprites.boss, Math.round(b.x), y - 8);
      if (T < 5.6) {
        const phase = ((T - 2.1) % 0.55) / 0.55;
        if (cfg.ending === 'spank') {
          const up = T < 2.1 ? 1 : (phase < 0.15 ? 0 : Math.min(1, (phase - 0.15) * 2));
          const hy = y - 14 - Math.round(up * 16);
          ctx.fillStyle = theme.ink; ctx.fillRect(254, hy + 2, Math.max(2, b.x - 252), 2);
          ctx.drawImage(sprites.hand, 247, hy);
        } else {
          const wag = Math.sin(T * 14) > 0 ? 1 : -1;
          ctx.fillStyle = theme.ink; ctx.fillRect(250, y - 30, 12, 2);
          ctx.drawImage(sprites.hand, 244 + wag, y - 33);
          ctx.fillStyle = '#e0786a'; ctx.fillRect(245 + wag, y - 39, 2, 6);
        }
      }
    }
  }

  function banner(a, b) {
    ctx.fillStyle = theme.dim; ctx.fillRect(0, 78, W, 40);
    BG.drawText(ctx, a, W / 2, 84, theme.hud, 3, 'center', theme.hudShadow);
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
