(() => {
  'use strict';

  const PACKETS_PER_SECOND = 300;
  const WIDTH = 300;
  const HEIGHT = 216;
  const VISIBLE_X = 6;
  const VISIBLE_Y = 12;
  const VISIBLE_W = 288;
  const VISIBLE_H = 192;
  const SDF_FRAME_MS = 40;
  const FIDELITY_FRAME_MS = 16;
  const SCALE2X_FRAME_MS = 33;
  const GLOSS_FRAME_MS = 33;

  class CDGDecoder {
    constructor() {
      this.frame = new Uint8Array(WIDTH * HEIGHT);
      this.palette = Array.from({ length: 16 }, () => [0, 0, 0, 255]);
      this.border = 0;
      this.transparent = 0;
      this.memoryColor = 0;
      this.hOffset = 0;
      this.vOffset = 0;
    }

    reset() {
      this.frame.fill(0);
      this.palette = Array.from({ length: 16 }, () => [0, 0, 0, 255]);
      this.border = 0;
      this.transparent = 0;
      this.memoryColor = 0;
      this.hOffset = 0;
      this.vOffset = 0;
    }

    clear(color) {
      this.memoryColor = color & 0x0f;
      this.frame.fill(this.memoryColor);
    }

    scroll(color, hcmd, vcmd, copyMode) {
      const hdir = (hcmd >> 4) & 0x03;
      const vdir = (vcmd >> 4) & 0x03;
      this.hOffset = hcmd & 0x07;
      this.vOffset = vcmd & 0x0f;

      const dx = hdir === 1 ? 6 : (hdir === 2 ? -6 : 0);
      const dy = vdir === 1 ? 12 : (vdir === 2 ? -12 : 0);
      if (!dx && !dy) return;

      const old = this.frame.slice();
      const fill = color & 0x0f;
      for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
          const sx = x - dx;
          const sy = y - dy;
          const dst = y * WIDTH + x;
          if (sx >= 0 && sx < WIDTH && sy >= 0 && sy < HEIGHT) {
            this.frame[dst] = old[sy * WIDTH + sx];
          } else if (copyMode) {
            const wx = ((sx % WIDTH) + WIDTH) % WIDTH;
            const wy = ((sy % HEIGHT) + HEIGHT) % HEIGHT;
            this.frame[dst] = old[wy * WIDTH + wx];
          } else {
            this.frame[dst] = fill;
          }
        }
      }
    }

    packet(p) {
      if (!p || p.length !== 24 || ((p[0] & 0x3f) !== 0x09)) return;
      const ins = p[1] & 0x3f;
      const d = new Uint8Array(16);
      for (let i = 0; i < 16; i++) d[i] = p[4 + i] & 0x3f;

      if (ins === 1) {
        this.clear(d[0]);
      } else if (ins === 2) {
        this.border = d[0] & 0x0f;
      } else if (ins === 6 || ins === 38) {
        const c0 = d[0] & 0x0f;
        const c1 = d[1] & 0x0f;
        const row = d[2] & 0x1f;
        const col = d[3] & 0x3f;
        const y0 = row * 12;
        const x0 = col * 6;

        for (let r = 0; r < 12; r++) {
          const bits = d[4 + r];
          const y = y0 + r;
          if (y >= HEIGHT) continue;
          for (let c = 0; c < 6; c++) {
            const x = x0 + c;
            if (x >= WIDTH) continue;
            const value = (bits & (1 << (5 - c))) ? c1 : c0;
            const idx = y * WIDTH + x;
            this.frame[idx] = ins === 38 ? (this.frame[idx] ^ value) : value;
          }
        }
      } else if (ins === 20) {
        this.scroll(d[0], d[1], d[2], false);
      } else if (ins === 24) {
        this.scroll(d[0], d[1], d[2], true);
      } else if (ins === 30 || ins === 31) {
        const base = ins === 30 ? 0 : 8;
        for (let i = 0; i < 8; i++) {
          const a = d[i * 2];
          const b = d[i * 2 + 1];
          const r = (a & 0x3c) >> 2;
          const g = ((a & 0x03) << 2) | ((b & 0x30) >> 4);
          const bl = b & 0x0f;
          this.palette[base + i] = [r * 17, g * 17, bl * 17, 255];
        }
      } else if (ins === 28) {
        this.transparent = d[0] & 0x0f;
      }
    }
  }

  const canvas = document.getElementById('cdgCanvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = false;

  const hdCanvas = document.getElementById('cdgCanvasHD');
  const audio = document.getElementById('audio');
  const pairInput = document.getElementById('pairInput');
  const playBtn = document.getElementById('playBtn');
  const seek = document.getElementById('seek');
  const volume = document.getElementById('volume');
  const currentTimeEl = document.getElementById('currentTime');
  const durationEl = document.getElementById('duration');
  const cdgName = document.getElementById('cdgName');
  const audioName = document.getElementById('audioName');
  const emptyState = document.getElementById('emptyState');
  const statusLine = document.getElementById('statusLine');
  const engineStatus = document.getElementById('engineStatus');
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  const screenWrap = document.getElementById('screenWrap');
  const offsetMinus = document.getElementById('offsetMinus');
  const offsetPlus = document.getElementById('offsetPlus');
  const offsetValue = document.getElementById('offsetValue');
  const qualityOriginal = document.getElementById('qualityOriginal');
  const qualityHD = document.getElementById('qualityHD');
  const qualityFidelity = document.getElementById('qualityFidelity');
  const qualityScale2x = document.getElementById('qualityScale2x');
  const qualityGloss = document.getElementById('qualityGloss');
  const qualitySdfPro = document.getElementById('qualitySdfPro');
  const qualityVector = document.getElementById('qualityVector');
  const qualityVectorV2 = document.getElementById('qualityVectorV2');
  const qualityNote = document.getElementById('qualityNote');
  const sdfPanel = document.getElementById('sdfPanel');
  const sdfReset = document.getElementById('sdfReset');
  const fidelityCanvas = document.getElementById('fidelityCanvas');
  const fidelityPanel = document.getElementById('fidelityPanel');
  const fidelityStatus = document.getElementById('fidelityStatus');
  const scale2xCanvas = document.getElementById('scale2xCanvas');
  const scale2xPanel = document.getElementById('scale2xPanel');
  const scale2xStatus = document.getElementById('scale2xStatus');
  const glossCanvas = document.getElementById('glossCanvas');
  const glossPanel = document.getElementById('glossPanel');
  const glossReset = document.getElementById('glossReset');
  const glossLineCount = document.getElementById('glossLineCount');
  const glossSmartSource = document.getElementById('glossSmartSource');
  const sdfProCanvas = document.getElementById('sdfProCanvas');
  const sdfProPanel = document.getElementById('sdfProPanel');
  const sdfProReset = document.getElementById('sdfProReset');
  const sdfProLineCount = document.getElementById('sdfProLineCount');
  const vectorStage = document.getElementById('vectorStage');
  const vectorPanel = document.getElementById('vectorPanel');
  const vectorEngineStatus = document.getElementById('vectorEngineStatus');
  const vectorCanvasV2 = document.getElementById('vectorCanvasV2');
  const vectorV2Panel = document.getElementById('vectorV2Panel');
  const vectorV2EngineStatus = document.getElementById('vectorV2EngineStatus');
  const vectorV2PathCount = document.getElementById('vectorV2PathCount');
  const vectorV2GeometryState = document.getElementById('vectorV2GeometryState');

  const fidelityInputs = {
    soften: document.getElementById('fidelitySoften'),
    aa: document.getElementById('fidelityAA'),
    outline: document.getElementById('fidelityOutline'),
    scale: document.getElementById('fidelityScale')
  };

  const fidelityOutputs = {
    soften: document.getElementById('fidelitySoftenValue'),
    aa: document.getElementById('fidelityAAValue'),
    outline: document.getElementById('fidelityOutlineValue'),
    scale: document.getElementById('fidelityScaleValue')
  };

  const scale2xInputs = {
    passes: document.getElementById('scale2xPasses'),
    outline: document.getElementById('scale2xOutline'),
    outputScale: document.getElementById('scale2xOutputScale'),
    aa: document.getElementById('scale2xAA')
  };

  const scale2xOutputs = {
    passes: document.getElementById('scale2xPassesValue'),
    outline: document.getElementById('scale2xOutlineValue'),
    outputScale: document.getElementById('scale2xOutputScaleValue'),
    aa: document.getElementById('scale2xAAValue')
  };

  const glossInputs = {
    gradient: document.getElementById('glossGradient'),
    outline: document.getElementById('glossOutline'),
    shadowX: document.getElementById('glossShadowX'),
    shadowY: document.getElementById('glossShadowY'),
    shadowBlur: document.getElementById('glossShadowBlur'),
    shadowAlpha: document.getElementById('glossShadowAlpha')
  };

  const glossOutputs = {
    gradient: document.getElementById('glossGradientValue'),
    outline: document.getElementById('glossOutlineValue'),
    shadowX: document.getElementById('glossShadowXValue'),
    shadowY: document.getElementById('glossShadowYValue'),
    shadowBlur: document.getElementById('glossShadowBlurValue'),
    shadowAlpha: document.getElementById('glossShadowAlphaValue')
  };

  const sdfProInputs = {
    halo: document.getElementById('sdfProHalo'),
    cutoff: document.getElementById('sdfProCutoff'),
    gamma: document.getElementById('sdfProGamma'),
    radius: document.getElementById('sdfProRadius'),
    threshold: document.getElementById('sdfProThreshold'),
    preSmooth: document.getElementById('sdfProPreSmooth'),
    expansion: document.getElementById('sdfProExpansion'),
    scale: document.getElementById('sdfProScale'),
    programGradient: document.getElementById('sdfProGradient'),
    proOutline: document.getElementById('sdfProOutline'),
    shadowX: document.getElementById('sdfProShadowX'),
    shadowY: document.getElementById('sdfProShadowY'),
    shadowBlur: document.getElementById('sdfProShadowBlur'),
    shadowAlpha: document.getElementById('sdfProShadowAlpha')
  };

  const sdfProOutputs = {
    halo: document.getElementById('sdfProHaloValue'),
    cutoff: document.getElementById('sdfProCutoffValue'),
    gamma: document.getElementById('sdfProGammaValue'),
    radius: document.getElementById('sdfProRadiusValue'),
    threshold: document.getElementById('sdfProThresholdValue'),
    preSmooth: document.getElementById('sdfProPreSmoothValue'),
    expansion: document.getElementById('sdfProExpansionValue'),
    scale: document.getElementById('sdfProScaleValue'),
    programGradient: document.getElementById('sdfProGradientValue'),
    proOutline: document.getElementById('sdfProOutlineValue'),
    shadowX: document.getElementById('sdfProShadowXValue'),
    shadowY: document.getElementById('sdfProShadowYValue'),
    shadowBlur: document.getElementById('sdfProShadowBlurValue'),
    shadowAlpha: document.getElementById('sdfProShadowAlphaValue')
  };

  const vectorInputs = {
    stroke: document.getElementById('vectorStroke'),
    cornerThreshold: document.getElementById('vectorCorner'),
    lengthThreshold: document.getElementById('vectorLength'),
    fps: document.getElementById('vectorFps')
  };

  const vectorOutputs = {
    stroke: document.getElementById('vectorStrokeValue'),
    cornerThreshold: document.getElementById('vectorCornerValue'),
    lengthThreshold: document.getElementById('vectorLengthValue'),
    fps: document.getElementById('vectorFpsValue')
  };

  const sdfInputs = {
    halo: document.getElementById('sdfHalo'),
    cutoff: document.getElementById('sdfCutoff'),
    gamma: document.getElementById('sdfGamma'),
    radius: document.getElementById('sdfRadius'),
    threshold: document.getElementById('sdfThreshold'),
    preSmooth: document.getElementById('sdfPreSmooth'),
    expansion: document.getElementById('sdfExpansion'),
    scale: document.getElementById('sdfScale')
  };

  const sdfOutputs = {
    halo: document.getElementById('sdfHaloValue'),
    cutoff: document.getElementById('sdfCutoffValue'),
    gamma: document.getElementById('sdfGammaValue'),
    radius: document.getElementById('sdfRadiusValue'),
    threshold: document.getElementById('sdfThresholdValue'),
    preSmooth: document.getElementById('sdfPreSmoothValue'),
    expansion: document.getElementById('sdfExpansionValue'),
    scale: document.getElementById('sdfScaleValue')
  };

  const decoder = new CDGDecoder();
  const imageData = ctx.createImageData(VISIBLE_W, VISIBLE_H);
  const visibleIndices = new Uint8Array(VISIBLE_W * VISIBLE_H);

  const SDF_STORAGE_KEY = 'djgabo-cdg-sdf-lab-v2';
  const SDF_PRESET_NAME = 'SDF_VECTOR_DJGABO_V1';
  const SDF_DEFAULTS = Object.freeze({
    halo: 0.41,
    cutoff: 0.54,
    gamma: 0.85,
    radius: 7,
    threshold: 0.01,
    preSmooth: 0,
    expansion: 0.60,
    scale: 8
  });

  function loadSdfParams() {
    try {
      const saved = JSON.parse(localStorage.getItem(SDF_STORAGE_KEY) || '{}');
      return Object.assign({}, SDF_DEFAULTS, saved);
    } catch {
      return Object.assign({}, SDF_DEFAULTS);
    }
  }

  let sdfParams = loadSdfParams();
  let hdRenderer = null;
  let qualityMode = 'hd';
  let lastHdRenderAt = 0;

  try {
    hdRenderer = new window.SDFHDRenderer(hdCanvas, VISIBLE_W, VISIBLE_H, sdfParams);
  } catch (error) {
    console.error('[SDF HD]', error);
    qualityMode = 'original';
    screenWrap.classList.remove('hd-mode');
    qualityHD.disabled = true;
    qualityHD.classList.remove('active');
    qualityOriginal.classList.add('active');
    sdfPanel?.classList.add('is-hidden');
    const detail = String(error && error.message ? error.message : error).slice(0, 180);
    qualityNote.textContent = 'SDF HD ERROR: ' + detail;
  }

  function formatSdfValue(name, value) {
    const n = Number(value);
    if (name === 'halo') return n.toFixed(2);
    if (name === 'cutoff') return n.toFixed(2);
    if (name === 'gamma') return n.toFixed(2);
    if (name === 'radius') return Math.round(n) + ' px';
    if (name === 'threshold') return n.toFixed(2);
    if (name === 'preSmooth') return String(Math.round(n));
    if (name === 'expansion') return n.toFixed(2) + ' px';
    if (name === 'scale') return Math.round(n) + '×';
    return String(value);
  }

  function syncSdfControls() {
    for (const name of Object.keys(sdfInputs)) {
      if (!sdfInputs[name]) continue;
      sdfInputs[name].value = String(sdfParams[name]);
      if (sdfOutputs[name]) sdfOutputs[name].textContent = formatSdfValue(name, sdfParams[name]);
    }
  }

  function applySdfParams(next, persist = true) {
    sdfParams = Object.assign({}, sdfParams, next || {});
    hdRenderer?.setParams(sdfParams);
    syncSdfControls();

    if (persist) {
      try {
        localStorage.setItem(SDF_STORAGE_KEY, JSON.stringify(sdfParams));
      } catch {}
    }

    if (qualityMode === 'hd') {
      lastHdRenderAt = 0;
      renderFrame(true);
    }
  }

  syncSdfControls();

  const FIDELITY_STORAGE_KEY = 'djgabo-cdg-fidelity-v1';
  const FIDELITY_DEFAULTS = Object.freeze({
    soften: 0.28,
    aa: 0.075,
    outline: 0.72,
    threshold: 0.01,
    scale: 8
  });

  function loadFidelityParams() {
    try {
      const saved = JSON.parse(localStorage.getItem(FIDELITY_STORAGE_KEY) || '{}');
      return Object.assign({}, FIDELITY_DEFAULTS, saved);
    } catch {
      return Object.assign({}, FIDELITY_DEFAULTS);
    }
  }

  let fidelityParams = loadFidelityParams();
  let fidelityRenderer = null;
  let lastFidelityRenderAt = 0;

  function formatFidelityValue(name, value) {
    const n = Number(value);
    if (name === 'soften') return n.toFixed(2);
    if (name === 'aa') return n.toFixed(3);
    if (name === 'outline') return n.toFixed(2) + ' px';
    if (name === 'scale') return Math.round(n) + '×';
    return String(value);
  }

  function syncFidelityControls() {
    for (const name of Object.keys(fidelityInputs)) {
      const input = fidelityInputs[name];
      if (!input) continue;
      input.value = String(fidelityParams[name]);
      if (fidelityOutputs[name]) {
        fidelityOutputs[name].textContent = formatFidelityValue(name, fidelityParams[name]);
      }
    }
  }

  function applyFidelityParams(next, persist = true) {
    fidelityParams = Object.assign({}, fidelityParams, next || {});
    fidelityRenderer?.setParams(fidelityParams);
    syncFidelityControls();

    if (persist) {
      try {
        localStorage.setItem(FIDELITY_STORAGE_KEY, JSON.stringify(fidelityParams));
      } catch {}
    }

    if (qualityMode === 'fidelity') {
      lastFidelityRenderAt = 0;
      renderFrame(true);
    }
  }

  try {
    fidelityRenderer = new window.CDGFidelityRenderer(
      fidelityCanvas,
      VISIBLE_W,
      VISIBLE_H,
      fidelityParams
    );
    fidelityStatus.textContent = 'GPU listo';
  } catch (error) {
    console.error('[CDG FIDELITY]', error);
    fidelityRenderer = null;
    if (qualityFidelity) qualityFidelity.disabled = true;
    fidelityStatus.textContent = 'Fidelity no disponible';
  }

  syncFidelityControls();

  const SCALE2X_STORAGE_KEY = 'djgabo-cdg-scale2x-v1';
  const SCALE2X_DEFAULTS = Object.freeze({
    passes: 2,
    outline: 1,
    outputScale: 4,
    aa: true
  });

  function loadScale2xParams() {
    try {
      const saved = JSON.parse(localStorage.getItem(SCALE2X_STORAGE_KEY) || '{}');
      return Object.assign({}, SCALE2X_DEFAULTS, saved);
    } catch {
      return Object.assign({}, SCALE2X_DEFAULTS);
    }
  }

  let scale2xParams = loadScale2xParams();
  let scale2xRenderer = null;
  let lastScale2xRenderAt = 0;

  function formatScale2xValue(name, value) {
    if (name === 'passes') return Number(value) === 2 ? 'Scale4X' : 'Scale2X';
    if (name === 'outline') return Math.round(Number(value)) + ' px';
    if (name === 'outputScale') return Math.round(Number(value)) + '×';
    if (name === 'aa') return value ? 'ON' : 'OFF';
    return String(value);
  }

  function syncScale2xControls() {
    for (const name of Object.keys(scale2xInputs)) {
      const input = scale2xInputs[name];
      if (!input) continue;

      if (input.type === 'checkbox') input.checked = Boolean(scale2xParams[name]);
      else input.value = String(scale2xParams[name]);

      if (scale2xOutputs[name]) {
        scale2xOutputs[name].textContent = formatScale2xValue(name, scale2xParams[name]);
      }
    }
  }

  function applyScale2xParams(next, persist = true) {
    scale2xParams = Object.assign({}, scale2xParams, next || {});
    scale2xRenderer?.setParams(scale2xParams);
    syncScale2xControls();

    if (persist) {
      try {
        localStorage.setItem(SCALE2X_STORAGE_KEY, JSON.stringify(scale2xParams));
      } catch {}
    }

    if (qualityMode === 'scale2x') {
      lastScale2xRenderAt = 0;
      renderFrame(true);
    }
  }

  try {
    scale2xRenderer = new window.CDGScale2XRenderer(
      scale2xCanvas,
      VISIBLE_W,
      VISIBLE_H,
      scale2xParams
    );
    scale2xStatus.textContent = 'Listo · 30 fps';
  } catch (error) {
    console.error('[SCALE2X]', error);
    scale2xRenderer = null;
    if (qualityScale2x) qualityScale2x.disabled = true;
    if (scale2xStatus) scale2xStatus.textContent = 'SCALE2X no disponible';
  }

  syncScale2xControls();

  const GLOSS_STORAGE_KEY = 'djgabo-cdg-karaoke-hd-v21';
  const GLOSS_PRESET_NAME = 'KARAOKE_HD_PK_CURVE_V1';
  const GLOSS_DEFAULTS = Object.freeze({
    outputScale: 4,
    outline: 0.75,
    gradient: 1.00,
    shadowX: 1.00,
    shadowY: 1.00,
    shadowBlur: 0.35,
    shadowAlpha: 0.40,
    lineMinPixels: 6,
    lineGap: 2,
    linePadding: 1,
    aa: true
  });

  function loadGlossParams() {
    try {
      const saved = JSON.parse(localStorage.getItem(GLOSS_STORAGE_KEY) || '{}');
      return Object.assign({}, GLOSS_DEFAULTS, saved);
    } catch {
      return Object.assign({}, GLOSS_DEFAULTS);
    }
  }

  let glossParams = loadGlossParams();
  let glossRenderer = null;
  let lastGlossRenderAt = 0;

  function formatGlossValue(name, value) {
    const n = Number(value);
    if (name === 'outline' || name === 'shadowX' || name === 'shadowY' || name === 'shadowBlur') {
      return n.toFixed(2) + ' px';
    }
    return n.toFixed(2);
  }

  function syncGlossControls() {
    for (const name of Object.keys(glossInputs)) {
      const input = glossInputs[name];
      if (!input) continue;
      input.value = String(glossParams[name]);

      if (glossOutputs[name]) {
        glossOutputs[name].textContent = formatGlossValue(name, glossParams[name]);
      }
    }
  }

  function applyGlossParams(next, persist = true) {
    glossParams = Object.assign({}, glossParams, next || {});
    glossRenderer?.setParams(glossParams);
    syncGlossControls();

    if (persist) {
      try {
        localStorage.setItem(GLOSS_STORAGE_KEY, JSON.stringify(glossParams));
      } catch {}
    }

    if (qualityMode === 'gloss') {
      lastGlossRenderAt = 0;
      renderFrame(true);
    }
  }

  try {
    glossRenderer = new window.CDGGlossRenderer(
      glossCanvas,
      VISIBLE_W,
      VISIBLE_H,
      glossParams
    );
  } catch (error) {
    console.error('[KARAOKE HD]', error);
    glossRenderer = null;
    if (qualityGloss) qualityGloss.disabled = true;
  }

  syncGlossControls();

  const SDF_PRO_STORAGE_KEY = 'djgabo-cdg-sdf-karaoke-pro-v1';
  const SDF_PRO_PRESET_NAME = 'SDF_KARAOKE_PRO_BASE_V1';
  const SDF_PRO_DEFAULTS = Object.freeze({
    halo: 0.47,
    cutoff: 0.54,
    gamma: 0.85,
    radius: 7,
    threshold: 0.01,
    preSmooth: 0,
    expansion: 0.60,
    scale: 8,
    programGradient: 35,
    proOutline: 0.60,
    shadowX: 1.25,
    shadowY: 1.00,
    shadowBlur: 0.85,
    shadowAlpha: 0.75
  });

  function loadSdfProParams() {
    try {
      const saved = JSON.parse(localStorage.getItem(SDF_PRO_STORAGE_KEY) || '{}');
      return Object.assign({}, SDF_PRO_DEFAULTS, saved);
    } catch {
      return Object.assign({}, SDF_PRO_DEFAULTS);
    }
  }

  let sdfProParams = loadSdfProParams();
  let sdfProRenderer = null;
  let lastSdfProRenderAt = 0;

  function formatSdfProValue(name, value) {
    const n = Number(value);
    if (name === 'halo' || name === 'cutoff' || name === 'gamma' || name === 'threshold') {
      return n.toFixed(2);
    }
    if (name === 'radius') return Math.round(n) + ' px';
    if (name === 'preSmooth') return String(Math.round(n));
    if (name === 'expansion' || name === 'proOutline' || name === 'shadowX' || name === 'shadowY' || name === 'shadowBlur') {
      return n.toFixed(2) + ' px';
    }
    if (name === 'scale') return Math.round(n) + '×';
    if (name === 'programGradient') return 'Nivel ' + Math.round(n);
    if (name === 'shadowAlpha') return n.toFixed(2);
    return String(value);
  }

  function syncSdfProControls() {
    for (const name of Object.keys(sdfProInputs)) {
      const input = sdfProInputs[name];
      if (!input) continue;
      input.value = String(sdfProParams[name]);
      if (sdfProOutputs[name]) {
        sdfProOutputs[name].textContent = formatSdfProValue(name, sdfProParams[name]);
      }
    }
  }

  function applySdfProParams(next, persist = true) {
    sdfProParams = Object.assign({}, sdfProParams, next || {});
    sdfProRenderer?.setParams(sdfProParams);
    syncSdfProControls();

    if (persist) {
      try {
        localStorage.setItem(SDF_PRO_STORAGE_KEY, JSON.stringify(sdfProParams));
      } catch {}
    }

    if (qualityMode === 'sdf-pro') {
      if (!ensureSdfProRenderer()) return;
      lastSdfProRenderAt = 0;
      renderFrame(true);
    }
  }

  function ensureSdfProRenderer() {
    if (sdfProRenderer) return true;

    try {
      sdfProRenderer = new window.SDFKaraokeProRenderer(
        sdfProCanvas,
        VISIBLE_W,
        VISIBLE_H,
        sdfProParams
      );
      return true;
    } catch (error) {
      console.error('[SDF KARAOKE PRO]', error);
      sdfProRenderer = null;
      if (qualitySdfPro) qualitySdfPro.disabled = true;
      return false;
    }
  }

  syncSdfProControls();

  const VECTOR_STORAGE_KEY = 'djgabo-cdg-vector-trace-v1';
  const VECTOR_DEFAULTS = Object.freeze({
    mode: 'spline',
    stroke: 1.15,
    cornerThreshold: 30,
    lengthThreshold: 4.0,
    spliceThreshold: 45,
    filterSpeckle: 2,
    maxColors: 4,
    threshold: 0.01,
    fps: 4
  });

  function loadVectorParams() {
    try {
      const saved = JSON.parse(localStorage.getItem(VECTOR_STORAGE_KEY) || '{}');
      return Object.assign({}, VECTOR_DEFAULTS, saved);
    } catch {
      return Object.assign({}, VECTOR_DEFAULTS);
    }
  }

  let vectorParams = loadVectorParams();
  let vectorBusy = false;
  let lastVectorRenderAt = 0;
  let lastVectorHash = -1;

  function formatVectorValue(name, value) {
    const n = Number(value);
    if (name === 'stroke') return n.toFixed(2) + ' px';
    if (name === 'cornerThreshold') return Math.round(n) + '°';
    if (name === 'lengthThreshold') return n.toFixed(2);
    if (name === 'fps') return Math.round(n) + ' fps';
    return String(value);
  }

  function syncVectorControls() {
    for (const name of Object.keys(vectorInputs)) {
      if (!vectorInputs[name]) continue;
      vectorInputs[name].value = String(vectorParams[name]);
      if (vectorOutputs[name]) vectorOutputs[name].textContent = formatVectorValue(name, vectorParams[name]);
    }
  }

  function saveVectorParams() {
    try {
      localStorage.setItem(VECTOR_STORAGE_KEY, JSON.stringify(vectorParams));
    } catch {}
  }

  function fastFrameHash(rgba) {
    let h = 2166136261 >>> 0;
    const step = Math.max(4, Math.floor(rgba.length / 4096 / 4) * 4);
    for (let i = 0; i < rgba.length; i += step) {
      h ^= rgba[i];
      h = Math.imul(h, 16777619) >>> 0;
      h ^= rgba[i + 1] || 0;
      h = Math.imul(h, 16777619) >>> 0;
      h ^= rgba[i + 2] || 0;
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  async function requestVectorRender(rgba, force = false) {
    if (qualityMode !== 'vector' || !window.DJGABOVector || vectorBusy) return;

    const now = performance.now();
    const interval = 1000 / Math.max(1, Number(vectorParams.fps) || 4);
    if (!force && now - lastVectorRenderAt < interval) return;

    const hash = fastFrameHash(rgba);
    if (!force && hash === lastVectorHash) return;

    vectorBusy = true;
    lastVectorRenderAt = now;
    lastVectorHash = hash;

    try {
      vectorEngineStatus.textContent = 'Vectorizando…';
      const snapshot = new Uint8Array(rgba);
      const svg = await window.DJGABOVector.traceFrame(snapshot, VISIBLE_W, VISIBLE_H, vectorParams);

      const pathCount = (svg.match(/<path\b/gi) || []).length;
      if (!pathCount) throw new Error('VTracer devolvió 0 curvas');

      if (qualityMode === 'vector') {
        vectorStage.innerHTML = svg;
        vectorEngineStatus.textContent = 'VTracer · ' + pathCount + ' curvas';
      }
    } catch (error) {
      console.error('[VECTOR TRACE]', error);
      vectorEngineStatus.textContent = 'Error VECTOR TRACE';
      qualityNote.textContent = 'VECTOR TRACE ERROR: ' + String(error?.message || error).slice(0, 140);
    } finally {
      vectorBusy = false;
    }
  }

  syncVectorControls();

  if (window.DJGABOVector?.ready) {
    window.DJGABOVector.ready
      .then(() => { vectorEngineStatus.textContent = 'VTracer listo'; })
      .catch((error) => {
        console.error('[VTracer WASM]', error);
        vectorEngineStatus.textContent = 'Error al cargar VTracer';
      });
  } else {
    vectorEngineStatus.textContent = 'Motor VTracer no cargado';
  }

  const VECTOR_V2_SCALE = 4;
  const VECTOR_V2_COLOR_MS = 33;
  const VECTOR_V2_DEBOUNCE_MS = 70;
  const VECTOR_V2_PARAMS = Object.freeze({
    mode: 'spline',
    stroke: 1.25,
    cornerThreshold: 15,
    lengthThreshold: 3.5,
    spliceThreshold: 20,
    filterSpeckle: 2,
    threshold: 0.01
  });

  const vectorV2Ctx = vectorCanvasV2.getContext('2d', { alpha: false });
  vectorCanvasV2.width = VISIBLE_W * VECTOR_V2_SCALE;
  vectorCanvasV2.height = VISIBLE_H * VECTOR_V2_SCALE;

  function makeVectorV2Canvas(width, height) {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    return c;
  }

  const vectorV2FillCanvas = makeVectorV2Canvas(vectorCanvasV2.width, vectorCanvasV2.height);
  const vectorV2MaskCanvas = makeVectorV2Canvas(vectorCanvasV2.width, vectorCanvasV2.height);
  const vectorV2OutlineCanvas = makeVectorV2Canvas(vectorCanvasV2.width, vectorCanvasV2.height);
  const vectorV2OverlayCanvas = makeVectorV2Canvas(vectorCanvasV2.width, vectorCanvasV2.height);
  const vectorV2ColorCanvas = makeVectorV2Canvas(VISIBLE_W, VISIBLE_H);

  const vectorV2FillCtx = vectorV2FillCanvas.getContext('2d');
  const vectorV2MaskCtx = vectorV2MaskCanvas.getContext('2d');
  const vectorV2OutlineCtx = vectorV2OutlineCanvas.getContext('2d');
  const vectorV2OverlayCtx = vectorV2OverlayCanvas.getContext('2d');
  const vectorV2ColorCtx = vectorV2ColorCanvas.getContext('2d');
  const vectorV2ColorImage = vectorV2ColorCtx.createImageData(VISIBLE_W, VISIBLE_H);

  let vectorV2Paths = [];
  let vectorV2GeometryHash = -1;
  let vectorV2PendingHash = -1;
  let vectorV2PendingSnapshot = null;
  let vectorV2DebounceTimer = 0;
  let vectorV2RequestSerial = 0;
  let vectorV2LastColorAt = 0;
  let vectorV2LastSource = '—';
  const vectorV2Cache = new Map();

  function vectorV2MaskHash(rgba) {
    let h = 2166136261 >>> 0;
    const threshold = Number(VECTOR_V2_PARAMS.threshold);

    for (let i = 0, p = 0; i < VISIBLE_W * VISIBLE_H; i++, p += 4) {
      const lum =
        (rgba[p] * 0.2126 + rgba[p + 1] * 0.7152 + rgba[p + 2] * 0.0722) / 255;
      const bit = lum >= threshold ? 1 : 0;
      h ^= bit;
      h = Math.imul(h, 16777619) >>> 0;
    }

    h ^= VISIBLE_W * VISIBLE_H;
    return h >>> 0;
  }

  function trimVectorV2Cache() {
    while (vectorV2Cache.size > 24) {
      const first = vectorV2Cache.keys().next().value;
      vectorV2Cache.delete(first);
    }
  }

  function clearVectorV2Canvas(ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, vectorCanvasV2.width, vectorCanvasV2.height);
  }

  function drawVectorV2Paths(ctx, paths, style) {
    ctx.setTransform(VECTOR_V2_SCALE, 0, 0, VECTOR_V2_SCALE, 0, 0);
    ctx.lineJoin = 'miter';
    ctx.lineCap = 'butt';
    ctx.miterLimit = 3;

    for (const desc of paths) {
      try {
        const path = new Path2D(desc.d);
        ctx.save();
        ctx.translate(Number(desc.tx) || 0, Number(desc.ty) || 0);

        if (style.fill) {
          ctx.fillStyle = style.fill;
          ctx.fill(path);
        }

        if (style.stroke && style.lineWidth > 0) {
          ctx.strokeStyle = style.stroke;
          ctx.lineWidth = style.lineWidth;
          ctx.stroke(path);
        }

        ctx.restore();
      } catch (error) {
        console.warn('[VECTOR V2] Path ignorado', error);
      }
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function buildVectorV2Geometry(paths, source = 'browser') {
    vectorV2Paths = Array.isArray(paths) ? paths : [];
    vectorV2LastSource = source;

    clearVectorV2Canvas(vectorV2FillCtx);
    clearVectorV2Canvas(vectorV2MaskCtx);
    clearVectorV2Canvas(vectorV2OutlineCtx);

    if (vectorV2Paths.length) {
      drawVectorV2Paths(vectorV2FillCtx, vectorV2Paths, {
        fill: '#ffffff',
        stroke: null,
        lineWidth: 0
      });

      drawVectorV2Paths(vectorV2MaskCtx, vectorV2Paths, {
        fill: '#ffffff',
        stroke: null,
        lineWidth: 0
      });

      drawVectorV2Paths(vectorV2OutlineCtx, vectorV2Paths, {
        fill: null,
        stroke: '#000000',
        lineWidth: VECTOR_V2_PARAMS.stroke
      });
    }

    vectorV2PathCount.textContent = String(vectorV2Paths.length);
    vectorV2GeometryState.textContent = source === 'cache' ? 'Caché' : source;
  }

  function updateVectorV2ColorMap(rgba) {
    const dst = vectorV2ColorImage.data;
    const threshold = Number(VECTOR_V2_PARAMS.threshold);

    for (let i = 0, p = 0; i < VISIBLE_W * VISIBLE_H; i++, p += 4) {
      const r = rgba[p];
      const g = rgba[p + 1];
      const b = rgba[p + 2];
      const lum = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;

      if (lum >= threshold) {
        dst[p] = r;
        dst[p + 1] = g;
        dst[p + 2] = b;
        dst[p + 3] = 255;
      } else {
        dst[p] = 0;
        dst[p + 1] = 0;
        dst[p + 2] = 0;
        dst[p + 3] = 0;
      }
    }

    vectorV2ColorCtx.putImageData(vectorV2ColorImage, 0, 0);
  }

  function composeVectorV2(rgba) {
    updateVectorV2ColorMap(rgba);

    vectorV2Ctx.setTransform(1, 0, 0, 1, 0, 0);
    vectorV2Ctx.fillStyle = '#6e737b';
    vectorV2Ctx.fillRect(0, 0, vectorCanvasV2.width, vectorCanvasV2.height);
    vectorV2Ctx.imageSmoothingEnabled = true;
    vectorV2Ctx.imageSmoothingQuality = 'high';

    if (!vectorV2Paths.length) {
      vectorV2Ctx.drawImage(
        vectorV2ColorCanvas,
        0, 0, VISIBLE_W, VISIBLE_H,
        0, 0, vectorCanvasV2.width, vectorCanvasV2.height
      );
      return;
    }

    vectorV2Ctx.drawImage(vectorV2FillCanvas, 0, 0);

    clearVectorV2Canvas(vectorV2OverlayCtx);
    vectorV2OverlayCtx.imageSmoothingEnabled = true;
    vectorV2OverlayCtx.imageSmoothingQuality = 'high';
    vectorV2OverlayCtx.drawImage(
      vectorV2ColorCanvas,
      0, 0, VISIBLE_W, VISIBLE_H,
      0, 0, vectorV2OverlayCanvas.width, vectorV2OverlayCanvas.height
    );
    vectorV2OverlayCtx.globalCompositeOperation = 'destination-in';
    vectorV2OverlayCtx.drawImage(vectorV2MaskCanvas, 0, 0);
    vectorV2OverlayCtx.globalCompositeOperation = 'source-over';

    vectorV2Ctx.drawImage(vectorV2OverlayCanvas, 0, 0);
    vectorV2Ctx.drawImage(vectorV2OutlineCanvas, 0, 0);
  }

  async function traceVectorV2Geometry(serial, hash, snapshot) {
    if (!window.DJGABOVector?.traceGeometry) return;

    vectorV2EngineStatus.textContent = 'Trazando geometría…';
    vectorV2GeometryState.textContent = 'Procesando';

    try {
      const result = await window.DJGABOVector.traceGeometry(
        snapshot,
        VISIBLE_W,
        VISIBLE_H,
        VECTOR_V2_PARAMS
      );

      if (serial !== vectorV2RequestSerial) return;

      const paths = Array.isArray(result?.paths) ? result.paths : [];
      const source = String(result?.source || 'browser');

      vectorV2Cache.set(hash, { paths, source });
      trimVectorV2Cache();

      buildVectorV2Geometry(paths, source);
      vectorV2GeometryHash = hash;
      vectorV2PendingHash = -1;
      vectorV2PendingSnapshot = null;

      vectorV2EngineStatus.textContent =
        paths.length ? 'V2 listo · ' + paths.length + ' curvas' : 'V2 · sin geometría';

      if (qualityMode === 'vector-v2') {
        composeVectorV2(imageData.data);
      }
    } catch (error) {
      if (serial !== vectorV2RequestSerial) return;

      console.error('[VECTOR V2]', error);
      vectorV2EngineStatus.textContent = 'Error VECTOR V2';
      vectorV2GeometryState.textContent = 'Error';
      qualityNote.textContent =
        'VECTOR V2 ERROR: ' + String(error?.message || error).slice(0, 130);
    }
  }

  function scheduleVectorV2Geometry(rgba, force = false) {
    const hash = vectorV2MaskHash(rgba);

    if (hash === vectorV2GeometryHash && vectorV2Paths) return;

    if (vectorV2Cache.has(hash)) {
      const cached = vectorV2Cache.get(hash);
      buildVectorV2Geometry(cached.paths, 'cache');
      vectorV2GeometryHash = hash;
      vectorV2PendingHash = -1;
      vectorV2EngineStatus.textContent =
        cached.paths.length ? 'V2 listo · caché' : 'V2 · sin geometría';
      return;
    }

    if (!force && hash === vectorV2PendingHash) return;

    vectorV2PendingHash = hash;
    vectorV2PendingSnapshot = new Uint8Array(rgba);
    const serial = ++vectorV2RequestSerial;

    clearTimeout(vectorV2DebounceTimer);
    vectorV2DebounceTimer = setTimeout(() => {
      const snapshot = vectorV2PendingSnapshot;
      if (!snapshot) return;
      traceVectorV2Geometry(serial, hash, snapshot);
    }, force ? 0 : VECTOR_V2_DEBOUNCE_MS);
  }

  function renderVectorV2(rgba, force = false) {
    scheduleVectorV2Geometry(rgba, force);

    const now = performance.now();
    if (!force && now - vectorV2LastColorAt < VECTOR_V2_COLOR_MS) return;

    vectorV2LastColorAt = now;
    composeVectorV2(rgba);
  }

  let cdgData = null;
  let processedPacket = 0;
  let audioUrl = null;
  let offsetSeconds = 0;
  let animationId = 0;
  let remoteLoadToken = 0;
  let pendingAutoplay = false;
  let cdgBaseSeconds = 0;

  const playbackWindow = {
    enabled: false,
    start: 0,
    end: Infinity,
    duration: 0,
    title: ''
  };

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function basenameFromUrl(value, fallback) {
    try {
      const url = new URL(value, window.location.href);
      const name = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '');
      return name || fallback;
    } catch {
      return fallback;
    }
  }

  function finiteNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function setStatus(text, ok = true) {
    statusLine.textContent = text;
    engineStatus.textContent = ok
      ? (playbackWindow.enabled ? 'Demo tienda' : 'Motor listo')
      : 'Revisar archivos';
  }

  function setQuality(mode) {
    const isHD = mode === 'hd';
    const isFidelity = mode === 'fidelity';
    const isScale2x = mode === 'scale2x';
    const isGloss = mode === 'gloss';
    const isSdfPro = mode === 'sdf-pro';
    const isVector = mode === 'vector';
    const isVectorV2 = mode === 'vector-v2';
    const isOriginal = mode === 'original';

    if (isHD && !hdRenderer) return;
    if (isFidelity && !fidelityRenderer) return;
    if (isScale2x && !scale2xRenderer) return;
    if (isGloss && !glossRenderer) return;
    if (isSdfPro && !ensureSdfProRenderer()) return;
    if ((isVector || isVectorV2) && !window.DJGABOVector) return;

    qualityMode = mode;
    screenWrap.classList.toggle('hd-mode', isHD);
    screenWrap.classList.toggle('fidelity-mode', isFidelity);
    screenWrap.classList.toggle('scale2x-mode', isScale2x);
    screenWrap.classList.toggle('gloss-mode', isGloss);
    screenWrap.classList.toggle('sdf-pro-mode', isSdfPro);
    screenWrap.classList.toggle('vector-mode', isVector);
    screenWrap.classList.toggle('vector-v2-mode', isVectorV2);

    qualityHD.classList.toggle('active', isHD);
    qualityFidelity?.classList.toggle('active', isFidelity);
    qualityScale2x?.classList.toggle('active', isScale2x);
    qualityGloss?.classList.toggle('active', isGloss);
    qualitySdfPro?.classList.toggle('active', isSdfPro);
    qualityVector?.classList.toggle('active', isVector);
    qualityVectorV2?.classList.toggle('active', isVectorV2);
    qualityOriginal.classList.toggle('active', isOriginal);

    sdfPanel?.classList.toggle('is-hidden', !isHD);
    fidelityPanel?.classList.toggle('is-hidden', !isFidelity);
    scale2xPanel?.classList.toggle('is-hidden', !isScale2x);
    glossPanel?.classList.toggle('is-hidden', !isGloss);
    sdfProPanel?.classList.toggle('is-hidden', !isSdfPro);
    vectorPanel?.classList.toggle('is-hidden', !isVector);
    vectorV2Panel?.classList.toggle('is-hidden', !isVectorV2);

    if (isHD) {
      qualityNote.textContent =
        'SDF LAB · halo ' + Number(sdfParams.halo).toFixed(2) +
        ' · corte ' + Number(sdfParams.cutoff).toFixed(2) +
        ' · radius ' + Math.round(sdfParams.radius) +
        ' · ' + Math.round(sdfParams.scale) + '×';
      lastHdRenderAt = 0;
      renderFrame(true);
    } else if (isFidelity) {
      qualityNote.textContent =
        'CDG FIDELITY · CLUT directo · AA ' + Number(fidelityParams.aa).toFixed(3) +
        ' · borde ' + Number(fidelityParams.outline).toFixed(2) + ' px · ' +
        Math.round(fidelityParams.scale) + '×';
      lastFidelityRenderAt = 0;
      renderFrame(true);
    } else if (isScale2x) {
      qualityNote.textContent =
        'SCALE2X · ' +
        (Number(scale2xParams.passes) === 2 ? 'Scale4X' : 'Scale2X') +
        ' · CLUT directo · borde ' + Math.round(Number(scale2xParams.outline)) +
        ' px · salida ' + Math.round(Number(scale2xParams.outputScale)) + '×';
      lastScale2xRenderAt = 0;
      renderFrame(true);
    } else if (isGloss) {
      qualityNote.textContent =
        'KARAOKE HD · PK curve ' + Number(glossParams.gradient).toFixed(2) +
        ' · sombra ' + Number(glossParams.shadowX).toFixed(2) + '/' +
        Number(glossParams.shadowY).toFixed(2) +
        ' · opacidad ' + Number(glossParams.shadowAlpha).toFixed(2);
      lastGlossRenderAt = 0;
      renderFrame(true);
    } else if (isSdfPro) {
      qualityNote.textContent =
        'SDF KARAOKE PRO · halo ' + Number(sdfProParams.halo).toFixed(2) +
        ' · grad ' + Math.round(Number(sdfProParams.programGradient)) + '/100' +
        ' · contorno ' + Number(sdfProParams.proOutline).toFixed(2) + ' px' +
        ' · sombra ' + Number(sdfProParams.shadowX).toFixed(2) + '/' +
        Number(sdfProParams.shadowY).toFixed(2);
      lastSdfProRenderAt = 0;
      renderFrame(true);
    } else if (isVector) {
      qualityNote.textContent =
        'VECTOR TRACE V1 · contorno ' + Number(vectorParams.stroke).toFixed(2) +
        ' px · esquina ' + Math.round(vectorParams.cornerThreshold) + '°';
      lastVectorRenderAt = 0;
      lastVectorHash = -1;
      renderFrame(true);
    } else if (isVectorV2) {
      qualityNote.textContent =
        'VECTOR V2 · geometría única · color 30 fps · fidelidad alta';
      vectorV2LastColorAt = 0;
      renderFrame(true);
    } else {
      qualityNote.textContent = 'CDG nativo · píxel directo';
    }
  }

  function resetDecoder() {
    decoder.reset();
    processedPacket = 0;
  }

  function processTo(targetPacket) {
    if (!cdgData) return;
    const total = Math.floor(cdgData.length / 24);
    targetPacket = Math.max(0, Math.min(total, targetPacket | 0));

    if (targetPacket < processedPacket) resetDecoder();

    for (let i = processedPacket; i < targetPacket; i++) {
      const start = i * 24;
      decoder.packet(cdgData.subarray(start, start + 24));
    }
    processedPacket = targetPacket;
  }

  function renderFrame(forceHD = false) {
    const out = imageData.data;
    let o = 0;
    let ii = 0;
    const hFine = Math.min(5, decoder.hOffset);
    const vFine = Math.min(11, decoder.vOffset);

    for (let y = 0; y < VISIBLE_H; y++) {
      const sy = Math.min(HEIGHT - 1, VISIBLE_Y + y + vFine);
      for (let x = 0; x < VISIBLE_W; x++) {
        const sx = Math.min(WIDTH - 1, VISIBLE_X + x + hFine);
        const colorIndex = decoder.frame[sy * WIDTH + sx] & 0x0f;
        visibleIndices[ii++] = colorIndex;
        const rgba = decoder.palette[colorIndex];
        out[o++] = rgba[0];
        out[o++] = rgba[1];
        out[o++] = rgba[2];
        out[o++] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);

    if (qualityMode === 'hd' && hdRenderer) {
      const now = performance.now();
      if (forceHD || now - lastHdRenderAt >= SDF_FRAME_MS) {
        hdRenderer.render(out);
        lastHdRenderAt = now;
      }
    } else if (qualityMode === 'fidelity' && fidelityRenderer) {
      const now = performance.now();
      if (forceHD || now - lastFidelityRenderAt >= FIDELITY_FRAME_MS) {
        fidelityRenderer.render(
          out,
          visibleIndices,
          decoder.memoryColor,
          decoder.transparent
        );
        lastFidelityRenderAt = now;
      }
    } else if (qualityMode === 'scale2x' && scale2xRenderer) {
      const now = performance.now();
      if (forceHD || now - lastScale2xRenderAt >= SCALE2X_FRAME_MS) {
        scale2xRenderer.render(
          visibleIndices,
          decoder.palette,
          decoder.memoryColor,
          decoder.transparent
        );
        lastScale2xRenderAt = now;
      }
    } else if (qualityMode === 'gloss' && glossRenderer) {
      const now = performance.now();
      if (forceHD || now - lastGlossRenderAt >= GLOSS_FRAME_MS) {
        glossRenderer.render(
          visibleIndices,
          decoder.palette,
          decoder.memoryColor,
          decoder.transparent,
          0
        );
        const glossState = glossRenderer.getState?.();
        if (glossLineCount) {
          glossLineCount.textContent = glossState
            ? String(glossState.lineCount)
            : '—';
        }
        if (glossSmartSource) {
          glossSmartSource.textContent = glossState?.smartResolution || 'Inicializando HQ4X…';
          if (glossState?.hqxError) {
            glossSmartSource.title = glossState.hqxError;
          } else {
            glossSmartSource.removeAttribute('title');
          }
        }
        lastGlossRenderAt = now;
      }
    } else if (qualityMode === 'sdf-pro' && sdfProRenderer) {
      const now = performance.now();
      if (forceHD || now - lastSdfProRenderAt >= SDF_FRAME_MS) {
        sdfProRenderer.render(out);
        const proState = sdfProRenderer.getState?.();
        if (sdfProLineCount) {
          sdfProLineCount.textContent = proState
            ? String(proState.lineCount)
            : '—';
        }
        lastSdfProRenderAt = now;
      }
    } else if (qualityMode === 'vector') {
      requestVectorRender(out, forceHD);
    } else if (qualityMode === 'vector-v2') {
      renderVectorV2(out, forceHD);
    }
  }

  function clampToWindow(time) {
    if (!playbackWindow.enabled) return Math.max(0, time);
    const max = Number.isFinite(playbackWindow.end) ? playbackWindow.end : time;
    return Math.min(max, Math.max(playbackWindow.start, time));
  }

  function displayCurrentTime() {
    if (playbackWindow.enabled) {
      return Math.max(0, audio.currentTime - playbackWindow.start);
    }
    return audio.currentTime;
  }

  function displayDuration() {
    if (playbackWindow.enabled) return playbackWindow.duration;
    return audio.duration;
  }

  function syncCDG(forceHD = false) {
    if (!cdgData) return;
    const effective = Math.max(0, cdgBaseSeconds + audio.currentTime + offsetSeconds);
    processTo(Math.floor(effective * PACKETS_PER_SECOND));
    renderFrame(forceHD);
  }

  function enforcePreviewEnd() {
    if (!playbackWindow.enabled || audio.paused) return false;
    if (audio.currentTime + 0.02 < playbackWindow.end) return false;

    audio.pause();
    audio.currentTime = playbackWindow.start;
    syncCDG(true);
    setStatus('Demo terminado. Pulsa ▶ para escucharlo otra vez.');
    return true;
  }

  function updateTransport() {
    currentTimeEl.textContent = formatTime(displayCurrentTime());

    const duration = displayDuration();
    if (Number.isFinite(duration) && duration > 0) {
      const progress = playbackWindow.enabled
        ? (audio.currentTime - playbackWindow.start) / duration
        : audio.currentTime / duration;
      seek.value = String(Math.round(Math.max(0, Math.min(1, progress)) * 1000));
    }
  }

  function loop() {
    if (!enforcePreviewEnd()) {
      syncCDG();
      updateTransport();
    }
    animationId = requestAnimationFrame(loop);
  }

  function startLoop() {
    cancelAnimationFrame(animationId);
    animationId = requestAnimationFrame(loop);
  }

  function updateOffset(delta) {
    offsetSeconds = Math.round((offsetSeconds + delta) * 10) / 10;
    offsetSeconds = Math.max(-5, Math.min(5, offsetSeconds));
    offsetValue.textContent = `${offsetSeconds.toFixed(1)} s`;
    syncCDG(true);
  }

  function resetPlaybackWindow() {
    playbackWindow.enabled = false;
    playbackWindow.start = 0;
    playbackWindow.end = Infinity;
    playbackWindow.duration = 0;
    playbackWindow.title = '';
    cdgBaseSeconds = 0;
    pendingAutoplay = false;
  }

  function configurePlaybackWindow({ start = 0, duration = 0, title = '', cdgStart = 0 } = {}) {
    const safeStart = Math.max(0, finiteNumber(start, 0));
    const safeDuration = Math.max(0, finiteNumber(duration, 0));
    cdgBaseSeconds = Math.max(0, finiteNumber(cdgStart, 0));

    playbackWindow.enabled = safeDuration > 0;
    playbackWindow.start = safeStart;
    playbackWindow.duration = safeDuration;
    playbackWindow.end = playbackWindow.enabled ? safeStart + safeDuration : Infinity;
    playbackWindow.title = String(title || '');
  }

  function applyMetadataWindow() {
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;

    if (playbackWindow.enabled) {
      playbackWindow.start = Math.min(playbackWindow.start, Math.max(0, audio.duration - 0.05));
      playbackWindow.end = Math.min(audio.duration, playbackWindow.start + playbackWindow.duration);
      playbackWindow.duration = Math.max(0, playbackWindow.end - playbackWindow.start);
      audio.currentTime = playbackWindow.start;
      durationEl.textContent = formatTime(playbackWindow.duration);
      currentTimeEl.textContent = formatTime(0);
    } else {
      durationEl.textContent = formatTime(audio.duration);
      currentTimeEl.textContent = formatTime(0);
    }

    syncCDG(true);

    if (pendingAutoplay) {
      pendingAutoplay = false;
      audio.play().catch(() => {
        setStatus('Demo listo. Pulsa ▶ para reproducirlo.');
      });
    }
  }

  function setLoadedNames(cdgLabel, audioLabel) {
    cdgName.textContent = cdgLabel || '—';
    audioName.textContent = audioLabel || '—';
    emptyState.style.display = 'none';
    playBtn.disabled = false;
    seek.disabled = false;
  }

  async function loadResolvedPair(cdgFile, audioFile, sourceLabel = '') {
    resetPlaybackWindow();
    engineStatus.textContent = 'Cargando';
    setStatus(sourceLabel ? 'Abriendo ' + sourceLabel + '…' : 'Cargando CDG…');

    cdgData = new Uint8Array(await cdgFile.arrayBuffer());

    if (cdgData.length < 24) {
      throw new Error('El archivo CDG está vacío o no es válido.');
    }

    resetDecoder();
    processTo(Math.min(Math.floor(cdgData.length / 24), 1));
    renderFrame(true);

    if (audioUrl && audioUrl.startsWith('blob:')) URL.revokeObjectURL(audioUrl);
    audioUrl = URL.createObjectURL(audioFile);
    audio.src = audioUrl;
    audio.load();

    setLoadedNames(cdgFile.name, audioFile.name);
    const prefix = sourceLabel ? sourceLabel + ' · ' : '';
    setStatus(prefix + 'CDG cargado: ' + Math.floor(cdgData.length / 24).toLocaleString() + ' paquetes.');
    startLoop();
  }

  async function loadZipFile(zipFile) {
    if (!window.DJGABOZip?.extractPair) {
      throw new Error('El lector ZIP no está disponible.');
    }

    engineStatus.textContent = 'Descomprimiendo';
    const sizeMb = Math.max(0.1, zipFile.size / (1024 * 1024));
    setStatus('Abriendo ZIP · ' + sizeMb.toFixed(1) + ' MB…');

    // Let the browser paint the loading state before touching a large file.
    await new Promise(resolve => requestAnimationFrame(resolve));

    const result = await window.DJGABOZip.extractPair(
      zipFile,
      zipFile.name,
      progress => {
        const percent = Math.max(0, Math.min(100, Number(progress?.percent) || 0));
        engineStatus.textContent = 'ZIP ' + Math.round(percent) + '%';
        setStatus('Abriendo ZIP… ' + Math.round(percent) + '%');
      }
    );

    const matchText = result.exactNameMatch
      ? 'pareja detectada por nombre'
      : 'pareja detectada automáticamente';

    await loadResolvedPair(
      result.cdgFile,
      result.audioFile,
      'ZIP · ' + matchText
    );
  }

  async function loadPair(files) {
    remoteLoadToken += 1;
    const list = Array.from(files || []);
    const zipFile = list.find(f => /\.zip$/i.test(f.name) || /application\/zip/i.test(f.type));

    pairInput.disabled = true;

    try {
      if (zipFile) {
        await loadZipFile(zipFile);
        return;
      }

      const cdgFile = list.find(f => /\.cdg$/i.test(f.name));
      const audioFile = list.find(f => /\.(mp3|wav|ogg|m4a|aac)$/i.test(f.name) || /^audio\//i.test(f.type));

      if (!cdgFile || !audioFile) {
        setStatus('Selecciona un ZIP o juntos un .CDG y su MP3/WAV.', false);
        return;
      }

      await loadResolvedPair(cdgFile, audioFile);
    } catch (error) {
      console.error('[LOCAL LOAD]', error);
      engineStatus.textContent = 'Revisar archivo';
      setStatus(String(error?.message || error), false);
    } finally {
      pairInput.disabled = false;
      pairInput.value = '';
    }
  }

  async function loadRemote(config = {}) {
    const token = ++remoteLoadToken;
    const cdgUrl = String(config.cdgUrl || config.cdg || '').trim();
    const remoteAudioUrl = String(config.audioUrl || config.audio || '').trim();

    if (!cdgUrl || !remoteAudioUrl) {
      throw new Error('Faltan cdgUrl y audioUrl.');
    }

    configurePlaybackWindow(config);
    pendingAutoplay = Boolean(config.autoplay);

    engineStatus.textContent = 'Cargando';
    setStatus('Cargando demo del karaoke…');

    let response;
    try {
      response = await fetch(cdgUrl, {
        method: 'GET',
        mode: 'cors',
        cache: 'force-cache',
        credentials: 'same-origin'
      });
    } catch (error) {
      setStatus('No se pudo descargar el CDG. Revisa CORS o la URL.', false);
      throw error;
    }

    if (!response.ok) {
      const error = new Error(`CDG HTTP ${response.status}`);
      setStatus(`No se pudo cargar el CDG (HTTP ${response.status}).`, false);
      throw error;
    }

    const data = new Uint8Array(await response.arrayBuffer());
    if (token !== remoteLoadToken) return;

    if (data.length < 24) {
      setStatus('El archivo CDG recibido está vacío o no es válido.', false);
      throw new Error('CDG inválido.');
    }

    cdgData = data;
    resetDecoder();
    processTo(Math.min(Math.floor(cdgData.length / 24), 1));
    renderFrame(true);

    if (audioUrl && audioUrl.startsWith('blob:')) {
      URL.revokeObjectURL(audioUrl);
    }
    audioUrl = remoteAudioUrl;
    audio.src = remoteAudioUrl;
    audio.load();

    const title = playbackWindow.title || basenameFromUrl(remoteAudioUrl, 'Audio remoto');
    setLoadedNames(
      basenameFromUrl(cdgUrl, 'Karaoke.cdg'),
      title
    );

    const modeText = playbackWindow.enabled
      ? `Demo de ${formatTime(playbackWindow.duration)} listo.`
      : 'Karaoke remoto listo.';
    setStatus(modeText);
    startLoop();
  }

  function loadFromQueryString() {
    const params = new URLSearchParams(window.location.search);
    const audioParam = params.get('audio');
    const cdgParam = params.get('cdg');
    if (!audioParam || !cdgParam) return;

    const qualityParam = String(params.get('quality') || '').toLowerCase();
    if (['original', 'hd', 'sdf-pro'].includes(qualityParam)) {
      setQuality(qualityParam);
    }

    loadRemote({
      audioUrl: audioParam,
      cdgUrl: cdgParam,
      title: params.get('title') || '',
      start: params.get('start') || 0,
      duration: params.get('duration') || 0,
      cdgStart: params.get('cdgStart') || 0,
      autoplay: ['1', 'true', 'yes'].includes(String(params.get('autoplay') || '').toLowerCase())
    }).catch(error => {
      console.error('[CDG_PLAYER_ONLINE] No se pudo cargar el demo:', error);
    });
  }

  for (const [name, input] of Object.entries(sdfInputs)) {
    input?.addEventListener('input', () => {
      const integerParam = name === 'scale' || name === 'radius' || name === 'preSmooth';
      const value = integerParam ? Math.round(Number(input.value)) : Number(input.value);
      applySdfParams({ [name]: value });
      qualityNote.textContent =
        'SDF LAB · halo ' + Number(sdfParams.halo).toFixed(2) +
        ' · corte ' + Number(sdfParams.cutoff).toFixed(2) +
        ' · radius ' + Math.round(sdfParams.radius) +
        ' · ' + Math.round(sdfParams.scale) + '×';
    });
  }

  sdfReset?.addEventListener('click', () => {
    applySdfParams(Object.assign({}, SDF_DEFAULTS));
  });

  for (const [name, input] of Object.entries(fidelityInputs)) {
    input?.addEventListener('input', () => {
      const value = name === 'scale'
        ? Math.round(Number(input.value))
        : Number(input.value);

      applyFidelityParams({ [name]: value });
      qualityNote.textContent =
        'CDG FIDELITY · CLUT directo · AA ' + Number(fidelityParams.aa).toFixed(3) +
        ' · borde ' + Number(fidelityParams.outline).toFixed(2) + ' px · ' +
        Math.round(fidelityParams.scale) + '×';
    });
  }

  for (const [name, input] of Object.entries(scale2xInputs)) {
    const eventName = input?.type === 'checkbox' ? 'change' : 'input';
    input?.addEventListener(eventName, () => {
      const value = input.type === 'checkbox'
        ? input.checked
        : Math.round(Number(input.value));

      applyScale2xParams({ [name]: value });

      qualityNote.textContent =
        'SCALE2X · ' +
        (Number(scale2xParams.passes) === 2 ? 'Scale4X' : 'Scale2X') +
        ' · CLUT directo · borde ' + Math.round(Number(scale2xParams.outline)) +
        ' px · salida ' + Math.round(Number(scale2xParams.outputScale)) + '×';
    });
  }

  for (const [name, input] of Object.entries(glossInputs)) {
    input?.addEventListener('input', () => {
      applyGlossParams({ [name]: Number(input.value) });

      qualityNote.textContent =
        'KARAOKE HD · PK curve ' + Number(glossParams.gradient).toFixed(2) +
        ' · sombra ' + Number(glossParams.shadowX).toFixed(2) + '/' +
        Number(glossParams.shadowY).toFixed(2) +
        ' · opacidad ' + Number(glossParams.shadowAlpha).toFixed(2);
    });
  }

  glossReset?.addEventListener('click', () => {
    applyGlossParams(Object.assign({}, GLOSS_DEFAULTS));
    qualityNote.textContent =
      'KARAOKE HD · Preset PK Style · gradiente ' + Number(glossParams.gradient).toFixed(2) +
      ' · sombra ' + Number(glossParams.shadowX).toFixed(2) + '/' +
      Number(glossParams.shadowY).toFixed(2);
  });

  for (const [name, input] of Object.entries(sdfProInputs)) {
    input?.addEventListener('input', () => {
      const integerParam =
        name === 'radius' ||
        name === 'preSmooth' ||
        name === 'scale' ||
        name === 'programGradient';

      const value = integerParam
        ? Math.round(Number(input.value))
        : Number(input.value);

      applySdfProParams({ [name]: value });

      qualityNote.textContent =
        'SDF KARAOKE PRO · halo ' + Number(sdfProParams.halo).toFixed(2) +
        ' · grad ' + Math.round(Number(sdfProParams.programGradient)) + '/100' +
        ' · contorno ' + Number(sdfProParams.proOutline).toFixed(2) + ' px' +
        ' · sombra ' + Number(sdfProParams.shadowX).toFixed(2) + '/' +
        Number(sdfProParams.shadowY).toFixed(2);
    });
  }

  sdfProReset?.addEventListener('click', () => {
    applySdfProParams(Object.assign({}, SDF_PRO_DEFAULTS));
    qualityNote.textContent =
      'SDF KARAOKE PRO · BASE V1 · grad ' +
      Math.round(Number(sdfProParams.programGradient)) + '/100';
  });

  for (const [name, input] of Object.entries(vectorInputs)) {
    input?.addEventListener('input', () => {
      const value = name === 'cornerThreshold' || name === 'fps'
        ? Math.round(Number(input.value))
        : Number(input.value);
      vectorParams = Object.assign({}, vectorParams, { [name]: value });
      syncVectorControls();
      saveVectorParams();
      lastVectorHash = -1;
      lastVectorRenderAt = 0;
      if (qualityMode === 'vector') renderFrame(true);
    });
  }

  qualityOriginal.addEventListener('click', () => setQuality('original'));
  qualityHD.addEventListener('click', () => setQuality('hd'));
  qualityFidelity?.addEventListener('click', () => setQuality('fidelity'));
  qualityScale2x?.addEventListener('click', () => setQuality('scale2x'));
  qualityGloss?.addEventListener('click', () => setQuality('gloss'));
  qualitySdfPro?.addEventListener('click', () => setQuality('sdf-pro'));
  qualityVector?.addEventListener('click', () => setQuality('vector'));
  qualityVectorV2?.addEventListener('click', () => setQuality('vector-v2'));

  pairInput.addEventListener('change', e => loadPair(e.target.files));

  playBtn.addEventListener('click', async () => {
    if (!audio.src) return;

    if (audio.paused) {
      if (playbackWindow.enabled &&
          (audio.currentTime < playbackWindow.start || audio.currentTime >= playbackWindow.end - 0.02)) {
        audio.currentTime = playbackWindow.start;
        syncCDG(true);
      }
      await audio.play();
    } else {
      audio.pause();
    }
  });

  audio.addEventListener('play', () => {
    playBtn.textContent = '❚❚';
    if (playbackWindow.enabled) setStatus('Reproduciendo demo…');
    startLoop();
  });

  audio.addEventListener('pause', () => {
    playBtn.textContent = '▶';
    syncCDG(true);
    updateTransport();
  });

  audio.addEventListener('loadedmetadata', applyMetadataWindow);

  audio.addEventListener('ended', () => {
    playBtn.textContent = '▶';
    if (playbackWindow.enabled) {
      audio.currentTime = playbackWindow.start;
      syncCDG(true);
    }
  });

  audio.addEventListener('error', () => {
    setStatus('No se pudo reproducir el audio remoto. Revisa la URL/formato.', false);
  });

  seek.addEventListener('input', () => {
    const duration = displayDuration();
    if (!Number.isFinite(duration) || duration <= 0) return;

    const ratio = Number(seek.value) / 1000;
    const target = playbackWindow.enabled
      ? playbackWindow.start + ratio * playbackWindow.duration
      : ratio * audio.duration;

    audio.currentTime = clampToWindow(target);
    syncCDG(true);
    updateTransport();
  });

  volume.addEventListener('input', () => {
    audio.volume = Number(volume.value);
  });

  offsetMinus.addEventListener('click', () => updateOffset(-0.1));
  offsetPlus.addEventListener('click', () => updateOffset(0.1));

  fullscreenBtn.addEventListener('click', async () => {
    if (!document.fullscreenElement) {
      await screenWrap.requestFullscreen?.();
    } else {
      await document.exitFullscreen?.();
    }
  });

  window.addEventListener('keydown', e => {
    if (e.code === 'Space' && e.target.tagName !== 'INPUT') {
      e.preventDefault();
      playBtn.click();
    }

    if (!audio.src) return;

    if (e.code === 'ArrowLeft') {
      audio.currentTime = clampToWindow(audio.currentTime - 5);
      syncCDG(true);
    }
    if (e.code === 'ArrowRight') {
      const naturalMax = Number.isFinite(audio.duration) ? audio.duration : Infinity;
      audio.currentTime = clampToWindow(Math.min(naturalMax, audio.currentTime + 5));
      syncCDG(true);
    }
  });

  window.DJGABO_CDG_PLAYER = Object.freeze({
    loadRemote,
    loadLocalFiles: loadPair,
    setQuality,
    play: () => audio.play(),
    pause: () => audio.pause(),
    stop: () => {
      audio.pause();
      audio.currentTime = playbackWindow.enabled ? playbackWindow.start : 0;
      syncCDG(true);
      updateTransport();
    },
    getState: () => ({
      ready: Boolean(cdgData && audio.src),
      paused: audio.paused,
      currentTime: audio.currentTime,
      quality: qualityMode,
      sdfPreset: SDF_PRESET_NAME,
      sdf: { ...sdfParams },
      fidelity: { ...fidelityParams },
      scale2x: { ...scale2xParams },
      glossPreset: GLOSS_PRESET_NAME,
      gloss: { ...glossParams },
      glossRuntime: glossRenderer?.getState?.() || null,
      sdfProPreset: SDF_PRO_PRESET_NAME,
      sdfPro: { ...sdfProParams },
      sdfProRuntime: sdfProRenderer?.getState?.() || null,
      vector: { ...vectorParams },
      vectorV2: {
        geometryHash: vectorV2GeometryHash,
        paths: vectorV2Paths.length,
        source: vectorV2LastSource,
        cachedPages: vectorV2Cache.size
      },
      preview: { ...playbackWindow }
    })
  });

  setQuality(qualityMode);
  renderFrame(true);
  loadFromQueryString();
})();