/* Ole Bar Glide — vector characters, the text helper and the two room themes (version 2, modern look).
 * Every character is drawn with shapes at SCALE times its game size, then drawn smoothly at its game size
 * (see blit in game.js). Each sprite canvas carries lw/lh, its size in game units.
 * Classic script, no build. Exposes window.BG.sprites, BG.drawText, BG.textWidth, BG.THEMES, BG.SCALE.
 * The pixel original is archived in v1/. */
window.BG = window.BG || {};
(function (BG) {
  'use strict';

  const S = BG.SCALE = 4;               // canvas pixels per game unit
  const INK = '#1a1020';

  // ---- colour helpers ----
  function rgb(h) { return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); }
  function hex(a) { return '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
  // f < 1 darkens, f > 1 lightens towards white.
  BG.shade = function (h, f) {
    const c = rgb(h);
    return hex(f <= 1 ? c.map(v => v * f) : c.map(v => v + (255 - v) * (f - 1)));
  };
  BG.mix = function (a, b, t) { const p = rgb(a), q = rgb(b); return hex(p.map((v, i) => v + (q[i] - v) * t)); };

  function sprite(w, h, fn) {
    const c = document.createElement('canvas');
    c.width = Math.round(w * S); c.height = Math.round(h * S); c.lw = w; c.lh = h;
    const x = c.getContext('2d');
    x.scale(S, S); x.lineJoin = 'round'; x.lineCap = 'round';
    fn(x);
    return c;
  }
  function rr(x, a, b, w, h, r) {
    x.beginPath(); x.moveTo(a + r, b); x.lineTo(a + w - r, b); x.quadraticCurveTo(a + w, b, a + w, b + r);
    x.lineTo(a + w, b + h - r); x.quadraticCurveTo(a + w, b + h, a + w - r, b + h); x.lineTo(a + r, b + h);
    x.quadraticCurveTo(a, b + h, a, b + h - r); x.lineTo(a, b + r); x.quadraticCurveTo(a, b, a + r, b); x.closePath();
  }
  function vgrad(x, y0, y1, c0, c1) { const g = x.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, c0); g.addColorStop(1, c1); return g; }
  function disc(x, cx, cy, r, fill, stroke) {
    x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2);
    if (fill) { x.fillStyle = fill; x.fill(); }
    if (stroke) { x.strokeStyle = INK; x.lineWidth = stroke; x.stroke(); }
  }
  function fillStroke(x, fill, w) { x.fillStyle = fill; x.fill(); x.strokeStyle = INK; x.lineWidth = w || 0.6; x.stroke(); }

  const KINDS = [
    { h: '#8a5a2b', c: '#c8463a', s: '#f2b98a', stache: true },    // cowboy
    { h: '#e8c25a', c: '#34508f', s: '#d9a066', stache: false },   // straw hat
    { h: '#e88aa0', c: '#3f8f5a', s: '#f5c9a0', stache: false },   // pink hat
    { h: '#8c8c9c', c: '#7a4a9c', s: '#a86b45', stache: true },    // grey hat
    { h: '#2d2d3a', c: '#d98a2b', s: '#f2b98a', stache: true }     // black hat
  ];

  // A customer, facing right (toward the bartender). 12 x 16 game units; the bar hides the last rows.
  function customer(k) {
    return sprite(12, 16, x => {
      rr(x, 1.6, 9, 8.6, 7, 2.2); fillStroke(x, vgrad(x, 9, 16, BG.shade(k.c, 1.25), BG.shade(k.c, 0.7)));
      x.fillStyle = 'rgba(255,255,255,0.28)'; x.fillRect(5.4, 9.6, 0.9, 5.6);          // vest seam
      disc(x, 5.9, 10.4, 0.45, BG.shade(k.h, 1.2));                                      // button
      rr(x, 7.8, 10.4, 3.4, 2.5, 1.2); fillStroke(x, BG.shade(k.c, 0.85));              // arm
      disc(x, 11.1, 11.7, 1.15, k.s, 0.5);                                                // hand
      const sk = x.createRadialGradient(5.2, 5.2, 0.4, 6, 6, 3.8);
      sk.addColorStop(0, BG.shade(k.s, 1.25)); sk.addColorStop(1, BG.shade(k.s, 0.9));
      disc(x, 6, 6.2, 3.3, sk, 0.6);                                                      // head
      disc(x, 9.1, 6.6, 0.95, BG.shade(k.s, 0.92), 0.4);                                  // nose
      disc(x, 7.5, 7.5, 0.9, 'rgba(240,110,110,0.35)');                                   // cheek
      disc(x, 7.7, 5.3, 0.55, INK);                                                       // eye
      if (k.stache) { rr(x, 7, 7.8, 3, 0.9, 0.45); x.fillStyle = BG.shade(k.h, 0.55); x.fill(); }
      x.beginPath(); x.ellipse(6, 3.7, 5.7, 1.2, 0, 0, Math.PI * 2); fillStroke(x, BG.shade(k.h, 0.9), 0.55);     // hat brim
      rr(x, 3.3, 0.5, 5.4, 3.5, 1.4); fillStroke(x, vgrad(x, 0.5, 4, BG.shade(k.h, 1.2), BG.shade(k.h, 0.8)), 0.55);   // crown
      x.fillStyle = BG.shade(k.h, 0.55); x.fillRect(3.5, 2.7, 5.1, 0.8);                // hat band
    });
  }

  // The bartender, facing left (toward the bar). 12 x 20.
  function bartender() {
    return sprite(12, 20, x => {
      rr(x, 3.2, 15, 2.6, 4.4, 1); fillStroke(x, '#34508f'); rr(x, 6.4, 15, 2.6, 4.4, 1); fillStroke(x, '#34508f');   // legs
      rr(x, 2.4, 18.4, 3.6, 1.5, 0.75); fillStroke(x, '#3a2a2a', 0.4); rr(x, 6.2, 18.4, 3.6, 1.5, 0.75); fillStroke(x, '#3a2a2a', 0.4);
      rr(x, 1.6, 8, 8.8, 8.6, 2.2); fillStroke(x, vgrad(x, 8, 16.5, '#ffffff', '#d9d4c4'));                          // shirt
      rr(x, 3, 11.2, 6.2, 5.8, 1.2); fillStroke(x, vgrad(x, 11, 17, '#efe4c8', '#cdbf9c'), 0.5);                  // apron
      x.beginPath(); x.moveTo(5.6, 8.9); x.lineTo(3.7, 8.1); x.lineTo(3.7, 9.8); x.closePath(); fillStroke(x, '#c8463a', 0.4);   // bow tie
      x.beginPath(); x.moveTo(5.6, 8.9); x.lineTo(7.5, 8.1); x.lineTo(7.5, 9.8); x.closePath(); fillStroke(x, '#c8463a', 0.4);
      rr(x, 0.2, 10, 4.4, 2.5, 1.2); fillStroke(x, '#f4f0e4', 0.5); disc(x, 0.9, 11.2, 1.2, '#f2b98a', 0.5);          // arm and hand
      const sk = x.createRadialGradient(4.6, 4.4, 0.4, 5.4, 5.2, 4);
      sk.addColorStop(0, '#fbd2ac'); sk.addColorStop(1, '#e8a878');
      disc(x, 5.6, 5.2, 3.4, sk, 0.6);                                                                                 // head
      x.beginPath(); x.arc(5.8, 4.6, 3.7, Math.PI * 1.02, Math.PI * 2.05); x.lineTo(9.3, 6.4); x.lineTo(7.6, 3.8);
      x.closePath(); fillStroke(x, '#5a3420', 0.55);                                                                   // slicked hair
      disc(x, 2.3, 5.9, 0.9, '#e8a878', 0.4); disc(x, 3.7, 4.8, 0.55, INK);
      rr(x, 2.4, 7, 3.4, 0.9, 0.45); x.fillStyle = '#5a3420'; x.fill();                                                // moustache
    });
  }

  // The bar owner, facing left. 16 x 22, red-faced.
  function boss() {
    return sprite(16, 22, x => {
      rr(x, 3, 18, 3.4, 3.4, 1); fillStroke(x, '#2d2040'); rr(x, 7, 18, 3.4, 3.4, 1); fillStroke(x, '#2d2040');
      rr(x, 1.2, 9, 11.6, 10, 2.4); fillStroke(x, vgrad(x, 9, 19, '#6a4a86', '#3a2850'));                              // suit
      x.fillStyle = '#fff'; x.beginPath(); x.moveTo(5.4, 9.4); x.lineTo(8.6, 9.4); x.lineTo(7, 14); x.closePath(); x.fill();
      x.beginPath(); x.moveTo(6.5, 10); x.lineTo(7.5, 10); x.lineTo(7.7, 16); x.lineTo(7, 17); x.lineTo(6.3, 16); x.closePath(); fillStroke(x, '#c8463a', 0.4);
      rr(x, 0, 10.6, 3.2, 5.4, 1.4); fillStroke(x, '#4a3262'); disc(x, 1.5, 16.4, 1.5, '#e0786a', 0.5);               // arm
      const fc = x.createRadialGradient(5, 4, 0.5, 6, 5.5, 5.5); fc.addColorStop(0, '#f08a7a'); fc.addColorStop(1, '#c8463a');
      disc(x, 6.5, 5.4, 4.6, fc, 0.65);                                                                                // face
      x.strokeStyle = INK; x.lineWidth = 0.9; x.beginPath(); x.moveTo(1.8, 2.8); x.lineTo(5, 4); x.moveTo(9.4, 4); x.lineTo(11.4, 2.6); x.stroke();   // cross brows
      disc(x, 4.2, 5, 0.8, '#fff'); disc(x, 4, 5, 0.45, INK); disc(x, 8.4, 5, 0.8, '#fff'); disc(x, 8.2, 5, 0.45, INK);
      disc(x, 2.2, 6.6, 1, '#e0786a', 0.4);
      rr(x, 3.2, 8, 4.6, 1.6, 0.8); fillStroke(x, '#7a1a1a', 0.4);                                                     // shouting mouth
      x.fillStyle = '#c8c8d4'; x.beginPath(); x.arc(6.5, 1.8, 3.6, Math.PI * 1.1, Math.PI * 1.9); x.fill();            // grey hair
    });
  }

  function hand() {
    return sprite(6, 5, x => {
      rr(x, 0.6, 0.6, 4.8, 3.8, 1.5); fillStroke(x, vgrad(x, 0, 5, '#f08a7a', '#c8463a'), 0.5);
      x.strokeStyle = 'rgba(26,16,32,0.5)'; x.lineWidth = 0.3;
      x.beginPath(); x.moveTo(2.2, 0.8); x.lineTo(2.2, 2); x.moveTo(3.8, 0.8); x.lineTo(3.8, 2); x.stroke();
    });
  }

  function flip(src) {
    return sprite(src.lw, src.lh, x => { x.translate(src.lw, 0); x.scale(-1, 1); x.drawImage(src, 0, 0, src.lw, src.lh); });
  }
  // A quarter turn counter-clockwise: the bartender bends over the bar.
  function turnLeft(src) {
    return sprite(src.lh, src.lw, x => { x.translate(0, src.lw); x.rotate(-Math.PI / 2); x.drawImage(src, 0, 0, src.lw, src.lh); });
  }

  let cache = null;
  BG.sprites = function () {
    if (cache) return cache;
    const btLeft = bartender();
    cache = { btLeft, btRight: flip(btLeft), btBent: turnLeft(btLeft), customers: KINDS.map(customer), boss: boss(), hand: hand() };
    return cache;
  };

  // ---- text: a rounded, heavy system font, sized so that scale 1 reads like the old 5-px letters ----
  const FONT = '"Arial Rounded MT Bold", "Nunito", "Quicksand", ui-rounded, system-ui, sans-serif';
  let meter = null;
  function fontFor(scale) { return '800 ' + (5.6 * (scale || 1) + 0.6) + 'px ' + FONT; }
  BG.textWidth = (str, scale) => {
    if (!meter) meter = document.createElement('canvas').getContext('2d');
    meter.font = fontFor(scale);
    return meter.measureText(String(str).toUpperCase()).width;
  };
  // align: 'left' | 'center' | 'right'. Optional shadow colour drawn a little down-right.
  BG.drawText = function (ctx, str, x, y, color, scale, align, shadow) {
    scale = scale || 1;
    str = String(str).toUpperCase();
    ctx.font = fontFor(scale); ctx.textBaseline = 'top'; ctx.textAlign = align || 'left';
    if (shadow) { ctx.fillStyle = shadow; ctx.fillText(str, x + 0.5 * scale, y + 0.5 * scale); }
    ctx.fillStyle = color; ctx.fillText(str, x, y);
  };

  // ---- Room themes. 'saloon' is the late-night arcade mood; 'pastel' is the daytime family look. ----
  BG.THEMES = {
    saloon: {
      wall: '#3b2316', plank: '#452a1a', plankLine: '#2a170d', shelf: '#6b3f22', shelfHi: '#8a5530',
      floorA: '#24160f', floorB: '#2e1c14', barTop: '#c9884a', barTopHi: '#e9b070', barFront: '#7a4423',
      barPanel: '#5a2f17', rail: '#e6b84a', door: '#a8693a', doorDark: '#6b3f22', doorway: '#120a14',
      night: '#1c2448', star: '#fff2b0', lamp: '#ffd27a', glow: 'rgba(255, 186, 90, 0.16)', neon: '#ff5fa2',
      neonDim: '#5a2440', neonGlow: 'rgba(255, 95, 162, 0.25)', hud: '#ffe9a8', hudShadow: '#1a1020',
      brass: '#d9a441', brassDark: '#8a6020', bubble: '#fff8e6', ink: '#1a1020', dim: 'rgba(10, 4, 12, 0.45)'
    },
    pastel: {
      wall: '#fde6c8', plank: '#f8dcbc', plankLine: '#e8c3a2', shelf: '#c99a7a', shelfHi: '#ddb393',
      floorA: '#f3d7c4', floorB: '#ecc9b4', barTop: '#f0c08a', barTopHi: '#ffdcae', barFront: '#d99a6a',
      barPanel: '#c4865a', rail: '#86c9a8', door: '#9ad0c2', doorDark: '#6fb3a3', doorway: '#cfe8f5',
      night: '#bfe3f5', star: '#ffffff', lamp: '#fff3b0', glow: 'rgba(255, 255, 220, 0.25)', neon: '#e8708a',
      neonDim: '#f2c4cc', neonGlow: 'rgba(232, 112, 138, 0.18)', hud: '#4a2e3e', hudShadow: '#fff8ec',
      brass: '#e0b25a', brassDark: '#b08030', bubble: '#ffffff', ink: '#3a2a3a', dim: 'rgba(255, 248, 236, 0.5)'
    }
  };
})(window.BG);
