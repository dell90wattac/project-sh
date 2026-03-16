import { getSharedAudioNodes, tryResumeSharedAudio } from './audioShared.js';

const TWO_PI = Math.PI * 2;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function createSeededRandom(seed) {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// ─── Buffer builders ─────────────────────────────────────────────────────────

// Stone floor footstep: low 60Hz thump + bandpass noise burst.
function buildFootstepBuffer(context) {
  const duration = 0.115;
  const sr = context.sampleRate;
  const n  = Math.floor(duration * sr);
  const buf = context.createBuffer(1, n, sr);
  const out = buf.getChannelData(0);
  const rand = createSeededRandom(2211);

  let lp = 0, hp = 0, phase = 0;

  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const transientEnv = Math.exp(-72 * t);
    const thumpEnv     = Math.exp(-25 * t);

    // Low sine thump at 62Hz
    phase += (62 / sr) * TWO_PI;
    const thump = Math.sin(phase) * thumpEnv * 0.72;

    // Bandpass noise for the click of contact (~150–800Hz)
    const noise = rand() * 2 - 1;
    lp += (noise - lp) * 0.62;
    hp += (lp - hp) * 0.048;
    const click = (lp - hp) * transientEnv * 0.52;

    out[i] = Math.tanh((thump + click) * 1.35) / Math.tanh(1.35);
  }

  return { buffer: buf, duration };
}

// Short metallic click at start of reload.
function buildReloadClickBuffer(context) {
  const duration = 0.055;
  const sr = context.sampleRate;
  const n  = Math.floor(duration * sr);
  const buf = context.createBuffer(1, n, sr);
  const out = buf.getChannelData(0);
  const rand = createSeededRandom(3301);

  let lp = 0, hp = 0, pingPhase = 0;

  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = Math.exp(-185 * t);

    // High ping at 1650Hz
    pingPhase += (1650 / sr) * TWO_PI;
    const ping = Math.sin(pingPhase) * 0.42;

    // Bright noise: highpass at ~900Hz
    const noise = rand() * 2 - 1;
    lp += (noise - lp) * 0.90;
    hp += (lp - hp) * 0.12;
    const click = (lp - hp) * 0.58;

    out[i] = Math.tanh((ping + click) * env * 2.6) / Math.tanh(2.6);
  }

  return { buffer: buf, duration };
}

// Heavier slide/thunk at end of reload (magazine seated, slide released).
function buildReloadDoneBuffer(context) {
  const duration = 0.09;
  const sr = context.sampleRate;
  const n  = Math.floor(duration * sr);
  const buf = context.createBuffer(1, n, sr);
  const out = buf.getChannelData(0);
  const rand = createSeededRandom(4402);

  let lp = 0, hp = 0, slidePhase = 0;

  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = Math.exp(-58 * t);

    // Descending sweep 360→115Hz — the slide snapping forward.
    const freq = 360 + (115 - 360) * (t / duration);
    slidePhase += (freq / sr) * TWO_PI;
    const slide = Math.sin(slidePhase) * 0.65;

    // Medium bandpass noise for body
    const noise = rand() * 2 - 1;
    lp += (noise - lp) * 0.52;
    hp += (lp - hp) * 0.055;
    const band = (lp - hp) * 0.42;

    out[i] = Math.tanh((slide + band) * env * 1.85) / Math.tanh(1.85) * 0.95;
  }

  return { buffer: buf, duration };
}

// Sharp impact/gasp when player takes damage.
function buildHurtBuffer(context) {
  const duration = 0.075;
  const sr = context.sampleRate;
  const n  = Math.floor(duration * sr);
  const buf = context.createBuffer(1, n, sr);
  const out = buf.getChannelData(0);
  const rand = createSeededRandom(5503);

  let lp = 0, hp = 0, thumpPhase = 0;

  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = Math.exp(-110 * t);

    // Mid-band impact noise ~700–4kHz
    const noise = rand() * 2 - 1;
    lp += (noise - lp) * 0.76;
    hp += (lp - hp) * 0.095;
    const band = (lp - hp) * 0.68;

    // Brief low thump underneath
    thumpPhase += (185 / sr) * TWO_PI;
    const thump = Math.sin(thumpPhase) * 0.28;

    out[i] = Math.tanh((band + thump) * env * 2.2) / Math.tanh(2.2) * 0.88;
  }

  return { buffer: buf, duration };
}

// Looping ambient drone: beating oscillators + filtered noise.
// Creates a slow, eerie atmospheric pulse with no obvious rhythm.
function buildAmbientBuffer(context) {
  const duration = 5.0;
  const sr = context.sampleRate;
  const n  = Math.floor(duration * sr);
  const buf = context.createBuffer(2, n, sr); // stereo for width
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  const rand = createSeededRandom(7777);

  let ph1 = 0, ph2 = 0, ph3 = 0, ph4 = 0;
  let lpL = 0, lpR = 0;

  for (let i = 0; i < n; i++) {
    const t = i / sr;

    // Slow amplitude pulse — 0.11Hz (9s cycle), depth 20%.
    const lfo = 0.88 + 0.12 * Math.sin(t * 0.11 * TWO_PI);

    // Two slightly detuned bass oscillators: 51Hz + 55Hz → creates ~4Hz beat.
    ph1 += (51 / sr) * TWO_PI;
    ph2 += (55 / sr) * TWO_PI;

    // A gentle upper harmonic for texture.
    ph3 += (102 / sr) * TWO_PI;
    ph4 += (110 / sr) * TWO_PI;

    const oscL = Math.sin(ph1) * 0.52 + Math.sin(ph3) * 0.10;
    const oscR = Math.sin(ph2) * 0.52 + Math.sin(ph4) * 0.10;

    // Deep filtered noise (below 180Hz) — very quiet rumble.
    const nL = rand() * 2 - 1;
    const nR = rand() * 2 - 1;
    lpL += (nL - lpL) * 0.025;
    lpR += (nR - lpR) * 0.025;

    L[i] = (oscL * 0.042 + lpL * 0.012) * lfo;
    R[i] = (oscR * 0.042 + lpR * 0.012) * lfo;
  }

  return { buffer: buf, duration };
}

// ─── Main system ─────────────────────────────────────────────────────────────

export function createAudioSystem() {
  let audioNodes    = null;
  let initialized   = false;

  let footstepData   = null;
  let reloadClickData = null;
  let reloadDoneData  = null;
  let hurtData       = null;
  let ambientData    = null;

  let ambientSource  = null;
  let ambientStarted = false;

  let footstepTimer  = 0;

  const activeVoices = [];
  const maxVoices    = 16;

  function tryInit() {
    if (initialized) return !!audioNodes;
    initialized = true;

    try {
      audioNodes = getSharedAudioNodes();
      if (!audioNodes) return false;

      const ctx = audioNodes.context;
      footstepData    = buildFootstepBuffer(ctx);
      reloadClickData = buildReloadClickBuffer(ctx);
      reloadDoneData  = buildReloadDoneBuffer(ctx);
      hurtData        = buildHurtBuffer(ctx);
      ambientData     = buildAmbientBuffer(ctx);

      return true;
    } catch (err) {
      console.warn('[Audio] audio.js init failed; continuing silently.', err);
      return false;
    }
  }

  function cleanupVoices(now) {
    for (let i = activeVoices.length - 1; i >= 0; i--) {
      if (activeVoices[i].endTime <= now) activeVoices.splice(i, 1);
    }
  }

  function stealVoice() {
    if (activeVoices.length < maxVoices) return;
    activeVoices.sort((a, b) => a.endTime - b.endTime);
    const v = activeVoices.shift();
    if (v) { try { v.source.stop(); } catch { /* ignore */ } }
  }

  function playOnce(data, gainAmount, pitchVariance = 0) {
    if (!data?.buffer || !audioNodes) return;

    const ctx = audioNodes.context;
    const now = ctx.currentTime;
    cleanupVoices(now);
    stealVoice();

    const source = ctx.createBufferSource();
    source.buffer = data.buffer;
    source.playbackRate.value = 1 + (Math.random() * 2 - 1) * pitchVariance;

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(clamp(gainAmount, 0.005, 0.5), now);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + data.duration);

    source.connect(gainNode);
    gainNode.connect(audioNodes.masterGain);
    source.start(now);

    const entry = { source, endTime: now + data.duration + 0.02 };
    activeVoices.push(entry);
    source.onended = () => {
      const idx = activeVoices.indexOf(entry);
      if (idx >= 0) activeVoices.splice(idx, 1);
    };
  }

  function startAmbientLoop() {
    if (ambientStarted || !ambientData?.buffer || !audioNodes) return;
    ambientStarted = true;

    try {
      const ctx = audioNodes.context;
      const source = ctx.createBufferSource();
      source.buffer = ambientData.buffer;
      source.loop   = true;

      // Ambient gets its own low-gain bus so it never competes with game sounds.
      const ambGain = ctx.createGain();
      ambGain.gain.value = 0.72;

      source.connect(ambGain);
      ambGain.connect(audioNodes.masterGain);
      source.start(ctx.currentTime);

      ambientSource = source;
    } catch (err) {
      console.warn('[Audio] Ambient loop start failed.', err);
    }
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  function update(dt, playerVelocity, isNoclip) {
    if (!tryInit()) return;

    // Footstep timing: only when moving on the ground (not in noclip).
    if (!isNoclip && playerVelocity) {
      const hSpeed = Math.sqrt(
        playerVelocity.x * playerVelocity.x +
        playerVelocity.z * playerVelocity.z
      );

      if (hSpeed > 0.55) {
        // Sprint: ~2.6 steps/sec, walk: ~1.75 steps/sec.
        const stepInterval = hSpeed > 4.2 ? 0.38 : 0.57;
        footstepTimer -= dt;
        if (footstepTimer <= 0) {
          playOnce(footstepData, 0.18 + Math.random() * 0.04, 0.06);
          footstepTimer = stepInterval;
        }
      } else {
        // Reset timer when stopped so first step after moving is prompt.
        footstepTimer = 0.08;
      }
    }
  }

  function onReloadStart() {
    if (!tryInit()) return;
    playOnce(reloadClickData, 0.16, 0.04);
  }

  function onReloadComplete() {
    if (!tryInit()) return;
    playOnce(reloadDoneData, 0.19, 0.03);
  }

  function onPlayerDamage() {
    if (!tryInit()) return;
    playOnce(hurtData, 0.26, 0.07);
  }

  async function unlock() {
    await tryResumeSharedAudio();
    // Start ambient now that the audio context is running.
    if (tryInit()) startAmbientLoop();
  }

  function clear() {
    for (const v of activeVoices) {
      try { v.source.stop(); } catch { /* ignore */ }
    }
    activeVoices.length = 0;

    if (ambientSource) {
      try { ambientSource.stop(); } catch { /* ignore */ }
      ambientSource = null;
      ambientStarted = false;
    }

    footstepTimer = 0;
  }

  return {
    update,
    onReloadStart,
    onReloadComplete,
    onPlayerDamage,
    unlock,
    clear,
  };
}
