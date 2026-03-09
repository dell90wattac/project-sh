# PROJECT SH — Design Bible
*High-level reference for AI agents. Keep entries brief and structural. Session details go in CHANGELOG.md.*

---

## Concept
First-person survival horror in the browser. No game engine — pure Three.js + vanilla JS.
Built collaboratively: AI agents write all code, the user provides design direction.

---

## Git / Source Control
**Repository:** https://github.com/dell90wattac/project-sh

> **START OF SESSION RULE:** Always `git pull origin main` before making any changes. This applies on any machine, including Claude Code on the web.

| Action | Command |
|--------|---------|
| Pull latest | `git pull origin main` |
| Push changes | `git add . && git commit -m "message" && git push origin main` |
| First-time setup on new machine | `git clone https://github.com/dell90wattac/project-sh.git` then `npm install` |

---

## Tech Stack
| Layer | Tech |
|-------|------|
| Renderer | Three.js 0.169.0 (CDN importmap) |
| Physics | Cannon-es 0.20.0 (CDN) |
| Audio | Web Audio API (not yet implemented) |
| Language | Vanilla JS, ES Modules, no bundler |
| Entry | `index.html` → `src/main.js` |
| Dev server | `npx serve .` or VS Code Live Server |

---

## Project Structure
```
Project SH/
├── index.html                   ← Entry point, importmap, overlay UI
├── src/
│   ├── main.js                  ← Game loop, scene setup, hazard/death logic
│   ├── world/
│   │   └── world.js             ← Environment geometry, colliders[], hazards[]
│   ├── player/
│   │   ├── player.js            ← Movement, collision, gravity, low-HP sway
│   │   └── viewmodel.js         ← First-person hands, flashlight, gun animations
│   ├── systems/
│   │   ├── health.js            ← Universal health factory (player + enemies)
│   │   ├── inventory.js         ← 9-slot grid + equipped slot logic
│   │   ├── weapons.js           ← Gun: fire, reload, ammo economy
│   │   ├── itemRegistry.js      ← All item definitions + combination recipes
│   │   ├── worldItems.js        ← 3D pickups, raycaster hover, pickup/drop
│   │   └── physics.js           ← Cannon-es world wrapper
│   └── ui/
│       ├── hud.js               ← Health pips + ammo counter (bottom-right)
│       ├── inventory.js         ← Inventory UI, context menu, combine mode
│       └── damageEffects.js     ← Vignette, heartbeat pulse, death screen
├── assets/
│   ├── textures/
│   ├── models/
│   ├── audio/
│   └── data/                    ← JSON configs (future)
├── CHANGELOG.md                 ← Full session history and implementation notes
└── PROJECT_BIBLE.md             ← This file
```

---

## Gameplay Pillars
1. **Tension over action** — scarcity, darkness, and sound drive fear
2. **Exploration** — environments reward careful movement
3. **Survival** — health, ammo, and items are scarce resources to manage

---

## Systems Overview

### Player (`src/player/player.js`)
- WASD + Shift sprint, spacebar jump, pointer lock mouse-look
- AABB collision with step-climbing; custom gravity (no physics engine for player)
- Camera sway at low HP — tunable in `player.js`

### Viewmodel (`src/player/viewmodel.js`)
- Dual first-person hands: left (flashlight), right (gun)
- Independent bob/sway per hand; recoil and reload animations
- Flashlight is a SpotLight parented to left hand — toggle with **F**

### Health (`src/systems/health.js`)
- Factory: `createHealth(maxHP)` — shared by player and enemies
- Scale 1–10. Supports damage types and flat resistances
- Callbacks: `onDamage`, `onDeath`, `onHeal`; `reset()` for respawn

### Gun (`src/systems/weapons.js`)
- Semi-auto hitscan raycast. Magazine + reserve ammo tracked separately
- **Real bullet economy:** unspent rounds lost on reload (see file for tunable constants)
- Fire: **left-click** | Reload: **R**

### Inventory (`src/systems/inventory.js` + `src/systems/itemRegistry.js`)
- 9-slot grid (3×3) + separate equipped weapon slot
- Items defined in `itemRegistry.js`: stackable, usable, equippable, combinable flags
- Combination recipes in `itemRegistry.js` (e.g. Herb + Spray = Mixed Medicine)
- Toggle: **E** (also picks up world items when looking at one)

### World Items (`src/systems/worldItems.js`)
- 3D rotating pickups in scene; raycaster detects hover from screen center
- Pickup range and hover label configurable in file
- Dropped items spawn at player feet

### Hazards (`src/world/world.js` + `src/main.js`)
- World exports `hazards[]` alongside `colliders[]`
- Each hazard: `{ position, radius, damagePerSecond, damageType }`
- Tick damage handled in main loop — timer logic in `main.js`

### HUD (`src/ui/hud.js`)
- 10 health pips (color shifts green → orange → red) + ammo counter
- All thresholds and colors tunable in `hud.js`

### Damage Effects (`src/ui/damageEffects.js`)
- CSS vignette with heartbeat pulse at low HP
- Damage flash on any hit; death screen on HP = 0 with auto-reset
- Timings and intensities tunable in file

---

## Architecture Patterns
- **Factory functions** everywhere: `createX(scene, ...)` returns `{ update(dt) }`
- **`main.js` orchestrates** — imports all systems, calls `.update(dt)` each frame
- **Pointer lock always active** — camera rotation frozen (not released) while inventory is open
- **Collision:** `colliders[]` = `THREE.Box3` array from world; player resolves via smallest-axis overlap push
- **Physics hybrid:** Player uses fast AABB; Cannon-es world ready for enemy rigidbodies

---

## Current Environment
- Grand cathedral museum — dimensions and furniture defined in `src/world/world.js`
- Entrance staircase, side staircases, back balcony, desk, benches, chandeliers
- One damage pillar hazard (placeholder enemy/hazard stand-in)
- Starting loadout defined in `main.js` (`resetGame` / init block)

---

## Roadmap (Next Up)
- Enemy AI with Cannon-es rigidbodies and damage type resistances
- Expanded maze environment with frustum culling (no loading screens)
- Creaky door interactions between zones
- Sound design: ambient, footsteps, gunfire, door creaks
- Baked lightmaps for static environment; realtime only for flashlight + moving lights

---

## Architectural Decisions
| Decision | Rationale |
|----------|-----------|
| No game engine — Three.js only | Full control, no abstraction overhead, browser-native |
| Player uses AABB, not Cannon-es | Speed and reliability; Cannon reserved for enemies/dynamics |
| Pointer lock never released | Avoids browser ESC prompt; quaternion freeze handles inventory |
| Real bullet economy on reload | Creates tension and resource decision-making |
| Universal health factory | Same system for player and all future enemies |
| Item behavior in registry, not inventory | Keeps inventory logic generic; easy to add new items |
| Frustum culling for maze (planned) | Performance headroom for sprawling open environment |
| Baked lighting for environment (planned) | Keeps realtime light count low for large maze |

---

## Agent Maintenance Rules
- **CHANGELOG.md** — update after every session with what changed and why
- **PROJECT_BIBLE.md** — update only for new systems, major feature additions, or architectural shifts. No implementation detail, no numbers — use file pointers instead
- **Tunable values** (speeds, timings, damage numbers) live in their respective source files as named constants — read the file, don't hardcode assumptions here
