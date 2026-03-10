# PROJECT SH - Design Bible
High-level reference for AI agents. Keep entries structural and durable. Session-by-session detail belongs in CHANGELOG.md.

---

## Concept
First-person survival horror in the browser. No game engine, pure Three.js + vanilla JS.
Built collaboratively: AI agents implement code while the user drives design direction.

---

## Git / Source Control
Repository: https://github.com/dell90wattac/project-sh

Start-of-session rule: always pull latest main before editing.

| Action | Command |
|--------|---------|
| Pull latest | `git pull origin main` |
| Push changes | `git add . && git commit -m "message" && git push origin main` |
| First-time setup | `git clone https://github.com/dell90wattac/project-sh.git` then `npm install` |

---

## Tech Stack
| Layer | Tech |
|-------|------|
| Renderer | Three.js 0.169.0 (CDN importmap) |
| Physics | cannon-es 0.20.0 (CDN) |
| Audio | Web Audio API (not yet implemented) |
| Language | Vanilla JS (ES modules), no bundler |
| Entry | index.html -> src/main.js |
| Dev server | node server.js (no-cache headers) |

---

## Project Structure
```
Project SH/
|- index.html
|- server.js
|- src/
|  |- main.js
|  |- world/
|  |  |- world.js
|  |- entities/
|  |  |- door.js
|  |  |- zombies.js
|  |- player/
|  |  |- player.js
|  |  |- viewmodel.js
|  |- systems/
|  |  |- door.js
|  |  |- fog.js
|  |  |- health.js
|  |  |- inventory.js
|  |  |- itemRegistry.js
|  |  |- lock.js
|  |  |- physics.js
|  |  |- roomCulling.js
|  |  |- weapons.js
|  |  |- worldItems.js
|  |- ui/
|  |  |- damageEffects.js
|  |  |- hud.js
|  |  |- inventory.js
|  |  |- perfOverlay.js
|- CHANGELOG.md
|- PROJECT_BIBLE.md
```

---

## Gameplay Pillars
1. Tension over action: scarcity, darkness, and atmosphere drive fear.
2. Exploration: spaces reward deliberate movement and observation.
3. Survival: health, ammo, and item decisions matter.

---

## Systems Overview

### Player (src/player/player.js)
- WASD movement, sprint, jump, and mouse-look.
- Player collision stays fast AABB-based against world colliders.
- Pointer-lock lifecycle is managed with a fallback mode for environments where lock cannot engage.
- Cursor state is synchronized with gameplay/inventory state.

### Viewmodel (src/player/viewmodel.js)
- Dual-hand first-person rig: flashlight hand + weapon hand.
- Bob, sway, recoil, and reload blend by state.
- Door interaction blend drives the push pose.
- Flashlight uses dual-cone lighting (main beam + short-range spill) to keep close-surface illumination natural.

### Health (src/systems/health.js)
- Shared health factory for player and future enemies.
- Damage, heal, death callbacks; reset flow for respawn.

### Weapons (src/systems/weapons.js)
- Semi-auto hitscan, magazine and reserve tracking.
- Reload uses real bullet-economy behavior.

### Inventory + Registry (src/systems/inventory.js, src/systems/itemRegistry.js, src/ui/inventory.js)
- 3x3 grid plus separate equipped slot.
- Drag/drop movement, stacking, recipe-based combining, and context-menu actions.
- Virtual cursor interaction remains pointer-lock-safe.
- Registry supports dynamic key item IDs (`key:<id>`) for reusable puzzle locks without per-key hardcoding.

### World Items (src/systems/worldItems.js)
- World pickups are room-owned and visibility-aware.
- Hover raycast excludes hidden-room pickups.
- Dropped pickups auto-spread to avoid overlap.
- Key pickups use the same world item path as other inventory items (including drops).

### Locks (src/systems/lock.js, src/main.js)
- Reusable lock factory (`createLock`) provides required-key matching, locked state, unlock callback hook, and per-frame update.
- Lock proximity uses cylindrical range (horizontal radius + vertical tolerance) for floor-aware behavior in multi-level maps.
- Lock module is entity-agnostic: doors or future puzzle actors decide what unlock enables.

### Room Culling (src/systems/roomCulling.js, src/world/world.js)
- Room graph visibility culling uses BFS from current room.
- Current-room resolution is overlap-aware and can prefer prior room at boundaries.
- Visibility depth is runtime-adjustable.
- Visibility updates are frame-budgeted (room-ops per frame) to avoid transition spikes.
- Culling syncs room topology from world room IDs at runtime, so added/removed rooms are handled without per-room culling code edits.
- Startup loading/warmup is room-count agnostic and normalizes to gameplay depth before click-to-begin.
- Culling throughput is adaptively tuned by frame time and queue pressure, then clamped by room-count-scaled caps.
- Player current-room visibility is prioritized to prevent entered-room hidden-state starvation.
- Desired visibility targets are refreshed each update so stale culling state self-corrects after topology or transition changes.

### Doors (src/entities/door.js, src/systems/door.js, src/main.js)
- Multi-door runtime: one door system per world door reference.
- Door physics uses torque + lever arm with tuned close behavior (spring/damping/cushion/friction).
- Player pushback resolves door overlap after movement.
- Doors connected to hidden rooms reset to closed.
- Door interaction is explicitly state-gated (`interactionEnabled`) so locked doors can be hard-disabled until unlock transitions occur.
- Locked-door flow is now explicit: locked + interaction-disabled -> unlock callback -> interaction-enabled swing behavior.

### Hazards (src/world/world.js, src/main.js)
- World exports hazard descriptors.
- Main loop applies tick damage while in hazard range.

### HUD + Perf Overlay (src/ui/hud.js, src/ui/perfOverlay.js)
- HUD shows health and ammo.
- Perf overlay (F3) shows fps/ms, room/zone, room counts, culling queue/budget (`vis queue`, `vis ops`), draw calls, and triangles.

### Damage Effects (src/ui/damageEffects.js)
- Damage flash, low-health pulse, and death/reset presentation.

---

## Architecture Patterns
- createX factory modules with explicit update loops.
- src/main.js is the runtime orchestrator.
- Room-first ownership model: world objects can belong to one or multiple rooms.
- Visibility culling drives dependent systems (doors, world items, overlay telemetry).
- Room graph integrations should remain room-ID agnostic (no hardcoded room lists in systems); rely on world room APIs.
- Player remains AABB-based; cannon-es is available for dynamic entities.

---

## Current Environment
- Core lobby remains the primary play space with connected offshoot chain rooms.
- Active room IDs:
  - lobby (label: Main Lobby, zone: lobby)
  - sideRoomEast (label: Offshoot East, zone: offshootA)
  - sideRoomMid (label: Offshoot Mid, zone: offshootB)
  - sideRoomWest (label: Offshoot West, zone: offshootC)
- Active room graph:
  - lobby <-> sideRoomEast <-> sideRoomMid <-> sideRoomWest
- Active doors:
  - doorLobbyEast (lobby <-> sideRoomEast)
  - doorEastMid (sideRoomEast <-> sideRoomMid)
  - doorMidWest (sideRoomMid <-> sideRoomWest)
- Runtime culling defaults:
  - visibility-based culling (no stream unload)
  - normal gameplay depth: 2
  - startup warmup raises depth briefly, then restores normal depth

---

## Roadmap
- Expand room graph from current chain toward 10-20 rooms.
- Implement hybrid offscreen enemy behavior for non-visible rooms.
- Add traversal polish like room-hide hysteresis if needed.
- Add sound design (ambient, footsteps, gunfire, door creaks).
- Move toward baked/static lighting where possible for scale.

---

## Architectural Decisions
| Decision | Rationale |
|----------|-----------|
| Three.js without full engine | Maximum control and low abstraction overhead |
| Player uses AABB collisions | Stable and fast first-person movement |
| Pointer lock preferred, fallback supported | Reliable input across browser/runtime contexts |
| Room-graph visibility culling | Performance headroom with seamless traversal |
| Shared-object room membership | Prevents pop-in on boundaries and shared partitions |
| Door reset on room hide | Simpler state policy under culling |
| Explicit lock -> interaction gate | Keeps puzzle gating deterministic and reusable across doors/non-door actors |
| Item behavior in registry | Keeps inventory logic generic and extensible |
| Health factory reuse | Same architecture for player and enemies |

---

## Agent Maintenance Rules
- Update CHANGELOG.md after every session.
- Update PROJECT_BIBLE.md only for architectural/system shifts.
- Keep tunable numeric balance values in code constants, not this bible.
