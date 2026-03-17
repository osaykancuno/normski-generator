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
  showShelf: true,
  showShadow: true,
  wallTexture: false,
  mode: 'frame',
  wallType: 'concrete',
  stencilColor: '#000000',
  streetWallColor: '#808080',
  stencilSize: 70,
  wallColor: '#808080',
  frameColor: '#8B4513',
  frameAccent: '#CD853F',
  matColor: '#FFFAF0',
  imageBg: '#FFFFFF',
  animSpeed: 5,
  resolution: 600,
  gifFrames: 30,
  gifFps: 15,
  playing: false,
  progress: 0,
  animStart: null,
  rafId: null
};

let canvas, ctx;
let wallTextureCanvas = null;   // cached texture tile (context-independent)
let stencilCache = null;        // cached stencil canvas { key, canvas }
let wallTypeTileCache = null;   // cached street art wall tile { type, color, canvas }

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
  ['frameStyle', 'resolution'].forEach(id => {
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

  // Mode tabs
  document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.mode = tab.dataset.mode;
      if (state.playing) stopAnimation();
      applyModeUI();
      requestRender();
    });
  });

  // Street Art controls
  document.getElementById('wallType').addEventListener('change', e => {
    state.wallType = e.target.value;
    wallTypeTileCache = null;
    requestRender();
  });

  document.getElementById('streetWallColor').addEventListener('input', e => {
    state.streetWallColor = e.target.value;
    wallTypeTileCache = null;
    requestRender();
  });

  document.getElementById('stencilColor').addEventListener('input', e => {
    state.stencilColor = e.target.value;
    stencilCache = null;
    requestRender();
  });

  const stencilSizeEl = document.getElementById('stencilSize');
  stencilSizeEl.addEventListener('input', () => {
    state.stencilSize = parseFloat(stencilSizeEl.value);
    document.getElementById('stencilSizeVal').textContent = stencilSizeEl.value + '%';
    stencilCache = null;
    requestRender();
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

function applyModeUI() {
  const isStreet = state.mode === 'streetart';
  // Frame-only sections
  document.getElementById('presetsSection').classList.toggle('hidden', isStreet);
  document.getElementById('frameSection').classList.toggle('hidden', isStreet);
  document.getElementById('colorsSection').classList.toggle('hidden', isStreet);
  // Street art section
  document.getElementById('streetartSection').classList.toggle('hidden', !isStreet);
  // Preview controls (animation only for frame mode)
  document.querySelector('.preview-controls').classList.toggle('hidden', isStreet);
  // GIF button only for frame mode
  document.getElementById('exportGif').classList.toggle('hidden', isStreet);
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
    stencilCache = null;
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

// ===== STENCIL / SPRAY PAINT EFFECT =====
function getStencilCanvas(sourceImage, paintColor, targetW, targetH) {
  const key = `${sourceImage.src}_${paintColor}_${targetW}_${targetH}`;
  if (stencilCache && stencilCache.key === key) return stencilCache.canvas;

  const c = document.createElement('canvas');
  c.width = targetW;
  c.height = targetH;
  const sctx = c.getContext('2d');

  // Draw source image scaled to target size
  sctx.imageSmoothingEnabled = false;
  sctx.drawImage(sourceImage, 0, 0, targetW, targetH);

  const imageData = sctx.getImageData(0, 0, targetW, targetH);
  const data = imageData.data;
  const [pr, pg, pb] = hexToRgb(paintColor);

  // Seeded PRNG for deterministic grain
  let seed = pr * 65536 + pg * 256 + pb + targetW + 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

  // Pass 1: threshold to 3-level stencil with spray grain
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (lum < 80) {
      // Dark regions: full paint with grain
      data[i] = pr; data[i + 1] = pg; data[i + 2] = pb;
      data[i + 3] = 255 - Math.floor(rand() * 40);
    } else if (lum < 170) {
      // Mid-tone regions: semi-transparent paint
      data[i] = pr; data[i + 1] = pg; data[i + 2] = pb;
      data[i + 3] = 90 - Math.floor(rand() * 50);
    } else {
      // Light regions: cut out (transparent)
      data[i + 3] = 0;
    }
  }

  // Pass 2: edge overspray — sparse dots near paint/transparent boundaries
  const w = targetW, h = targetH;
  const alphaSnapshot = new Uint8Array(w * h);
  for (let i = 0; i < alphaSnapshot.length; i++) alphaSnapshot[i] = data[i * 4 + 3];

  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      const idx = y * w + x;
      if (alphaSnapshot[idx] > 0) continue; // only add spray in transparent areas
      // Check if any neighbor within 2px is painted
      let nearPaint = false;
      for (let dy = -2; dy <= 2 && !nearPaint; dy++) {
        for (let dx = -2; dx <= 2 && !nearPaint; dx++) {
          if (alphaSnapshot[(y + dy) * w + (x + dx)] > 50) nearPaint = true;
        }
      }
      if (nearPaint && rand() < 0.12) {
        const pi = idx * 4;
        data[pi] = pr; data[pi + 1] = pg; data[pi + 2] = pb;
        data[pi + 3] = 30 + Math.floor(rand() * 60);
      }
    }
  }

  sctx.putImageData(imageData, 0, 0);
  stencilCache = { key, canvas: c };
  return c;
}

// ===== STREET ART WALL TEXTURES =====
function buildWallTypeTile(type, color) {
  const key = `${type}_${color}`;
  if (wallTypeTileCache && wallTypeTileCache.key === key) return wallTypeTileCache.canvas;

  const [r, g, b] = hexToRgb(color);
  let seed = r * 65536 + g * 256 + b + 13;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

  const tile = document.createElement('canvas');
  const tctx = tile.getContext('2d');

  if (type === 'brick') {
    tile.width = 160; tile.height = 80;
    const mortarColor = adjustColor(color, -25);
    tctx.fillStyle = mortarColor;
    tctx.fillRect(0, 0, 160, 80);

    const brickW = 36, brickH = 16, gap = 3;
    const rowH = brickH + gap;
    const rows = Math.ceil(80 / rowH) + 1;

    for (let row = 0; row < rows; row++) {
      const offsetX = (row % 2 === 0) ? 0 : -(brickW + gap) / 2;
      const y = row * rowH;
      const cols = Math.ceil(160 / (brickW + gap)) + 2;
      for (let col = 0; col < cols; col++) {
        const x = offsetX + col * (brickW + gap);
        const n = (rand() - 0.5) * 20;
        tctx.fillStyle = `rgb(${clamp(r + n)},${clamp(g + n)},${clamp(b + n)})`;
        tctx.fillRect(x, y, brickW, brickH);
        // Subtle highlight on top edge
        tctx.fillStyle = `rgba(255,255,255,${0.04 + rand() * 0.04})`;
        tctx.fillRect(x, y, brickW, 2);
      }
    }
  } else if (type === 'plaster') {
    tile.width = 150; tile.height = 150;
    tctx.fillStyle = color;
    tctx.fillRect(0, 0, 150, 150);
    // Large splotchy noise
    for (let y = 0; y < 150; y += 3) {
      for (let x = 0; x < 150; x += 3) {
        const n = (rand() - 0.5) * 14;
        const n2 = (rand() - 0.5) * 8;
        tctx.fillStyle = `rgb(${clamp(r + n + n2)},${clamp(g + n)},${clamp(b + n - n2 * 0.5)})`;
        tctx.fillRect(x, y, 3, 3);
      }
    }
    // Occasional cracks/marks
    tctx.strokeStyle = `rgba(0,0,0,0.08)`;
    tctx.lineWidth = 0.5;
    for (let i = 0; i < 4; i++) {
      const sx = rand() * 150, sy = rand() * 150;
      tctx.beginPath();
      tctx.moveTo(sx, sy);
      tctx.lineTo(sx + (rand() - 0.5) * 30, sy + (rand() - 0.5) * 30);
      tctx.stroke();
    }
  } else {
    // concrete (default)
    tile.width = 120; tile.height = 120;
    tctx.fillStyle = color;
    tctx.fillRect(0, 0, 120, 120);
    for (let y = 0; y < 120; y += 2) {
      for (let x = 0; x < 120; x += 2) {
        const n = (rand() - 0.5) * 22;
        tctx.fillStyle = `rgb(${clamp(r + n)},${clamp(g + n)},${clamp(b + n)})`;
        tctx.fillRect(x, y, 2, 2);
      }
    }
  }

  wallTypeTileCache = { key, canvas: tile };
  return tile;
}

// ===== STREET ART RENDERING =====
function renderStreetArt(ctx, W, H, opts) {
  const wallColor = opts.streetWallColor;
  const [wr, wg, wb] = hexToRgb(wallColor);

  // Seeded PRNG for consistent city skyline
  let seed = wr * 256 + wg * 16 + wb + 42;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

  // Layout zones
  const skyBottom = H * 0.28;
  const wallTop = H * 0.22;
  const wallBottom = H * 0.86;
  const sidewalkTop = wallBottom;

  ctx.clearRect(0, 0, W, H);

  // 1) Sky gradient
  const skyGrad = ctx.createLinearGradient(0, 0, 0, skyBottom);
  skyGrad.addColorStop(0, '#1a1e2e');
  skyGrad.addColorStop(0.6, '#2a3248');
  skyGrad.addColorStop(1, '#3d4560');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, W, skyBottom + 2);

  // 2) City skyline silhouettes
  const numBuildings = 7 + Math.floor(rand() * 3);
  const buildingW = W / numBuildings;
  for (let i = 0; i < numBuildings; i++) {
    const bh = H * (0.08 + rand() * 0.16);
    const bx = i * buildingW + (rand() - 0.5) * buildingW * 0.2;
    const bw = buildingW * (0.7 + rand() * 0.4);
    const by = skyBottom - bh;
    const darkness = 15 + Math.floor(rand() * 15);
    ctx.fillStyle = `rgb(${darkness},${darkness + 2},${darkness + 5})`;
    ctx.fillRect(bx, by, bw, bh + 2);

    // Windows (small lit squares)
    const winSize = Math.max(2, W * 0.005);
    const winGap = winSize * 2.5;
    for (let wy = by + winGap; wy < skyBottom - winGap; wy += winGap) {
      for (let wx = bx + winGap; wx < bx + bw - winGap; wx += winGap) {
        if (rand() > 0.45) {
          const bright = 0.3 + rand() * 0.7;
          ctx.fillStyle = `rgba(255,220,120,${bright * 0.6})`;
          ctx.fillRect(wx, wy, winSize, winSize);
        }
      }
    }
  }

  // 3) Wall with perspective (trapezoid clip + texture)
  const perspShift = W * 0.015;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(perspShift, wallTop);            // top-left (shifted right)
  ctx.lineTo(W - perspShift * 0.3, wallTop);  // top-right
  ctx.lineTo(W, wallBottom);                   // bottom-right
  ctx.lineTo(0, wallBottom);                   // bottom-left
  ctx.closePath();
  ctx.clip();

  const wallTile = buildWallTypeTile(opts.wallType, wallColor);
  ctx.fillStyle = ctx.createPattern(wallTile, 'repeat');
  ctx.fillRect(0, wallTop, W, wallBottom - wallTop);

  // Wall edge shadow (top)
  const edgeShadow = ctx.createLinearGradient(0, wallTop, 0, wallTop + H * 0.03);
  edgeShadow.addColorStop(0, 'rgba(0,0,0,0.25)');
  edgeShadow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = edgeShadow;
  ctx.fillRect(0, wallTop, W, H * 0.03);

  // 4) Stencil on wall
  if (opts.image) {
    const wallH = wallBottom - wallTop;
    const wallW = W;
    const sizeFrac = opts.stencilSize / 100;
    const maxDim = Math.min(wallW * 0.85, wallH * 0.85) * sizeFrac;
    const iw = opts.image.naturalWidth || opts.image.width;
    const ih = opts.image.naturalHeight || opts.image.height;
    const imgAspect = iw / ih;

    let dw, dh;
    if (imgAspect > 1) { dw = maxDim; dh = maxDim / imgAspect; }
    else { dh = maxDim; dw = maxDim * imgAspect; }

    const stencil = getStencilCanvas(opts.image, opts.stencilColor, Math.round(dw), Math.round(dh));
    const drawX = (wallW - dw) / 2;
    const drawY = wallTop + (wallH - dh) / 2;

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(stencil, drawX, drawY, dw, dh);
  }

  ctx.restore(); // end wall clip

  // 5) Sidewalk
  const sidewalkH = H - sidewalkTop;
  const swGrad = ctx.createLinearGradient(0, sidewalkTop, 0, H);
  swGrad.addColorStop(0, '#3a3a3a');
  swGrad.addColorStop(0.15, '#4a4a4a');
  swGrad.addColorStop(1, '#2a2a2a');
  ctx.fillStyle = swGrad;
  ctx.fillRect(0, sidewalkTop, W, sidewalkH);

  // Curb line
  ctx.fillStyle = '#555';
  ctx.fillRect(0, sidewalkTop, W, Math.max(2, H * 0.005));

  // Sidewalk cracks
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 1;
  seed = wr + wg + wb + 99; // re-seed for cracks
  for (let i = 0; i < 3; i++) {
    const cx = rand() * W;
    ctx.beginPath();
    ctx.moveTo(cx, sidewalkTop + sidewalkH * 0.2);
    ctx.lineTo(cx + (rand() - 0.5) * 20, H);
    ctx.stroke();
  }

  // 6) Lamppost (left side)
  const lampX = W * 0.08;
  const lampTop = H * 0.05;
  const poleW = Math.max(2, W * 0.006);
  ctx.fillStyle = '#222';
  ctx.fillRect(lampX - poleW / 2, lampTop, poleW, H - lampTop);

  // Lamp head
  const headW = W * 0.04;
  const headH = H * 0.018;
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(lampX - headW / 2, lampTop, headW, headH);

  // Lamp glow
  const glowR = W * 0.06;
  const glowGrad = ctx.createRadialGradient(lampX, lampTop + headH, 0, lampX, lampTop + headH, glowR);
  glowGrad.addColorStop(0, 'rgba(255,220,120,0.15)');
  glowGrad.addColorStop(1, 'rgba(255,220,120,0)');
  ctx.fillStyle = glowGrad;
  ctx.fillRect(lampX - glowR, lampTop + headH - glowR, glowR * 2, glowR * 2);
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
  if (opts.mode === 'streetart') renderStreetArt(ctx, W, H, opts);
  else renderShredScene(ctx, W, H, rawProgress, opts);
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
