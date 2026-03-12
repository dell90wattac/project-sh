# PROJECT SH - Architecture Bible (Condensed)
Top-down architecture reference for agents. Keep this file short, contract-focused, and implementation-agnostic where possible.

## Purpose
Project SH is a browser FPS survival-horror built with Three.js + vanilla ES modules.
Goal: preserve one coherent system architecture as content scales.

## Runtime Shape (Non-Negotiable)
- `src/main.js` composes systems and runs per-frame updates.
- Systems should be factory-style (`createX`) with explicit state and `update(...)` entry points.
- `src/world/world.js` is the source of room/world descriptors; other systems consume descriptors rather than hardcoded room logic.
- Player movement/collision remains AABB-based unless explicitly re-scoped.
- Import paths must match `index.html` import-map aliases exactly; for Three examples use `three/addons/...`.

## Ownership Map (Where To Edit)
- World layout, room graph, room registration, door placement: `src/world/world.js`
- Room tracking and current-zone resolution: `src/systems/roomCulling.js`
- Door behavior/runtime: `src/entities/door.js`, `src/systems/door.js`
- Lock contracts and unlock rules: `src/systems/lock.js`
- Inventory and item definitions: `src/systems/inventory.js`, `src/systems/itemRegistry.js`
- World pickup lifecycle: `src/systems/worldItems.js`
- Weapons and firing state: `src/systems/weapons.js`
- Shockwave gameplay force/damage orchestration: `src/systems/shockwave.js`
- Shockwave visuals only: `src/systems/shockwaveFx.js`
- Ammo tuning source of truth: `src/systems/ammoTypes.js`
- Health model: `src/systems/health.js`
- Enemy archetype contract: `src/entities/zombies.js`
- Enemy AI decision-making (state machine, pathing): `src/systems/enemyAI.js`
- Enemy runtime orchestration and collider sync: `src/systems/enemyRuntime.js`
- Fog presentation: `src/systems/fog.js`
- UI is presentation-only: `src/ui/*`

Rule: extend the existing owner system first; do not create parallel authority for the same responsibility.

## Critical Contracts
- Room-ID agnostic design: avoid hardcoded room lists in systems.
- Visibility culling is currently disabled (all rooms visible); room tracking still resolves current room every frame.
- Locks are key-driven (`key:<id>`) and entity-agnostic.
- Doors support world-rotated placement and expose `applyExternalTorque(...)` for non-player forces.
- Shockwave uses decoupled target registration (`registerTarget`); target systems own their response behavior.
- Ammo profiles are data-driven; tune shockwave behavior in `ammoTypes.js` only.
- Weapons enforce one ammo type per loaded magazine.
- Enemy component keys remain stable: `visual`, `animation`, `pathing`, `controller`, `collision`, `health`, `knockback`.
- Reserved enemy runtime states: `idle`, `walk`, `attack`, `hit`, `death`.
- Enemy collision uses `components.collision.syncFromEntity` after controller/knockback updates.
- Enemy AI decision-making lives in `src/systems/enemyAI.js`; runtime orchestration (movement application, knockback, collision) stays in `src/systems/enemyRuntime.js`.
- AI states: `idle` → `wander` → `chase` → `return`. Transitions are zone-driven (room-graph BFS).
- Current chase local avoidance uses continuous direction-sampling steering in `enemyAI`; treat this as the baseline local solver until waypoint/portal routing is layered in.
- Each enemy's `pathing.homeZone` (room ID) and `pathing.aggroDepth` (hop count) define territorial behavior.
- Post-knockback recovery: `enemyRuntime` notifies `enemyAI.notifyKnockbackEnd()` so enemies re-evaluate immediately after shockwave displacement.
- Spider impact damage only fires on non-floor surfaces: `onSpiderSurfaceImpact(enemy, speed, normal)` skips damage when `normal.y > 0.58`. Always pass the resolved surface normal at all landing call sites.
- Spider debug toggles: `?spiderGroundDebug=1` enables ring-buffer ground event logging; `?spiderInvincible=1` or `window.__SPIDER_INVINCIBLE__ = true` disables all spider damage at runtime.
- `attachEnemyComponents()` in `entities/zombies.js` is the canonical way to equip bare archetype meshes with AI-ready component sets.
- Each room must have a unique zone identifier (fog + overlay usage).
- Camera is parented to player body; use `camera.getWorldPosition()` / `camera.getWorldDirection()` for world-space weapon math.
- Dynamic shadows are budgeted runtime behavior, not default-everywhere visuals.

## Fast Change Chains
- Add a room/wing:
  1. Update descriptors/graph/doors in `src/world/world.js`.
  2. Ensure unique zone mapping consumed by `roomCulling.js` and `fog.js`.
  3. Add lock+item wiring through `lock.js`, `inventory.js`, `itemRegistry.js` if gated.
- Add a lockable door interaction:
  1. Door entity/runtime: `entities/door.js` + `systems/door.js`.
  2. Lock contract: `systems/lock.js`.
  3. Key/item path: `systems/itemRegistry.js` + `systems/inventory.js` + world placement.
- Add a shockwave-reactive object:
  1. Register via shockwave target contract.
  2. Keep gameplay in target system; visuals remain in `shockwaveFx.js`.
  3. If static prop, follow world static classification pipeline.
- Add furniture to a room:
  1. Use existing factory functions in `world.js` (`makeDesk`, `makeChair`, `makeComputer`, etc.).
  2. Wrap placement calls in `withRoom(roomId, () => { ... })` for room ownership.
  3. Use `orient(dx, dz, facing)` / `dimOrient(w, d, facing)` for wall-relative placement.
  4. Shockwave shake is automatic via `box()`/`decor()` pipeline — no manual registration.
- Add/modify enemy archetypes:
  1. Archetype data in `entities/zombies.js`.
  2. Call `attachEnemyComponents(entity, { homeZone, aggroDepth, moveSpeed })` for AI-ready setup.
  3. Runtime/state/collision integration in `systems/enemyRuntime.js`.
  4. Register with `enemyAI.register(entity)` in `main.js`.

## Static Prop Shake Contract (Keep Consistent)
- Static props built through `box`/`decor` in `world.js` are auto-classified for canned shake.
- External static props must use `registerExternalStaticRoomObject(roomId, object3D, options?)`, with `shockwaveShake` override (`true`/`false`) when needed.
- Static shake derivation is room-agnostic; do not hardcode room IDs for shockwave shake inclusion.
- Exclude structural slabs and `shockwavePhysicsControlled` objects from canned shake.
- Do not manually curate `world.shakeables`; derive from static classification.

## Handgun Ammo Variant Contract
- Handgun ammo item variants (`ammo`, `ammoHeavy`) must map through `AMMO_ITEM_PROFILE_MAP` in `ammoTypes.js`; no hardcoded shockwave profile selection in gameplay loops.
- Handgun+ammo combine/swap must run through gun-owned transaction logic (`combineAmmoType`) to preserve one authority for loaded-mag state.
- Opposite-ammo swaps are atomic: verify ejection capacity first, then eject to inventory stacks (with overflow to empty slots); cancel entire transaction if capacity is insufficient.
- Inventory UI may trigger handgun+ammo combine from either grid or equipped slot interactions, but should delegate execution to gun transaction APIs.
- HUD ammo styling can reflect currently loaded ammo type, but must remain presentation-only and never become source-of-truth for weapon state.

## Furniture Factory Contract
- All reusable furniture factories live inside `createWorld()` in `world.js`, using closure over `box`, `decor`, `M`, and `registerLight`.
- Factories accept `(x, z, facing)` with `facing` as `'north'`/`'south'`/`'east'`/`'west'`; orientation is axis-swap based (no mesh rotation).
- Use `box()` for collidable main bodies (desks, cabinets, seats); use `decor()` for detail parts (legs, handles, screens, keyboards).
- Rugs use `excludeShockwaveShake: true` option to avoid shaking flat floor decor.
- Limit to 1 PointLight per desk lamp per room; rooms already have ceiling and sconce lights from structure builders.
- Maintain 1.0m clear zone around all door positions for player navigation.

## Versioning + Discipline
- Keep debug overlay and changelog in `Session X.Y` sync.
- For accepted iterations in one session: increment `Y`.
- On new session: increment `X`, reset `Y` to `1`.
- Update `CHANGELOG.md` every working session.
- Update this bible only for architecture/ownership/contract changes (not balance tuning).

## Current Priorities
1. Shockwave Phase 2: lightweight debris (cap around 30 active objects).
2. Shockwave Phase 3 follow-up: camera shake + stronger per-ammo recoil identity.
3. Enemy pathing follow-up: room-transition portal waypoints + richer local route generation for dense furniture layouts.
4. Offscreen enemy simulation using room-graph distance tiers.
5. Event-driven audio system (subscribed to gameplay events).
6. If scaling to large room counts, evaluate `THREE.Layers` culling or static-merge strategies before `visible` toggling.
