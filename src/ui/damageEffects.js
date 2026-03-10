/**
 * Damage Visual Effects
 * - Red heartbeat vignette at health ≤3 (slow pulse, slight red tint)
 * - Heavier/faster/redder pulse at health 1
 * - Death screen: full red fade → game reset after delay
 */
export function createDamageEffects(playerHealth) {
  // ── Heartbeat vignette overlay ────────────────────────────────────────────
  const vignette = document.createElement('div');
  vignette.id = 'damage-vignette';
  vignette.style.cssText = `
    position: fixed;
    top: 0; left: 0;
    width: 100%; height: 100%;
    pointer-events: none;
    z-index: 90;
    opacity: 0;
    transition: none;
    background: radial-gradient(ellipse at center, transparent 40%, rgba(180, 0, 0, 0.6) 100%);
  `;

  // ── Death screen overlay ──────────────────────────────────────────────────
  const deathScreen = document.createElement('div');
  deathScreen.id = 'death-screen';
  deathScreen.style.cssText = `
    position: fixed;
    top: 0; left: 0;
    width: 100%; height: 100%;
    pointer-events: none;
    z-index: 500;
    opacity: 0;
    background: #220000;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    transition: opacity 1.5s ease-in;
  `;

  const deathText = document.createElement('div');
  deathText.textContent = 'YOU DIED';
  deathText.style.cssText = `
    color: #cc0000;
    font-family: monospace;
    font-size: 48px;
    font-weight: bold;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    opacity: 0;
    transition: opacity 2s ease-in 0.5s;
  `;
  deathScreen.appendChild(deathText);

  const uiRoot = document.getElementById('ui-root') || document.body;
  uiRoot.appendChild(vignette);
  uiRoot.appendChild(deathScreen);

  // ── Heartbeat state ───────────────────────────────────────────────────────
  let heartbeatPhase = 0;
  let isDying = false;
  let deathTimer = 0;
  const DEATH_RESET_DELAY = 4.0; // seconds before game resets
  let onResetCallback = null;

  // ── Damage flash state ────────────────────────────────────────────────────
  let flashIntensity = 0; // brief flash when taking damage

  return {
    update(dt) {
      const hp = playerHealth.getHealth();

      // ── Damage flash decay ──────────────────────────────────────────────
      if (flashIntensity > 0) {
        flashIntensity = Math.max(0, flashIntensity - dt * 3);
      }

      // ── Death state ─────────────────────────────────────────────────────
      if (isDying) {
        deathTimer += dt;
        if (deathTimer >= DEATH_RESET_DELAY && onResetCallback) {
          onResetCallback();
        }
        return; // Don't process heartbeat during death
      }

      // ── Heartbeat at low health ─────────────────────────────────────────
      if (hp <= 3 && hp > 0) {
        // Pulse speed: faster at lower health
        // Health 3: slow beat (~0.8 Hz), Health 1: fast beat (~1.6 Hz)
        const beatSpeed = hp === 1 ? 10 : (hp === 2 ? 7 : 5);
        heartbeatPhase += dt * beatSpeed;

        // Heartbeat shape: sharp spike then quick falloff (like a real heartbeat)
        const raw = Math.sin(heartbeatPhase);
        const beat = Math.max(0, raw) ** 2; // Only positive half, squared for sharp pulse

        // Intensity scales with how hurt you are
        // Health 3: subtle (0.15-0.35), Health 1: heavy (0.3-0.7)
        let minOpacity, maxOpacity;
        if (hp === 1) {
          minOpacity = 0.3;
          maxOpacity = 0.7;
          vignette.style.background = 'radial-gradient(ellipse at center, transparent 30%, rgba(200, 0, 0, 0.8) 100%)';
        } else if (hp === 2) {
          minOpacity = 0.2;
          maxOpacity = 0.5;
          vignette.style.background = 'radial-gradient(ellipse at center, transparent 35%, rgba(180, 0, 0, 0.7) 100%)';
        } else {
          minOpacity = 0.1;
          maxOpacity = 0.35;
          vignette.style.background = 'radial-gradient(ellipse at center, transparent 40%, rgba(160, 0, 0, 0.6) 100%)';
        }

        const opacity = minOpacity + beat * (maxOpacity - minOpacity);
        vignette.style.opacity = Math.min(1, opacity + flashIntensity).toString();
      } else if (hp > 3) {
        // Above 3 health: only show damage flash
        heartbeatPhase = 0;
        vignette.style.background = 'radial-gradient(ellipse at center, transparent 40%, rgba(180, 0, 0, 0.6) 100%)';
        vignette.style.opacity = flashIntensity.toString();
      }
    },

    // Call this when player takes damage (brief red flash)
    flashDamage() {
      flashIntensity = 0.6;
    },

    // Trigger death sequence
    triggerDeath() {
      isDying = true;
      deathTimer = 0;
      vignette.style.opacity = '0';
      deathScreen.style.opacity = '1';
      deathScreen.style.pointerEvents = 'all';
      deathText.style.opacity = '1';
    },

    // Reset visuals (after game reset)
    reset() {
      isDying = false;
      deathTimer = 0;
      heartbeatPhase = 0;
      flashIntensity = 0;
      vignette.style.opacity = '0';
      deathScreen.style.opacity = '0';
      deathScreen.style.pointerEvents = 'none';
      deathText.style.opacity = '0';
    },

    // Set callback for when death timer expires → game reset
    onReset(fn) { onResetCallback = fn; },

    isDying() { return isDying; },

    destroy() {
      vignette.remove();
      deathScreen.remove();
    },
  };
}
