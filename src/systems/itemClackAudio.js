import * as THREE from 'three';
import { getSharedAudioNodes, tryResumeSharedAudio } from './audioShared.js';

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

function buildClackBuffer(context) {
  // A deep, heavy thud — stone or wood shifting in a dark space.
  // Low woody thump (~280Hz) + slow resonance ring (~85Hz) + bandpass noise burst.
  const duration = 0.22;
  const sampleRate = context.sampleRate;
  const sampleCount = Math.max(1, Math.floor(duration * sampleRate));
  const buffer = context.createBuffer(1, sampleCount, sampleRate);
  const out = buffer.getChannelData(0);
  const rand = createSeededRandom(889);

  let lp = 0;
  let hp = 0;
  let woodPhase = 0;
  let resonPhase = 0;

  for (let i = 0; i < sampleCount; i++) {
    const t = i / sampleRate;

    // Sharp initial hit decays fast; low resonance rings on longer.
    const transientEnv = Math.exp(-38 * t);
    const resonEnv    = Math.exp(-7 * t);

    // Woody thump at 280Hz — much lower and darker than the old 980Hz tone.
    woodPhase  += (280 / sampleRate) * Math.PI * 2;
    const wood  = Math.sin(woodPhase) * 0.62;

    // Sub resonance at 85Hz — adds physical weight.
    resonPhase += (85 / sampleRate) * Math.PI * 2;
    const reson = Math.sin(resonPhase) * resonEnv * 0.44;

    // Bandpass noise ~200–700Hz for texture (not bright, not muddy).
    const noise = rand() * 2 - 1;
    lp += (noise - lp) * 0.52;       // LP cutoff ~3.5kHz
    hp += (lp - hp) * 0.045;         // HP cutoff ~300Hz
    const bandNoise = lp - hp;

    const raw = (wood + bandNoise * 0.55) * transientEnv + reson;

    out[i] = Math.tanh(raw * 1.65) / Math.tanh(1.65) * 1.1;
  }

  return { buffer, duration };
}

export function createItemClackAudio(listenerProvider, options = {}) {
  const debug = options.debug === true;

  let warned = false;
  let initialized = false;
  let audioNodes = null;
  let clackData = null;

  const debugStats = {
    triggerCalls: 0,
    invalidHitsPayload: 0,
    totalHitsSeen: 0,
    eligibleHitsSeen: 0,
    cooldownSkips: 0,
    requestsQueued: 0,
    tapsScheduled: 0,
    fallbackShots: 0,
    initFailures: 0,
    panFallbackUsed: 0,
    lastContextState: 'unknown',
    lastReason: 'none',
  };

  const eligibleTypes = new Set(['shakeable', 'chandelier', 'door']);
  const targetCooldownUntil = new WeakMap();
  const targetTemp = new THREE.Vector3();

  const activeVoices = [];
  const maxVoices = 48;
  const FOLLOWUP_TAIL_ITEMS = 8;
  const TARGET_COOLDOWN = 0.18;
  const CLACK_BUS_CEILING = 0.42;
  const MIN_BUS_SCALE = 0.62;
  const WALL_CLATTER_GAIN = 0.04;

  function warnOnce(message, error) {
    if (warned) return;
    warned = true;
    console.warn(message, error || '');
  }

  function logDebug(label, extra = null) {
    if (!debug) return;
    if (extra) {
      console.log(`[ClackDBG] ${label}`, extra);
      return;
    }
    console.log(`[ClackDBG] ${label}`);
  }

  function tryInit() {
    if (initialized) return true;
    initialized = true;

    try {
      audioNodes = getSharedAudioNodes();
      if (!audioNodes) return false;
      clackData = buildClackBuffer(audioNodes.context);
      debugStats.lastContextState = audioNodes.context.state;
      logDebug('init ok', { sampleRate: audioNodes.context.sampleRate, state: audioNodes.context.state });
      return true;
    } catch (error) {
      debugStats.initFailures++;
      warnOnce('[Audio] Item clack audio init failed; continuing silently.', error);
      logDebug('init failed', error);
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

  function voiceStealIfNeeded() {
    if (activeVoices.length < maxVoices) return;
    activeVoices.sort((a, b) => a.endTime - b.endTime);
    const victim = activeVoices.shift();
    if (!victim) return;
    try {
      victim.source.stop();
    } catch {
      // Ignore stop races.
    }
  }

  function computeStereoPan(targetPosition, listenerPosition) {
    if (!targetPosition || !listenerPosition) return 0;
    const dx = targetPosition.x - listenerPosition.x;
    return clamp(dx / 6, -0.75, 0.75);
  }

  function computeBaseGain(hit) {
    const magnitude = Number.isFinite(hit?.magnitude) ? hit.magnitude : 0;
    const falloff = Number.isFinite(hit?.falloff) ? hit.falloff : 0;
    const distance = Number.isFinite(hit?.distance) ? hit.distance : 999;

    const magTerm = clamp(magnitude / 16, 0, 1);
    const distanceTerm = clamp(1 - distance / 12, 0, 1);
    const combined = 0.5 * magTerm + 0.5 * Math.max(falloff, distanceTerm);

    // Stay quiet by design: never exceed this per-target base.
    return clamp(0.045 + combined * 0.055, 0.035, 0.12);
  }

  function createPanNode(ctx, pan) {
    if (typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      return panner;
    }

    debugStats.panFallbackUsed++;
    const fallbackGain = ctx.createGain();
    fallbackGain.gain.value = 1;
    return fallbackGain;
  }

  function scheduleClackTap(ctx, now, pan, baseGain, playbackRate, delaySeconds) {
    if (!clackData?.buffer) return;

    cleanupFinishedVoices(now);
    voiceStealIfNeeded();

    const source = ctx.createBufferSource();
    source.buffer = clackData.buffer;
    source.playbackRate.value = playbackRate;

    const gainNode = ctx.createGain();
    const panNode = createPanNode(ctx, pan);

    const tapStart = now + delaySeconds;
    const tapDuration = clackData.duration;

    gainNode.gain.setValueAtTime(clamp(baseGain, 0.002, 0.14), tapStart);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, tapStart + tapDuration);

    source.connect(gainNode);
    gainNode.connect(panNode);
    panNode.connect(audioNodes.masterGain);

    source.start(tapStart);
    debugStats.tapsScheduled++;

    const endTime = tapStart + tapDuration + 0.03;
    activeVoices.push({ source, endTime });
    source.onended = () => {
      const idx = activeVoices.findIndex(v => v.source === source);
      if (idx >= 0) activeVoices.splice(idx, 1);
    };
  }

  function triggerFromShockwave(hits = [], shockOrigin = null) {
    debugStats.triggerCalls++;
    debugStats.lastReason = 'shockwave';

    if (!Array.isArray(hits)) {
      debugStats.invalidHitsPayload++;
      logDebug('invalid hits payload', { hitsType: typeof hits });
      return;
    }

    if (!tryInit() || !audioNodes) return;

    const ctx = audioNodes.context;
    const now = ctx.currentTime;
    debugStats.lastContextState = ctx.state;
    cleanupFinishedVoices(now);

    const listenerPosition = typeof listenerProvider === 'function' ? listenerProvider() : null;

    debugStats.totalHitsSeen += hits.length;

    const filtered = hits
      .filter(hit => hit && eligibleTypes.has(hit.type))
      .sort((a, b) => a.distance - b.distance);

    debugStats.eligibleHitsSeen += filtered.length;

    let busRequested = 0;
    const requests = [];

    for (let i = 0; i < filtered.length; i++) {
      const hit = filtered[i];
      const targetRef = hit.targetRef;
      if (targetRef) {
        const lockedUntil = targetCooldownUntil.get(targetRef) || 0;
        if (lockedUntil > now) {
          debugStats.cooldownSkips++;
          continue;
        }
        targetCooldownUntil.set(targetRef, now + TARGET_COOLDOWN);
      }

      const baseGain = computeBaseGain(hit);
      busRequested += baseGain;
      requests.push({ hit, baseGain, index: i });
    }

    debugStats.requestsQueued += requests.length;

    if (requests.length === 0 || filtered.length === 0) {
      // Fallback wall reflections so the environment still gives a faint rattle
      // even when no eligible dynamic targets are in range.
      debugStats.fallbackShots++;
      scheduleClackTap(ctx, now, -0.45, WALL_CLATTER_GAIN, 0.9 + Math.random() * 0.04, 0.03);
      scheduleClackTap(ctx, now, 0.45, WALL_CLATTER_GAIN * 0.85, 0.85 + Math.random() * 0.04, 0.11);
      logDebug('fallback clatter', {
        hits: hits.length,
        eligible: filtered.length,
        queued: requests.length,
        ctxState: ctx.state,
      });
      return;
    }

    const busScale = busRequested > CLACK_BUS_CEILING
      ? Math.max(MIN_BUS_SCALE, CLACK_BUS_CEILING / busRequested)
      : 1;

    for (let i = 0; i < requests.length; i++) {
      const req = requests[i];
      const hit = req.hit;
      const position = hit.position || shockOrigin || targetTemp.set(0, 0, 0);
      const pan = computeStereoPan(position, listenerPosition);
      const scaledBase = req.baseGain * busScale;

      // Every affected item gets an initial clack.
      scheduleClackTap(ctx, now, pan, scaledBase, 1.0 + Math.random() * 0.05, 0.03);

      // Only the strongest early set gets full shake-tail taps to avoid
      // excessive layering when many objects are affected at once.
      if (i < FOLLOWUP_TAIL_ITEMS) {
        scheduleClackTap(ctx, now, pan, scaledBase * 0.55, 0.95 + Math.random() * 0.05, 0.08);
        scheduleClackTap(ctx, now, pan, scaledBase * 0.3, 0.9 + Math.random() * 0.05, 0.17);
      }
    }

    logDebug('clacks scheduled', {
      hits: hits.length,
      eligible: filtered.length,
      queued: requests.length,
      busRequested: Number(busRequested.toFixed(4)),
      busScale: Number(busScale.toFixed(4)),
      activeVoices: activeVoices.length,
      ctxState: ctx.state,
    });
  }

  function playDebugPing(reason = 'manual') {
    if (!tryInit() || !audioNodes || !clackData?.buffer) return false;
    const ctx = audioNodes.context;
    const now = ctx.currentTime;
    debugStats.lastReason = String(reason || 'manual');
    scheduleClackTap(ctx, now, 0, 0.08, 1, 0);
    scheduleClackTap(ctx, now, 0, 0.05, 0.92, 0.1);
    logDebug('debug ping', { reason: debugStats.lastReason, ctxState: ctx.state });
    return true;
  }

  function getDebugSnapshot() {
    const contextState = audioNodes?.context?.state || 'no-context';
    return {
      ...debugStats,
      contextState,
      activeVoices: activeVoices.length,
      hasBuffer: !!clackData?.buffer,
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
    triggerFromShockwave,
    unlock,
    clear,
    playDebugPing,
    getDebugSnapshot,
  };
}
