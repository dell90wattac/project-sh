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
| Dev server | `node server.js` — serves with `no-cache` headers to prevent stale JS |

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
- Items defined in `itemRegistry.js`: stackable, usable, equippable, combinable flags; stack limits and heal amounts live there, not here
- Combination recipes in `itemRegistry.js` (e.g. Healing Item 1 + Healing Item 2 → Healing Item 3)
- Toggle: **Q** (also picks up world items when looking at one via **E**)
- **Left-click drag** to move items between slots; drop targets highlight green (valid) or red (invalid)
  - Drag to empty slot: moves; same type with room: partial-fills stack, leaves remainder; same type full: STACK FULL; recipe match: combines; no recipe: CANNOT COMBINE; outside panel: drops on ground
- **Right-click** on a slot opens virtual-cursor context menu: Use / Equip / Drop
  - Menu interaction is pointer-lock safe — driven by virtual cursor, not native mouse events
- Healing items heal the player when used; `usable: false` items (ammo, handgun) never show Use
- Stack count shown in green when a slot is at max capacity
- "INVENTORY FULL" notification when all 9 slots are occupied and pickup is attempted

### World Items (`src/systems/worldItems.js`)
- 3D rotating pickups in scene; raycaster detects hover from screen center
- Pickup range and hover label configurable in file
- Dropped items auto-spread: `findClearDropPosition` tests up to 13 candidate positions so no two pickups ever overlap on the ground

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
- Compressed lobby — **14 m wide × 28 m deep × 5.5 m ceiling** (≈50×100 player-block units); dimensions in `src/world/world.js`
- **Entry zone** (Z +9..+14): Elevated platform with 3-step descent to main floor
- **Front hall** (Z +2..+7): Open reception area; 2 benches with side tables flanking the walkway; standing lamps illuminate seating
- **Central zone** (Z -2..+2): Front desk (4.5 m wide) positioned at Z=0, centered in room. Mid-level column pair (X=±3, Z=+1)
- **Transition zone** (Z -3..-5): Back column pair (X=±3, Z=-3); one damage pillar hazard at center; wall sconces light the approach to stairs
- **Staircase zone** (Z -5..-11.4): Dual side staircases flush against walls (left X=-7 to -4.8, right X=+4.8 to +7), ascending 8 steps with inner railings. Wall-side baseboard at X=±7, inner railing at X=±4.8
- **Balcony** (Z -11.4..-13.8, Y=2.4): Upper gallery overlooking main floor; front railing spans center only (X=-4.8 to +4.8) with gaps where stairs connect; newel posts at X=±4.8; side rails along walls; back rail near back wall
- **Lighting**: 3 chandeliers along center axis (Z=[0, 6, -4]); 3 ceiling point lights above entry, seating, and desk; 4 sconce pairs on side walls (Z=[8, 3, -2, -5])
- **Pickups**: Ammo (3 stacks, 27 rounds each) in front of desk (Z=+1.5); healing items behind desk (Z=-1.0)
- **Starting loadout**: Handgun equipped with no ammo; items available for pickup on floor

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
