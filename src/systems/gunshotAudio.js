import { getSharedAudioNodes, tryResumeSharedAudio } from './audioShared.js';

const TWO_PI = Math.PI * 2;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createSeededRandom(seed) {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// ─── Crack Layer ─────────────────────────────────────────────────────────────
// The sharp high-frequency snap of the shot — very short, bright, punchy.
function buildCrackBuffer(context, seed) {
  const duration = 0.038;
  const sampleRate = context.sampleRate;
  const sampleCount = Math.max(1, Math.floor(duration * sampleRate));
  const buffer = context.createBuffer(1, sampleCount, sampleRate);
  const out = buffer.getChannelData(0);
  const rand = createSeededRandom(seed);

  let lp1 = 0;
  let hp1 = 0;

  for (let i = 0; i < sampleCount; i++) {
    const t = i / sampleRate;
    const env = Math.exp(-170 * t);

    const noise = rand() * 2 - 1;

    // Band-shape via LP then HP: passes ~500Hz–7kHz band.
    lp1 += (noise - lp1) * 0.88;       // LP cutoff ~8kHz
    hp1 += (lp1 - hp1) * 0.068;        // HP cutoff ~500Hz
    const band = lp1 - hp1;

    const driven = Math.tanh(band * env * 3.4) / Math.tanh(3.4);
    out[i] = driven * 0.92;
  }

  return { buffer, duration };
}

// ─── Body Layer ───────────────────────────────────────────────────────────────
// The low bassy boom — a descending sine sweep with noise texture.
function buildBodyBuffer(context, recipe) {
  const duration = recipe.bodyDuration;
  const sampleRate = context.sampleRate;
  const sampleCount = Math.max(1, Math.floor(duration * sampleRate));
  const buffer = context.createBuffer(1, sampleCount, sampleRate);
  const out = buffer.getChannelData(0);
  const rand = createSeededRandom(recipe.bodySeed);

  let phase = 0;
  let lp = 0;

  for (let i = 0; i < sampleCount; i++) {
    const t = i / sampleRate;
    const normalized = t / duration;
    const env = Math.exp(-recipe.bodyDecay * t);

    // Frequency sweep: high start drops to low end (non-linear, faster at start)
    const freq = recipe.freqStart + (recipe.freqEnd - recipe.freqStart) * Math.pow(normalized, 0.6);
    phase += (freq / sampleRate) * TWO_PI;

    const tone = Math.sin(phase);
    const noise = (rand() * 2 - 1) * 0.22;
    const raw = tone * 0.78 + noise;

    // Heavy lowpass gives warm, bassy character
    lp += (raw - lp) * recipe.bodyLpAlpha;

    const driven = Math.tanh(lp * env * recipe.bodyDrive) / Math.tanh(recipe.bodyDrive);
    out[i] = driven * 0.9;
  }

  return { buffer, duration };
}

// ─── Recipes ─────────────────────────────────────────────────────────────────
const RECIPES = Object.freeze({
  standard: {
    crackSeed: 1337,
    crackGain: 0.20,
    bodySeed: 1338,
    bodyDuration: 0.17,
    freqStart: 205,
    freqEnd: 55,
    bodyDecay: 21,
    bodyLpAlpha: 0.13,
    bodyDrive: 1.55,
    bodyGain: 0.17,
    pitchJitter: 0.025,
  },
  heavyHandgun: {
    crackSeed: 4242,
    crackGain: 0.23,
    bodySeed: 4243,
    bodyDuration: 0.24,
    freqStart: 165,
    freqEnd: 40,
    bodyDecay: 13,
    bodyLpAlpha: 0.09,
    bodyDrive: 1.9,
    bodyGain: 0.21,
    pitchJitter: 0.018,
  },
});

export function createGunshotAudio() {
  let warned = false;
  let initialized = false;
  let audioNodes = null;
  const buffersByProfile = new Map(); // profileKey → { crack, body }
  const activeVoices = [];
  const maxVoices = 8;

  function warnOnce(message, error) {
    if (warned) return;
    warned = true;
    console.warn(message, error || '');
  }

  function tryInit() {
    if (initialized) return true;
    initialized = true;

    try {
      audioNodes = getSharedAudioNodes();
      if (!audioNodes) return false;

      for (const [key, recipe] of Object.entries(RECIPES)) {
        buffersByProfile.set(key, {
          crack: buildCrackBuffer(audioNodes.context, recipe.crackSeed),
          body: buildBodyBuffer(audioNodes.context, recipe),
        });
      }

      return true;
    } catch (error) {
      warnOnce('[Audio] Gunshot audio init failed; continuing silently.', error);
      return false;
    }
  }

  function cleanupFinishedVoices(now) {
    for (let i = activeVoices.length - 1; i >= 0; i--) {
      if (activeVoices[i].endTime <= now) {
        activeVoices.splice(i, 1);
      }
    }
  }

  function stealOldestVoice() {
    if (activeVoices.length < maxVoices) return;
    activeVoices.sort((a, b) => a.endTime - b.endTime);
    const victim = activeVoices.shift();
    if (!victim) return;
    for (const src of victim.sources) {
      try { src.stop(); } catch { /* ignore stop races */ }
    }
  }

  function playLayer(layerData, gainAmount, playbackRate, now) {
    if (!layerData?.buffer || !audioNodes) return null;

    const ctx = audioNodes.context;
    const source = ctx.createBufferSource();
    source.buffer = layerData.buffer;
    source.playbackRate.value = playbackRate;

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(clamp(gainAmount, 0.01, 0.35), now);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + layerData.duration);

    source.connect(gainNode);
    gainNode.connect(audioNodes.masterGain);
    source.start(now);

    return { source, endTime: now + layerData.duration + 0.02 };
  }

  function playShot(ammoConfig) {
    if (!tryInit() || !audioNodes) return;

    const profileKey = ammoConfig?.audioProfileKey || 'standard';
    const recipe = RECIPES[profileKey] || RECIPES.standard;
    const layers = buffersByProfile.get(profileKey) || buffersByProfile.get('standard');
    if (!layers) return;

    const ctx = audioNodes.context;
    const now = ctx.currentTime;
    cleanupFinishedVoices(now);
    stealOldestVoice();

    const jitterBase = Number.isFinite(ammoConfig?.audioPitchJitter)
      ? ammoConfig.audioPitchJitter
      : recipe.pitchJitter;
    const jitter = (Math.random() * 2 - 1) * clamp(jitterBase, 0, 0.08);
    const rate = 1 + jitter;

    const crackVoice = playLayer(layers.crack, recipe.crackGain, rate, now);
    const bodyVoice  = playLayer(layers.body,  recipe.bodyGain,  rate * 0.98, now);

    const endTime = Math.max(
      crackVoice?.endTime ?? now,
      bodyVoice?.endTime ?? now,
    );

    const sources = [
      crackVoice?.source,
      bodyVoice?.source,
    ].filter(Boolean);

    if (sources.length > 0) {
      const voiceEntry = { sources, endTime };
      activeVoices.push(voiceEntry);
      for (const src of sources) {
        src.onended = () => {
          const idx = activeVoices.indexOf(voiceEntry);
          if (idx >= 0) activeVoices.splice(idx, 1);
        };
      }
    }
  }

  async function unlock() {
    await tryResumeSharedAudio();
  }

  function clear() {
    for (const voice of activeVoices) {
      for (const src of voice.sources) {
        try { src.stop(); } catch { /* ignore */ }
      }
    }
    activeVoices.length = 0;
  }

  return {
    playShot,
    unlock,
    clear,
  };
}
