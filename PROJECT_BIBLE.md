# PROJECT SH - Architecture Bible
Top-level guidance for AI agents. Keep this file focused on structural truth, ownership boundaries, and future direction.

## Project Intent
Browser-based first-person survival horror built with Three.js and vanilla ES modules.
Primary goal for code changes: preserve one coherent architecture as systems scale.

## Core Runtime Model
- `src/main.js` is the orchestrator. Systems are composed there and updated per frame.
- Systems should be factory-style modules (`createX`) with explicit state and `update` entry points.
- World data originates from `src/world/world.js`; systems consume world descriptors instead of hardcoded per-room/per-door logic.
- Player movement/collision remains AABB-based. Do not replace with full rigid-body character physics unless explicitly requested.

## ES Module Import Rule (Startup-Critical)
- Import paths must match `index.html` import-map aliases exactly.
- For Three.js example utilities, use `three/addons/...` paths (not `three/examples/jsm/...`).
- A bad ESM import path can halt module bootstrap before input/click handlers bind, which appears as "click to begin" doing nothing.

## Ownership Boundaries (Do Not Blur)
- Room visibility and graph traversal: `src/systems/roomCulling.js`
- Door entity behavior and door runtime coordination: `src/entities/door.js`, `src/systems/door.js`
- Lock rules and unlock contracts: `src/systems/lock.js`
- Inventory state and item definitions: `src/systems/inventory.js`, `src/systems/itemRegistry.js`
- World pickup lifecycle: `src/systems/worldItems.js`
- Combat/weapon state: `src/systems/weapons.js`
- Health state model: `src/systems/health.js`
- Enemy runtime orchestration (controller + animation state plumbing + collider sync): `src/systems/enemyRuntime.js`
- Enemy archetype authoring contracts (visual profile, animation states, pathing config, health defaults): `src/entities/zombies.js`
- World layout, room geometry, room registration, and door placement: `src/world/world.js`
- Fog as zone-driven presentation: `src/systems/fog.js`
- UI presentation only: `src/ui/*` (HUD/effects should not become gameplay source-of-truth)

If adding a feature, extend the existing owner system first. Do not create parallel subsystems for the same responsibility.

## Active Architectural Contracts
- Room-ID agnostic design: avoid hardcoded room lists inside systems.
- Visibility culling is authoritative for hidden/active room behavior and drives dependent systems.
- Doors support explicit interaction gating; lock flow controls when interaction is enabled.
- Doors support rotated placement via `hingeRotY` parameter in `addLinkedDoor`; non-zero rotation wraps the pivot in a parent group so door physics inherits world orientation transparently.
- Locking is entity-agnostic and key-driven (`key:<id>` pattern via registry/inventory path).
- Pointer lock + fallback input mode must continue to work with inventory and interaction UI.
- Dynamic shadows are budgeted as an orchestrated runtime concern: prefer one primary gameplay shadow caster, keep secondary effects non-shadowed by default, and gate extra casters behind explicit profiling/toggle paths.
- Enemy entities are component-driven and must keep stable keys for future upgrades: `visual`, `animation`, `pathing`, `controller`, `collision`, `health`.
- Current enemy runtime state machine names are reserved now and must remain compatible: `idle`, `walk`, `attack`, `hit`, `death`.
- Enemy collision uses explicit component sync (`components.collision.syncFromEntity`) so static and future moving/pathing enemies share one update path.
- Each room has a unique zone identifier used by fog and perf overlay; new rooms must define their own zone rather than sharing a generic one.

## Enemy Runtime Guidance
- Register enemies in world ownership (`world.enemies` / `world.getEnemies`) so non-render systems can consume them without scene traversal.
- Keep enemy pathing authority out of `world.js`; world owns placement and initial collider registration only.
- Keep controller update hooks deterministic (`controller.update(dt, context)`) and avoid direct UI side effects.
- If a future enemy swaps to a skinned mesh/rig, preserve the same component contract and runtime state names so AI/pathing code remains unchanged.

## Technical Depth Policy
- Increase technical detail only for cross-cutting or high-risk systems.
- Keep detail at contract level (inputs, outputs, authority, constraints), not algorithm lock-in.
- Do not prescribe one permanent implementation unless required by a proven bottleneck.
- Keep tunable values in code constants; keep architectural rules in this file.

Current depth target by system type:
- High depth: room culling, state authority, system integration points, performance budgeting.
- Medium depth: locks, doors, inventory/world-item interactions, offscreen simulation contracts.
- Lower depth: visual polish systems such as fog and post effects, unless they become gameplay-critical or a performance hotspot.

## Culling And Fog Guidance
- Culling (`src/systems/roomCulling.js`) should expose stable visibility state that other systems consume directly.
- Dependent systems must subscribe to culling outcomes instead of re-implementing room-visibility checks.
- Culling changes should preserve deterministic behavior at room boundaries before adding complexity.
- Fog (`src/systems/fog.js`) should remain a presentation system driven by world/room state.
- Fog is zone-based: each fog zone defines its own bounds, ceiling height, wisp count, and ground fog plane. New world areas require a corresponding fog zone entry.
- Do not move gameplay authority into fog logic; fog reacts to game state, it does not define it.
- If fog quality increases, validate cost against culling/update budgets first.

## Lighting And Shadow Guidance
- Keep lighting ownership split by role: world/environment lights in `src/world/world.js`, first-person effect lights in `src/player/viewmodel.js`, and frame-budget/shadow update policy in `src/main.js`.
- If dynamic shadowing expands, scale via explicit runtime budgeting (throttled updates, limited caster count) before raising map resolution or caster scope.
- Treat muzzle flash, spill, and similar short-lived aesthetic lights as non-shadowed by default unless a profiling session explicitly validates headroom.

## Current World Shape (High Level)
- Play space is a multi-wing museum built from connected room graphs.
- **Main Lobby**: Grand 14×28m hall with 5.5m ceilings, columns, balcony, staircases, front desk. Player spawns at center (0, 0, 0).
- **West Offshoots** (left from spawn): Three 4×4m rooms chained off the lobby left wall (`sideRoomEast` → `sideRoomMid` → `sideRoomWest`). Full lobby ceiling height (5.5m).
- **East Wing — Administration** (right from spawn): Hallway (11.8×3.0m) connecting lobby to five rooms through the right wall:
  - North side: Reception Office, Admin Office
  - South side: Manager's Office, Kitchenette
  - End of hallway: Director's Office (5.3×7.0m)
  - All east wing rooms use 3.0m ceilings for realistic office scale.
  - 7 doors total (1 lobby→hallway, 4 hallway→offices rotated ±π/2, 1 hallway→director, plus existing lobby→offshoot).
- Runtime assumes culling-based visibility (not asset streaming/unloading).
- Existing systems are already wired for multi-room expansion; scale by extending world descriptors and graph links.

## Path Forward (Code-Altering Priorities)
1. Expand room graph content using existing room/culling contracts, not custom per-room logic.
2. Add offscreen enemy simulation compatible with room visibility states (lightweight when hidden, full behavior when visible).
3. Introduce audio as a system-layer concern that subscribes to gameplay events (doors, weapons, footsteps, hazards), not ad-hoc calls spread across files.
4. Keep performance work aligned to current model: culling throughput, update budgeting, and static/baked lighting where feasible.

## Change Discipline For Agents
- Update `CHANGELOG.md` every working session.
- Update this file only when architecture, ownership, or system contracts change.
- Keep tuning values and moment-to-moment balance in code constants, not here.
