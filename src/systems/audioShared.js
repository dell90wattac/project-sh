let sharedContext = null;
let sharedMasterGain = null;
let unlockHooksBound = false;

function canUseAudioContext() {
  return typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
}

function getAudioContextCtor() {
  return window.AudioContext || window.webkitAudioContext;
}

function bindUnlockHooks() {
  if (unlockHooksBound || typeof window === 'undefined') return;
  unlockHooksBound = true;

  const unlock = async () => {
    if (!sharedContext) return;
    if (sharedContext.state !== 'suspended') return;
    try {
      await sharedContext.resume();
    } catch {
      // Best effort only; audio remains optional.
    }
  };

  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock, { passive: true });
}

export function getSharedAudioNodes() {
  if (!canUseAudioContext()) return null;

  if (!sharedContext) {
    const Ctor = getAudioContextCtor();
    sharedContext = new Ctor();
    sharedMasterGain = sharedContext.createGain();
    sharedMasterGain.gain.value = 0.85;
    sharedMasterGain.connect(sharedContext.destination);
  }

  bindUnlockHooks();

  return {
    context: sharedContext,
    masterGain: sharedMasterGain,
  };
}

export async function tryResumeSharedAudio() {
  if (!sharedContext) return;
  if (sharedContext.state !== 'suspended') return;
  try {
    await sharedContext.resume();
  } catch {
    // Silent fail: gameplay should not depend on audio.
  }
}
