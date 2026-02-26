'use strict';

// ===== PRESETS =====
const PRESETS = {
  gallery: {
    wallColor: '#808080', frameColor: '#8B4513', frameAccent: '#CD853F',
    matColor: '#FFFAF0', imageBg: '#FFFFFF'
  },
  classicGold: {
    wallColor: '#696969', frameColor: '#8B6914', frameAccent: '#DAA520',
    matColor: '#F5F5DC', imageBg: '#E8E4D9'
  },
  darkEbony: {
    wallColor: '#2C2C2C', frameColor: '#1C1C1C', frameAccent: '#555555',
    matColor: '#FFFFFF', imageBg: '#F0F0F0'
  },
  vintage: {
    wallColor: '#8B7355', frameColor: '#654321', frameAccent: '#B8860B',
    matColor: '#FFF8DC', imageBg: '#FFFFF0'
  },
  modern: {
    wallColor: '#F0F0F0', frameColor: '#111111', frameAccent: '#333333',
    matColor: '#FFFFFF', imageBg: '#FFFFFF'
  },
  neon: {
    wallColor: '#0a0a1a', frameColor: '#1a0033', frameAccent: '#ff00ff',
    matColor: '#0d0d1a', imageBg: '#000011'
  }
};

// Ornate frame band layout (constant — no allocation per draw call)
const ORNATE_BANDS = [
  { f: 0.04, l: -20 },
  { f: 0.10, l: 35 },
  { f: 0.06, l: 15 },
  { f: 0.05, l: 0, accent: true },
  { f: 0.22, l: 5 },
  { f: 0.06, l: 10 },
  { f: 0.05, l: 0, accent: true },
  { f: 0.22, l: -5 },
  { f: 0.06, l: -10 },
  { f: 0.10, l: -18 },
  { f: 0.04, l: -12 },
];

// ===== STATE =====
const state = {
  image: null,
  normieId: 1,
  frameStyle: 'ornate',
  frameWidth: 12,
  matWidth: 0,
  frameSize: 68,
  nesting: 6,
  showShelf: true,
  showShadow: true,
  wallTexture: false,
  wallColor: '#808080',
  frameColor: '#8B4513',
  frameAccent: '#CD853F',
  matColor: '#FFFAF0',
  imageBg: '#FFFFFF',
  animationType: 'shred',
  animSpeed: 5,
  easing: 'linear',
  resolution: 600,
  gifFrames: 30,
  gifFps: 15,
  playing: false,
  progress: 0,
  animStart: null,
  rafId: null
};

let canvas, ctx;
let wallTextureCanvas = null; // cached texture tile (context-independent)

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
  canvas = document.getElementById('preview');
  ctx = canvas.getContext('2d');
  setupUI();
  requestRender();
  loadNormie(1);
});

// ===== UI SETUP =====
function setupUI() {
  // Section collapse toggles
  document.querySelectorAll('.section-title').forEach(title => {
    title.addEventListener('click', () => {
      const target = document.getElementById(title.dataset.toggle);
      title.classList.toggle('collapsed');
      target.classList.toggle('collapsed');
    });
  });

  // Normie loading
  document.getElementById('loadNormie').addEventListener('click', () => {
    const id = parseInt(document.getElementById('normieId').value, 10);
    if (!isNaN(id)) loadNormie(id);
  });
  document.getElementById('normieId').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const id = parseInt(e.target.value, 10);
      if (!isNaN(id)) loadNormie(id);
    }
  });
  document.getElementById('randomNormie').addEventListener('click', () => {
    const id = Math.floor(Math.random() * 10000);
    document.getElementById('normieId').value = id;
    loadNormie(id);
  });

  // Presets
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyPreset(btn.dataset.preset);
    });
  });

  // Range sliders with value display
  const rangeMap = {
    frameWidth: { display: 'frameWidthVal', suffix: '%' },
    matWidth:   { display: 'matWidthVal',   suffix: '%' },
    frameSize:  { display: 'frameSizeVal',  suffix: '%' },
    nesting:    { display: 'nestingVal',    suffix: '' },
    animSpeed:  { display: 'animSpeedVal',  suffix: '' },
    gifFrames:  { display: 'gifFramesVal',  suffix: '' },
    gifFps:     { display: 'gifFpsVal',     suffix: '' }
  };

  Object.entries(rangeMap).forEach(([id, cfg]) => {
    const el = document.getElementById(id);
    el.addEventListener('input', () => {
      state[id] = parseFloat(el.value);
      document.getElementById(cfg.display).textContent = el.value + cfg.suffix;
      requestRender();
    });
  });

  // Selects
  ['frameStyle', 'animationType', 'easing', 'resolution'].forEach(id => {
    document.getElementById(id).addEventListener('change', e => {
      state[id] = id === 'resolution' ? parseInt(e.target.value, 10) : e.target.value;
      requestRender();
    });
  });

  // Color pickers
  ['wallColor', 'frameColor', 'frameAccent', 'matColor', 'imageBg'].forEach(id => {
    document.getElementById(id).addEventListener('input', e => {
      state[id] = e.target.value;
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      if (id === 'wallColor') wallTextureCanvas = null;
      requestRender();
    });
  });

  // Checkboxes
  ['showShelf', 'showShadow', 'wallTexture'].forEach(id => {
    document.getElementById(id).addEventListener('change', e => {
      state[id] = e.target.checked;
      if (id === 'wallTexture') wallTextureCanvas = null;
      requestRender();
    });
  });

  // Timeline scrubber
  document.getElementById('timeline').addEventListener('input', e => {
    state.progress = parseFloat(e.target.value) / 1000;
    document.getElementById('timeDisplay').textContent = Math.round(state.progress * 100) + '%';
    requestRender();
  });

  // Play/Pause
  document.getElementById('playPause').addEventListener('click', togglePlay);

  // Export
  document.getElementById('exportPng').addEventListener('click', exportPNG);
  document.getElementById('exportGif').addEventListener('click', exportGIF);
}

// ===== IMAGE LOADING =====
async function loadNormie(id) {
  id = Math.max(0, Math.min(9999, id));
  state.normieId = id;
  document.getElementById('normieId').value = id;
  const traitsEl = document.getElementById('normieTraits');
  traitsEl.innerHTML = '';
  const loadSpan = document.createElement('span');
  loadSpan.className = 'trait-tag';
  loadSpan.textContent = 'Loading...';
  traitsEl.appendChild(loadSpan);

  const img = await fetchNormieImage(id);
  if (img) {
    state.image = img;
    requestRender();
  }

  try {
    const resp = await fetch(`https://api.normies.art/normie/${id}/traits`);
    if (resp.ok) {
      const data = await resp.json();
      displayTraits(data.attributes);
    }
  } catch (_) {
    // Traits are optional
  }
}

async function fetchNormieImage(id) {
  // Primary: fetch PNG as blob (avoids tainted canvas)
  try {
    const resp = await fetch(`https://api.normies.art/normie/${id}/image.png`);
    if (resp.ok) return await blobToImage(await resp.blob());
  } catch (_) { /* fall through */ }

  // Fallback: fetch SVG as text, create blob URL
  try {
    const resp = await fetch(`https://api.normies.art/normie/${id}/image.svg`);
    if (resp.ok) {
      const blob = new Blob([await resp.text()], { type: 'image/svg+xml' });
      return await blobToImage(blob);
    }
  } catch (_) { /* fall through */ }

  const errEl = document.getElementById('normieTraits');
  errEl.innerHTML = '';
  const errSpan = document.createElement('span');
  errSpan.className = 'trait-tag';
  errSpan.style.color = '#e40014';
  errSpan.textContent = 'Error: could not load image. Try another ID.';
  errEl.appendChild(errSpan);
  return createPlaceholder(id);
}

function blobToImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image decode failed')); };
    img.src = url;
  });
}

function createPlaceholder(seed) {
  return new Promise(resolve => {
    const size = 40;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const pctx = c.getContext('2d');

    pctx.fillStyle = '#e3e5e4';
    pctx.fillRect(0, 0, size, size);

    // Seeded PRNG for consistent output per ID
    let s = seed + 1;
    const rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };

    pctx.fillStyle = '#48494b';
    for (let y = 8; y < 32; y++) {
      for (let x = 10; x <= 20; x++) {
        if (rand() > 0.55) {
          pctx.fillRect(x, y, 1, 1);
          pctx.fillRect(39 - x, y, 1, 1);
        }
      }
    }

    const img = new Image();
    img.onload = () => resolve(img);
    img.src = c.toDataURL();
  });
}

function displayTraits(attributes) {
  const container = document.getElementById('normieTraits');
  container.innerHTML = '';
  for (const a of attributes) {
    const span = document.createElement('span');
    span.className = 'trait-tag';
    const strong = document.createElement('strong');
    strong.textContent = a.trait_type + ':';
    span.appendChild(strong);
    span.appendChild(document.createTextNode(' ' + a.value));
    container.appendChild(span);
  }
}

// ===== COLOR UTILITIES =====
function hexToRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16)
  ];
}

function adjustColor(hex, amount) {
  // Handle rgb() strings passed from previous adjustColor calls
  if (hex.startsWith('rgb')) {
    const m = hex.match(/(\d+)/g);
    if (m) {
      const [r, g, b] = m.map(Number);
      const [h, s, l] = rgbToHsl(r, g, b);
      const newL = Math.max(0, Math.min(100, l + amount * 0.4));
      const [nr, ng, nb] = hslToRgb(h, s, newL);
      return `rgb(${clamp(nr)},${clamp(ng)},${clamp(nb)})`;
    }
  }
  const [r, g, b] = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(r, g, b);
  const newL = Math.max(0, Math.min(100, l + amount * 0.4));
  const [nr, ng, nb] = hslToRgb(h, s, newL);
  return `rgb(${clamp(nr)},${clamp(ng)},${clamp(nb)})`;
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [h * 360, s * 100, l * 100];
}

function hslToRgb(h, s, l) {
  h /= 360; s /= 100; l /= 100;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    hue2rgb(p, q, h + 1 / 3) * 255,
    hue2rgb(p, q, h) * 255,
    hue2rgb(p, q, h - 1 / 3) * 255
  ];
}

function clamp(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

// ===== WALL TEXTURE =====
function buildWallTextureTile() {
  const tile = document.createElement('canvas');
  tile.width = 120;
  tile.height = 120;
  const tctx = tile.getContext('2d');
  const [r, g, b] = hexToRgb(state.wallColor);

  tctx.fillStyle = state.wallColor;
  tctx.fillRect(0, 0, 120, 120);

  // Deterministic noise (seeded by wall color)
  let seed = r * 65536 + g * 256 + b;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed / 2147483647 - 0.5) * 18; };

  for (let y = 0; y < 120; y += 2) {
    for (let x = 0; x < 120; x += 2) {
      const n = rand();
      tctx.fillStyle = `rgb(${clamp(r + n)},${clamp(g + n)},${clamp(b + n)})`;
      tctx.fillRect(x, y, 2, 2);
    }
  }
  return tile;
}

function getWallFill(targetCtx) {
  if (!state.wallTexture) return state.wallColor;
  if (!wallTextureCanvas) wallTextureCanvas = buildWallTextureTile();
  // Create pattern bound to the target context
  return targetCtx.createPattern(wallTextureCanvas, 'repeat');
}

// ===== PRESETS =====
function applyPreset(name) {
  const p = PRESETS[name];
  if (!p) return;
  for (const key of Object.keys(p)) {
    state[key] = p[key];
    const el = document.getElementById(key);
    if (el) el.value = p[key];
  }
  wallTextureCanvas = null;
  requestRender();
}

// ===== EASING =====
function applyEasing(t) {
  switch (state.easing) {
    case 'ease-in': return t * t;
    case 'ease-out': return t * (2 - t);
    case 'ease-in-out': return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    default: return t;
  }
}

// ===== RENDERING =====
let renderRequested = false;

function requestRender() {
  if (!renderRequested && !state.playing) {
    renderRequested = true;
    requestAnimationFrame(() => {
      renderRequested = false;
      renderScene(ctx, canvas.width, canvas.height, state.progress, state);
    });
  }
}

function renderScene(ctx, W, H, rawProgress, opts) {
  const t = applyEasing(rawProgress);

  // Shred animation uses a completely different rendering path
  if (opts.animationType === 'shred') {
    renderShredScene(ctx, W, H, t, opts);
    return;
  }

  const frameFrac = opts.frameSize / 100;
  const borderFrac = opts.frameWidth / 100;
  const matFrac = opts.matWidth / 100;
  const innerFrac = Math.max(0.05, 1 - 2 * borderFrac - 2 * matFrac);
  const nestRatio = Math.max(0.05, frameFrac * innerFrac);

  let zoom = 1;
  let rotation = 0;
  switch (opts.animationType) {
    case 'zoom-in':  zoom = Math.pow(1 / nestRatio, t); break;
    case 'zoom-out': zoom = Math.pow(nestRatio, t); break;
    case 'pulse':    zoom = 1 + Math.sin(t * Math.PI * 2) * 0.25; break;
    case 'rotate':   rotation = t * Math.PI * 2; break;
  }

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = getWallFill(ctx);
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  if (rotation !== 0) {
    ctx.translate(W / 2, H / 2);
    ctx.rotate(rotation);
    ctx.translate(-W / 2, -H / 2);
  }

  const maxLevels = opts.nesting + 4;
  for (let i = -2; i < maxLevels; i++) {
    const levelScale = zoom * Math.pow(nestRatio, i);
    if (levelScale > 8) continue;
    if (levelScale < 0.003) break;
    drawLevel(ctx, W, H, levelScale, frameFrac, borderFrac, matFrac, innerFrac, opts);
  }

  ctx.restore();
}

// ===== SHRED (BANKSY) ANIMATION =====
function renderShredScene(ctx, W, H, t, opts) {
  const frameFrac = opts.frameSize / 100;
  const borderFrac = opts.frameWidth / 100;
  const matFrac = opts.matWidth / 100;

  const cx = W / 2;
  // Push the frame upward so the shred strips below are visible
  const cy = H * 0.40;
  const frameW = W * frameFrac;
  const frameH = H * frameFrac;
  const fx = cx - frameW / 2;
  const fy = cy - frameH / 2;

  const bw = frameW * borderFrac;
  const mw = frameW * matFrac;

  // Image area inside the mat
  const imgX = fx + bw + mw;
  const imgY = fy + bw + mw;
  const imgW = frameW - (bw + mw) * 2;
  const imgH = frameH - (bw + mw) * 2;

  // Calculate available strip space below the frame
  const frameBottom = fy + frameH;
  const actualShelfH = Math.max(2, frameW * 0.018);
  const shelfZone = opts.showShelf ? actualShelfH * 2 + frameW * 0.01 : 0;
  const stripTop = frameBottom + shelfZone;
  const availableHang = Math.max(0, H - stripTop - 4);

  // Triangle wave: 0→1→0 so animation goes down then back up (loop-friendly)
  const pingPong = t < 0.5 ? t * 2 : (1 - t) * 2;
  const maxDrop = Math.min(imgH * 0.4, availableHang);
  const drop = pingPong * maxDrop;

  // 1) Wall
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = getWallFill(ctx);
  ctx.fillRect(0, 0, W, H);

  // 2) Frame shadow
  if (opts.showShadow && frameW > 15) {
    const blur = Math.max(3, frameW * 0.03);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = blur;
    ctx.shadowOffsetX = Math.max(1, frameW * 0.008);
    ctx.shadowOffsetY = Math.max(2, frameW * 0.015);
    ctx.fillStyle = opts.frameColor;
    ctx.fillRect(fx, fy, frameW, frameH);
    ctx.restore();
  }

  // 3) Frame border
  drawFrameBorder(ctx, fx, fy, frameW, frameH, bw, opts);

  // 4) Mat
  const matX = fx + bw;
  const matY = fy + bw;
  const matW = frameW - bw * 2;
  const matH = frameH - bw * 2;
  if (matW > 0 && matH > 0) {
    ctx.fillStyle = opts.matColor;
    ctx.fillRect(matX, matY, matW, matH);
    if (mw > 1 && matW > 10) {
      ctx.strokeStyle = adjustColor(opts.matColor, -30);
      ctx.lineWidth = Math.max(0.5, mw * 0.1);
      ctx.strokeRect(matX + mw - 1, matY + mw - 1, matW - (mw - 1) * 2, matH - (mw - 1) * 2);
    }
  }

  // 5) Image area background — same as wall so the shred reveal looks natural
  if (imgW > 2 && imgH > 2) {
    ctx.fillStyle = getWallFill(ctx);
    ctx.fillRect(imgX, imgY, imgW, imgH);
  }

  // 6) Draw image inside frame (clipped to image area)
  if (opts.image && imgW > 2 && imgH > 2) {
    const iw = opts.image.naturalWidth || opts.image.width;
    const ih = opts.image.naturalHeight || opts.image.height;
    const imgAspect = iw / ih;
    const areaAspect = imgW / imgH;

    // Cover mode: fill entire frame area, crop overflow
    let dw, dh;
    if (imgAspect > areaAspect) {
      dh = imgH; dw = imgH * imgAspect;
    } else {
      dw = imgW; dh = imgW / imgAspect;
    }

    const drawX = imgX + (imgW - dw) / 2;
    const drawBaseY = imgY + (imgH - dh) / 2;
    const drawY = drawBaseY + drop;

    // Clip to image area and draw the portion still inside the frame
    ctx.save();
    ctx.beginPath();
    ctx.rect(imgX, imgY, imgW, imgH);
    ctx.clip();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(opts.image, drawX, drawY, dw, dh);
    ctx.restore();

    // 7) Draw hanging strips below the frame
    if (drop > 0) {
      const numStrips = 14;
      const stripW = imgW / numStrips;
      const hangAmount = Math.min(drop, dh);
      const srcHangFrac = hangAmount / dh;

      for (let s = 0; s < numStrips; s++) {
        const wave = Math.sin(s * 1.3 + pingPong * Math.PI * 4) * (stripW * 0.15) * Math.min(1, pingPong * 3);
        const stripHangVariation = 1 + Math.sin(s * 2.1) * 0.08;
        const thisHang = hangAmount * stripHangVariation;

        const srcX = (s / numStrips) * iw;
        const srcW = iw / numStrips;
        const srcY = ih * (1 - srcHangFrac);
        const srcH = ih * srcHangFrac;

        if (srcH < 1) continue;

        const destX = imgX + s * stripW + wave;

        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(opts.image, srcX, srcY, srcW, srcH, destX, stripTop, stripW, thisHang);
      }

      if (hangAmount > 5) {
        ctx.fillStyle = 'rgba(0,0,0,0.08)';
        for (let s = 0; s < numStrips; s++) {
          const wave = Math.sin(s * 1.3 + pingPong * Math.PI * 4) * (stripW * 0.15) * Math.min(1, pingPong * 3);
          const stripHangVariation = 1 + Math.sin(s * 2.1) * 0.08;
          const thisHang = hangAmount * stripHangVariation;
          ctx.fillRect(imgX + s * stripW + wave + 1, stripTop + 1, stripW, thisHang);
        }
      }
    }
  }

  // 8) Shelf (drawn after strips so it's on top at the frame edge)
  if (opts.showShelf && frameW > 60) {
    const shelfW = frameW * 0.65;
    const shelfX = cx - shelfW / 2;
    const shelfY = frameBottom + frameW * 0.01;
    const shelfH = actualShelfH;

    ctx.fillStyle = adjustColor(opts.frameColor, 10);
    ctx.fillRect(shelfX, shelfY, shelfW, shelfH);

    ctx.fillStyle = adjustColor(opts.frameColor, -15);
    ctx.fillRect(shelfX, shelfY + shelfH, shelfW, shelfH * 0.6);

    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(shelfX, shelfY + shelfH + shelfH * 0.6, shelfW, shelfH * 0.4);

    const bracketW = Math.max(2, shelfW * 0.025);
    const bracketH = Math.max(3, shelfH * 3);
    ctx.fillStyle = adjustColor(opts.frameColor, -25);
    ctx.fillRect(shelfX + shelfW * 0.15, shelfY + shelfH, bracketW, bracketH);
    ctx.fillRect(shelfX + shelfW * 0.85 - bracketW, shelfY + shelfH, bracketW, bracketH);
  }
}

function drawLevel(ctx, W, H, scale, frameFrac, borderFrac, matFrac, innerFrac, opts) {
  const cx = W / 2;
  const cy = H / 2;
  const frameW = W * frameFrac * scale;
  const frameH = H * frameFrac * scale;

  if (frameW < 2 || frameH < 2) return;

  const fx = cx - frameW / 2;
  const fy = cy - frameH / 2;

  // Wall background behind this frame
  const wallSize = frameW / frameFrac;
  ctx.fillStyle = getWallFill(ctx);
  ctx.fillRect(cx - wallSize / 2, cy - wallSize / 2, wallSize, wallSize);

  // Frame shadow
  if (opts.showShadow && frameW > 15) {
    const blur = Math.max(3, frameW * 0.03);
    const offX = Math.max(1, frameW * 0.008);
    const offY = Math.max(2, frameW * 0.015);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = blur;
    ctx.shadowOffsetX = offX;
    ctx.shadowOffsetY = offY;
    ctx.fillStyle = opts.frameColor;
    ctx.fillRect(fx, fy, frameW, frameH);
    ctx.restore();
  }

  // Frame border
  const bw = frameW * borderFrac;
  drawFrameBorder(ctx, fx, fy, frameW, frameH, bw, opts);

  // Mat
  const mw = frameW * matFrac;
  const matX = fx + bw;
  const matY = fy + bw;
  const matW = frameW - bw * 2;
  const matH = frameH - bw * 2;

  if (matW > 0 && matH > 0) {
    ctx.fillStyle = opts.matColor;
    ctx.fillRect(matX, matY, matW, matH);

    if (mw > 1 && matW > 10) {
      ctx.strokeStyle = adjustColor(opts.matColor, -30);
      ctx.lineWidth = Math.max(0.5, mw * 0.1);
      ctx.strokeRect(matX + mw - 1, matY + mw - 1, matW - (mw - 1) * 2, matH - (mw - 1) * 2);
    }
  }

  // Image area
  const imgX = matX + mw;
  const imgY = matY + mw;
  const imgW = matW - mw * 2;
  const imgH = matH - mw * 2;

  if (imgW > 2 && imgH > 2) {
    ctx.fillStyle = opts.imageBg;
    ctx.fillRect(imgX, imgY, imgW, imgH);

    if (opts.image) {
      const iw = opts.image.naturalWidth || opts.image.width;
      const ih = opts.image.naturalHeight || opts.image.height;
      const imgAspect = iw / ih;
      const areaAspect = imgW / imgH;

      let dw, dh, dx, dy;
      if (imgAspect > areaAspect) {
        dw = imgW; dh = imgW / imgAspect;
        dx = imgX; dy = imgY + (imgH - dh) / 2;
      } else {
        dh = imgH; dw = imgH * imgAspect;
        dx = imgX + (imgW - dw) / 2; dy = imgY;
      }

      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(opts.image, dx, dy, dw, dh);
    }
  }

  // Shelf
  if (opts.showShelf && frameW > 60) {
    const shelfW = frameW * 0.65;
    const shelfH = Math.max(2, frameW * 0.018);
    const shelfX = cx - shelfW / 2;
    const shelfY = fy + frameH + frameW * 0.01;

    ctx.fillStyle = adjustColor(opts.frameColor, 10);
    ctx.fillRect(shelfX, shelfY, shelfW, shelfH);

    ctx.fillStyle = adjustColor(opts.frameColor, -15);
    ctx.fillRect(shelfX, shelfY + shelfH, shelfW, shelfH * 0.6);

    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(shelfX, shelfY + shelfH + shelfH * 0.6, shelfW, shelfH * 0.4);

    const bracketW = Math.max(2, shelfW * 0.025);
    const bracketH = Math.max(3, shelfH * 3);
    ctx.fillStyle = adjustColor(opts.frameColor, -25);
    ctx.fillRect(shelfX + shelfW * 0.15, shelfY + shelfH, bracketW, bracketH);
    ctx.fillRect(shelfX + shelfW * 0.85 - bracketW, shelfY + shelfH, bracketW, bracketH);
  }
}

// ===== FRAME STYLES =====
function drawFrameBorder(ctx, x, y, w, h, borderW, opts) {
  if (borderW < 1) return;
  switch (opts.frameStyle) {
    case 'ornate':  drawOrnateFrame(ctx, x, y, w, h, borderW, opts); break;
    case 'simple':  drawSimpleFrame(ctx, x, y, w, h, borderW, opts); break;
    case 'pixel':   drawPixelFrame(ctx, x, y, w, h, borderW, opts); break;
    case 'modern':  drawModernFrame(ctx, x, y, w, h, borderW, opts); break;
  }
}

function drawOrnateFrame(ctx, x, y, w, h, borderW, opts) {
  const fc = opts.frameColor;
  const ac = opts.frameAccent;

  let offset = 0;
  for (const band of ORNATE_BANDS) {
    const bw = borderW * band.f;
    if (bw < 0.3) { offset += bw; continue; }

    const base = band.accent ? ac : fc;
    const adj = band.l || 0;
    const ox = x + offset, oy = y + offset;
    const ow = w - offset * 2, oh = h - offset * 2;

    // Top (lighter)
    ctx.fillStyle = adjustColor(base, adj + 12);
    ctx.beginPath();
    ctx.moveTo(ox, oy); ctx.lineTo(ox + ow, oy);
    ctx.lineTo(ox + ow - bw, oy + bw); ctx.lineTo(ox + bw, oy + bw);
    ctx.closePath(); ctx.fill();

    // Bottom (darker)
    ctx.fillStyle = adjustColor(base, adj - 12);
    ctx.beginPath();
    ctx.moveTo(ox, oy + oh); ctx.lineTo(ox + ow, oy + oh);
    ctx.lineTo(ox + ow - bw, oy + oh - bw); ctx.lineTo(ox + bw, oy + oh - bw);
    ctx.closePath(); ctx.fill();

    // Left
    ctx.fillStyle = adjustColor(base, adj + 5);
    ctx.beginPath();
    ctx.moveTo(ox, oy); ctx.lineTo(ox, oy + oh);
    ctx.lineTo(ox + bw, oy + oh - bw); ctx.lineTo(ox + bw, oy + bw);
    ctx.closePath(); ctx.fill();

    // Right
    ctx.fillStyle = adjustColor(base, adj - 5);
    ctx.beginPath();
    ctx.moveTo(ox + ow, oy); ctx.lineTo(ox + ow, oy + oh);
    ctx.lineTo(ox + ow - bw, oy + oh - bw); ctx.lineTo(ox + ow - bw, oy + bw);
    ctx.closePath(); ctx.fill();

    offset += bw;
  }

  // Corner accents
  if (borderW > 15) {
    const size = borderW * 0.3;
    const inset = borderW * 0.35;
    ctx.fillStyle = adjustColor(ac, 15);
    for (const [cx, cy] of [
      [x + inset, y + inset],
      [x + w - inset - size, y + inset],
      [x + inset, y + h - inset - size],
      [x + w - inset - size, y + h - inset - size]
    ]) {
      const mid = size / 2;
      ctx.beginPath();
      ctx.moveTo(cx + mid, cy); ctx.lineTo(cx + size, cy + mid);
      ctx.lineTo(cx + mid, cy + size); ctx.lineTo(cx, cy + mid);
      ctx.closePath(); ctx.fill();
    }
  }
}

function drawSimpleFrame(ctx, x, y, w, h, borderW, opts) {
  const fc = opts.frameColor;
  const bands = [
    { f: 0.08, l: -20 },
    { f: 0.84, l: 0 },
    { f: 0.08, l: -20 },
  ];

  let offset = 0;
  for (const band of bands) {
    const bw = borderW * band.f;
    if (bw < 0.3) { offset += bw; continue; }

    ctx.fillStyle = adjustColor(fc, band.l);
    const ox = x + offset, oy = y + offset;
    const ow = w - offset * 2, oh = h - offset * 2;

    ctx.fillRect(ox, oy, ow, bw);
    ctx.fillRect(ox, oy + oh - bw, ow, bw);
    ctx.fillRect(ox, oy, bw, oh);
    ctx.fillRect(ox + ow - bw, oy, bw, oh);

    offset += bw;
  }
}

function drawPixelFrame(ctx, x, y, w, h, borderW, opts) {
  const fc = opts.frameColor;
  const ac = opts.frameAccent;
  const pixelSize = Math.max(2, Math.floor(borderW / 4));
  const numBands = Math.floor(borderW / pixelSize);

  for (let b = 0; b < numBands; b++) {
    const isEdge = b === 0 || b === numBands - 1;
    const isAccent = b === Math.floor(numBands / 2);
    ctx.fillStyle = isAccent ? ac : isEdge ? adjustColor(fc, -20) : fc;

    const ox = x + b * pixelSize, oy = y + b * pixelSize;
    const ow = w - b * pixelSize * 2, oh = h - b * pixelSize * 2;

    for (let px = 0; px < ow; px += pixelSize) ctx.fillRect(ox + px, oy, pixelSize, pixelSize);
    for (let px = 0; px < ow; px += pixelSize) ctx.fillRect(ox + px, oy + oh - pixelSize, pixelSize, pixelSize);
    for (let py = pixelSize; py < oh - pixelSize; py += pixelSize) ctx.fillRect(ox, oy + py, pixelSize, pixelSize);
    for (let py = pixelSize; py < oh - pixelSize; py += pixelSize) ctx.fillRect(ox + ow - pixelSize, oy + py, pixelSize, pixelSize);
  }
}

function drawModernFrame(ctx, x, y, w, h, borderW, opts) {
  const fc = opts.frameColor;
  const thinLine = Math.max(1, borderW * 0.06);
  const gap = borderW * 0.25;

  ctx.strokeStyle = fc;
  ctx.lineWidth = thinLine;
  ctx.strokeRect(x + thinLine / 2, y + thinLine / 2, w - thinLine, h - thinLine);

  const inner = thinLine + gap;
  ctx.strokeRect(x + inner, y + inner, w - inner * 2, h - inner * 2);

  const bodyStart = inner + thinLine / 2;
  const bodyW = borderW - bodyStart;
  if (bodyW > 1) {
    ctx.fillStyle = fc;
    const bx = x + bodyStart, by = y + bodyStart;
    const bw = w - bodyStart * 2, bh = h - bodyStart * 2;
    ctx.fillRect(bx, by, bw, bodyW);
    ctx.fillRect(bx, by + bh - bodyW, bw, bodyW);
    ctx.fillRect(bx, by, bodyW, bh);
    ctx.fillRect(bx + bw - bodyW, by, bodyW, bh);
  }
}

// ===== ANIMATION =====
function togglePlay() {
  state.playing ? stopAnimation() : startAnimation();
}

function startAnimation() {
  state.playing = true;
  state.animStart = performance.now() - state.progress * getAnimDuration();
  document.getElementById('playPause').innerHTML = '&#9646;&#9646;';
  animate();
}

function stopAnimation() {
  state.playing = false;
  document.getElementById('playPause').innerHTML = '&#9654;';
  if (state.rafId) {
    cancelAnimationFrame(state.rafId);
    state.rafId = null;
  }
}

function getAnimDuration() {
  return (11 - state.animSpeed) * 500;
}

function animate() {
  if (!state.playing) return;

  const elapsed = performance.now() - state.animStart;
  const duration = getAnimDuration();
  state.progress = (elapsed % duration) / duration;

  document.getElementById('timeline').value = Math.round(state.progress * 1000);
  document.getElementById('timeDisplay').textContent = Math.round(state.progress * 100) + '%';

  renderScene(ctx, canvas.width, canvas.height, state.progress, state);
  state.rafId = requestAnimationFrame(animate);
}

// ===== EXPORT =====
function setExportLock(locked) {
  document.getElementById('exportPng').disabled = locked;
  document.getElementById('exportGif').disabled = locked;
}

function exportPNG() {
  const res = state.resolution;
  const offCanvas = document.createElement('canvas');
  offCanvas.width = res;
  offCanvas.height = res;
  const offCtx = offCanvas.getContext('2d');

  renderScene(offCtx, res, res, state.progress, state);

  const link = document.createElement('a');
  link.download = `normski_${state.normieId}_${res}x${res}.png`;
  link.href = offCanvas.toDataURL('image/png');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

async function exportGIF() {
  const res = state.resolution;
  const numFrames = state.gifFrames;
  const delay = Math.round(1000 / state.gifFps);

  const progressEl = document.getElementById('exportProgress');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');

  setExportLock(true);
  progressEl.style.display = 'flex';
  progressFill.style.width = '0%';
  progressText.textContent = 'Rendering...';

  const offCanvas = document.createElement('canvas');
  offCanvas.width = res;
  offCanvas.height = res;
  const offCtx = offCanvas.getContext('2d');

  try {
    const gif = new GIF({
      workers: 2,
      quality: 10,
      width: res,
      height: res,
      workerScript: 'gif.worker.js'
    });

    for (let i = 0; i < numFrames; i++) {
      renderScene(offCtx, res, res, i / numFrames, state);
      gif.addFrame(offCtx, { delay, copy: true });

      progressFill.style.width = Math.round(((i + 1) / numFrames) * 60) + '%';
      progressText.textContent = `Frame ${i + 1}/${numFrames}`;

      // Yield to UI thread every few frames
      if (i % 3 === 0) await new Promise(r => setTimeout(r, 0));
    }

    progressText.textContent = 'Encoding GIF...';
    progressFill.style.width = '60%';

    gif.on('progress', p => {
      const pct = 60 + Math.round(p * 40);
      progressFill.style.width = pct + '%';
      progressText.textContent = `Encoding... ${pct}%`;
    });

    gif.on('finished', blob => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `normski_${state.normieId}_${res}x${res}.gif`;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 5000);

      progressFill.style.width = '100%';
      progressText.textContent = 'Done!';
      setExportLock(false);
      setTimeout(() => { progressEl.style.display = 'none'; }, 2000);
    });

    gif.render();
  } catch (err) {
    console.error('GIF export failed:', err);
    progressText.textContent = 'Error: ' + err.message;
    setExportLock(false);
  }
}
