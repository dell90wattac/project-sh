// ─── Health System ──────────────────────────────────────────────────────────
// Universal health system for player AND enemies.
// Health scale: 0–10 (10 = fully healthy, 0 = dead).
// Damage can range from 0–10 depending on attack/weapon.
// Resistances prepped for future use (reduces incoming damage by type).

export function createHealth(maxHealth = 10) {
  let health = maxHealth;
  let dead = false;
  let invincible = false;

  // Resistance map — reduces damage of a given type by a flat amount.
  // Example: { fire: 2 } means fire damage is reduced by 2.
  // Empty by default; add resistances via setResistance().
  const resistances = {};

  // Callbacks for events (UI hooks, death triggers, etc.)
  let onDamageCallback = null;
  let onDeathCallback = null;
  let onHealCallback = null;

  return {
    // Take damage. Type is optional (for future damage types like 'fire', 'blunt', etc.)
    // Returns actual damage dealt after resistances.
    takeDamage(amount, type = 'generic') {
      if (dead) return 0;
      if (invincible) return 0;

      // Apply resistance if one exists for this damage type
      let finalDamage = amount;
      if (resistances[type]) {
        finalDamage = Math.max(0, amount - resistances[type]);
      }

      health = Math.max(0, health - finalDamage);

      if (onDamageCallback) onDamageCallback(finalDamage, health, type);

      if (health <= 0) {
        dead = true;
        if (onDeathCallback) onDeathCallback();
      }

      return finalDamage;
    },

    // Heal. Won't exceed max health. Returns actual amount healed.
    heal(amount) {
      if (dead) return 0;
      const before = health;
      health = Math.min(maxHealth, health + amount);
      const healed = health - before;
      if (onHealCallback && healed > 0) onHealCallback(healed, health);
      return healed;
    },

    // Getters
    getHealth()    { return health; },
    getMaxHealth() { return maxHealth; },
    isDead()       { return dead; },
    isInvincible() { return invincible; },

    // Set a resistance for a damage type (flat reduction).
    // e.g. setResistance('fire', 2) — fire attacks do 2 less damage.
    setResistance(type, amount) {
      resistances[type] = amount;
    },

    getResistance(type) {
      return resistances[type] || 0;
    },

    // Reset to full health (for respawn / game reset)
    reset() {
      health = maxHealth;
      dead = false;
      invincible = false;
    },

    setInvincible(enabled) { invincible = !!enabled; },

    // Event hooks
    onDamage(fn) { onDamageCallback = fn; },
    onDeath(fn)  { onDeathCallback = fn; },
    onHeal(fn)   { onHealCallback = fn; },
  };
}
