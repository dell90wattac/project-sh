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

function envelope(t, attack, decay) {
  if (t <= 0) return 0;
  if (t < attack) {
    return t / Math.max(attack, 0.00001);
  }
  return Math.exp(-(t - attack) * decay);
}

function buildShotBuffer(context, recipe) {
  const sampleRate = context.sampleRate;
  const sampleCount = Math.max(1, Math.floor(recipe.duration * sampleRate));
  const buffer = context.createBuffer(1, sampleCount, sampleRate);
  const out = buffer.getChannelData(0);
  const rand = createSeededRandom(recipe.seed);

  let phase = 0;
  let lastFiltered = 0;

  for (let i = 0; i < sampleCount; i++) {
    const t = i / sampleRate;
    const normalized = clamp(t / recipe.duration, 0, 1);
    const freq = recipe.freqStart + (recipe.freqEnd - recipe.freqStart) * normalized;
    phase += (freq / sampleRate) * TWO_PI;

    const noise = (rand() * 2 - 1);
    const tone = Math.sin(phase);

    const env = envelope(t, recipe.attack, recipe.decay);
    const mixed = tone * recipe.toneMix + noise * recipe.noiseMix;
    const crunchEnv = Math.exp(-t * recipe.crunchDecay);
    const crunch = noise * recipe.crunchNoiseMix * crunchEnv;

    // Gentle one-pole lowpass to avoid harsh digital fizz.
    const alpha = recipe.lowpassAlpha;
    lastFiltered += (mixed - lastFiltered) * alpha;

    const preDrive = (lastFiltered * env) + crunch;
    const driven = Math.tanh(preDrive * recipe.drive) / Math.tanh(recipe.drive);
    out[i] = driven * recipe.outputGain;
  }

  return buffer;
}

const RECIPES = Object.freeze({
  standard: {
    seed: 1337,
    duration: 0.13,
    attack: 0.002,
    decay: 34,
    freqStart: 265,
    freqEnd: 112,
    toneMix: 0.52,
    noiseMix: 0.48,
    lowpassAlpha: 0.36,
    crunchNoiseMix: 0.17,
    crunchDecay: 42,
    drive: 1.5,
    outputGain: 0.92,
    gain: 0.18,
    pitchJitter: 0.03,
  },
  heavyHandgun: {
    seed: 4242,
    duration: 0.2,
    attack: 0.003,
    decay: 24,
    freqStart: 178,
    freqEnd: 64,
    toneMix: 0.58,
    noiseMix: 0.42,
    lowpassAlpha: 0.28,
    crunchNoiseMix: 0.2,
    crunchDecay: 34,
    drive: 1.8,
    outputGain: 0.95,
    gain: 0.23,
    pitchJitter: 0.02,
  },
});

export function createGunshotAudio() {
  let warned = false;
  let initialized = false;
  let audioNodes = null;
  const buffersByProfile = new Map();
  const activeVoices = [];
  const maxVoices = 6;

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

      for (const [profileKey, recipe] of Object.entries(RECIPES)) {
        buffersByProfile.set(profileKey, buildShotBuffer(audioNodes.context, recipe));
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
    const voice = activeVoices.shift();
    if (!voice) return;
    try {
      voice.source.stop();
    } catch {
      // Ignore stop races.
    }
  }

  function playShot(ammoConfig) {
    if (!tryInit() || !audioNodes) return;

    const profileKey = ammoConfig?.audioProfileKey || 'standard';
    const recipe = RECIPES[profileKey] || RECIPES.standard;
    const buffer = buffersByProfile.get(profileKey) || buffersByProfile.get('standard');
    if (!buffer) return;

    const ctx = audioNodes.context;
    const now = ctx.currentTime;
    cleanupFinishedVoices(now);
    stealOldestVoice();

    const jitterBase = Number.isFinite(ammoConfig?.audioPitchJitter)
      ? ammoConfig.audioPitchJitter
      : recipe.pitchJitter;
    const gainBase = Number.isFinite(ammoConfig?.audioGain)
      ? ammoConfig.audioGain
      : recipe.gain;

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gainNode = ctx.createGain();
    const startGain = clamp(gainBase, 0.02, 0.28);
    gainNode.gain.setValueAtTime(startGain, now);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + recipe.duration);

    const jitter = (Math.random() * 2 - 1) * clamp(jitterBase, 0, 0.08);
    source.playbackRate.value = 1 + jitter;

    source.connect(gainNode);
    gainNode.connect(audioNodes.masterGain);

    source.start(now);

    const endTime = now + recipe.duration + 0.02;
    activeVoices.push({ source, endTime });
    source.onended = () => {
      const idx = activeVoices.findIndex(v => v.source === source);
      if (idx >= 0) activeVoices.splice(idx, 1);
    };
  }

  async function unlock() {
    await tryResumeSharedAudio();
  }

  function clear() {
    for (const voice of activeVoices) {
      try {
        voice.source.stop();
      } catch {
        // Ignore stop races.
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
