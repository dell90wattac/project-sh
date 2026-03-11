# Changelog

All notable changes to Project SH are documented here.

---

## [Session 23] — 2026-03-11
### Added
- **Reusable furniture factory system** (`src/world/world.js`)
  - 22 factory functions for office and kitchen furniture: `makeDesk`, `makeLargeDesk`, `makeChair`, `makeMonitor`, `makeKeyboard`, `makeMouse`, `makeComputer`, `makeLaptop`, `makeFilingCabinet`, `makeTallCabinet`, `makeBookshelf`, `makeDeskLamp`, `makeStandingLamp`, `makeWallClock`, `makeRug`, `makeTable`, `makeCounter`, `makeSink`, `makeMicrowave`, `makeCoffeeMaker`, `makeKitchenCabinet`, `makeWaterCooler`
  - `orient(dx, dz, facing)` and `dimOrient(w, d, facing)` helpers for placing furniture against any wall direction (`north`/`south`/`east`/`west`)
  - All factory output uses existing `box()`/`decor()` pipeline — shockwave shake compatibility is automatic

- **6 new materials** added to the `M` palette: `screen` (CRT green glow), `plastic` (off-white peripherals), `rug`/`rugBorder` (dark red floor coverings), `stainless` (kitchen metal), `ceramic` (sink/mug surfaces)

- **East wing fully furnished** — all 6 rooms populated:
  - **Reception Office**: desk, chair, computer, desk lamp, filing cabinet, bookshelf, rug, wall clock
  - **Admin Office**: 2 workstations (computer + laptop), 3 tall filing cabinets, bookshelf, rug, wall clock
  - **Manager's Office**: large executive desk, computer, 2 guest chairs, bookshelf, 2 filing cabinets, standing lamp, rug, wall clock
  - **Kitchenette**: counter run with sink/microwave/coffee maker, upper wall cabinets, table + 2 chairs, water cooler, pantry cabinet, dish shelf, wall clock
  - **Director's Office**: large desk, computer, 2 guest chairs + side table, 2 bookshelves, filing cabinets, standing lamp, large rug, wall clock
  - **East Hallway**: side table, water cooler, runner rug, wall clock

- **Zombie AI and pathfinding system** (`src/systems/enemyAI.js`)
  - Zone-aware territorial behavior: each enemy has a `homeZone` (room ID) and `aggroDepth` (max distance in rooms from home to chase player)
  - BFS room-graph pathfinding: enemies navigate through multi-room layouts using world connectivity graph, steering toward doorways to funnel through connected spaces
  - State machine with 4 modes: `idle` (standing/micro-bob), `wander` (random point in home zone), `chase` (pursuit with dynamic path updates), `return` (walking back to home after losing aggro)
  - Shockwave recovery: knockback ends trigger immediate AI re-evaluation so enemies snap back to pursuit behavior rather than resuming stale state

- **Zombie movement and collision** (`src/systems/enemyRuntime.js`)
  - AI-driven movement: enemy desired velocity from AI system applied each frame with full collision detection
  - World collision handling: AABB pushback against environment colliders (furniture, walls) to prevent wall-walking
  - Knockback physics with subcision: shockwave impulse applies physics-only velocity with sub-stepping (`MAX_STEP = 0.1m`) to prevent tunneling through thin colliders
  - Knockback friction: exponential velocity decay during impact recovery
  - Death state visual: collapsed/face-planted animation with slow tilt and sink into ground over 0.6 seconds

### Changed
- **Zombie Sentry survivability pass** (`src/entities/zombies.js`)
  - Increased `createLobbyZombieSentry` HP from `4` to `15` to support longer chase sequences before destruction
  - Added `homeZone` and `aggroDepth` fields to pathing component for AI zone awareness

- **Enemy component standardization** (`src/entities/zombies.js`)
  - New `attachEnemyComponents()` helper pre-configures AI-ready component stubs (visual, animation, pathing, health, knockback) for any enemy entity
  - Simplifies future enemy archetype (shambler, guard, etc.) setup with single call
  - Configurable `moveSpeed` and `turnSpeed` per archetype

---

## [Session 22] — 2026-03-11
### Added
- **Bullet-scoped ammo profile resolver and mapping** (`src/systems/ammoTypes.js`, `src/main.js`, `src/systems/weapons.js`)
  - Added `AMMO_ITEM_PROFILE_MAP` with resolver helpers (`getAmmoProfileKeyForItem`, `getAmmoConfigForItem`) so shockwave tuning is selected from fired bullet item type, not gun identity
  - Main fire path now resolves ammo config per-shot using `fireResult.ammoItemType` instead of hardcoded `AMMO_TYPES.standard`
  - Weapon fire result payload now carries `ammoItemType` for downstream systems

- **Muzzle-origin shockwave visual wavefront system** (`src/systems/shockwaveFx.js`, `src/main.js`)
  - Added pooled visual-only shockwave FX system with `spawnMuzzleWave`, `update`, and `clear`
  - New effect renders an expanding cone shell plus layered traveling rings for readable depth/motion from gun origin to full shockwave range
  - FX is explicitly non-interactive: no physics, no collisions, no shockwave target registration
  - Integrated into fire/update/reset flow in `main.js`

### Changed
- **Gun firing cadence and feel pass** (`src/systems/weapons.js`, `src/player/viewmodel.js`)
  - Increased fire cooldown from `0.1` to `0.75`, then tuned to `0.82` seconds between shots
  - Added per-shot upward kick pulse in the viewmodel (triggered on shot edge) so firing visibly lifts the weapon while preserving reload dip behavior

- **Magazine ammo typing contract** (`src/systems/weapons.js`)
  - Added selected ammo item state and loaded-mag ammo state to establish no-mixed-round behavior (single ammo type per magazine load)
  - Reload now pulls from selected ammo item type and stamps the loaded magazine type on completion

- **Shockwave geometry tuning and visual sync** (`src/systems/ammoTypes.js`, `src/systems/shockwaveFx.js`)
  - Standard ammo shockwave tuned from `radius 5` to `5.75` and `cone half-angle 45°` to `52°`
  - Shockwave FX math now matches gameplay cone geometry (`radius` + `coneHalfAngle`) 1:1 for spatial alignment
  - Visual timing tuned slightly slower/longer for clarity (`0.24`–`0.34s`) with gentler ring swirl

- **Shockwave origin alignment to weapon viewmodel** (`src/systems/weapons.js`)
  - Shockwave origin shifted to a muzzle-like world-space offset from camera (`SHOCKWAVE_MUZZLE_OFFSET`) so visuals and force emission read as coming from the gun

- **Room-agnostic static prop shockwave shake coverage** (`src/world/world.js`, `PROJECT_BIBLE.md`)
  - Replaced lobby-only shakeable derivation with room-agnostic static classification so east wing non-plane static props participate automatically
  - Added explicit external static override `shockwaveShake` (`true`/`false`) with precedence over legacy `excludeShockwaveShake`
  - Updated architecture bible static-prop contract to reflect room-agnostic derivation and explicit external override policy

- **Heavy handgun ammo item + handgun combine transaction flow** (`src/systems/itemRegistry.js`, `src/systems/ammoTypes.js`, `src/systems/weapons.js`, `src/systems/inventory.js`, `src/ui/inventory.js`, `src/main.js`)
  - Added new `ammoHeavy` item with handgun-ammo-equivalent stack behavior and dedicated profile mapping to `heavyHandgun`
  - Wired heavy ammo to shockwave through ammo profile resolution, currently mirroring standard profile values for safe parity
  - Added gun combine transaction API to support ammo stack + handgun combine for both `ammo` and `ammoHeavy`
  - Implemented opposite-ammo swap behavior: loaded rounds are ejected back to inventory with stack-first placement, transaction canceled if no capacity
  - Added inventory capacity precheck (`canFitItem`) and multi-stack `removeItem` so swap/eject flows are deterministic
  - Added three heavy ammo world pickups for test coverage and hooked inventory UI drag-combine to invoke handgun ammo combine path

- **Heavy ammo visual + shockwave escalation pass** (`src/ui/hud.js`, `src/systems/ammoTypes.js`, `src/main.js`)
  - HUD ammo counter now renders red when heavy ammo is currently loaded in the handgun magazine
  - Heavy handgun profile now uses 2x force and 2x depth/range relative to standard
  - Heavy cone width at max range is preserved by narrowing cone half-angle to keep end-cap circumference equivalent to standard

- **Heavy ammo circumference expansion** (`src/systems/ammoTypes.js`, `src/main.js`)
  - Increased heavy handgun cone half-angle to 60° so edge-of-camera targets are captured while preserving the existing doubled depth and force

- **Heavy ammo depth expansion (+50%)** (`src/systems/ammoTypes.js`, `src/main.js`)
  - Increased heavy handgun radius from 11.5 to 17.25 while preserving heavy force and widened cone coverage

- **Main lobby mid-height wall trim band** (`src/world/world.js`)
  - Added a new picture-rail style trim pass around the lobby walls at `y=2.72` (slightly above sconce height) to mirror east-wing trim rhythm
  - Side-wall trim is segmented around existing doorway spans to keep the wall-opening logic and shadow breakup consistent

### Notes
- This session delivers the first shipped implementation of Shockwave Phase 3 visual direction (muzzle-origin expanding wavefront) while preserving gameplay authority in `shockwave.js`.
- Ammo profile ownership is now bullet-item scoped and future ammo variants should be introduced by extending `AMMO_TYPES` plus `AMMO_ITEM_PROFILE_MAP`.
- Session 22 closes at build `22.7` with heavy handgun profile baseline: `force 20`, `radius 17.25`, `coneHalfAngle 60°`, plus red HUD ammo counter when heavy rounds are loaded.

---

## [Session 21] — 2026-03-11
### Added
- **Chandelier shockwave-driven motion upgrade** (`src/main.js`, `src/systems/chandelierMotion.js`)
  - Disabled canned ambient sway for chandeliers in gameplay config (`breezeStrengthX/Z: 0`, `microMotion: 0`) so swing is primarily shockwave-driven
  - Retargeted chandelier shockwave hit position to the hanging body (world position with downward offset) instead of ceiling anchor for more natural hit registration
  - Increased chandelier impulse coupling scale to make hits clearly readable in gameplay
  - Added impulse clamping and dynamic max-swing boost logic tied to impact magnitude for stronger but stable reaction arcs

- **Windchime-style independent chandelier part motion** (`src/systems/chandelierMotion.js`)
  - Added per-part spring-like state for chains, arms, bulbs, and main bulb (response/follow/damping/bias/velocity)
  - Added per-part lag/follow solvers so chandelier components no longer move as a rigid block
  - Shockwave impulses now propagate into each part with slight deterministic variation, producing controlled "chime" behavior
  - Added tunable `chimeResponse` parameter and tuned session value to `1.22` for slightly more pronounced chime feel without instability

- **Static world prop shake architecture (lobby)** (`src/world/world.js`)
  - Added static object classification registry (`staticWorldObjects`) and `markStaticWorldObject(...)`
  - Updated `box(...)` and `decor(...)` helpers to auto-mark created meshes as static world props
  - Replaced manual hand-picked `shakeables.push(...)` furniture list with rule-based rebuild from static classification
  - Added `isFlatStaticPlane(...)` filter to exclude structural slabs (walls/ceilings/floors style flat planes)
  - Added `rebuildLobbyShakeables()` to derive lobby shakeables from static props while excluding physics-controlled shockwave objects
  - Added `registerExternalRoomObject(roomId, object3D, options?)` static-world option support and new helper `registerExternalStaticRoomObject(...)` for externally-created static props

### Changed
- **Door exclusion from canned shake via explicit physics ownership tags** (`src/world/world.js`)
  - Door root objects are now marked `shockwavePhysicsControlled` and `excludeShockwaveShake`, guaranteeing they are excluded from static canned shake selection

- **Shockwave/static object contract updated in architecture bible** (`PROJECT_BIBLE.md`)
  - Added critical contract that static props created via `box`/`decor` are automatically included in shake classification
  - Added rule that externally-created static props must use `registerExternalStaticRoomObject(...)` to remain consistent
  - Added explicit prohibition on manual per-feature `world.shakeables` curation

- **Debug/version iteration policy added to architecture contracts** (`PROJECT_BIBLE.md`)
  - Added required debug interface version format: `Session X.Y`
  - Defined iteration progression per session (`X` = session, `Y` increments each accepted change)
  - Locked requirement that debug interface version and changelog version labels must remain synchronized

- **Debug overlay build tag now explicitly marked for this iteration** (`src/main.js`, `src/ui/perfOverlay.js`)
  - Added `BUILD_VERSION = '21.7'` and wired it into the perf/debug overlay
  - Replaced stale hardcoded overlay label (`session 20.3`) with runtime-configured `session 21.7`

### Notes
- This session formalizes a future-proof static prop policy: lobby canned shake is derived from classification rules, not ad-hoc lists.
- Dedicated shockwave physics actors (doors/chandeliers/enemies/custom targets) remain separate from canned static shake by design.

---

## [Session 20] — 2026-03-11
### Added
- **Shockwave weapon system — core mechanic** (`src/systems/shockwave.js`, `src/systems/ammoTypes.js`)
  - Guns now fire shockwaves instead of bullets; this is the central gameplay gimmick
  - Created `createShockwaveSystem()` with a decoupled target registry pattern — doors, chandeliers, enemies, and furniture register as shockwave targets without the shockwave system importing their modules
  - Shockwave shape supports three modes per ammo type: `cone` (directional), `sphere` (omnidirectional), and `hybrid` (cone + weaker spherical splash)
  - Force calculation uses configurable distance falloff: `baseForce × (1 - dist/radius)^exponent`
  - Cone check via dot product against fire direction with configurable half-angle
  - Built-in furniture shake manager: decaying sinusoidal position rattle with per-mesh intensity, duration, and automatic position restoration

- **Data-driven ammo type definitions** (`src/systems/ammoTypes.js`)
  - Each ammo type defines a complete shockwave profile: shape, radius, cone angle, force, damage, falloff exponent, splash multiplier, and visual config
  - `standard` ammo configured as a 45° directional cone, 5m radius, inverse-square falloff
  - System designed for single weapon (handgun) with multiple ammo types swappable at runtime
  - Adding a new ammo type requires only a new entry in `AMMO_TYPES` — no code changes

- **Door shockwave response** (`src/systems/door.js`)
  - Added `applyExternalTorque(torque)` method that injects force directly into the existing angular velocity model
  - Shockwave computes torque from force direction vs door normal (cross product for torque sign) × lever arm
  - Locked doors are immune; unlocked doors swing proportional to shockwave strength and proximity
  - Uses identical physics path as player contact push — no new simulation infrastructure

- **Chandelier shockwave response** (`src/systems/chandelierMotion.js`)
  - Added `applyImpulse(index, impulseX, impulseZ)` method that injects velocity into the existing pendulum simulation
  - Added dynamic max swing override system: shockwave temporarily raises swing clamp from 0.075 to 0.4 radians, decaying back over 2 seconds
  - Prevents the ambient swing clamp from eating dramatic shockwave-driven swings

- **Enemy knockback and damage** (`src/systems/enemyRuntime.js`, `src/main.js`)
  - Added knockback velocity processing in enemy runtime update loop (between controller update and collision sync)
  - Knockback uses exponential friction decay (`Math.pow(0.1, dt)`) for natural deceleration
  - Auto-deactivates when velocity falls below threshold
  - Shockwave applies damage via enemy health component with distance-based falloff; triggers death state when HP reaches 0

- **Shakeable furniture system** (`src/world/world.js`, `src/main.js`)
  - Tagged 10 heavy furniture meshes as shakeable: desk counter, counter top, chair, filing cabinet, left bench, right bench, left side table (2 parts), right side table (2 parts)
  - Exposed `shakeables` array and `getShakeables()` from world
  - Shockwave triggers canned rattle animation on hit — decaying sinusoidal X/Z displacement

### Fixed
- **Physics raycast was completely broken** (`src/systems/physics.js`)
  - `world.getShapeAtWorldPoint()` does not exist in Cannon-ES; replaced with correct `world.raycastClosest()` API
  - Gun firing was silently throwing every shot since Session 3 — ammo was consumed and muzzle flash played, but the return value was lost to the exception
  - Raycast now returns correct `{ body, point, distance }` using `CANNON.RaycastResult`

- **Weapon raycast origin was always (0,0,0)** (`src/systems/weapons.js`)
  - Camera is parented to player body group (`body.add(camera)`), so `camera.position` returned local space coordinates (~0,0,0 with head bob)
  - Changed to `camera.getWorldPosition()` and `camera.getWorldDirection()` for correct world-space ray origin and direction
  - This fix also corrects any future systems that depend on accurate weapon hit detection

### Changed
- **Weapon fire return value expanded** (`src/systems/weapons.js`)
  - `fire()` now returns `{ success, hitInfo, shockwaveOrigin, shockwaveDirection }` instead of just `{ success, hitInfo }`
  - Shockwave origin and direction are world-space vectors used by the shockwave system

- **Main loop shockwave integration** (`src/main.js`)
  - Gun fire result now triggers `shockwave.fire()` with the equipped ammo type config
  - `shockwave.update(dt)` added to game loop between `stepPhysics` and `chandelierMotion.update` for shake animation processing
  - All shockwave targets registered after system creation: doors, chandeliers, enemies, and shakeable furniture

### Notes
- **Zero new Cannon-ES bodies** — the shockwave system achieves all environmental interaction through existing simulation models (door angular velocity, chandelier pendulum velocity, enemy position offset, mesh position shake). Physics world step cost is unchanged.
- **Performance impact is negligible**: ~60 vector operations per shot (target iteration), ~10 sin/cos per frame (active shakes). No per-frame allocations.
- Shockwave system is designed for three-phase rollout:
  - Phase 1 (this session): Core system + doors + chandeliers + enemies + furniture shake
  - Phase 2 (future): Debris system — small objects (pencils, papers, magazines) fly off surfaces with lightweight custom physics
  - Phase 3 (future): Visual effects — expanding ring mesh, camera shake, per-ammo-type recoil scaling
- The two long-standing weapon bugs (broken raycast, wrong origin) were pre-existing since Session 3/4 but never surfaced because `hitInfo` was returned but never consumed by any system.

---

## [Session 19] — 2026-03-11
### Changed
- **Room culling disabled — all rooms always visible** (`src/systems/roomCulling.js`)
  - Stripped visibility toggling, BFS graph walking, progressive mesh reveal, transition cursors, adaptive budgeting, and prewarm phases
  - System retained as a lightweight room tracker: resolves the player's current room each frame for HUD zone display and perf overlay
  - API surface preserved as no-op stubs (`setVisibilityDepth`, `setMeshOpsPerFrame`, etc.) so callers don't need guards
  - Motivation: toggling `object3D.visible` caused Three.js to evict/re-upload GPU buffers on every room transition, producing recurring 1000ms+ hitches that no amount of progressive spreading could eliminate

- **Startup loading simplified** (`src/main.js`)
  - Removed multi-phase prewarm system (prewarm → normalize → settle), adaptive mesh-ops budget, `renderer.compile()` call, warmup depth calculation, and all associated constants
  - Loading screen now shows a simple 0.9s progress bar before enabling "click to begin"
  - Removed `onVisibilityChange` callback that reset doors when rooms were culled (no longer needed since rooms are never hidden)

- **Perf overlay label updated** (`src/ui/perfOverlay.js`)
  - `vis ops` renamed to `mesh ops` (now always shows 0)

### Removed
- Progressive visibility API (`world.setRoomVisibilityProgressive`, `world.getRoomObjectCount`) added in earlier session — no longer called by any system
- Adaptive mesh-ops budget system and all related constants (`NORMAL_MESH_OPS_PER_FRAME`, `STARTUP_MESH_OPS_PER_FRAME`, `GAMEPLAY_MIN/MAX_MESH_OPS_PER_FRAME`, etc.)

### Notes
- With all 11 rooms (~162 meshes) always visible, the game runs at 144 FPS on target hardware (GTX 1060+)
- The world will grow to approximately 4× current size (~44 rooms). If draw call count becomes a bottleneck at that scale, the plan is to revisit with a `THREE.Layers`-based approach (which keeps GPU buffers warm) and/or static geometry merging per room — not `visible` flag toggling
- Room graph, room registration, room connections, and zone metadata remain intact for future use by fog, enemy simulation, and audio systems

---

## [Session 18] — 2026-03-10
### Added
- **East Wing administration area — 6-room layout** (`src/world/world.js`)
  - Added east hallway (11.8×3.0m) connecting to lobby through a new door opening in the right wall
  - Added 4 offices branching off the hallway: Reception Office (north-left), Admin Office (north-right), Manager's Office (south-left), Kitchenette (south-right)
  - Added Director's Office (5.3×7.0m) at the end of the hallway
  - All rooms built with floors, walls, ceilings, wainscoting, crown molding, door frames, ceiling lights, and wall sconces using existing materials and patterns
  - East wing uses 3.0m ceilings (realistic office height) vs lobby's 5.5m grand scale

- **Per-room zone identifiers for east wing** (`src/world/world.js`)
  - Each east wing room registered with a unique zone: `eastHallway`, `eastReception`, `eastAdmin`, `eastManager`, `eastKitchen`, `eastDirector`
  - Zones propagate through room culling metadata and perf overlay automatically

- **Rotated door support via `hingeRotY` parameter** (`src/world/world.js`)
  - Enhanced `addLinkedDoor` to accept `hingeRotY` for doors on non-X-axis walls
  - Non-zero rotation wraps the door pivot in a parent `THREE.Group` so door physics (`getWorldQuaternion`) inherits orientation transparently
  - Zero-rotation behavior unchanged; fully backwards-compatible

- **7 new doors for east wing traversal** (`src/world/world.js`)
  - `doorLobbyEastWing`: lobby → hallway (standard orientation)
  - `doorHallReception`, `doorHallAdmin`: hallway north wall → offices (rotated +π/2)
  - `doorHallManager`, `doorHallKitchen`: hallway south wall → offices (rotated −π/2)
  - `doorHallDirector`: hallway end wall → director's office (standard orientation)

- **Zone-aware fog system** (`src/systems/fog.js`)
  - Refactored from single hardcoded lobby bounds to a `fogZones` array
  - Lobby zone retains 20 wisps at 5.5m ceiling; east wing zone gets 12 wisps at 3.0m ceiling
  - Each zone has its own ground fog plane with independent bounds
  - Wisp wrap and height clamping now per-zone

### Changed
- **Lobby right wall split for east wing entrance** (`src/world/world.js`)
  - Replaced single continuous right wall with two segments leaving a 1.0m door opening at Z=2.0→3.0
  - Split right wainscoting and crown molding to match
  - Added door frame trim on the right wall opening
  - Relocated right wall sconce from Z=3 (door conflict) to Z=5.5

- **Lobby room connections updated** (`src/world/world.js`)
  - Lobby now connects to both `sideRoomEast` and `eastHallway` for proper culling graph traversal

### Fixed
- **Rotated hallway doors misaligned with wall openings** (`src/world/world.js`)
  - Corrected hinge positions for rotated doors: +π/2 doors hinge at left edge of opening, −π/2 doors hinge at right edge, so door panels center in their openings

### Notes
- East wing rooms are structural shells only (walls, floors, ceilings, doors, lights). Furniture, items, and enemies to be added in future sessions.
- Door physics system (`src/systems/door.js`) required zero changes — world-space quaternion inheritance handles rotated pivots.
- Room culling system (`src/systems/roomCulling.js`) required zero changes — fully connection-graph driven.

---

## [Session 17] — 2026-03-10
### Added
- **Rig-ready enemy runtime scaffold** (`src/systems/enemyRuntime.js`, `src/main.js`, `src/world/world.js`, `src/entities/zombies.js`)
  - Added `createEnemyRuntime(world, player)` system that updates enemies through a stable per-frame contract
  - Added world enemy registry (`world.enemies`, `world.getEnemies()`) so enemy systems avoid scene graph traversal
  - Added per-enemy component contracts for future animation/pathing integration: `visual`, `animation`, `pathing`, `controller`, `collision`, `health`
  - Reserved animation state names now for forward compatibility: `idle`, `walk`, `attack`, `hit`, `death`

### Changed
- **Zombie sentry now exposes controller + pathing-ready metadata** (`src/entities/zombies.js`)
  - Added rig profile metadata for future skinned/rigged replacement without API churn
  - Added deterministic controller hook (`controller.update`) and lightweight idle bob runtime behavior

- **Zombie collision upgraded for future movement support** (`src/world/world.js`)
  - Added `components.collision.syncFromEntity(enemy)` callback and linked world collider reference
  - Collider update path now supports eventual enemy pathing/locomotion without rewriting player collision logic

### Notes
- Current sentry remains non-pathing and non-combat AI by design; this session establishes upgrade-safe contracts so animation + navigation can be layered in incrementally.

---

## [Session 16] — 2026-03-10
### Changed
- **Flashlight now supports performance-safe dynamic shadows** (`src/player/viewmodel.js`, `src/player/player.js`, `src/main.js`)
  - Enabled shadow casting on the primary flashlight spotlight only
  - Tuned flashlight shadow camera and map settings for stable quality/cost (`512` map size, short near/far, bias and normal-bias tuning)
  - Exposed flashlight runtime state through player API for render orchestration
  - Disabled continuous shadow-map auto-updates and added throttled shadow refresh based on camera motion/toggle state

- **Muzzle flash moved into measurable shadow profiling mode** (`src/player/viewmodel.js`, `src/main.js`)
  - Enabled muzzle flash spotlight shadows to verify real-world frame impact during combat
  - Added short burst shadow-refresh window tied to firing state so cost can be observed even with throttled global shadow updates

### Fixed
- **Secondary local lights causing avoidable shadow overhead risk** (`src/player/viewmodel.js`)
  - Kept flashlight spill light explicitly non-shadowed
  - Kept muzzle flash shadow behavior explicitly controlled per profiling mode instead of inheriting implicit defaults

### Notes
- Current test outcome: runtime remained effectively capped at monitor limit (144 FPS) during flashlight + muzzle-flash shadow usage on this machine.
- Shadow policy now favors one primary gameplay shadow caster, with additional dynamic shadow casters gated behind explicit profiling/perf intent.

---

## [Session 15] — 2026-03-10
### Added
- **Universal lock/key foundation for puzzle gating** (`src/systems/lock.js`, `src/systems/itemRegistry.js`, `src/systems/door.js`, `src/main.js`)
  - Added reusable `createLock()` system with per-lock required key IDs, locked state, unlock callback hook, and runtime update method
  - Added dynamic key item typing (`key:<id>`) so keys can be created per puzzle without hardcoding every key in registry data
  - Keys are configured as non-stackable, non-combinable, droppable items and can be held via equipped slot
  - Added test key spawn near lobby ammo and wired first lock to `doorLobbyEast`

### Changed
- **Flashlight beam tuning for more natural coverage** (`src/player/viewmodel.js`)
  - Moved flashlight light origin closer to the held flashlight model so emission aligns better with the lens
  - Softened beam edges and widened circumference using cone/penumbra tuning
  - Shifted beam color to subtle warm-white and rebalanced intensity/falloff for cleaner readability

- **Door state flow now explicitly gated for locked interactions** (`src/systems/door.js`, `src/main.js`)
  - Added explicit `interactionEnabled` gate in door system so doors can cleanly transition from non-interactable to swing-enabled
  - Locked doors start with interaction disabled; unlock callback enables interaction at runtime
  - Added fallback auto-equip behavior for nearby required keys so unlock tests are not blocked by UI equip misses

- **Lock proximity made multi-floor safe** (`src/systems/lock.js`)
  - Lock range now uses horizontal radius + vertical tolerance (cylindrical range), rather than raw 3D sphere distance
  - Prevents accidental unlock through upper/lower floors while remaining reliable at door height

### Fixed
- **Close-range flashlight beam pinching on walls and doors** (`src/player/viewmodel.js`)
  - Added a secondary short-range spill spotlight layered with the primary beam
  - Kept both lights locked to flashlight state so toggle behavior remains consistent
  - Reduced tiny-hotspot behavior when player stands very close to nearby surfaces

- **Locked door staying inert after intended unlock path** (`src/systems/lock.js`, `src/systems/door.js`, `src/main.js`)
  - Fixed lock range checks to accept runtime vector-like position sources
  - Removed ambiguous lock-to-door coupling by wiring explicit unlock -> interaction-enable transition
  - Exposed lock range helper for runtime integration and debugging

### Notes
- Flashlight now uses a dual-cone setup (focused main beam + wide soft spill) for better near-field lighting response.
- Lock/key flow is now reusable for non-door puzzle entities: lock owns key-matching + proximity logic; entity/system owns what "unlock" enables.

---

## [Session 14] — 2026-03-10
### Fixed
- **Restored lost runtime integrations after rollback/lost edits** (`src/world/world.js`, `src/systems/worldItems.js`, `src/systems/door.js`, `src/player/player.js`)
  - Reinstated room graph ownership model and room metadata APIs in world runtime
  - Reinstated offshoot room chain (`sideRoomEast`, `sideRoomMid`, `sideRoomWest`) and linked multi-door setup
  - Reinstated room-aware pickup ownership and visibility filtering for culling
  - Reinstated door close tuning + `resetToClosed()` for room-hide orchestration
  - Reinstated pointer-lock/fallback handoff and cursor-mode synchronization expected by startup flow

### Notes
- This session reimplemented the previously shipped culling/room/door/input architecture so `main.js` and `roomCulling.js` are again aligned with world/player/systems APIs.

---

## [Session 13] — 2026-03-10
### Added
- **Scalable room-topology synchronization in culling** (`src/systems/roomCulling.js`)
  - Room culling now refreshes room IDs from `world.getRoomIds()` continuously instead of relying on a one-time startup snapshot
  - Added topology sync handling for room additions/removals so visibility sets stay valid without manual rewiring
  - Pending visibility queue and per-frame visibility budget continue to work with updated room graphs automatically

### Changed
- **Startup loading made room-count agnostic** (`src/main.js`)
  - Startup warmup and progress calculations now derive from runtime room count helpers rather than fixed room-count snapshots
  - Visibility-settle progress now scales using current world room count, making load-screen behavior stable as the map expands

- **Adaptive culling budgeting added for scalable frame stability** (`src/main.js`, `src/systems/roomCulling.js`, `src/ui/perfOverlay.js`)
  - Added frame-time + queue-pressure adaptive control for `roomOpsPerFrame` during startup normalization and gameplay
  - Runtime culling throughput now scales by room graph size caps rather than static per-frame operations only
  - Perf overlay now reports `vis ops` (current room-ops budget) alongside `vis queue` for live tuning

- **Transition hitch mitigation generalized** (`src/systems/roomCulling.js`, `src/main.js`, `src/world/world.js`, `src/ui/perfOverlay.js`)
  - Incremental room visibility application remains frame-budgeted for smoother traversal between connected rooms
  - Redundant world visibility writes are skipped in `setRoomVisibility`, reducing avoidable per-room object visibility recomputation
  - Perf overlay includes `vis queue` so culling backlog can be monitored while tuning large room graphs

### Result
- Room-culling performance behavior now scales cleanly for newly added rooms and ongoing room-layout edits with no extra per-room code updates in the culling/runtime loop.
- Room transitions have less hitch risk across small and large room graphs because culling throughput can rise under queue pressure and back off on slow frames.

### Fixed
- **Entered-room visibility starvation under low culling budgets** (`src/systems/roomCulling.js`, `src/main.js`)
  - Prioritized immediate visibility for the player's current room before normal queue processing so newly entered spaces cannot stay hidden
  - Re-anchored culling scan cursor to the current room whenever visibility signature changes to reduce delayed room re-show
  - Raised gameplay adaptive floor to baseline culling budget to avoid under-provisioned visibility throughput

- **Hidden-room state desync causing permanent unloaded geometry** (`src/systems/roomCulling.js`)
  - Fixed topology sync logic that could incorrectly mark intentionally hidden rooms as already visible in culling state
  - Added strict initialization path for only truly new room IDs discovered at runtime
  - Culling now refreshes desired visibility set every update so stale internal sets self-correct after topology/transition changes

### Notes
- Session closed with room reload/culling regression resolved and traversal now stable with only a minor occasional hitch remaining during heavy transition moments.

---

## [Session 12] — 2026-03-10 
### Added
- **Room graph + visibility architecture foundation** (`src/world/world.js`, `src/systems/roomCulling.js`, `src/main.js`)
  - Added room registration with bounds, adjacency, labels, and zones
  - Added room APIs: `getRoomIds`, `getRoomConnections`, `getRoomMeta`, `getRoomAtPosition`, `setRoomVisibility`, `registerExternalRoomObject`
  - Added BFS room culling system with configurable visibility depth and room-transition resolution support

- **Expanded offshoot layout for culling validation** (`src/world/world.js`)
  - Replaced single side-room path with a three-room chain: `sideRoomEast`, `sideRoomMid`, `sideRoomWest`
  - Added interior partitions/openings, doorway trims, per-room lights, and room metadata wiring

- **Multi-door transition model** (`src/world/world.js`, `src/main.js`)
  - Added and integrated all active transition doors:
    - `doorLobbyEast` (`lobby` <-> `sideRoomEast`)
    - `doorEastMid` (`sideRoomEast` <-> `sideRoomMid`)
    - `doorMidWest` (`sideRoomMid` <-> `sideRoomWest`)
  - Added `world.doors` as primary source with `world.door` kept for compatibility
  - Main loop now runs one door system per door and selects strongest interaction blend for viewmodel feedback

- **Runtime observability for traversal/perf** (`src/ui/perfOverlay.js`, `src/main.js`, `src/systems/roomCulling.js`)
  - Added perf overlay with FPS/ms, room visibility counts, draw calls, triangle count, and current room label/zone
  - Added culling warmup controls (`setVisibilityDepth`, `getVisibilityDepth`) and startup prewarm flow

### Changed
- **Visibility ownership semantics hardened** (`src/world/world.js`)
  - Moved to per-object multi-room membership tracking
  - Shared objects now stay visible if any owning room is visible, fixing doorway/partition pop-in

- **Room culling policy tuning** (`src/main.js`, `src/systems/roomCulling.js`)
  - Increased gameplay depth preload and added startup warmup depth window to reduce first-transition hitching
  - Added overlap-aware room resolution preference to reduce delayed room handoffs near thresholds

- **World items made room-aware** (`src/systems/worldItems.js`, `src/main.js`)
  - Pickups/drops now store room ownership, obey room visibility, and are excluded from hover raycasts when hidden

- **Door dynamics adjusted for feel and consistency across all doors** (`src/systems/door.js`)
  - Added room-hide reset policy support via `resetToClosed()` orchestration
  - Tuned contact/cushion/friction/overshoot behavior to reduce hard frame magnetism and restore smoother sweep-through close behavior

- **Pointer-lock fallback handoff stabilized** (`src/player/player.js`, `src/main.js`)
  - Added lock lifecycle tracking + cursor-mode synchronization
  - Tightened fallback activation timing to avoid accidental fallback during normal pointer-lock startup

### Notes
- This consolidation replaces individual entries for Sessions 12-18 while preserving their cumulative implementation history.
- Room culling remains visibility-based (not full streaming/unload) and is currently tuned for seamless traversal with no loading screens.

---

## [Session 11] — 2026-03-09
### Added
- **Door entity + door physics system** (`src/entities/door.js`, `src/systems/door.js`)
  - Door entity: pivot-hinged `BoxGeometry` panel with handle; configurable width (1.0 m), height (2.2 m), thickness (0.08 m)
  - Physics-based torque model: player hitbox overlap generates contact force; force × lever arm → torque → angular acceleration, divided by moment of inertia ($I = \frac{1}{3} m L^2$, 40 kg door)
  - Bidirectional swing — detects which side the player is on and pushes accordingly
  - Push detection zone (0.59 m) is wider than pushback zone (0.34 m) so force registers before collision resolution cancels the overlap
  - `applyPlayerPushback()` — soft collision that prevents walking through the door, called after `player.update()` each frame
  - Auto-close spring (0.02 strength, 0.998 damping) — barely perceptible creep back to closed, like gravity on heavy worn hinges
  - Air cushion near frame — exponential dampening (`pow(0.75, closeness)`) in a ~3° zone as the door approaches closed; only brakes *before* crossing the frame, allowing slight overshoot and natural settle
  - Snap-to-closed at <0.06° and near-zero velocity
  - Max swing angle: ±117° (`π × 0.65`)

- **Door push hand animation** (`src/player/viewmodel.js`)
  - Both hands rise, press forward, and spread apart as `doorBlend` increases (proximity + facing)
  - Palms rotate outward (pitch back + roll) to face the door surface
  - Normal weapon sway, walk bob, recoil, and reload animations fade out proportionally during door interaction
  - Dynamic forward press intensifies when the door is actively moving (`doorAngularVel`)
  - Subtle micro-motion oscillation when hands are held against the door
  - `rotation.z` set via assignment (not `+=`) to prevent frame accumulation
  - `position.z` set to base + offset (not `+=`) — fixes original bug where hands left the body permanently

- **Door opening in left wall** (`src/world/world.js`)
  - Left wall split into two segments with 1.0 m door opening at Z=2.0–3.0
  - Wainscoting and crown molding also split to match
  - Decorative door frame (lintel + two jambs) in wainscot material
  - Door entity placed at hinge position (X=-6.9, Z=2.0)
  - Door removed from static `colliders[]` — collision handled dynamically by door system

- **Small room beyond door** (`src/world/world.js`)
  - 4 m × 4 m square room on left side of wall (centered on door opening)
  - Floor, ceiling, 3 walls (front, back, far side); shared materials with main lobby
  - Interior point light (warm, 1.4 intensity, 6 m range)

- **Door system integration** (`src/main.js`)
  - `createDoorSystem()` imported and wired; updates each frame before player
  - `doorSystem.getInteraction()` passed to `player.update()` → viewmodel
  - `doorSystem.applyPlayerPushback()` called after player movement

### Changed
- **Left bench and side table moved** — Z=3.0 → **Z=4.5** to clear the door swing area (`src/world/world.js`)

### Fixed
- **Hands permanently leaving body** — `position.z += doorForward` accumulated every frame; changed to `position.z = -0.15 + doorForward`
- **Door impossible to open** — door `Box3` was in static `colliders[]`, pushback prevented player from reaching push zone
- **Door couldn't be pushed from back side** — bidirectional `side` detection based on player's local X position relative to door plane

---

## [Session 10] — 2026-03-09
### Changed
- **Layout reorganization for coherent spatial flow** (`src/world/world.js`)
  - **Staircases flush against walls** — eliminated 1.9 m gaps
    - Left staircase: center X=-4 → **X=-5.9** (spans X=-7.0 to -4.8)
    - Right staircase: center X=+4 → **X=+5.9** (spans X=+4.8 to +7.0)
  - **Staircase start pushed back** — Z=-2 → **Z=-5** (into transition zone, `STAIR_START_Z` constant added)
  - **Balcony flipped orientation** — now extends **backward** (Z=-11.4 to -13.8) overlooking main floor, not forward
    - Front railing at Z=-11.4 spans center only (X=-4.8 to +4.8); gaps where stairs connect
    - Newel posts at X=±4.8 (staircase-to-balcony junction); side rails along walls; back rail near Z=-13.8
  - **Front desk repositioned to center** — Z=-4.0 → **Z=0.0** (visible from entry, centered in room)
  - **Benches moved to front hall** — Z=-7.0 → **Z=+3.0** (between columns and entry, flanking central walkway)
  - **Standing lamps follow benches** — Z=-6.0 → **Z=+4.2** (illuminate seating area)
  - **Column Z positions shifted** — [+5, -1, -7] → **[+5, +1, -3]** (avoid staircase zones)
  - **Wall sconce Z positions** — [5, 1, -3, -7] → **[8, 3, -2, -5]** (entry to staircase start)
  - **Ceiling lights repositioned** — now above entry (Z=9), seating (Z=3), desk (Z=0), and transition zones (Z=±3)
  - **Damage pillar moved** — X=1.5, Z=0 → **X=0, Z=-4** (transition zone, clear of desk)
  - **Back-area floor added** — Z=-10 to -14 (under balcony overhang, prevents void when player looks underneath)

- **Chandelier repositioning** (`src/main.js`)
  - Repositioned along center axis: Z=[0, -5, -5] → **Z=[0, 6, -4]**
  - Illuminates entry hall, desk area, and transition zone in a visual line

- **Item spawn repositioning** (`src/main.js`)
  - Ammo pickups: Z=-2.0 → **Z=+1.5** (in front of desk, immediately visible from entry)
  - Healing items: Z=-3.5 → **Z=-1.0** (behind desk, encourages exploration)

### Result
The room now reads as a **grand RCPD/museum lobby** with clear spatial narrative:
1. **Entry zone** (Z=+7 to +14) — elevated platform, descent
2. **Front hall** (Z=+2 to +7) — open reception area with seating
3. **Central zone** (Z=-2 to +2) — check-in desk with mid-level columns
4. **Transition** (Z=-3 to -5) — back columns, hazard, lighting transition
5. **Staircase zone** (Z=-5 to -11.4) — dual ascending staircases, flush to walls
6. **Balcony** (Z=-11.4 to -13.8) — upper gallery with front and side railings

---

## [Session 9] — 2026-03-09
### Changed
- **Room dimensions dramatically compressed** (`src/world/world.js`)
  - Width: 20 m → **14 m** (X: ±7)
  - Depth: 40 m → **28 m** (Z: ±14)
  - Ceiling: 10 m → **5.5 m**
  - Proportions are approximately 50×100 player-block units

- **All world elements repositioned to match new room scale**
  - Entry platform: Y=1.5 → **1.0**, Z=+9..+14
  - Front staircase: 6 steps → **3 steps** (0.3 m rise each, 0.5 m run)
  - Side staircases: 10 steps → **8 steps**, 2.5 m wide → **2.2 m**, centered at X=±5.5, `STAIR_HEIGHT` 3.5 m → **2.5 m**, start Z=-1.5, run 0.8 m each
  - Balcony: full-width at Y=2.5, Z≈-7.9 to -14
  - Column pairs: X=±4.5 → **X=±3.0**, Z=[+5, -1, -7]
  - Front desk: 7 m → **4.5 m** wide, moved to Z=-4.0
  - Benches: behind staircases at X=±5.0, Z=-9 (under balcony overhang)
  - Water cooler: right side aisle at (6.2, 0, +5)
  - Damage pillar: height matches `STAIR_HEIGHT` (2.5 m)
  - Player spawn: Z=7 → **Z=4**

- **Chandeliers resized for lower ceiling** (`src/main.js`)
  - Outer chains: 3.0 m → **1.0 m**; inner arms: 1.2 m → **0.55 m**
  - Bottom bulb at ≈3.3 m (was 3.7 m) — clears player eye level
  - 4 chandeliers → **3**, hung at Y=5.2 at Z=[+4, -4, -10]

- **Fog density increased**: 0.035 → **0.055** (tighter room reads hazier)

- **Dev server cache fixed** (`server.js`)
  - Added `Cache-Control: no-cache, no-store, must-revalidate` headers
  - Browser was serving stale JS due to missing cache headers

---

## [Session 8] — 2026-03-09
### Added
- **Inventory drag-and-drop** (`src/ui/inventory.js`)
  - Left-click and drag any occupied grid slot or the equipped slot to move items
  - Drag ghost icon follows the virtual cursor while dragging; source slot dims to 25% opacity
  - Drop target slots highlight in real time: **green** = valid, **red** = invalid
  - Drop rules:
    - Empty slot → moves item there
    - Same stackable type with room → fills target stack, leaves any remainder in source slot
    - Same stackable type but target is already full → red border + **STACK FULL** feedback
    - Different type with a combine recipe → combines (consumes ingredients, places result)
    - Different type with no recipe → red border + **CANNOT COMBINE** feedback, item returns
    - Equipped slot (from grid item) → equips if item is equippable, otherwise **CANNOT EQUIP**
    - Outside the inventory panel → drops item on the ground at player's feet
    - Inside panel but not on any slot → drag cancelled, item returns
  - Escape key cancels an in-progress drag

- **Right-click context menu** (`src/ui/inventory.js`)
  - Right-click any occupied slot to open the action menu (Use / Equip / Drop)
  - Menu is fully driven by the virtual cursor — hover highlight and click detection use `cursorX/cursorY` so it works correctly under pointer lock
  - **Use** — only shown for `usable: true` items; calls `playerHealth.heal()` and decrements stack quantity. Shows **ALREADY AT FULL HP** if no healing applied
  - **Equip** — only shown for `equippable: true` items not currently in the equipped slot
  - **Drop** — only shown for `droppable: true` items; spawns the item in the world
  - Non-usable items (e.g. ammo, handgun) never show a Use option

- **Item use wired up** — healing items (H1 +2 HP, H2 +5 HP, H3 +8 HP) now correctly heal the player when used via the context menu; the item is consumed from the stack

- **Ground item auto-spread** (`src/systems/worldItems.js`)
  - `spawnDrop` now calls `findClearDropPosition` before placing a pickup mesh
  - Tries 13 candidate positions (centre, 8 cardinal/diagonal offsets at 0.85 u, 4 wider offsets) in order; picks the first clear one
  - Falls back to a random wider-radius position if all candidates are occupied
  - Dropped items never overlap on the ground regardless of drop count

- **New inventory methods** (`src/systems/inventory.js`)
  - `unequipToSlot(slotIndex)` — unequips the equipped item to a specific empty grid slot
  - `swapEquippedWithSlot(slotIndex)` — swaps equipped item with an equippable grid slot item

### Removed
- Combine mode (yellow cursor, two-step click flow) — superseded by direct drag-and-drop combining

---

## [Session 7] — 2026-03-09
### Changed
- **Inventory interaction: right-click → left-click**
  - All inventory actions (context menu, combine mode) now triggered by left-click
  - Removed separate right-click handler; unified into a single left-click handler
  - Info text updated to "Left-click for options"

- **Healing items renamed and rebalanced**
  - `healingA` → **Healing Item 1** (heals 2 HP, was 5)
  - `healingB` → **Healing Item 2** (heals 5 HP, was 3)
  - `healingC` → **Healing Item 3** (heals 8 HP, combined result; `combinable: false`)
  - Recipe unchanged: Healing Item 1 + Healing Item 2 → Healing Item 3

- **Stack limits**
  - Handgun ammo `maxStack`: 999 → **27** per slot; overflow fills a new stack
  - All healing items `maxStack`: 99 → **3** per slot regardless of type

- **Full-stack indicator** — stack count displays in **green** when slot is at max capacity

- **Inventory full notification** — "INVENTORY FULL" message appears for 2 seconds when pickup fails because all 9 grid slots are occupied

### Changed (Starting Loadout)
- Removed starting ammo and healing items from player inventory
- Replaced with world pickups near spawn:
  - Three full ammo stacks (27 bullets each) on the floor
  - One Healing Item 1 and one Healing Item 2 on the floor

---

## [Session 6] — 2026-03-08
### Added
- **Item Registry System** (`src/systems/itemRegistry.js`)
  - Centralized item definitions (ammo, healing herbs, handgun, medical items)
  - Item properties: stackable, maxStack, usable, equippable, droppable, combinable
  - 3D appearance config (color, size, shape) for world items
  - Recipe system: Healing Herb + First Aid Spray → Mixed Medicine (heals 8 HP)

- **Inventory System Overhaul**
  - Separate equipped weapon slot (displays above 3×3 grid)
  - New methods: `equipItem()`, `unequipItem()`, `moveItem()`, `useItem()`, `combineItems()`, `dropItem()`
  - maxStack enforcement from registry
  - Starting loadout: 100 ammo, 1 First Aid Spray in grid, Handgun equipped

- **World Items / Pickups**
  - 3D rotating mesh pickups in the scene
  - THREE.Raycaster hover detection (3-unit range from camera)
  - Hover text overlay: "Item Name — Press E to pick up"
  - Pickup/drop lifecycle, auto-disposal of meshes on pickup
  - Weapon pickups auto-equip to weapon slot

- **Inventory UI Overhaul**
  - Colored rectangle icons with 2-character initials (instead of placeholder SVGs)
  - Equipped weapon slot with gold border
  - Right-click context menu: Use, Combine, Equip, Drop
  - Combine mode: yellow cursor, click target to combine items
  - Item names displayed in each slot

- **Enhanced E-Key Logic**
  - Pickup if looking at item (raycaster hovering)
  - Else open/close inventory
  - One-key intuitive interaction

---

## [Session 5] — 2026-03-08
### Added
- **Universal Health System** (`src/systems/health.js`)
  - Factory function: `createHealth(maxHealth)`
  - Scale: 1–10 (10 = healthy, 0 = dead)
  - Damage types support (`'generic'`, `'fire'`, etc.)
  - Flat damage resistances per type
  - Event callbacks: `onDamage`, `onDeath`, `onHeal`, `reset`
  - Same system ready for enemies

- **HUD Redesign**
  - Relocated to bottom-right corner
  - Health shown as 10 pip bars (dynamic color: green → orange → red)
  - Ammo counter: "MAG / RESERVE" with color coding

- **Damage Visual Effects**
  - CSS-based red vignette overlay
  - Heartbeat pulse synchronized to heartbeat frequency
    - HP ≤ 3: subtle slow pulse
    - HP 2: medium pulse
    - HP 1: heavy, fast, deep red pulse
  - Brief red flash on any damage (regardless of HP)

- **Low-Health Player Sway**
  - At 1 HP: camera drifts with wobbly sine-wave pattern
  - Two overlapping frequencies for organic feel
  - Settles when healing above 1 HP

- **Death System**
  - Dark red death screen fades in with "YOU DIED" text
  - All player input disabled
  - Auto-reset after 4 seconds (health restored, player repositioned, effects cleared)

- **Damage Pillar Hazard**
  - Dark stone cylinder (radius 0.5m, height 3m)
  - Positioned at (5, 0, 0) on main floor
  - Deals 1 damage per second on contact
  - Both collision box (blocks movement) and hazard (tick damage)

- **Hazard System Infrastructure**
  - World exports `hazards[]` array alongside `colliders[]`
  - Each hazard defines: position, radius, damagePerSecond, damageType
  - Main loop checks player distance each frame
  - Tick damage applied at 1-second intervals
  - Timer resets when player leaves range

---

## [Session 4] — 2026-03-08
### Added
- **Inventory System** (`src/systems/inventory.js`)
  - 9-slot 3×3 grid
  - Item stacking: each slot holds one item type with unlimited quantity
  - Toggle with **E key**
  - Methods: `addItem()`, `removeItem()`, `getItemCount()`, `getItems()`

- **Gun System** (`src/systems/weapons.js`)
  - 9-round magazine capacity
  - Semi-automatic with 0.1s fire rate cooldown
  - **Real bullet economy**: Unspent rounds are discarded on reload (creates resource tension)
  - Hitscan raycast for instant hit detection (100m range)
  - Fire with **left-click**, reload with **R key**

- **Gun Animations** (viewmodel)
  - Recoil kick on fire: hand kicks back -0.02m Y offset + 0.05 rad rotation
  - Recoil decay: 0.15s smooth falloff
  - Reload animation during 1.2s reload duration: hand rotates 45° and lowers smoothly
  - All applied to right-hand viewmodel

- **Inventory UI**
  - 3×3 grid overlay with item count overlays
  - Opens centered on screen with semi-transparent dark background
  - Appears only when inventory is active

- **In-Game Cursor**
  - Green glowing circle (2px border + center dot)
  - Tracks mouse movement using pointer lock deltas
  - Appears when inventory opens, disappears when closed
  - Allows clicking inventory items while keeping game running

- **HUD Ammo Counter**
  - Top-right corner (green text with glow)
  - Format: "MAG / RESERVE"
  - Color-coded: green (normal), orange (< 3 rounds), red (empty)
  - Updates every frame

- **Game Loop Continuity**
  - Pointer lock stays active entire time (no defocus)
  - Camera rotation frozen while inventory open (saved quaternion restored each frame)
  - WASD movement continues while inventory open — game runs in background, not paused

---

## [Session 3] — 2026-03-08
### Added
- **Cannon-es Physics Integration** (`src/systems/physics.js`)
  - Lightweight Cannon.js port imported via CDN
  - Physics world steps every frame
  - Hybrid collision approach:
    - Player: fast AABB collision detection (proven, maintains 60 FPS)
    - World: static boxes registered as physics bodies
    - Future enemies: will use dynamic rigidbodies

- **Physics-Ready Architecture**
  - No physics-based puzzles (RE7-style gameplay)
  - World collision boxes prepared for interactive objects and enemies
  - Raycast system ready for future use

---

## [Session 2] — 2026-03-08
### Added
- **Dual-Hand First-Person Viewmodel**
  - Left hand with flashlight, right hand with pistol
  - Independent bob/sway animation per hand
  - Hands centered at (±0.08, -0.1, -0.15) relative to camera
  - Left hand leads sway; right hand lags for natural feel

- **Flashlight System**
  - F-key toggle
  - SpotLight child of left hand, follows hand position/rotation via scene graph
  - Soft cone lighting (32° cone, penumbra 0.45, decay 1.4) for ambient spillage
  - Naturally moves with hand in world space

- **Environment Expansion**
  - Grand entrance staircase (6 steps down)
  - Side staircases (12 steps up) linking to full-width back balcony
  - Expanded lighting: 5 point lights + 4 large chandeliers for layered illumination
  - Soft ambient lighting (0x404040, 0.3 intensity)

- **Collision Detection with Step-Climbing**
  - AABB-based collision system
  - Automatic step-climbing (0.45m max step height)
  - Fast and responsive at 60 FPS
  - Player can walk up stairs without jumping

---

## [Session 1] — 2026-03-08
### Added
- **Project Initialization**
  - First-person survival horror game in browser
  - Three.js 0.169.0 via CDN importmap
  - Vanilla JavaScript (ES Modules)
  - No game engine, no bundler

- **Core Renderer & Game Loop**
  - Canvas renderer (WebGL)
  - 60 FPS game loop
  - Scene setup with perspective camera

- **Grand Cathedral Museum Environment**
  - 30m wide × 60m deep × 15m ceiling
  - Procedural marble floor textures
  - Initial furniture and details: desk, benches, water cooler, standing lamps

- **Player Controller**
  - WASD/arrow movement
  - Spacebar jump
  - Shift sprint
  - Pointer lock + fallback mouse-look
  - Custom gravity physics (no external engine) with velocity and jump impulse

- **Initial HUD System**
  - Basic UI overlay framework

---

## Release Timeline
| Version | Session | Date | Status |
|---------|---------|------|--------|
| v0.20 | Session 20 | 2026-03-11 | Shockwave Weapon System (Phase 1) |
| v0.9 | Session 9 | 2026-03-09 | Room Scale Compression & Cache Fix |
| v0.8 | Session 8 | 2026-03-09 | Drag-and-Drop Inventory & Item Use |
| v0.7 | Session 7 | 2026-03-09 | Inventory Debugging & Item Rebalance |
| v0.6 | Session 6 | 2026-03-08 | Item Registry & Pickups |
| v0.5 | Session 5 | 2026-03-08 | Health System & Damage Effects |
| v0.4 | Session 4 | 2026-03-08 | Gun & Inventory |
| v0.3 | Session 3 | 2026-03-08 | Physics Integration |
| v0.2 | Session 2 | 2026-03-08 | Dual-Hand Viewmodel & Flashlight |
| v0.1 | Session 1 | 2026-03-08 | Project Init & Cathedral |
