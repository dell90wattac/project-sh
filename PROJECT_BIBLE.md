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
- Room tracking and zone resolution: `src/systems/roomCulling.js`
- Door entity behavior and door runtime coordination: `src/entities/door.js`, `src/systems/door.js`
- Lock rules and unlock contracts: `src/systems/lock.js`
- Inventory state and item definitions: `src/systems/inventory.js`, `src/systems/itemRegistry.js`
- World pickup lifecycle: `src/systems/worldItems.js`
- Combat/weapon state: `src/systems/weapons.js`
- Shockwave force distribution and furniture shake: `src/systems/shockwave.js`
- Ammo type definitions (shockwave profiles): `src/systems/ammoTypes.js`
- Health state model: `src/systems/health.js`
- Enemy runtime orchestration (controller + animation state plumbing + collider sync): `src/systems/enemyRuntime.js`
- Enemy archetype authoring contracts (visual profile, animation states, pathing config, health defaults): `src/entities/zombies.js`
- World layout, room geometry, room registration, and door placement: `src/world/world.js`
- Fog as zone-driven presentation: `src/systems/fog.js`
- UI presentation only: `src/ui/*` (HUD/effects should not become gameplay source-of-truth)

If adding a feature, extend the existing owner system first. Do not create parallel subsystems for the same responsibility.

## Active Architectural Contracts
- Room-ID agnostic design: avoid hardcoded room lists inside systems.
- Room tracking resolves the player's current room each frame; visibility culling is currently disabled (all rooms always visible).
- Doors support explicit interaction gating; lock flow controls when interaction is enabled.
- Doors support rotated placement via `hingeRotY` parameter in `addLinkedDoor`; non-zero rotation wraps the pivot in a parent group so door physics inherits world orientation transparently.
- Doors expose `applyExternalTorque(torque)` for shockwave and future force-based interactions without requiring player proximity.
- Locking is entity-agnostic and key-driven (`key:<id>` pattern via registry/inventory path).
- Pointer lock + fallback input mode must continue to work with inventory and interaction UI.
- Dynamic shadows are budgeted as an orchestrated runtime concern: prefer one primary gameplay shadow caster, keep secondary effects non-shadowed by default, and gate extra casters behind explicit profiling/toggle paths.
- Enemy entities are component-driven and must keep stable keys for future upgrades: `visual`, `animation`, `pathing`, `controller`, `collision`, `health`, `knockback`.
- Current enemy runtime state machine names are reserved now and must remain compatible: `idle`, `walk`, `attack`, `hit`, `death`.
- Enemy collision uses explicit component sync (`components.collision.syncFromEntity`) so static and future moving/pathing enemies share one update path.
- Enemy knockback is processed between controller update and collision sync; the `knockback` component is initialized lazily by the shockwave system.
- Each room has a unique zone identifier used by fog and perf overlay; new rooms must define their own zone rather than sharing a generic one.
- Shockwave system uses a decoupled target registry — systems register themselves as shockwave targets; shockwave.js does not import door/chandelier/enemy modules.
- Ammo types are data-driven. Adding a new ammo type requires only a new entry in `AMMO_TYPES` — no code changes in the shockwave system or weapons system.
- Camera is parented to player body group; weapon systems must use `camera.getWorldPosition()` / `camera.getWorldDirection()` for world-space coordinates, never `camera.position` directly.

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
- High depth: state authority, system integration points, world room graph.
- Medium depth: locks, doors, inventory/world-item interactions, offscreen simulation contracts.
- Lower depth: visual polish systems such as fog and post effects, unless they become gameplay-critical or a performance hotspot.

## Room Tracking And Fog Guidance
- Room tracking (`src/systems/roomCulling.js`) resolves the player's current room for HUD/zone display. Visibility culling is disabled — all rooms are always rendered.
- If draw call count becomes a bottleneck at larger world scale, prefer a `THREE.Layers`-based culling approach or static geometry merging over `object3D.visible` toggling (which causes GPU buffer eviction and recurring stalls).
- Fog (`src/systems/fog.js`) should remain a presentation system driven by world/room state.
- Fog is zone-based: each fog zone defines its own bounds, ceiling height, wisp count, and ground fog plane. New world areas require a corresponding fog zone entry.
- Do not move gameplay authority into fog logic; fog reacts to game state, it does not define it.

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
- All rooms are always visible (no culling). Performance is sustained at 144 FPS with current mesh count (~162 meshes / 11 rooms).
- Existing systems are already wired for multi-room expansion; scale by extending world descriptors and graph links.

## Shockwave System Guidance
- The shockwave is the core weapon mechanic. Guns fire shockwaves, not bullets. Different ammo types produce different shockwave profiles.
- The shockwave system (`src/systems/shockwave.js`) owns force distribution and furniture shake. It does not own target-specific behavior — each target system handles its own response to force.
- To make any world object react to shockwaves: use static world object contracts for canned rattle and `shockwave.registerTarget(type, { getPosition, applyForce, takeDamage? })` for custom physics behavior.
- Doors respond via `applyExternalTorque`; chandeliers via `applyImpulse`; enemies via knockback velocity + health damage; furniture via position shake. Each uses its own existing simulation — no new physics bodies were added.
- Ammo types (`src/systems/ammoTypes.js`) are the sole source of shockwave tuning. Do not hardcode force/damage/radius values elsewhere.
- Phase 2 (debris: small flyable objects with lightweight custom physics) and Phase 3 (visual ring effect, camera shake, per-ammo recoil) are designed but not yet implemented.

## Static World Prop Shockwave Contract (Critical)
- Static world props are the canonical source for canned shockwave shake. This rule is now architecture, not a one-off implementation detail.
- If static props are created through `box`/`decor` in `src/world/world.js`, they are automatically classified as static world objects and eligible for lobby shake filtering.
- If static props are created externally (outside `box`/`decor`), they must be registered through `registerExternalStaticRoomObject(roomId, object3D, options?)` so they join the same static classification pipeline.
- Lobby canned shake selection is rebuilt from static object classification and excludes:
  - flat structural planes (walls/ceilings/floors style slabs), and
  - objects already controlled by dedicated shockwave physics (`shockwavePhysicsControlled`), such as doors/chandeliers.
- Do not manually curate `world.shakeables` per feature. The shake list must come from static classification rules so behavior stays consistent as content scales.

## Debug Versioning Contract (Critical)
- The debug interface (perf/debug overlay) must display the current build/session version in `Session X.Y` format.
- `X` is the session number and `Y` is the iteration number for that session.
- Every accepted change/iteration in the same session must increment `Y` (for example: `21.1`, `21.2`, `21.3`).
- On a new session, increment `X` and reset `Y` to `1`.
- Changelog entries and debug interface version display must stay aligned so the in-game debug view always identifies the exact iteration being tested.

## Path Forward (Code-Altering Priorities)
1. **Shockwave Phase 2**: Debris system — small world objects (pencils, papers, magazines) fly off surfaces with lightweight custom physics (no Cannon-ES). Cap at ~30 active debris objects.
2. **Shockwave Phase 3**: Visual polish — expanding ring mesh effect, camera shake, per-ammo-type recoil scaling in viewmodel.
3. Expand room graph content using existing room registration and graph link contracts, not custom per-room logic.
4. Add offscreen enemy simulation using room graph distance from player (lightweight when far, full behavior when near).
5. Introduce audio as a system-layer concern that subscribes to gameplay events (doors, weapons, footsteps, hazards), not ad-hoc calls spread across files.
6. If performance becomes a concern at larger scale (~44+ rooms), investigate `THREE.Layers`-based culling or per-room static geometry merging before reverting to `visible` flag toggling.

## Change Discipline For Agents
- Update `CHANGELOG.md` every working session.
- Update this file only when architecture, ownership, or system contracts change.
- Maintain session iteration numbering using `Session X.Y`, incrementing `Y` for each accepted iteration within the current session.
- Keep debug interface version display and changelog version labels synchronized.
- Keep tuning values and moment-to-moment balance in code constants, not here.
