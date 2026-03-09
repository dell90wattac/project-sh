/**
 * HUD - Heads-Up Display
 * Bottom-right corner: Health (1-10 scale) + Ammo (MAG / RESERVE)
 */
export function createHUD(gun, playerHealth) {
  const hudContainer = document.createElement('div');
  hudContainer.id = 'hud-container';
  hudContainer.style.cssText = `
    position: fixed;
    bottom: 30px;
    right: 30px;
    color: #cccccc;
    font-family: monospace;
    font-size: 14px;
    font-weight: bold;
    z-index: 100;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
  `;

  // ── Health display ────────────────────────────────────────────────────────
  const healthRow = document.createElement('div');
  healthRow.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
  `;

  const healthLabel = document.createElement('span');
  healthLabel.textContent = 'HP';
  healthLabel.style.cssText = `
    font-size: 11px;
    color: #888;
    letter-spacing: 0.1em;
  `;

  const healthPips = document.createElement('div');
  healthPips.style.cssText = `
    display: flex;
    gap: 3px;
    align-items: center;
  `;

  // Create 10 pip elements
  const pips = [];
  for (let i = 0; i < 10; i++) {
    const pip = document.createElement('div');
    pip.style.cssText = `
      width: 6px;
      height: 14px;
      background: #00cc44;
      border-radius: 1px;
      transition: background 0.3s, opacity 0.3s;
    `;
    pips.push(pip);
    healthPips.appendChild(pip);
  }

  healthRow.appendChild(healthLabel);
  healthRow.appendChild(healthPips);

  // ── Ammo display ──────────────────────────────────────────────────────────
  const ammoRow = document.createElement('div');
  ammoRow.style.cssText = `
    display: flex;
    align-items: baseline;
    gap: 6px;
  `;

  const ammoLabel = document.createElement('span');
  ammoLabel.textContent = 'AMMO';
  ammoLabel.style.cssText = `
    font-size: 11px;
    color: #888;
    letter-spacing: 0.1em;
  `;

  const ammoDisplay = document.createElement('span');
  ammoDisplay.style.cssText = `
    font-size: 18px;
    color: #00ff00;
    text-shadow: 0 0 8px rgba(0, 255, 0, 0.4);
    letter-spacing: 0.05em;
  `;

  ammoRow.appendChild(ammoLabel);
  ammoRow.appendChild(ammoDisplay);

  hudContainer.appendChild(healthRow);
  hudContainer.appendChild(ammoRow);

  const uiRoot = document.getElementById('ui-root') || document.body;
  uiRoot.appendChild(hudContainer);

  return {
    update(dt) {
      // ── Update health pips ──────────────────────────────────────────────
      const hp = playerHealth.getHealth();
      for (let i = 0; i < 10; i++) {
        if (i < hp) {
          pips[i].style.opacity = '1';
          if (hp <= 1) {
            pips[i].style.background = '#ff0000';
          } else if (hp <= 3) {
            pips[i].style.background = '#ff4400';
          } else if (hp <= 5) {
            pips[i].style.background = '#ffaa00';
          } else {
            pips[i].style.background = '#00cc44';
          }
        } else {
          pips[i].style.opacity = '0.15';
          pips[i].style.background = '#333';
        }
      }

      // ── Update ammo ────────────────────────────────────────────────────
      const ammoState = gun.getAmmoState();
      ammoDisplay.textContent = `${ammoState.currentMag} / ${ammoState.reserve}`;

      if (ammoState.currentMag === 0) {
        ammoDisplay.style.color = '#ff0000';
        ammoDisplay.style.textShadow = '0 0 8px rgba(255, 0, 0, 0.4)';
      } else if (ammoState.currentMag < 3) {
        ammoDisplay.style.color = '#ffaa00';
        ammoDisplay.style.textShadow = '0 0 8px rgba(255, 170, 0, 0.4)';
      } else {
        ammoDisplay.style.color = '#00ff00';
        ammoDisplay.style.textShadow = '0 0 8px rgba(0, 255, 0, 0.4)';
      }
    },

    destroy() {
      hudContainer.remove();
    },
  };
}
